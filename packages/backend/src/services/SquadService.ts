/**
 * @module services/SquadService
 *
 * Service for managing squads (group/family subscriptions).
 *
 * Handles squad creation, member management, and access checking.
 * A squad allows an owner (subscriber) to share their subscription
 * access with multiple members identified by external user IDs.
 */

import { Injectable, Inject } from "@tsed/di";
import { NotFound, Conflict, BadRequest } from "@tsed/exceptions";
import { Logger } from "@tsed/logger";
import { In } from "typeorm";
import { AppDataSource } from "../core/datasource";
import { Squad } from "../entities/Squad";
import { SquadMember } from "../entities/SquadMember";
import { SquadInvite } from "../entities/SquadInvite";
import { Subscriber } from "../entities/Subscriber";
import { Subscription } from "../entities/Subscription";
import { Account } from "../entities/Account";
import { OutgoingWebhookService } from "./OutgoingWebhookService";

@Injectable()
export class SquadService {
    @Inject()
    logger!: Logger;

    constructor(private readonly outgoingWebhooks: OutgoingWebhookService) {}

    // ─── Squad Lifecycle ────────────────────────────────────────

    /**
     * Create a squad for a subscriber.
     *
     * @param subscriberId - ID of the subscriber who will own the squad.
     * @returns The newly created squad.
     * @throws {NotFound} If the subscriber doesn't exist.
     * @throws {BadRequest} If the subscription plan doesn't support squads.
     * @throws {Conflict} If the subscriber already owns a squad.
     */
    async createSquad(subscriberId: string): Promise<Squad> {
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const squadRepo = AppDataSource.getRepository(Squad);

        const subscriber = await subscriberRepo.findOne({
            where: { id: subscriberId },
            relations: ["subscription"],
        });
        if (!subscriber) throw new NotFound("Subscriber not found");
        if (subscriber.status !== "active" && subscriber.status !== "trialing") {
            throw new BadRequest("Subscriber is not active or trialing");
        }

        const subscription = subscriber.subscription;
        if (!subscription.squadEnabled) {
            throw new BadRequest("This subscription plan does not support squads");
        }

        const existing = await squadRepo.findOneBy({ ownerId: subscriberId });
        if (existing) throw new Conflict("Subscriber already owns a squad");

        const squad = squadRepo.create({
            ownerId: subscriberId,
            maxMembers: subscription.squadMaxMembers,
        });
        await squadRepo.save(squad);

        this.logger.info(`Squad created: ${squad.id} (owner: ${subscriberId})`);

        await this.outgoingWebhooks.dispatch("squad.created", {
            squadId: squad.id,
            ownerId: subscriberId,
            ownerUid: subscriber.uid,
            subscriptionId: subscription.id,
            maxMembers: squad.maxMembers,
        });

        // Return with empty members array for consistency
        squad.members = [];
        return squad;
    }

    /**
     * Get a squad by ID with its active members.
     *
     * @param squadId - Squad UUID.
     * @returns The squad with owner and active members.
     * @throws {NotFound} If the squad doesn't exist.
     */
    async getSquad(squadId: string) {
        const squad = await AppDataSource.getRepository(Squad).findOne({
            where: { id: squadId },
            relations: ["owner", "members"],
        });
        if (!squad) throw new NotFound("Squad not found");

        // Filter to only active members
        squad.members = squad.members.filter((m) => m.status === "active");
        return mapSquad(squad);
    }

    /**
     * Find a squad by the owner's external user ID and subscription.
     *
     * @param ownerUid       - External user ID of the owner.
     * @param subscriptionId - Subscription plan ID.
     * @returns The squad, or null if not found.
     */
    async getSquadByOwnerUid(ownerUid: string, subscriptionId: string) {
        const subscriber = await AppDataSource.getRepository(Subscriber).findOneBy({
            uid: ownerUid,
            subscriptionId,
        });
        if (!subscriber) return null;

        const squad = await AppDataSource.getRepository(Squad).findOne({
            where: { ownerId: subscriber.id },
            relations: ["owner", "members"],
        });
        if (!squad) return null;

        squad.members = squad.members.filter((m) => m.status === "active");
        return mapSquad(squad);
    }

