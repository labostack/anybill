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
import { AppDataSource } from "../core/datasource";
import { Squad } from "../entities/Squad";
import { SquadMember } from "../entities/SquadMember";
import { Subscriber } from "../entities/Subscriber";
import { Subscription } from "../entities/Subscription";
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
        if (subscriber.status !== "active") throw new BadRequest("Subscriber is not active");

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
    async getSquad(squadId: string): Promise<Squad> {
        const squad = await AppDataSource.getRepository(Squad).findOne({
            where: { id: squadId },
            relations: ["owner", "members"],
        });
        if (!squad) throw new NotFound("Squad not found");

        // Filter to only active members
        squad.members = squad.members.filter((m) => m.status === "active");
        return squad;
    }

    /**
     * Find a squad by the owner's external user ID and subscription.
     *
     * @param ownerUid       - External user ID of the owner.
     * @param subscriptionId - Subscription plan ID.
     * @returns The squad, or null if not found.
     */
    async getSquadByOwnerUid(ownerUid: string, subscriptionId: string): Promise<Squad | null> {
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
        return squad;
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
        const directWhere: any = { uid, status: "active" };
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

        // 2. Check squad membership
        const memberQuery = memberRepo
            .createQueryBuilder("m")
            .innerJoinAndSelect("m.squad", "s")
            .innerJoinAndSelect("s.owner", "o")
            .innerJoinAndSelect("o.subscription", "sub")
            .where("m.uid = :uid", { uid })
            .andWhere("m.status = :memberStatus", { memberStatus: "active" })
            .andWhere("o.status = :ownerStatus", { ownerStatus: "active" });

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
}
