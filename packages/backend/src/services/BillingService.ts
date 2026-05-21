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
import { ProviderLoader } from "./ProviderLoader";
import { OutgoingWebhookService } from "./OutgoingWebhookService";
import { CouponService } from "./CouponService";

@Injectable()
export class BillingService implements OnInit {
    private engine!: BillingEngine;

    constructor(
        private readonly providerLoader: ProviderLoader,
        private readonly outgoingWebhooks: OutgoingWebhookService,
        private readonly couponService: CouponService,
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
    async createPayment(subscriptionId: string, uid: string, providerName: string, couponCode?: string) {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const subscriptionRepo = AppDataSource.getRepository(Subscription);

        const subscription = await subscriptionRepo.findOneBy({ id: subscriptionId });
        if (!subscription) throw new NotFound("Subscription not found");

        // Find or create subscriber.
        let subscriber = await subscriberRepo.findOneBy({ uid, subscriptionId });
        if (!subscriber) {
            subscriber = subscriberRepo.create({ uid, subscriptionId, status: "pending" });
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

        // Create pending invoice.
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
        });
        await invoiceRepo.save(invoice);



        // Generate payment link via engine.
        const link = await this.engine.createPaymentLink(providerName, {
            plan: { ...subscription, amount: invoiceAmount, invoiceId: invoice.id },
            user: { uid, subscriberId: subscriber.id },
        });

        // Persist provider data on the invoice.
        invoice.paymentUrl = link.url;
        invoice.providerInvoiceId = link.id ?? null;
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
            subscriber.status = "cancelled";
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
            redirectUrl: invoice.status === "paid" ? account?.successRedirectUrl : null,
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
                throw new Conflict("User already has an active subscription to this plan");
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
        if (subscription.squadEnabled) {
            const squadRepo = AppDataSource.getRepository(Squad);
            const existingSquad = await squadRepo.findOneBy({ ownerId: subscriber.id });
            if (!existingSquad) {
                const squad = squadRepo.create({
                    ownerId: subscriber.id,
                    maxMembers: subscription.squadMaxMembers || 0,
                });
                await squadRepo.save(squad);
                this.logger.info(`Auto-created squad ${squad.id} for trial subscriber ${subscriber.id}`);

                await this.outgoingWebhooks.dispatch("squad.created", {
                    squadId: squad.id,
                    ownerUid: uid,
                    subscriberId: subscriber.id,
                    subscriptionId: subscription.id,
                });
            }
        }

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

    // ─── Event Handlers ─────────────────────────────────────────

    /** Handle a confirmed payment: mark invoice as paid, activate subscriber, determine renewal mode. */
    private async onPaymentConfirmed(providerInvoiceId: string, providerName: string, metadata?: Record<string, any>): Promise<void> {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const subscriberRepo = AppDataSource.getRepository(Subscriber);

        const invoice = await invoiceRepo.findOne({
            where: [
                { providerInvoiceId },
                { id: metadata?.invoiceId },
            ],
        });
        if (!invoice) return;

        invoice.status = "paid";
        invoice.paidAt = new Date();
        invoice.providerData = metadata ?? null;
        await invoiceRepo.save(invoice);

        const subscriber = await subscriberRepo.findOneBy({ id: invoice.subscriberId });
        if (subscriber) {
            const wasTrial = subscriber.status === "trialing";
            subscriber.status = "active";
            subscriber.currentPeriodStart = new Date();

            // Clear trial end on conversion to paid.
            if (wasTrial) {
                subscriber.trialEnd = null;
            }

            const subscription = await AppDataSource.getRepository(Subscription).findOneBy({ id: invoice.subscriptionId });
            if (subscription && subscription.interval !== "one_time") {
                subscriber.currentPeriodEnd = computePeriodEnd(subscription.interval, subscription.intervalCount);
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

            // Auto-create squad for squad-enabled plans.
            if (subscription && subscription.squadEnabled) {
                const squadRepo = AppDataSource.getRepository(Squad);
                const existingSquad = await squadRepo.findOneBy({ ownerId: subscriber.id });
                if (!existingSquad) {
                    const squad = squadRepo.create({
                        ownerId: subscriber.id,
                        maxMembers: subscription.squadMaxMembers || 0,
                    });
                    await squadRepo.save(squad);
                    this.logger.info(`Auto-created squad ${squad.id} for subscriber ${subscriber.id} on plan ${subscription.name}`);

                    await this.outgoingWebhooks.dispatch("squad.created", {
                        squadId: squad.id,
                        ownerUid: subscriber.uid,
                        subscriberId: subscriber.id,
                        subscriptionId: subscription.id,
                    });
                }
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
            subscriber.status = "cancelled";
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
        subscriber.currentPeriodStart = new Date();
        subscriber.currentPeriodEnd = computePeriodEnd(subscription.interval, subscription.intervalCount);
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
 * Compute the end date of a billing period starting from now.
 *
 * @param interval      - Billing interval type.
 * @param intervalCount - Number of intervals.
 * @returns The computed period end date.
 */
function computePeriodEnd(interval: SubscriptionInterval, intervalCount: number): Date {
    const end = new Date();
    switch (interval) {
        case "day":   end.setDate(end.getDate() + intervalCount); break;
        case "week":  end.setDate(end.getDate() + intervalCount * 7); break;
        case "month": end.setMonth(end.getMonth() + intervalCount); break;
        case "year":  end.setFullYear(end.getFullYear() + intervalCount); break;
    }
    return end;
}
