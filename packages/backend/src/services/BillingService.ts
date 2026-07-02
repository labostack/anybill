/**
 * @module services/BillingService
 *
 * Core billing service bridging the {@link BillingEngine} with the database.
 *
 * Handles the full payment lifecycle:
 * 1. Create subscriber + invoice + payment link via provider.
 * 2. React to engine events (confirmed, failed, refunded, renewed).
 * 3. Update entity state and dispatch outgoing webhooks.
 */

import { Injectable, OnInit, Inject } from "@tsed/di";
import { NotFound, Conflict, BadRequest } from "@tsed/exceptions";
import { Logger } from "@tsed/logger";
import { BillingEngine } from "../billing/BillingEngine";
import { AppDataSource } from "../core/datasource";
import { Invoice } from "../entities/Invoice";
import { Subscriber } from "../entities/Subscriber";
import { Subscription, type SubscriptionInterval } from "../entities/Subscription";
import { Account } from "../entities/Account";
import { Squad } from "../entities/Squad";
import { SquadMember } from "../entities/SquadMember";
import { SquadInvite } from "../entities/SquadInvite";
import { ProviderLoader } from "./ProviderLoader";
import { OutgoingWebhookService } from "./OutgoingWebhookService";
import { CouponService } from "./CouponService";
import { ExchangeRateService } from "./ExchangeRateService";

@Injectable()
export class BillingService implements OnInit {
    private engine!: BillingEngine;

    constructor(
        private readonly providerLoader: ProviderLoader,
        private readonly outgoingWebhooks: OutgoingWebhookService,
        private readonly couponService: CouponService,
        private readonly exchangeRate: ExchangeRateService,
    ) {}

    @Inject()
    logger!: Logger;

    // ─── Lifecycle ──────────────────────────────────────────────

    /** Initialize the billing engine and register event handlers. */
    async $onInit(): Promise<void> {
        const providers = await this.providerLoader.load();

        this.engine = new BillingEngine({
            debug: process.env.NODE_ENV !== "production",
        });

        for (const [name, provider] of providers) {
            this.engine.provider(name, provider);
        }

        this.engine.on("payment:confirmed", ({ provider, payment }) => this.onPaymentConfirmed(payment.id, provider, payment.metadata));
        this.engine.on("payment:failed", ({ payment }) => this.onPaymentFailed(payment.id));
        this.engine.on("payment:refunded", ({ payment }) => this.onPaymentRefunded(payment.id));
        this.engine.on("payment:renewed", ({ provider, payment }) => this.onPaymentRenewed(payment.id, provider, payment.metadata));

        this.logger.info(`Billing engine ready (${providers.size} providers)`);
    }

    // ─── Public API ─────────────────────────────────────────────

    /** Get registered provider name identifiers. */
    getProviderNames(): string[] {
        return this.engine.getProviderNames();
    }

    /** Get provider info with display names and capabilities. */
    getProviders() {
        return this.engine.getProviders();
    }

    /** Expose the engine instance for the invoice expiration worker. */
    getEngine(): BillingEngine {
        return this.engine;
    }

