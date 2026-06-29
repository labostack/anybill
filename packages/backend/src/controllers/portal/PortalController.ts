/**
 * @module controllers/portal/PortalController
 *
 * Client area portal endpoints — subscriber self-service.
 *
 * Access is controlled via encrypted portal tokens (AES-256-GCM).
 * The token encodes `uid` (external user ID) and grants access to
 * the subscriber's current subscription and invoice history.
 *
 * For plan changes and renewals, the portal creates a checkout link
 * and redirects the subscriber to the standard checkout flow. This
 * keeps provider selection and payment processing in one place.
 */

import { Controller, Get, Post, BodyParams, PathParams, QueryParams } from "@tsed/common";
import { BadRequest, NotFound, Forbidden } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { Logger } from "@tsed/logger";
import { AppDataSource } from "../../core/datasource";
import { AppError } from "../../core/errors/AppError";
import { ErrorCode } from "../../core/errors/ErrorCode";
import { Subscriber } from "../../entities/Subscriber";
import { Invoice } from "../../entities/Invoice";
import { Account } from "../../entities/Account";
import { Squad } from "../../entities/Squad";
import { SquadMember } from "../../entities/SquadMember";
import { BillingService } from "../../services/BillingService";
import { OutgoingWebhookService } from "../../services/OutgoingWebhookService";
import { verifyPortalToken } from "../../core/portalToken";
import { createCheckoutToken } from "../../core/checkoutToken";
import { PortalCancelBody, PortalRenewBody } from "../../models/PortalModels";



@Controller("/")
@Tags("Portal")
export class PortalController {
    constructor(
        private readonly billing: BillingService,
        private readonly outgoingWebhooks: OutgoingWebhookService,
    ) {}

    @Inject()
    logger!: Logger;

    // ─── Helpers ────────────────────────────────────────────────

    /**
     * Verify a portal token and return the uid.
     * @throws BadRequest if the token is invalid or expired.
     */
    private verifyToken(token: string): string {
        const payload = verifyPortalToken(token);
        if (!payload) {
            throw new AppError(400, ErrorCode.INVALID_PORTAL_TOKEN, "Invalid or expired portal link");
        }
        return payload.uid;
    }

    /**
     * Load a subscriber by ID and verify uid ownership.
     * @throws NotFound if subscriber doesn't exist.
     * @throws Forbidden if subscriber.uid doesn't match the token uid.
     */
    private async loadSubscriber(subscriberId: string, uid: string): Promise<Subscriber> {
        const subscriber = await AppDataSource.getRepository(Subscriber).findOne({
            where: { id: subscriberId },
            relations: ["subscription"],
        });
        if (!subscriber) {
            throw new AppError(404, ErrorCode.SUBSCRIBER_NOT_FOUND, "Subscriber not found");
        }
        if (subscriber.uid !== uid) {
            throw new AppError(403, ErrorCode.FORBIDDEN, "Access denied");
        }
        return subscriber;
    }

    // ─── Endpoints ──────────────────────────────────────────────

