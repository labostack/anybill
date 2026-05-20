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

@Injectable()
export class BillingService implements OnInit {
    private engine!: BillingEngine;

    constructor(
        private readonly providerLoader: ProviderLoader,
        private readonly outgoingWebhooks: OutgoingWebhookService,
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

        this.engine.on("payment:confirmed", ({ payment }) => this.onPaymentConfirmed(payment.id, payment.metadata));
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

    /**
     * Create a payment for a subscription plan.
     *
     * Finds or creates a subscriber, cancels stale pending invoices,
     * creates a new pending invoice, and generates a payment link.
     *
     * @param subscriptionId - ID of the subscription plan.
     * @param uid            - External user identifier.
     * @param providerName   - Payment provider to use.
     * @returns Invoice ID and payment URL.
     * @throws {Error} If the subscription doesn't exist or one-time was already purchased.
     */
    async createPayment(subscriptionId: string, uid: string, providerName: string) {
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

        // Create pending invoice.
        const invoice = invoiceRepo.create({
            subscriberId: subscriber.id,
            subscriptionId: subscription.id,
            provider: providerName,
            amount: subscription.amount,
            currency: subscription.currency,
            status: "pending",
        });
        await invoiceRepo.save(invoice);

        // Generate payment link via engine.
        const link = await this.engine.createPaymentLink(providerName, {
            plan: { ...subscription, invoiceId: invoice.id },
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

    // ─── Event Handlers ─────────────────────────────────────────

    /** Handle a confirmed payment: mark invoice as paid, activate subscriber. */
    private async onPaymentConfirmed(providerInvoiceId: string, metadata?: Record<string, any>): Promise<void> {
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
            subscriber.status = "active";
            subscriber.currentPeriodStart = new Date();

            const subscription = await AppDataSource.getRepository(Subscription).findOneBy({ id: invoice.subscriptionId });
            if (subscription && subscription.interval !== "one_time") {
                subscriber.currentPeriodEnd = computePeriodEnd(subscription.interval, subscription.intervalCount);
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