    /**
     * Dissolve a squad, removing all members.
     *
     * @param squadId - Squad UUID to dissolve.
     * @throws {NotFound} If the squad doesn't exist.
     */
    async dissolveSquad(squadId: string): Promise<void> {
        const squadRepo = AppDataSource.getRepository(Squad);
        const memberRepo = AppDataSource.getRepository(SquadMember);

        const squad = await squadRepo.findOne({
            where: { id: squadId },
            relations: ["owner"],
        });
        if (!squad) throw new NotFound("Squad not found");

        // Soft-delete all active members
        await memberRepo
            .createQueryBuilder()
            .update(SquadMember)
            .set({ status: "removed", removedAt: new Date() })
            .where("squadId = :squadId AND status = :status", {
                squadId,
                status: "active",
            })
            .execute();

        // Delete the squad itself
        await squadRepo.remove(squad);

        this.logger.info(`Squad dissolved: ${squadId}`);

        await this.outgoingWebhooks.dispatch("squad.dissolved", {
            squadId,
            ownerUid: squad.owner?.uid,
        });
    }

    // ─── Member Management ──────────────────────────────────────

    /**
     * Add a member to a squad.
     *
     * @param squadId - Squad UUID.
     * @param uid     - External user ID of the member to add.
     * @returns The newly created squad member.
     * @throws {NotFound} If the squad doesn't exist.
     * @throws {BadRequest} If the member limit is reached or uid is the owner.
     * @throws {Conflict} If the uid is already an active member.
     */
    async addMember(squadId: string, uid: string): Promise<SquadMember> {
        const squadRepo = AppDataSource.getRepository(Squad);
        const memberRepo = AppDataSource.getRepository(SquadMember);

        const squad = await squadRepo.findOne({
            where: { id: squadId },
            relations: ["owner", "members"],
        });
        if (!squad) throw new NotFound("Squad not found");

        // Owner cannot be a member of their own squad
        if (squad.owner.uid === uid) {
            throw new BadRequest("Owner cannot be added as a squad member");
        }

        // Check for existing active membership in this squad
        const existingInSquad = squad.members.find((m) => m.uid === uid && m.status === "active");
        if (existingInSquad) {
            throw new Conflict("User is already a member of this squad");
        }

        // Check if uid is already in another squad for the same subscription
        const ownerSubscriptionId = squad.owner.subscriptionId;
        const otherMembership = await memberRepo
            .createQueryBuilder("m")
            .innerJoin("m.squad", "s")
            .innerJoin("s.owner", "o")
            .where("m.uid = :uid", { uid })
            .andWhere("m.status = :status", { status: "active" })
            .andWhere("o.subscriptionId = :subId", { subId: ownerSubscriptionId })
            .andWhere("s.id != :squadId", { squadId })
            .getOne();
        if (otherMembership) {
            throw new Conflict("User is already a member of another squad for this subscription");
        }

        // Check member limit (0 = unlimited)
        const activeCount = squad.members.filter((m) => m.status === "active").length;
        if (squad.maxMembers > 0 && activeCount >= squad.maxMembers) {
            throw new BadRequest(`Squad member limit reached (max: ${squad.maxMembers})`);
        }

        const member = memberRepo.create({ squadId, uid });
        await memberRepo.save(member);

        this.logger.info(`Squad member added: ${uid} → squad ${squadId}`);

        await this.outgoingWebhooks.dispatch("squad.member_added", {
            squadId,
            memberUid: uid,
            memberId: member.id,
            ownerUid: squad.owner.uid,
            subscriptionId: ownerSubscriptionId,
        });

        return member;
    }

    /**
     * Remove a member from a squad (soft-delete).
     *
     * @param squadId - Squad UUID.
     * @param uid     - External user ID of the member to remove.
     * @throws {NotFound} If the squad or active member doesn't exist.
     */
    async removeMember(squadId: string, uid: string): Promise<void> {
        const memberRepo = AppDataSource.getRepository(SquadMember);

        const squad = await AppDataSource.getRepository(Squad).findOne({
            where: { id: squadId },
            relations: ["owner"],
        });
        if (!squad) throw new NotFound("Squad not found");

        const member = await memberRepo.findOneBy({ squadId, uid, status: "active" });
        if (!member) throw new NotFound("Active member not found in this squad");

        member.status = "removed";
        member.removedAt = new Date();
        await memberRepo.save(member);

        this.logger.info(`Squad member removed: ${uid} from squad ${squadId}`);

        await this.outgoingWebhooks.dispatch("squad.member_removed", {
            squadId,
            memberUid: uid,
            memberId: member.id,
            ownerUid: squad.owner?.uid,
            subscriptionId: squad.owner?.subscriptionId,
        });
    }