    /**
     * Resolve a portal token and return the subscriber's current state.
     *
     * Finds the most recent subscriber for the given uid. Returns the
     * subscriber, their invoice history, available plans, and branding.
     *
     * If no subscriber exists for the uid, `subscriber` will be `null`.
     */
    @Get("/resolve/:token")
    @Summary("Resolve portal token")
    @Description("Verifies an encrypted portal token and returns the subscriber's subscription, invoices, available plans, and branding.")
    @Returns(200)
    @Returns(400)
    async resolve(@PathParams("token") token: string) {
        const uid = this.verifyToken(token);

        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const invoiceRepo = AppDataSource.getRepository(Invoice);

        // Find the most relevant subscriber for this uid:
        // prefer active > past_due > expired > cancelled.
        const allSubscribers = await subscriberRepo.find({
            where: { uid },
            relations: ["subscription"],
            order: { updatedAt: "DESC" },
        });

        // Rank by status priority (lower = better).
        // active beats trialing beats pending, etc.
        const statusPriority: Record<string, number> = {
            active: 0,
            trialing: 1,
            pending: 2,
            past_due: 3,
            expired: 4,
            cancelled: 5,
        };
        allSubscribers.sort(
            (a, b) => (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99),
        );

        const subscriber = allSubscribers[0] ?? null;

        // Fetch account early — needed for both member and owner responses.
        const account = await AppDataSource.getRepository(Account).findOne({ where: {} });

        // Check if this subscriber owns a squad
        let role: "direct" | "owner" | "member" = "direct";
        let squadInfo: any = null;

        if (subscriber) {
            const squad = await AppDataSource.getRepository(Squad).findOne({
                where: { ownerId: subscriber.id },
                relations: ["members"],
            });
            if (squad) {
                role = "owner";
                const activeMembers = squad.members.filter(m => m.status === "active");
                squadInfo = {
                    id: squad.id,
                    maxMembers: squad.maxMembers,
                    memberCount: activeMembers.length,
                };
            }
        }

        // If uid has no subscriber record, check if they're a squad member.
        if (!subscriber) {
            const membership = await AppDataSource.getRepository(SquadMember)
                .createQueryBuilder("m")
                .innerJoinAndSelect("m.squad", "s")
                .innerJoinAndSelect("s.owner", "o")
                .innerJoinAndSelect("o.subscription", "sub")
                .where("m.uid = :uid", { uid })
                .andWhere("m.status = :memberStatus", { memberStatus: "active" })
                .andWhere(
                    "(" +
                        "(o.status IN (:...ownerStatuses) AND (o.currentPeriodEnd IS NULL OR o.currentPeriodEnd > :now))" +
                        " OR " +
                        "(o.status = 'cancelled' AND o.currentPeriodEnd > :now)" +
                    ")",
                    { ownerStatuses: ["active", "trialing"], now: new Date() },
                )
                .getOne();

            if (membership) {
                role = "member";
                const owner = membership.squad.owner;
                // Build a synthetic subscriber response from the owner's data
                // so the portal can display the plan info
                return {
                    uid,
                    role,
                    squad: {
                        id: membership.squad.id,
                        ownerUid: owner.uid,
                    },
                    subscriber: {
                        id: owner.id,
                        subscription: {
                            id: owner.subscription.id,
                            name: owner.subscription.name,
                            description: owner.subscription.description,
                            amount: owner.subscription.amount,
                            currency: owner.subscription.currency,
                            interval: owner.subscription.interval,
                            intervalCount: owner.subscription.intervalCount,
                        },
                        status: owner.status,
                        currentPeriodStart: owner.currentPeriodStart,
                        currentPeriodEnd: owner.currentPeriodEnd,
                        trialEnd: owner.trialEnd,
                        renewalMode: owner.renewalMode,
                        provider: owner.provider,
                    },
                    invoices: [],
                    availablePlans: [],
                    checkoutConfig: account?.checkoutConfig || {},
                };
            }
        }

        // Load invoices for the active subscriber.
        let invoices: Invoice[] = [];
        if (subscriber) {
            invoices = await invoiceRepo.find({
                where: { subscriberId: subscriber.id },
                order: { createdAt: "DESC" },
                take: 50,
            });
        }

        return {
            uid,
            role,
            squad: squadInfo,
            subscriber: subscriber
                ? {
                      id: subscriber.id,
                      subscription: {
                          id: subscriber.subscription.id,
                          name: subscriber.subscription.name,
                          description: subscriber.subscription.description,
                          amount: subscriber.subscription.amount,
                          currency: subscriber.subscription.currency,
                          interval: subscriber.subscription.interval,
                          intervalCount: subscriber.subscription.intervalCount,
                      },
                      status: subscriber.status,
                      currentPeriodStart: subscriber.currentPeriodStart,
                      currentPeriodEnd: subscriber.currentPeriodEnd,
                      trialEnd: subscriber.trialEnd,
                      renewalMode: subscriber.renewalMode,
                      provider: subscriber.provider,
                  }
                : null,
            invoices: invoices.map((inv) => ({
                id: inv.id,
                amount: inv.amount,
                currency: inv.currency,
                status: inv.status,
                provider: inv.provider,
                paidAt: inv.paidAt,
                createdAt: inv.createdAt,
            })),
            checkoutConfig: account?.checkoutConfig || {},
        };
    }