    /**
     * Create a payment for a subscription plan.
     *
     * Finds or creates a subscriber, cancels stale pending invoices,
     * creates a new pending invoice, and generates a payment link.
     *
     * @param subscriptionId - ID of the subscription plan.
     * @param uid            - External user identifier.
     * @param providerName   - Payment provider to use.
     * @param couponCode     - Optional coupon/promo code to apply.
     * @returns Invoice ID and payment URL.
     * @throws {Error} If the subscription doesn't exist or one-time was already purchased.
     */
    async createPayment(subscriptionId: string, uid: string, providerName: string, couponCode?: string, prevSubscriberId?: string, clientIp?: string, origin?: string, successUrl?: string, variantId?: string) {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const subscriptionRepo = AppDataSource.getRepository(Subscription);

        const subscription = await subscriptionRepo.findOneBy({ id: subscriptionId });
        if (!subscription) throw new NotFound("Subscription not found");

        // Find or create subscriber.
        let subscriber = await subscriberRepo.findOneBy({ uid, subscriptionId });
        if (!subscriber) {
            // Auto-detect plan change: if the uid already has an active/trialing subscriber
            // on a different plan and no prevSubscriberId was explicitly provided, treat the
            // existing subscription as the previous one so we don't create a duplicate.
            if (!prevSubscriberId) {
                const activeOnOtherPlan = await subscriberRepo
                    .createQueryBuilder("s")
                    .where("s.uid = :uid", { uid })
                    .andWhere("s.subscriptionId != :subscriptionId", { subscriptionId })
                    .andWhere("s.status IN (:...statuses)", { statuses: ["active", "trialing"] })
                    .andWhere("(s.currentPeriodEnd IS NULL OR s.currentPeriodEnd > :now)", { now: new Date() })
                    .orderBy("s.currentPeriodEnd", "DESC")
                    .getOne();

                if (activeOnOtherPlan) {
                    prevSubscriberId = activeOnOtherPlan.id;
                    this.logger.info(
                        `Auto plan-change detected: uid=${uid} switching from subscriber ${activeOnOtherPlan.id} (plan ${activeOnOtherPlan.subscriptionId}) to plan ${subscriptionId}`,
                    );
                }
            }

            subscriber = subscriberRepo.create({
                uid,
                subscriptionId,
                status: "pending",
                // Carry prevSubscriberId so onPaymentConfirmed can cancel the old subscription.
                metadata: prevSubscriberId ? { prevSubscriberId } : null,
            });
            await subscriberRepo.save(subscriber);
        } else if (prevSubscriberId && !subscriber.metadata?.prevSubscriberId) {
            // Subscriber already exists (e.g. returning after abandoned checkout) — refresh metadata.
            subscriber.metadata = { ...(subscriber.metadata ?? {}), prevSubscriberId };
            await subscriberRepo.save(subscriber);
        }

        // Block duplicate one-time purchases.
        if (subscription.interval === "one_time") {
            const existingPaid = await invoiceRepo.findOneBy({
                subscriberId: subscriber.id,
                subscriptionId,
                status: "paid",
            });
            if (existingPaid) {
                throw new Conflict("This one-time subscription has already been purchased");
            }
        }

        // Cancel stale pending invoices for this subscriber+subscription.
        // First, attempt provider-side cancellation for invoices that have a provider reference.
        const stalePending = await invoiceRepo.find({
            where: {
                subscriberId: subscriber.id,
                subscriptionId,
                status: "pending",
            },
        });

        for (const stale of stalePending) {
            if (stale.providerInvoiceId && stale.provider && this.engine.can(stale.provider, "cancel")) {
                this.engine.cancel(stale.provider, {
                    invoiceId: stale.id,
                    providerInvoiceId: stale.providerInvoiceId,
                    amount: stale.amount,
                    currency: stale.currency,
                    providerData: stale.providerData,
                }).catch((err) => this.logger.error(`Provider cancel failed for invoice ${stale.id}: ${err.message}`));
            }
        }

        // Bulk-cancel in DB.
        if (stalePending.length > 0) {
            await invoiceRepo
                .createQueryBuilder()
                .update(Invoice)
                .set({ status: "cancelled" })
                .where("subscriberId = :sid AND subscriptionId = :subId AND status = :status", {
                    sid: subscriber.id,
                    subId: subscriptionId,
                    status: "pending",
                })
                .execute();
        }

        // Apply coupon if provided.
        let invoiceAmount = subscription.amount;
        let originalAmount: number | null = null;
        let discountAmount = 0;
        let couponId: string | null = null;

        if (couponCode) {
            const result = await this.couponService.validateCoupon(couponCode, subscriptionId, uid);
            if (!result.valid) throw new BadRequest(result.error || "Invalid coupon");

            const discount = this.couponService.calculateDiscount(result.coupon!, subscription.amount);
            originalAmount = subscription.amount;
            discountAmount = discount.discountAmount;
            invoiceAmount = discount.finalAmount;
            couponId = result.coupon!.id;
        }

        const invoice = invoiceRepo.create({
            subscriberId: subscriber.id,
            subscriptionId: subscription.id,
            provider: providerName,
            amount: invoiceAmount,
            currency: subscription.currency,
            status: "pending",
            originalAmount,
            discountAmount,
            couponId,
            successUrl: successUrl || null,
        });
        await invoiceRepo.save(invoice);



        // Resolve variant and convert currency if needed.
        let variantData: { id: string; currency: string; convertedAmount: number } | undefined;
        let providerAmount: number | null = null;
        let providerCurrency: string | null = null;

        if (variantId) {
            const providerInfo = this.engine.getProviders().find(p => p.id === providerName);
            const variant = providerInfo?.variants.find(v => v.id === variantId);
            if (!variant) {
                throw new BadRequest(`Unknown variant "${variantId}" for provider "${providerName}"`);
            }

            if (variant.currency.toLowerCase() !== subscription.currency.toLowerCase()) {
                const convertedAmount = await this.exchangeRate.convert(
                    invoiceAmount,
                    subscription.currency,
                    variant.currency,
                );
                variantData = { id: variant.id, currency: variant.currency, convertedAmount };
                providerAmount = convertedAmount;
                providerCurrency = variant.currency;
            } else {
                // Same currency — no conversion, but still pass variant context.
                variantData = { id: variant.id, currency: variant.currency, convertedAmount: invoiceAmount };
            }
        }

        // Generate payment link via engine.
        const link = await this.engine.createPaymentLink(providerName, {
            plan: { ...subscription, amount: invoiceAmount, invoiceId: invoice.id },
            user: { uid, subscriberId: subscriber.id },
            origin,
            clientIp,
            variant: variantData,
        });

        // Persist provider data on the invoice.
        invoice.paymentUrl = link.url;
        invoice.providerInvoiceId = link.id ?? null;
        invoice.providerAmount = providerAmount;
        invoice.providerCurrency = providerCurrency;
        await invoiceRepo.save(invoice);

        return { invoiceId: invoice.id, paymentUrl: link.url };
    }