    /**
     * Get active members of a squad.
     *
     * @param squadId - Squad UUID.
     * @returns List of active squad members.
     * @throws {NotFound} If the squad doesn't exist.
     */
    async getMembers(squadId: string): Promise<SquadMember[]> {
        const squad = await AppDataSource.getRepository(Squad).findOneBy({ id: squadId });
        if (!squad) throw new NotFound("Squad not found");

        return AppDataSource.getRepository(SquadMember).find({
            where: { squadId, status: "active" },
            order: { joinedAt: "ASC" },
        });
    }

    // ─── Access Check ───────────────────────────────────────────

    /**
     * Check if a user has access — either through a direct subscription
     * or through a squad membership.
     *
     * This is the primary method for client applications to verify
     * whether a user should be granted access.
     *
     * @param uid            - External user identifier.
     * @param subscriptionId - Optional: limit check to a specific plan.
     * @returns Access check result with type and context.
     */
    async checkAccess(uid: string, subscriptionId?: string): Promise<{
        hasAccess: boolean;
        accessType?: "direct" | "squad";
        squadId?: string;
        ownerUid?: string;
        subscriber?: Subscriber;
        subscription?: Subscription;
    }> {
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const memberRepo = AppDataSource.getRepository(SquadMember);

        // 1. Check direct subscription
        // Also grant access to cancelled subscribers who are still within their paid period
        // (cancel-at-period-end semantics: status = "cancelled" but currentPeriodEnd > now).
        const now = new Date();
        const directWhere: any = { uid, status: In(["active", "trialing"]) };
        if (subscriptionId) directWhere.subscriptionId = subscriptionId;

        const directSub = await subscriberRepo.findOne({
            where: directWhere,
            relations: ["subscription"],
        });
        if (directSub) {
            return {
                hasAccess: true,
                accessType: "direct",
                subscriber: directSub,
                subscription: directSub.subscription,
            };
        }

        // Check cancelled-but-within-period subscribers separately
        const cancelledWhere: any = { uid, status: "cancelled" };
        if (subscriptionId) cancelledWhere.subscriptionId = subscriptionId;
        const cancelledSub = await subscriberRepo.findOne({
            where: cancelledWhere,
            relations: ["subscription"],
            order: { currentPeriodEnd: "DESC" },
        });
        if (cancelledSub?.currentPeriodEnd && cancelledSub.currentPeriodEnd > now) {
            return {
                hasAccess: true,
                accessType: "direct",
                subscriber: cancelledSub,
                subscription: cancelledSub.subscription,
            };
        }

        // 2. Check squad membership
        // Owner must be active OR trialing OR cancelled-but-within-period (cancel-at-period-end).
        const memberQuery = memberRepo
            .createQueryBuilder("m")
            .innerJoinAndSelect("m.squad", "s")
            .innerJoinAndSelect("s.owner", "o")
            .innerJoinAndSelect("o.subscription", "sub")
            .where("m.uid = :uid", { uid })
            .andWhere("m.status = :memberStatus", { memberStatus: "active" })
            .andWhere(
                "(o.status IN (:...activeStatuses) OR (o.status = 'cancelled' AND o.currentPeriodEnd > :now))",
                { activeStatuses: ["active", "trialing"], now },
            );

        if (subscriptionId) {
            memberQuery.andWhere("o.subscriptionId = :subId", { subId: subscriptionId });
        }

        const membership = await memberQuery.getOne();

        if (membership) {
            return {
                hasAccess: true,
                accessType: "squad",
                squadId: membership.squad.id,
                ownerUid: membership.squad.owner.uid,
                subscriber: membership.squad.owner,
                subscription: membership.squad.owner.subscription,
            };
        }

        return { hasAccess: false };
    }

    // ─── Invite Management ──────────────────────────────────────