    /**
     * Cancel a recurring subscription.
     *
     * Sets subscriber status to `cancelled` and cancels any pending invoices.
     * One-time subscriptions cannot be cancelled.
     */
    @Post("/cancel")
    @Summary("Cancel subscription")
    @Description("Cancels a recurring subscription. Sets status to cancelled and cancels pending invoices.")
    @Returns(200)
    @Returns(400)
    @Returns(403)
    @Returns(404)
    async cancel(@BodyParams() { token, subscriberId }: PortalCancelBody) {
        const uid = this.verifyToken(token);
        const subscriber = await this.loadSubscriber(subscriberId, uid);

        if (subscriber.subscription.interval === "one_time") {
            throw new AppError(400, ErrorCode.SUBSCRIPTION_NOT_CANCELLABLE, "One-time subscriptions cannot be cancelled");
        }

        if (subscriber.status === "cancelled") {
            throw new AppError(400, ErrorCode.SUBSCRIPTION_CANCELED, "Subscription is already cancelled");
        }

        if (subscriber.status === "expired") {
            throw new AppError(400, ErrorCode.BAD_REQUEST, "Subscription has already expired");
        }

        if (subscriber.status === "pending") {
            throw new AppError(400, ErrorCode.BAD_REQUEST, "Cannot cancel a subscription with no completed payment");
        }

        // Cancel the subscriber.
        // Status is set to "cancelled" immediately, but currentPeriodEnd is
        // preserved so the subscriber retains access until the end of the
        // billing period they already paid for (Stripe-style "cancel at period end").
        subscriber.status = "cancelled";
        await AppDataSource.getRepository(Subscriber).save(subscriber);

        // Cancel any pending invoices.
        await AppDataSource.getRepository(Invoice)
            .createQueryBuilder()
            .update(Invoice)
            .set({ status: "cancelled" })
            .where("subscriberId = :sid AND status = :status", {
                sid: subscriberId,
                status: "pending",
            })
            .execute();

        this.logger.info(`Portal: subscription cancelled for subscriber ${subscriberId} (access until ${subscriber.currentPeriodEnd?.toISOString() ?? "now"})`);

        // Dispatch outgoing webhook.
        await this.outgoingWebhooks.dispatch("subscription.cancelled", {
            subscriberId: subscriber.id,
            subscriptionId: subscriber.subscriptionId,
            uid,
            cancelledVia: "portal",
            accessUntil: subscriber.currentPeriodEnd?.toISOString() ?? null,
        });

        return { success: true, status: "cancelled", accessUntil: subscriber.currentPeriodEnd ?? null };
    }

    /**
     * Renew an expired, cancelled, or past_due subscription.
     *
     * Creates a checkout link for the same plan. The subscriber is
     * redirected to the standard checkout flow for payment.
     */
    @Post("/renew")
    @Summary("Renew subscription")
    @Description("Creates a checkout URL for renewing an expired/cancelled subscription.")
    @Returns(200)
    @Returns(400)
    @Returns(403)
    @Returns(404)
    async renew(@BodyParams() { token, subscriberId }: PortalRenewBody) {
        const uid = this.verifyToken(token);
        const subscriber = await this.loadSubscriber(subscriberId, uid);

        if (subscriber.status === "active") {
            // Allow renewal if the billing period has already ended (subscriber is
            // effectively expired but the worker hasn't transitioned status yet).
            const periodStillValid = !subscriber.currentPeriodEnd || subscriber.currentPeriodEnd > new Date();
            if (periodStillValid) {
                throw new AppError(400, ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE, "Subscription is already active");
            }
        }

        if (subscriber.status === "trialing") {
            throw new AppError(400, ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE, "Trial subscription is still active");
        }

        if (subscriber.status === "pending") {
            throw new AppError(400, ErrorCode.BAD_REQUEST, "A pending payment is already in progress — complete or cancel it first");
        }

        if (subscriber.subscription.interval === "one_time") {
            throw new AppError(400, ErrorCode.BAD_REQUEST, "One-time subscriptions cannot be renewed");
        }

        // Create a checkout link for the same plan.
        const { token: checkoutToken } = createCheckoutToken(subscriber.subscriptionId, uid);
        const checkoutUrl = `/pay/s/${checkoutToken}`;

        this.logger.info(`Portal: renewal initiated for subscriber ${subscriberId}`);

        return { checkoutUrl };
    }

    /**
     * Get invoice history for a subscriber.
     *
     * Returns a paginated list of invoices, most recent first.
     */
    @Get("/invoices")
    @Summary("Subscriber invoice history")
    @Description("Returns invoice history for a subscriber, verified by portal token.")
    @Returns(200)
    @Returns(400)
    @Returns(403)
    @Returns(404)
    async invoices(
        @QueryParams("token") token: string,
        @QueryParams("subscriberId") subscriberId: string,
    ) {
        if (!token || !subscriberId) {
            throw new AppError(400, ErrorCode.BAD_REQUEST, "Missing token or subscriberId");
        }

        const uid = this.verifyToken(token);
        await this.loadSubscriber(subscriberId, uid);

        const invoices = await AppDataSource.getRepository(Invoice).find({
            where: { subscriberId },
            order: { createdAt: "DESC" },
            take: 100,
        });

        return invoices.map((inv) => ({
            id: inv.id,
            amount: inv.amount,
            currency: inv.currency,
            status: inv.status,
            provider: inv.provider,
            paidAt: inv.paidAt,
            createdAt: inv.createdAt,
        }));
    }
}