    /**
     * Forward an incoming provider webhook to the billing engine.
     *
     * @param providerName - Provider that sent the webhook.
     * @param body         - Raw request body.
     * @param headers      - HTTP headers.
     */
    async handleWebhook(providerName: string, body: any, headers: Record<string, string>) {
        return this.engine.handleWebhook(providerName, { body, headers });
    }

    /**
     * Refund a subscriber's latest paid invoice.
     *
     * If the provider supports refunds, delegates to the provider.
     * Otherwise, performs a manual (DB-only) refund.
     *
     * @param subscriberId - ID of the subscriber to refund.
     */
    async refundSubscriber(subscriberId: string) {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const subscriberRepo = AppDataSource.getRepository(Subscriber);

        const subscriber = await subscriberRepo.findOneBy({ id: subscriberId });
        if (!subscriber) throw new NotFound("Subscriber not found");

        const invoice = await invoiceRepo.findOne({
            where: { subscriberId, status: "paid" },
            order: { paidAt: "DESC" },
        });
        if (!invoice) throw new BadRequest("No paid invoice found to refund");

        if (!this.engine.can(invoice.provider, "refund")) {
                    // Manual refund: update DB state directly.
            invoice.status = "refunded";
            await invoiceRepo.save(invoice);
            // Refund = immediate access revocation (money returned — no grace period).
            subscriber.status = "cancelled";
            subscriber.currentPeriodEnd = new Date();
            await subscriberRepo.save(subscriber);
            return { refunded: true, method: "manual" };
        }

        await this.engine.refund(invoice.provider, {
            invoiceId: invoice.id,
            providerInvoiceId: invoice.providerInvoiceId,
            amount: invoice.amount,
            currency: invoice.currency,
            providerData: invoice.providerData,
        });

        return { refunded: true, method: "provider" };
    }

    /**
     * Check invoice status for the confirm page polling.
     *
     * @param invoiceId - ID of the invoice to check.
     * @returns Status and optional redirect URL, or `null` if not found.
     */
    async getInvoiceStatus(invoiceId: string) {
        const invoice = await AppDataSource.getRepository(Invoice).findOne({
            where: { id: invoiceId },
            relations: ["subscription"],
        });
        if (!invoice) return null;

        const account = await AppDataSource.getRepository(Account).findOne({ where: {} });

        return {
            status: invoice.status,
            redirectUrl: invoice.status === "paid"
                ? (invoice.successUrl || account?.successRedirectUrl || null)
                : null,
        };
    }

    /**
     * Start a free trial for a user on a subscription plan.
     *
     * Resolves the trial plan automatically if `subscriptionId` is omitted
     * and there is exactly one active plan with `trialDays > 0`.
     *
     * @param uid            - External user identifier.
     * @param subscriptionId - Optional plan ID. Auto-resolved if omitted.
     * @returns Subscriber ID, trial end date, and status.
     * @throws {BadRequest}  If no trial plans configured or multiple found without ID.
     * @throws {Conflict}    If the user already used a trial on this plan.
     */
    async startTrial(uid: string, subscriptionId?: string): Promise<{
        subscriberId: string;
        trialEnd: Date;
        status: "trialing";
    }> {
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const subscriptionRepo = AppDataSource.getRepository(Subscription);

        // 1. Resolve subscription.
        let subscription: Subscription;
        if (subscriptionId) {
            const found = await subscriptionRepo.findOneBy({ id: subscriptionId, isActive: true });
            if (!found) throw new NotFound("Subscription not found or inactive");
            subscription = found;
        } else {
            const trialPlans = await subscriptionRepo.find({
                where: { isActive: true },
            });
            const withTrial = trialPlans.filter(p => p.trialDays > 0 && p.interval !== "one_time");
            if (withTrial.length === 0) {
                throw new BadRequest("No trial plans configured");
            }
            if (withTrial.length > 1) {
                throw new BadRequest("Multiple trial plans found, specify subscriptionId");
            }
            subscription = withTrial[0];
        }

        // 2. Validate trial eligibility.
        if (subscription.trialDays <= 0) {
            throw new BadRequest("This plan does not offer a trial period");
        }
        if (subscription.interval === "one_time") {
            throw new BadRequest("One-time plans do not support trials");
        }

        // 3. Check for existing subscriber.
        const existing = await subscriberRepo.findOneBy({ uid, subscriptionId: subscription.id });
        if (existing) {
            if (existing.trialEnd) {
                throw new Conflict("Trial already used for this plan");
            }
            if (existing.status === "active") {
                // Allow if the billing period has already ended (phantom active).
                const periodStillValid = !existing.currentPeriodEnd || existing.currentPeriodEnd > new Date();
                if (periodStillValid) {
                    throw new Conflict("User already has an active subscription to this plan");
                }
            }
        }

        // 4. Create or reuse subscriber.
        const now = new Date();
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + subscription.trialDays);

