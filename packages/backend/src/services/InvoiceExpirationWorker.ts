/**
 * @module services/InvoiceExpirationWorker
 *
 * Background worker that periodically cancels stale pending invoices.
 *
 * Behaviour:
 * - Polls on a configurable interval (`INVOICE_EXPIRE_POLL_MS`, default 60 s).
 * - Reads the {@link Account} singleton for the `invoiceAutoExpire` toggle
 *   and `invoiceExpireTtlMinutes` TTL.
 * - When enabled, finds all pending invoices older than the TTL and:
 *   1. Attempts provider-side cancellation via `@CancelPayment()` (if supported).
 *   2. Sets the invoice status to `cancelled` in the database.
 *   3. Dispatches a `payment.cancelled` outgoing webhook.
 */

import { Injectable, OnInit, OnDestroy, Inject } from "@tsed/di";
import { Logger } from "@tsed/logger";
import { LessThanOrEqual, In } from "typeorm";
import { AppDataSource } from "../core/datasource";
import { Account } from "../entities/Account";
import { Invoice } from "../entities/Invoice";
import { Subscriber } from "../entities/Subscriber";
import { BillingService } from "./BillingService";
import { OutgoingWebhookService } from "./OutgoingWebhookService";
import { SquadService } from "./SquadService";

/** Invoice auto-expiration poll interval (default 5 min — short enough for any practical TTL). */
const INVOICE_POLL_MS = Number(process.env.INVOICE_EXPIRE_POLL_MS) || 300_000;

/** Subscription/trial/invite expiration poll interval (default 30 min). */
const SUBSCRIPTION_POLL_MS = Number(process.env.SUBSCRIPTION_EXPIRE_POLL_MS) || 1_800_000;

@Injectable()
export class InvoiceExpirationWorker implements OnInit, OnDestroy {
    private invoiceTimer?: ReturnType<typeof setInterval>;
    private subscriptionTimer?: ReturnType<typeof setInterval>;

    @Inject()
    logger!: Logger;

    constructor(
        private readonly billing: BillingService,
        private readonly outgoingWebhooks: OutgoingWebhookService,
        private readonly squads: SquadService,
    ) {}

    async $onInit(): Promise<void> {
        // Fast loop: invoice auto-expiration (minutes granularity).
        this.invoiceTimer = setInterval(() => this.processExpiredInvoices(), INVOICE_POLL_MS);

        // Slow loop: subscription/trial/invite expiration (hours granularity).
        this.subscriptionTimer = setInterval(async () => {
            await this.processExpiredTrials();
            await this.processExpiredActiveManualSubscriptions();
            await this.processExpiredCancelledSubscriptions();
            await this.squads.expireStaleInvites();
        }, SUBSCRIPTION_POLL_MS);

        this.logger.info(
            `Workers started — invoices: every ${INVOICE_POLL_MS / 60_000}min, subscriptions: every ${SUBSCRIPTION_POLL_MS / 60_000}min`,
        );
    }

    $onDestroy(): void {
        if (this.invoiceTimer) clearInterval(this.invoiceTimer);
        if (this.subscriptionTimer) clearInterval(this.subscriptionTimer);
    }

    // ─── Core Logic ─────────────────────────────────────────────

    private async processExpiredInvoices(): Promise<void> {
        try {
            const account = await AppDataSource.getRepository(Account).findOne({ where: {} });
            if (!account || !account.invoiceAutoExpire) return;

            const ttlMs = account.invoiceExpireTtlMinutes * 60_000;
            const cutoff = new Date(Date.now() - ttlMs);

            const invoiceRepo = AppDataSource.getRepository(Invoice);
            const expired = await invoiceRepo.find({
                where: {
                    status: "pending",
                    createdAt: LessThanOrEqual(cutoff),
                },
            });

            if (expired.length === 0) return;

            const engine = this.billing.getEngine();

            for (const invoice of expired) {
                // Attempt provider-side cancellation (fire-and-forget).
                if (invoice.providerInvoiceId && invoice.provider && engine.can(invoice.provider, "cancel")) {
                    try {
                        await engine.cancel(invoice.provider, {
                            invoiceId: invoice.id,
                            providerInvoiceId: invoice.providerInvoiceId,
                            amount: invoice.amount,
                            currency: invoice.currency,
                            providerData: invoice.providerData,
                        });
                    } catch (err: any) {
                        this.logger.error(`Provider cancel failed for invoice ${invoice.id}: ${err.message}`);
                    }
                }

                // Update DB status.
                invoice.status = "cancelled";
                await invoiceRepo.save(invoice);

                // Dispatch outgoing webhook.
                await this.outgoingWebhooks.dispatch("payment.cancelled", {
                    invoiceId: invoice.id,
                    subscriberId: invoice.subscriberId,
                    subscriptionId: invoice.subscriptionId,
                    amount: invoice.amount,
                    currency: invoice.currency,
                    provider: invoice.provider,
                    reason: "auto_expired",
                });
            }

            this.logger.info(`Auto-expired ${expired.length} stale pending invoice(s)`);
        } catch (err: any) {
            this.logger.error(`Invoice expiration worker error: ${err.message}`);
        }
    }

