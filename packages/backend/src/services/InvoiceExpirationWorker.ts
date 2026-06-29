/**
 * @module services/InvoiceExpirationWorker
 *
 * Background worker that periodically processes expired invoices, trials,
 * and subscriptions using node-cron.
 *
 * Behaviour:
 * - Runs immediately on startup, then on cron schedule.
 * - Invoice auto-expiration: every 5 minutes (configurable via `INVOICE_CRON`).
 * - Subscription/trial/invite expiration: every 30 minutes (configurable via `SUBSCRIPTION_CRON`).
 * - Reads the {@link Account} singleton for the `invoiceAutoExpire` toggle
 *   and `invoiceExpireTtlMinutes` TTL.
 * - When enabled, finds all pending invoices older than the TTL and:
 *   1. Attempts provider-side cancellation via `@CancelPayment()` (if supported).
 *   2. Sets the invoice status to `cancelled` in the database.
 *   3. Dispatches a `payment.cancelled` outgoing webhook.
 */

import { Injectable, OnInit, OnDestroy, Inject } from "@tsed/di";
import { Logger } from "@tsed/logger";
import cron, { ScheduledTask } from "node-cron";
import { LessThanOrEqual } from "typeorm";
import { AppDataSource } from "../core/datasource";
import { Account } from "../entities/Account";
import { Invoice } from "../entities/Invoice";
import { Subscriber } from "../entities/Subscriber";
import { BillingService } from "./BillingService";
import { OutgoingWebhookService } from "./OutgoingWebhookService";
import { SquadService } from "./SquadService";

/** Cron expression for invoice auto-expiration (default: every 5 minutes). */
const INVOICE_CRON = process.env.INVOICE_CRON || "*/5 * * * *";

/** Cron expression for subscription/trial/invite expiration (default: every 30 minutes). */
const SUBSCRIPTION_CRON = process.env.SUBSCRIPTION_CRON || "*/30 * * * *";

@Injectable()
export class InvoiceExpirationWorker implements OnInit, OnDestroy {
    private invoiceTask?: ScheduledTask;
    private subscriptionTask?: ScheduledTask;

    @Inject()
    logger!: Logger;

    constructor(
        private readonly billing: BillingService,
        private readonly outgoingWebhooks: OutgoingWebhookService,
        private readonly squads: SquadService,
    ) {}

    async $onInit(): Promise<void> {
        // ── Schedule recurring cron jobs ────────────────────────────
        this.invoiceTask = cron.schedule(INVOICE_CRON, () => {
            this.processExpiredInvoices();
        });

        this.subscriptionTask = cron.schedule(SUBSCRIPTION_CRON, () => {
            this.runSubscriptionChecks();
        });

        // ── Run immediately once DB is ready ────────────────────────
        // DataSource initializes in $afterInit (after $onInit), so we
        // defer the first execution until it's available.
        this.runOnceWhenReady();

        this.logger.info(
            `Workers started — invoices: "${INVOICE_CRON}", subscriptions: "${SUBSCRIPTION_CRON}"`,
        );
    }

    $onDestroy(): void {
        this.invoiceTask?.stop();
        this.subscriptionTask?.stop();
    }

    /**
     * Wait for TypeORM DataSource to become initialized, then run
     * all expiration checks once. Non-blocking — fires and forgets.
     */
    private runOnceWhenReady(): void {
        const MAX_WAIT_MS = 30_000;
        const POLL_MS = 500;
        let elapsed = 0;

        const timer = setInterval(async () => {
            if (AppDataSource.isInitialized) {
                clearInterval(timer);
                this.logger.info("Database ready — running initial expiration checks");
                await this.processExpiredInvoices();
                await this.runSubscriptionChecks();
                return;
            }

            elapsed += POLL_MS;
            if (elapsed >= MAX_WAIT_MS) {
                clearInterval(timer);
                this.logger.error("Database did not initialize within 30s — skipping initial expiration run");
            }
        }, POLL_MS);
    }

    // ─── Aggregate runners ──────────────────────────────────────

    private async runSubscriptionChecks(): Promise<void> {
        await this.processExpiredTrials();
        await this.processExpiredActiveManualSubscriptions();
        await this.processExpiredCancelledSubscriptions();
        await this.squads.expireStaleInvites();
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