        let subscriber: Subscriber;
        if (existing) {
            existing.status = "trialing";
            existing.trialEnd = trialEnd;
            existing.currentPeriodStart = now;
            existing.currentPeriodEnd = trialEnd;
            subscriber = await subscriberRepo.save(existing);
        } else {
            subscriber = subscriberRepo.create({
                uid,
                subscriptionId: subscription.id,
                status: "trialing",
                trialEnd,
                currentPeriodStart: now,
                currentPeriodEnd: trialEnd,
            });
            await subscriberRepo.save(subscriber);
        }

        // 5. Auto-create squad if plan supports it.
        await this.ensureSquad(subscriber, subscription, uid);

        // 6. Dispatch webhook.
        await this.outgoingWebhooks.dispatch("trial.started", {
            subscriberId: subscriber.id,
            subscriptionId: subscription.id,
            uid,
            trialDays: subscription.trialDays,
            trialEnd: trialEnd.toISOString(),
        });

        this.logger.info(`Trial started: uid=${uid}, plan=${subscription.name}, ends=${trialEnd.toISOString()}`);

        return {
            subscriberId: subscriber.id,
            trialEnd,
            status: "trialing",
        };
    }

    /**
     * Grant a subscription to a user without requiring payment.
     *
     * Creates (or reuses) a subscriber record in `active` status immediately.
     * Useful for admin overrides, promotional grants, comp accounts, etc.
     *
     * @param uid            - External user identifier.
     * @param subscriptionId - ID of the subscription plan to grant.
     * @param days           - Optional custom duration in days. Overrides plan interval.
     * @param startDate      - Optional start date (ISO 8601). Defaults to now.
     * @returns The created/updated subscriber record.
     * @throws {NotFound}  If subscription not found or inactive.
     * @throws {Conflict}  If user already has an active subscription to this plan.
     */
    async grantSubscription(
        uid: string,
        subscriptionId: string,
        days?: number,
        startDate?: string,
    ): Promise<{
        subscriberId: string;
        status: "active";
        currentPeriodStart: string;
        currentPeriodEnd: string | null;
    }> {
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const subscriptionRepo = AppDataSource.getRepository(Subscription);

        // 1. Resolve subscription.
        const subscription = await subscriptionRepo.findOneBy({ id: subscriptionId, isActive: true });
        if (!subscription) throw new NotFound("Subscription not found or inactive");

        // 2. Check for existing active subscriber.
        const existing = await subscriberRepo.findOneBy({ uid, subscriptionId });
        if (existing && (existing.status === "active" || existing.status === "trialing")) {
            // Allow if the billing period has already ended (phantom active/trialing).
            const periodStillValid = !existing.currentPeriodEnd || existing.currentPeriodEnd > new Date();
            if (periodStillValid) {
                throw new Conflict("User already has an active subscription to this plan");
            }
        }

        // 3. Compute period.
        const periodStart = startDate ? new Date(startDate) : new Date();
        let periodEnd: Date | null = null;

        if (days) {
            // Custom duration overrides plan interval.
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + days);
        } else if (subscription.interval !== "one_time") {
            periodEnd = computePeriodEnd(subscription.interval, subscription.intervalCount, periodStart);
        }

        // 4. Create or reuse subscriber.
        let subscriber: Subscriber;
        if (existing) {
            existing.status = "active";
            existing.currentPeriodStart = periodStart;
            existing.currentPeriodEnd = periodEnd;
            existing.renewalMode = "manual";
            existing.provider = null;
            existing.trialEnd = null;
            subscriber = await subscriberRepo.save(existing);
        } else {
            subscriber = subscriberRepo.create({
                uid,
                subscriptionId,
                status: "active",
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                renewalMode: "manual",
            });
            await subscriberRepo.save(subscriber);
        }

        // 5. Auto-create squad if plan supports it.
        await this.ensureSquad(subscriber, subscription, uid);

        // 6. Dispatch webhook (reusing payment.confirmed event so integrations react uniformly).
        await this.outgoingWebhooks.dispatch("payment.confirmed", {
            invoiceId: null,
            subscriberId: subscriber.id,
            subscriptionId: subscription.id,
            amount: 0,
            currency: subscription.currency,
            provider: "grant",
            providerInvoiceId: null,
            paidAt: new Date().toISOString(),
        });

        this.logger.info(`Subscription granted: uid=${uid}, plan=${subscription.name}, period=${periodStart.toISOString()}–${periodEnd?.toISOString() ?? "∞"}`);

        return {
            subscriberId: subscriber.id,
            status: "active",
            currentPeriodStart: periodStart.toISOString(),
            currentPeriodEnd: periodEnd?.toISOString() ?? null,
        };
    }

    /**
     * Cancel a subscriber's subscription.
     *
     * Sets status to `cancelled` but preserves `currentPeriodEnd` so the
     * subscriber retains access until the end of their current billing period.
     *
     * @param subscriberId - AnyBill subscriber UUID.
     * @throws {NotFound}    If subscriber not found.
     * @throws {BadRequest}  If the plan is one-time (cannot be cancelled).
     */
    async cancelSubscriber(subscriberId: string): Promise<Subscriber> {
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const sub = await subscriberRepo.findOne({ where: { id: subscriberId }, relations: ["subscription"] });
        if (!sub) throw new NotFound("Subscriber not found");
        if (sub.subscription?.interval === "one_time") {
            throw new BadRequest("One-time subscriptions cannot be cancelled");
        }
        sub.status = "cancelled";
        const saved = await subscriberRepo.save(sub);

        await this.outgoingWebhooks.dispatch("subscription.cancelled", {
            subscriberId: sub.id,
            subscriptionId: sub.subscriptionId,
            uid: sub.uid,
            cancelledVia: "sdk",
            accessUntil: sub.currentPeriodEnd?.toISOString() ?? null,
        });

        this.logger.info(`Subscription cancelled: subscriber=${subscriberId}`);
        return saved;
    }

    /**
     * Revoke a subscriber's access immediately.
     *
     * Sets status to `cancelled` AND clears billing period dates, so the
     * subscriber loses access right away (no grace period).
     *
     * @param subscriberId - AnyBill subscriber UUID.
     * @throws {NotFound} If subscriber not found.
     */
    async revokeSubscriber(subscriberId: string): Promise<Subscriber> {
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const sub = await subscriberRepo.findOneBy({ id: subscriberId });
        if (!sub) throw new NotFound("Subscriber not found");

        sub.status = "cancelled";
        sub.currentPeriodStart = null as any;
        sub.currentPeriodEnd = null as any;
        const saved = await subscriberRepo.save(sub);

        await this.outgoingWebhooks.dispatch("subscription.cancelled", {
            subscriberId: sub.id,
            subscriptionId: sub.subscriptionId,
            uid: sub.uid,
            cancelledVia: "sdk",
            accessUntil: null,
        });

        this.logger.info(`Subscription revoked: subscriber=${subscriberId}`);
        return saved;
    }

    /**
     * Permanently delete a subscriber and all related records.
     *
     * Cascade-deletes: squad invites → squad members → squad → invoices → subscriber.
     * This is a hard delete and cannot be undone.
     *
     * @param subscriberId - AnyBill subscriber UUID.
     * @throws {NotFound} If subscriber not found.
     */
    async deleteSubscriber(subscriberId: string): Promise<{ deleted: boolean }> {
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const sub = await subscriberRepo.findOneBy({ id: subscriberId });
        if (!sub) throw new NotFound("Subscriber not found");

        // Cascade-delete squad and related records.
        const squadRepo = AppDataSource.getRepository(Squad);
        const squad = await squadRepo.findOneBy({ ownerId: subscriberId });

        if (squad) {
            await AppDataSource.getRepository(SquadInvite).delete({ squadId: squad.id });
            await AppDataSource.getRepository(SquadMember).delete({ squadId: squad.id });
            await squadRepo.delete({ id: squad.id });
        }

        // Delete invoices, then the subscriber.
        await AppDataSource.getRepository(Invoice).delete({ subscriberId });
        await subscriberRepo.delete({ id: subscriberId });

        this.logger.info(`Subscriber deleted: id=${subscriberId}, uid=${sub.uid}`);
        return { deleted: true };
    }

    // ─── Shared Helpers ─────────────────────────────────────────

    /**
     * Ensure a squad exists for a subscriber on a squad-enabled plan.
     *
     * Handles three scenarios:
     * 1. **Migration** — if `prevSubscriberId` is provided and the old subscriber
     *    owns a squad, reassign ownership to the new subscriber.
     * 2. **Creation** — if no squad exists, create one and dispatch `squad.created`.
     * 3. **Sync** — if a squad already exists, sync `maxMembers` to the plan's limit.
     *
     * No-op if the plan does not have `squadEnabled`.
     */
    private async ensureSquad(
        subscriber: Subscriber,
        subscription: Subscription,
        uid: string,
        prevSubscriberId?: string,
    ): Promise<void> {
        if (!subscription.squadEnabled) return;

        const squadRepo = AppDataSource.getRepository(Squad);
        let squad = await squadRepo.findOneBy({ ownerId: subscriber.id });

        // Migrate squad from previous subscriber (plan change).
        if (!squad && prevSubscriberId) {
            const oldSquad = await squadRepo.findOneBy({ ownerId: prevSubscriberId });
            if (oldSquad) {
                oldSquad.ownerId = subscriber.id;
                oldSquad.maxMembers = subscription.squadMaxMembers || 0;
                squad = await squadRepo.save(oldSquad);
                this.logger.info(`Migrated squad ${squad.id} from old subscriber ${prevSubscriberId} to ${subscriber.id} on plan ${subscription.name}`);
            }
        }

        if (!squad) {
            // Create new squad.
            squad = squadRepo.create({
                ownerId: subscriber.id,
                maxMembers: subscription.squadMaxMembers || 0,
            });
            await squadRepo.save(squad);
            this.logger.info(`Auto-created squad ${squad.id} for subscriber ${subscriber.id} on plan ${subscription.name}`);

            await this.outgoingWebhooks.dispatch("squad.created", {
                squadId: squad.id,
                ownerUid: uid,
                subscriberId: subscriber.id,
                subscriptionId: subscription.id,
            });
        } else {
            // Sync maxMembers to current plan.
            squad.maxMembers = subscription.squadMaxMembers || 0;
            await squadRepo.save(squad);
        }
    }

    // ─── Event Handlers ─────────────────────────────────────────

    /** Handle a confirmed payment: mark invoice as paid, activate subscriber, determine renewal mode. */
    private async onPaymentConfirmed(providerInvoiceId: string, providerName: string, metadata?: Record<string, any>): Promise<void> {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const subscriberRepo = AppDataSource.getRepository(Subscriber);

        // Prefer lookup by our own invoiceId (set at creation, most reliable).
        // Fall back to providerInvoiceId if metadata.invoiceId is absent.
        let invoice = metadata?.invoiceId
            ? await invoiceRepo.findOneBy({ id: metadata.invoiceId })
            : null;
        if (!invoice) {
            invoice = await invoiceRepo.findOneBy({ providerInvoiceId });
        }
        if (!invoice) return;

        // Idempotency guard — provider may retry the same webhook.
        if (invoice.status !== "pending") {
            this.logger.warn(`onPaymentConfirmed: invoice ${invoice.id} already in status "${invoice.status}", skipping`);
            return;
        }

        invoice.status = "paid";
        invoice.paidAt = new Date();
        invoice.providerData = metadata ?? null;
        await invoiceRepo.save(invoice);

        const subscriber = await subscriberRepo.findOneBy({ id: invoice.subscriberId });
        if (subscriber) {
            const wasTrial = subscriber.status === "trialing";
            subscriber.status = "active";

            // Clear trial end on conversion to paid.
            if (wasTrial) {
                subscriber.trialEnd = null;
            }

            const subscription = await AppDataSource.getRepository(Subscription).findOneBy({ id: invoice.subscriptionId });
            if (subscription && subscription.interval !== "one_time") {
                // Stack periods for renewals: if this subscriber still has remaining
                // time (e.g. provider-managed renewal or SDK early renewal), extend
                // from currentPeriodEnd instead of resetting to now.
                // For plan changes, a new subscriber record is created with
                // currentPeriodEnd=null, so periodBase naturally falls to now.
                // For renewals, stack from currentPeriodEnd if still in the future.
                const now = new Date();
                const periodBase = (subscriber.currentPeriodEnd && subscriber.currentPeriodEnd > now)
                    ? subscriber.currentPeriodEnd
                    : now;
                subscriber.currentPeriodStart = now;
                subscriber.currentPeriodEnd = computePeriodEnd(subscription.interval, subscription.intervalCount, periodBase);

                // Day summation on upgrade: if the new plan is more expensive than
                // the old one (same currency), add the remaining days from the old
                // period to the new period end. This rewards upgraders — they keep
                // the time they already paid for on the cheaper plan.
                const prevSubId = subscriber.metadata?.prevSubscriberId;
                if (prevSubId) {
                    const prevSub = await subscriberRepo.findOne({
                        where: { id: prevSubId },
                        relations: ["subscription"],
                    });
                    if (
                        prevSub?.currentPeriodEnd &&
                        prevSub.subscription &&
                        subscription.amount > prevSub.subscription.amount &&
                        subscription.currency === prevSub.subscription.currency
                    ) {
                        const remainingMs = prevSub.currentPeriodEnd.getTime() - now.getTime();
                        if (remainingMs > 0) {
                            subscriber.currentPeriodEnd = new Date(
                                subscriber.currentPeriodEnd!.getTime() + remainingMs,
                            );
                            this.logger.info(
                                `Upgrade day-summation: added ${Math.round(remainingMs / 86400000)}d from old subscriber ${prevSubId} to new period end ${subscriber.currentPeriodEnd.toISOString()}`,
                            );
                        }
                    }
                }
            } else {
                subscriber.currentPeriodStart = new Date();
            }

            // Determine actual renewal mode based on provider capabilities.
            subscriber.provider = providerName;
            if (subscription && subscription.interval !== "one_time") {
                const providerInfo = this.engine.getProviders().find(p => p.id === providerName);
                const supportsRecurring = providerInfo?.capabilities.includes("recurring") ?? false;
                subscriber.renewalMode = supportsRecurring ? "provider_managed" : "manual";
            } else {
                subscriber.renewalMode = "manual";
            }

            await subscriberRepo.save(subscriber);

            // If this payment is a plan change, cancel the previous subscriber
            // now that the new one is confirmed active.
            const prevSubscriberId = subscriber.metadata?.prevSubscriberId;
            if (prevSubscriberId) {
                const prevSubscriber = await subscriberRepo.findOneBy({ id: prevSubscriberId });
                if (prevSubscriber && prevSubscriber.status !== "expired" && prevSubscriber.status !== "cancelled") {
                    // Cancel at period end — keep access until currentPeriodEnd.
                    prevSubscriber.status = "cancelled";
                    await subscriberRepo.save(prevSubscriber);

                    await this.outgoingWebhooks.dispatch("subscription.cancelled", {
                        subscriberId: prevSubscriber.id,
                        subscriptionId: prevSubscriber.subscriptionId,
                        uid: prevSubscriber.uid,
                        cancelledVia: "plan_change",
                        accessUntil: prevSubscriber.currentPeriodEnd?.toISOString() ?? null,
                        newSubscriberId: subscriber.id,
                        newSubscriptionId: subscriber.subscriptionId,
                    });

                    this.logger.info(`Plan change: cancelled old subscriber ${prevSubscriberId} after new payment confirmed`);
                }

                // Clear the prevSubscriberId from metadata — no longer needed.
                // Use destructuring to properly remove the key (undefined is stripped by JSON.stringify).
                const { prevSubscriberId: _removed, ...restMeta } = subscriber.metadata ?? {};
                subscriber.metadata = Object.keys(restMeta).length > 0 ? restMeta : null;
                await subscriberRepo.save(subscriber);
            }

            // Auto-create / migrate squad for squad-enabled plans.
            if (subscription) {
                await this.ensureSquad(subscriber, subscription, subscriber.uid, prevSubscriberId);
            }
        }

        await this.outgoingWebhooks.dispatch("payment.confirmed", {
            invoiceId: invoice.id,
            subscriberId: invoice.subscriberId,
            subscriptionId: invoice.subscriptionId,
            amount: invoice.amount,
            currency: invoice.currency,
            provider: invoice.provider,
            providerInvoiceId: invoice.providerInvoiceId,
            paidAt: invoice.paidAt?.toISOString(),
        });

        // Redeem coupon and dispatch webhook if a coupon was used.
        if (invoice.couponId) {
            await this.couponService.redeemCoupon(invoice.couponId);

            await this.outgoingWebhooks.dispatch("coupon.redeemed", {
                couponId: invoice.couponId,
                invoiceId: invoice.id,
                subscriberId: invoice.subscriberId,
                subscriptionId: invoice.subscriptionId,
                discountAmount: invoice.discountAmount,
                originalAmount: invoice.originalAmount,
                finalAmount: invoice.amount,
            });
        }
    }

    /** Handle a failed payment: mark invoice as failed. */
    private async onPaymentFailed(providerInvoiceId: string): Promise<void> {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const invoice = await invoiceRepo.findOneBy({ providerInvoiceId });
        if (!invoice) return;

        invoice.status = "failed";
        await invoiceRepo.save(invoice);

        await this.outgoingWebhooks.dispatch("payment.failed", {
            invoiceId: invoice.id,
            subscriberId: invoice.subscriberId,
            subscriptionId: invoice.subscriptionId,
            amount: invoice.amount,
            currency: invoice.currency,
            provider: invoice.provider,
        });
    }

    /** Handle a refund: mark invoice and cancel subscriber. */
    private async onPaymentRefunded(providerInvoiceId: string): Promise<void> {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const subscriberRepo = AppDataSource.getRepository(Subscriber);

        const invoice = await invoiceRepo.findOneBy({ providerInvoiceId });
        if (!invoice) return;

        invoice.status = "refunded";
        await invoiceRepo.save(invoice);

        const subscriber = await subscriberRepo.findOneBy({ id: invoice.subscriberId });
        if (subscriber) {
            // Refund = immediate access revocation (money returned — no grace period).
            subscriber.status = "cancelled";
            subscriber.currentPeriodEnd = new Date();
            await subscriberRepo.save(subscriber);
        }

        await this.outgoingWebhooks.dispatch("payment.refunded", {
            invoiceId: invoice.id,
            subscriberId: invoice.subscriberId,
            subscriptionId: invoice.subscriptionId,
            amount: invoice.amount,
            currency: invoice.currency,
            provider: invoice.provider,
        });
    }

    /** Handle a provider-managed renewal: create paid invoice and shift period. */
    private async onPaymentRenewed(providerInvoiceId: string, providerName: string, metadata?: Record<string, any>): Promise<void> {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const subscriptionRepo = AppDataSource.getRepository(Subscription);

        // Idempotency: skip if we already have a paid invoice for this providerInvoiceId.
        const existingPaid = await invoiceRepo.findOneBy({ providerInvoiceId, status: "paid" });
        if (existingPaid) {
            this.logger.warn(`onPaymentRenewed: duplicate renewal webhook for providerInvoiceId ${providerInvoiceId}, skipping`);
            return;
        }

        let subscriber: Subscriber | null = null;

        if (metadata?.subscriberId) {
            subscriber = await subscriberRepo.findOneBy({ id: metadata.subscriberId });
        }
        if (!subscriber && metadata?.uid && metadata?.subscriptionId) {
            subscriber = await subscriberRepo.findOneBy({
                uid: metadata.uid,
                subscriptionId: metadata.subscriptionId,
            });
        }
        if (!subscriber) {
            this.logger.error(`Renewal webhook: subscriber not found (provider: ${providerName})`);
            return;
        }

        const subscription = await subscriptionRepo.findOneBy({ id: subscriber.subscriptionId });
        if (!subscription) {
            this.logger.error(`Renewal webhook: subscription not found for subscriber ${subscriber.id}`);
            return;
        }

        const invoice = invoiceRepo.create({
            subscriberId: subscriber.id,
            subscriptionId: subscription.id,
            provider: providerName,
            providerInvoiceId,
            amount: subscription.amount,
            currency: subscription.currency,
            status: "paid",
            paidAt: new Date(),
            providerData: metadata ?? null,
        });
        await invoiceRepo.save(invoice);

        subscriber.status = "active";
        const now = new Date();
        const periodStart = (subscriber.currentPeriodEnd && subscriber.currentPeriodEnd > now)
            ? subscriber.currentPeriodEnd
            : now;
        subscriber.currentPeriodStart = now;
        subscriber.currentPeriodEnd = computePeriodEnd(subscription.interval, subscription.intervalCount, periodStart);
        subscriber.provider = providerName;
        subscriber.renewalMode = "provider_managed";
        await subscriberRepo.save(subscriber);

        await this.outgoingWebhooks.dispatch("subscription.renewed", {
            invoiceId: invoice.id,
            subscriberId: subscriber.id,
            subscriptionId: subscription.id,
            amount: invoice.amount,
            currency: invoice.currency,
            provider: providerName,
            currentPeriodStart: subscriber.currentPeriodStart?.toISOString(),
            currentPeriodEnd: subscriber.currentPeriodEnd?.toISOString(),
        });
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Compute the end date of a billing period.
 *
 * @param interval      - Billing interval type.
 * @param intervalCount - Number of intervals.
 * @param from          - Start date (defaults to now). Pass the current
 *                        period end to stack periods instead of resetting.
 * @returns The computed period end date.
 */
function computePeriodEnd(interval: SubscriptionInterval, intervalCount: number, from?: Date): Date {
    const end = new Date(from ?? new Date());
    switch (interval) {
        case "day":   end.setDate(end.getDate() + intervalCount); break;
        case "week":  end.setDate(end.getDate() + intervalCount * 7); break;
        case "month": end.setMonth(end.getMonth() + intervalCount); break;
        case "year":  end.setFullYear(end.getFullYear() + intervalCount); break;
    }
    return end;
}