    /**
     * Create an invite for a user to join a squad.
     *
     * @param squadId  - Squad UUID.
     * @param uid      - External user ID of the invitee.
     * @param ttlDays  - Optional TTL override in days. Reads from account settings if omitted. 0 = no expiry.
     * @returns The newly created invite.
     */
    async createInvite(squadId: string, uid: string, ttlDays?: number): Promise<SquadInvite> {
        const squadRepo = AppDataSource.getRepository(Squad);
        const inviteRepo = AppDataSource.getRepository(SquadInvite);

        const squad = await squadRepo.findOne({
            where: { id: squadId },
            relations: ["owner", "members"],
        });
        if (!squad) throw new NotFound("Squad not found");

        // Owner cannot be invited
        if (squad.owner.uid === uid) {
            throw new BadRequest("Cannot invite the squad owner");
        }

        // Already an active member?
        const isActiveMember = squad.members.some((m) => m.uid === uid && m.status === "active");
        if (isActiveMember) {
            throw new Conflict("User is already an active member of this squad");
        }

        // Already has a pending invite?
        const existingInvite = await inviteRepo.findOneBy({ squadId, uid, status: "pending" });
        if (existingInvite) {
            throw new Conflict("A pending invite already exists for this user");
        }

        // Check member limit before creating the invite (0 = unlimited)
        const activeCount = squad.members.filter((m) => m.status === "active").length;
        if (squad.maxMembers > 0 && activeCount >= squad.maxMembers) {
            throw new BadRequest(`Squad member limit reached (max: ${squad.maxMembers})`);
        }

        // Resolve TTL: explicit param > account setting > no expiry
        let expiresAt: Date | null = null;
        const effectiveTtlDays = ttlDays ?? (await this.getAccountInviteTtlDays());
        if (effectiveTtlDays > 0) {
            expiresAt = new Date(Date.now() + effectiveTtlDays * 86_400_000);
        }

        const invite = inviteRepo.create({ squadId, uid, expiresAt });
        await inviteRepo.save(invite);

        this.logger.info(`Squad invite created: ${invite.id} → uid ${uid} for squad ${squadId}`);

        await this.outgoingWebhooks.dispatch("squad.invite_created", {
            squadId,
            inviteId: invite.id,
            ownerUid: squad.owner.uid,
            inviteeUid: uid,
            expiresAt: expiresAt?.toISOString() ?? null,
        });

        return invite;
    }

    /**
     * Accept a squad invite.
     *
     * The `uid` must match the invite's target uid (prevents others from accepting).
     * Atomically updates invite status and adds the user as a squad member.
     *
     * @param inviteId - Invite UUID.
     * @param uid      - External user ID of the invitee.
     * @returns The updated invite.
     */
    async acceptInvite(inviteId: string, uid: string): Promise<SquadInvite> {
        const inviteRepo = AppDataSource.getRepository(SquadInvite);
        const invite = await inviteRepo.findOne({
            where: { id: inviteId },
            relations: ["squad", "squad.owner"],
        });
        if (!invite) throw new NotFound("Invite not found");
        if (invite.uid !== uid) throw new BadRequest("This invite is not addressed to you");
        if (invite.status !== "pending") throw new BadRequest(`Invite is already ${invite.status}`);
        if (invite.expiresAt && invite.expiresAt < new Date()) {
            invite.status = "expired";
            await inviteRepo.save(invite);
            throw new BadRequest("Invite has expired");
        }

        // Atomically: mark invite accepted + add member.
        // If addMember fails (e.g. race condition on member limit), revert invite status.
        invite.status = "accepted";
        await inviteRepo.save(invite);
        try {
            await this.addMember(invite.squadId, uid);
        } catch (err) {
            invite.status = "pending";
            await inviteRepo.save(invite);
            throw err;
        }

        this.logger.info(`Squad invite accepted: ${inviteId} by uid ${uid}`);

        await this.outgoingWebhooks.dispatch("squad.invite_accepted", {
            squadId: invite.squadId,
            inviteId,
            ownerUid: invite.squad?.owner?.uid,
            inviteeUid: uid,
        });

        return invite;
    }