    private async processExpiredTrials(): Promise<void> {
        try {
            const subscriberRepo = AppDataSource.getRepository(Subscriber);
            const now = new Date();

            const expiredTrials = await subscriberRepo.find({
                where: {
                    status: "trialing",
                    trialEnd: LessThanOrEqual(now),
                },
            });

            if (expiredTrials.length === 0) return;

            for (const subscriber of expiredTrials) {
                subscriber.status = "expired";
                await subscriberRepo.save(subscriber);

                await this.outgoingWebhooks.dispatch("trial.expired", {
                    subscriberId: subscriber.id,
                    subscriptionId: subscriber.subscriptionId,
                    uid: subscriber.uid,
                    trialEnd: subscriber.trialEnd?.toISOString(),
                });

                this.logger.info(`Trial expired for subscriber ${subscriber.id} (uid: ${subscriber.uid})`);
            }

            this.logger.info(`Auto-expired ${expiredTrials.length} trialing subscriber(s)`);
        } catch (err: any) {
            this.logger.error(`Trial expiration check error: ${err.message}`);
        }
    }

    /**
     * Expire active subscribers with manual renewal whose billing period has ended.
     *
     * When a subscriber has `renewalMode = "manual"` (i.e. the payment provider
     * does NOT handle automatic recurring billing), AnyBill must detect when
     * their `currentPeriodEnd` has passed and transition them to `expired`.
     *
     * This prevents the bug where manual-renewal subscribers stay in `active`
     * status indefinitely after their billing period ends.
     *
     * Note: `provider_managed` subscribers are NOT touched here — their provider
     * is expected to send renewal webhooks or failure notifications.
     */
    private async processExpiredActiveManualSubscriptions(): Promise<void> {
        try {
            const subscriberRepo = AppDataSource.getRepository(Subscriber);
            const now = new Date();

            const expiredActive = await subscriberRepo.find({
                where: {
                    status: "active",
                    renewalMode: "manual",
                    currentPeriodEnd: LessThanOrEqual(now),
                },
            });

            if (expiredActive.length === 0) return;

            for (const subscriber of expiredActive) {
                // Skip subscribers with null currentPeriodEnd (one-time / manual management).
                if (!subscriber.currentPeriodEnd) continue;

                subscriber.status = "expired";
                await subscriberRepo.save(subscriber);

                await this.outgoingWebhooks.dispatch("subscription.expired", {
                    subscriberId: subscriber.id,
                    subscriptionId: subscriber.subscriptionId,
                    uid: subscriber.uid,
                    expiredAt: subscriber.currentPeriodEnd.toISOString(),
                });

                this.logger.info(
                    `Active manual subscription expired for subscriber ${subscriber.id} (uid: ${subscriber.uid}, periodEnd: ${subscriber.currentPeriodEnd.toISOString()})`,
                );
            }

            this.logger.info(`Transitioned ${expiredActive.length} active manual → expired subscriber(s)`);
        } catch (err: any) {
            this.logger.error(`Active manual subscription expiration check error: ${err.message}`);
        }
    }

    /**
     * Notify when cancelled subscriptions' paid period has elapsed.
     *
     * Subscribers cancelled via portal retain access until currentPeriodEnd.
     * Once that date passes, access is already denied by checkAccess — but we
     * also fire a subscription.expired webhook so the client app can clean up
     * (revoke tokens, send emails, etc.) and mark them as expired in the DB.
     */
    private async processExpiredCancelledSubscriptions(): Promise<void> {
        try {
            const subscriberRepo = AppDataSource.getRepository(Subscriber);
            const now = new Date();

            // Find cancelled subscribers whose paid period just ended.
            // We mark them as "expired" so they don't keep appearing in cancelled queries.
            const expiredCancelled = await subscriberRepo.find({
                where: {
                    status: "cancelled",
                    currentPeriodEnd: LessThanOrEqual(now),
                },
            });

            if (expiredCancelled.length === 0) return;

            for (const subscriber of expiredCancelled) {
                // Only process those that had a real period end set (skip null / legacy)
                if (!subscriber.currentPeriodEnd) continue;

                subscriber.status = "expired";
                await subscriberRepo.save(subscriber);

                await this.outgoingWebhooks.dispatch("subscription.expired", {
                    subscriberId: subscriber.id,
                    subscriptionId: subscriber.subscriptionId,
                    uid: subscriber.uid,
                    expiredAt: subscriber.currentPeriodEnd.toISOString(),
                });

                this.logger.info(`Cancelled subscription expired for subscriber ${subscriber.id} (uid: ${subscriber.uid})`);
            }

            if (expiredCancelled.length > 0) {
                this.logger.info(`Transitioned ${expiredCancelled.length} cancelled → expired subscriber(s)`);
            }
        } catch (err: any) {
            this.logger.error(`Cancelled subscription expiration check error: ${err.message}`);
        }
    }
}
