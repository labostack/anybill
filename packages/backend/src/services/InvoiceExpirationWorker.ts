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

const POLL_MS = Number(process.env.INVOICE_EXPIRE_POLL_MS) || 60_000;

@Injectable()
export class InvoiceExpirationWorker implements OnInit, OnDestroy {
    private timer?: ReturnType<typeof setInterval>;

    @Inject()
    logger!: Logger;

    constructor(
        private readonly billing: BillingService,
        private readonly outgoingWebhooks: OutgoingWebhookService,
    ) {}

    async $onInit(): Promise<void> {
        this.timer = setInterval(async () => {
            await this.processExpiredInvoices();
            await this.processExpiredTrials();
        }, POLL_MS);
        this.logger.info(`Invoice and trial expiration worker started (poll every ${POLL_MS}ms)`);
    }

    $onDestroy(): void {
        if (this.timer) clearInterval(this.timer);
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
}