    /**
     * Decline a squad invite.
     *
     * The `uid` must match the invite's target uid.
     *
     * @param inviteId - Invite UUID.
     * @param uid      - External user ID of the invitee.
     * @returns The updated invite.
     */
    async declineInvite(inviteId: string, uid: string): Promise<SquadInvite> {
        const inviteRepo = AppDataSource.getRepository(SquadInvite);
        const invite = await inviteRepo.findOne({
            where: { id: inviteId },
            relations: ["squad", "squad.owner"],
        });
        if (!invite) throw new NotFound("Invite not found");
        if (invite.uid !== uid) throw new BadRequest("This invite is not addressed to you");
        if (invite.status !== "pending") throw new BadRequest(`Invite is already ${invite.status}`);

        invite.status = "declined";
        await inviteRepo.save(invite);

        this.logger.info(`Squad invite declined: ${inviteId} by uid ${uid}`);

        await this.outgoingWebhooks.dispatch("squad.invite_declined", {
            squadId: invite.squadId,
            inviteId,
            ownerUid: invite.squad?.owner?.uid,
            inviteeUid: uid,
        });

        return invite;
    }

    /**
     * Cancel a pending invite (owner action).
     *
     * @param inviteId - Invite UUID.
     * @param squadId  - Squad UUID (used to verify ownership).
     */
    async cancelInvite(inviteId: string, squadId: string): Promise<void> {
        const inviteRepo = AppDataSource.getRepository(SquadInvite);
        const invite = await inviteRepo.findOne({
            where: { id: inviteId },
            relations: ["squad", "squad.owner"],
        });
        if (!invite) throw new NotFound("Invite not found");
        if (invite.squadId !== squadId) throw new NotFound("Invite not found in this squad");
        if (invite.status !== "pending") throw new BadRequest(`Invite is already ${invite.status}`);

        invite.status = "cancelled";
        await inviteRepo.save(invite);

        this.logger.info(`Squad invite cancelled: ${inviteId} (squad: ${squadId})`);

        await this.outgoingWebhooks.dispatch("squad.invite_cancelled", {
            squadId,
            inviteId,
            ownerUid: invite.squad?.owner?.uid,
            inviteeUid: invite.uid,
        });
    }

    /**
     * List invites for a squad.
     *
     * @param squadId - Squad UUID.
     * @param status  - Optional filter by status.
     * @returns List of invites ordered by creation date desc.
     */
    async getInvites(squadId: string, status?: string): Promise<SquadInvite[]> {
        const squad = await AppDataSource.getRepository(Squad).findOneBy({ id: squadId });
        if (!squad) throw new NotFound("Squad not found");

        const where: any = { squadId };
        if (status) where.status = status;

        return AppDataSource.getRepository(SquadInvite).find({
            where,
            order: { createdAt: "DESC" },
        });
    }

    /**
     * Get all invites for a given uid (invitee's inbox).
     *
     * @param uid    - External user ID.
     * @param status - Optional filter by status.
     * @returns List of invites ordered by creation date desc.
     */
    async getInvitesByUid(uid: string, status?: string): Promise<SquadInvite[]> {
        const where: any = { uid };
        if (status) where.status = status;

        return AppDataSource.getRepository(SquadInvite).find({
            where,
            order: { createdAt: "DESC" },
        });
    }

    /**
     * Expire all pending invites whose TTL has elapsed.
     * Called by the background expiration worker.
     */
    async expireStaleInvites(): Promise<void> {
        const inviteRepo = AppDataSource.getRepository(SquadInvite);
        const result = await inviteRepo
            .createQueryBuilder()
            .update(SquadInvite)
            .set({ status: "expired" })
            .where("status = :status", { status: "pending" })
            .andWhere("expiresAt IS NOT NULL")
            .andWhere("expiresAt <= :now", { now: new Date() })
            .execute();

        if (result.affected && result.affected > 0) {
            this.logger.info(`Expired ${result.affected} stale squad invite(s)`);
        }
    }

    // ─── Private Helpers ────────────────────────────────────────

    /** Read the global invite TTL from account settings. */
    private async getAccountInviteTtlDays(): Promise<number> {
        const account = await AppDataSource.getRepository(Account).findOne({ where: {} });
        return account?.inviteTtlDays ?? 7;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Map a Squad entity to a plain response object,
 * promoting `owner.uid` to a flat `ownerUid` field.
 */
function mapSquad(squad: Squad) {
    return {
        id: squad.id,
        ownerId: squad.ownerId,
        ownerUid: squad.owner?.uid ?? null,
        maxMembers: squad.maxMembers,
        members: squad.members,
        createdAt: squad.createdAt,
        updatedAt: squad.updatedAt,
    };
}
