/**
 * @module services/OutgoingWebhookService
 *
 * Dispatches billing events to registered webhook endpoints with
 * HMAC-SHA256 signing and exponential backoff retry (10s→1m→5m→30m→1h).
 */

import { Injectable, OnInit, OnDestroy, Inject } from "@tsed/di";
import { Logger } from "@tsed/logger";
import { createHmac } from "crypto";
import { AppDataSource } from "../core/datasource";
import { WebhookEndpoint } from "../entities/WebhookEndpoint";
import { WebhookDelivery } from "../entities/WebhookDelivery";
import { LessThanOrEqual } from "typeorm";

/** All event types AnyBill can emit. */
export type WebhookEventType =
    | "payment.confirmed"
    | "payment.failed"
    | "payment.refunded"
    | "payment.cancelled"
    | "subscription.renewed"
    | "subscription.expired"
    | "subscription.cancelled"
    | "squad.created"
    | "squad.dissolved"
    | "squad.member_added"
    | "squad.member_removed"
    | "coupon.redeemed"
    | "trial.started"
    | "trial.expired";

const MAX_RETRIES = Number(process.env.WEBHOOK_MAX_RETRIES) || 5;
const RETRY_DELAYS_MS = (process.env.WEBHOOK_RETRY_DELAYS_MS || "10000,60000,300000,1800000,3600000")
    .split(",").map(Number);
const RETRY_POLL_MS = Number(process.env.WEBHOOK_RETRY_POLL_MS) || 15_000;
const RETRY_BATCH = Number(process.env.WEBHOOK_RETRY_BATCH) || 20;
const DELIVERY_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS) || 10_000;
const MAX_BODY_LEN = Number(process.env.WEBHOOK_MAX_BODY_LEN) || 2048;

@Injectable()
export class OutgoingWebhookService implements OnInit, OnDestroy {
    private retryInterval?: ReturnType<typeof setInterval>;

    @Inject()
    logger!: Logger;

    async $onInit(): Promise<void> {
        this.retryInterval = setInterval(() => this.processRetries(), RETRY_POLL_MS);
        this.logger.info("Outgoing webhook service ready");
    }

    $onDestroy(): void {
        if (this.retryInterval) clearInterval(this.retryInterval);
    }

    /**
     * Dispatch an event to all matching active endpoints.
     * @param event - Event type to dispatch.
     * @param data  - Event payload data.
     */
    async dispatch(event: WebhookEventType, data: Record<string, any>): Promise<void> {
        const epRepo = AppDataSource.getRepository(WebhookEndpoint);
        const endpoints = await epRepo.find({ where: { isActive: true } });

        for (const ep of endpoints) {
            if (ep.events.length > 0 && !ep.events.includes(event)) continue;

            const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
            const dlvRepo = AppDataSource.getRepository(WebhookDelivery);
            const delivery = dlvRepo.create({ endpointId: ep.id, event, payload, status: "pending", attempts: 0 });
            await dlvRepo.save(delivery);
            await this.attemptDelivery(delivery, ep);
        }
    }

    /** Attempt HTTP delivery; schedule retry on failure. */
    private async attemptDelivery(delivery: WebhookDelivery, endpoint: WebhookEndpoint): Promise<void> {
        const repo = AppDataSource.getRepository(WebhookDelivery);
        delivery.attempts += 1;

        try {
            // Include timestamp in the signature to prevent replay attacks.
            // Signature format: HMAC-SHA256("timestamp.payload")
            // Receivers should verify: |now - timestamp| < tolerance (e.g. 300s).
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const sigPayload = `${timestamp}.${delivery.payload}`;
            const sig = createHmac("sha256", endpoint.secret).update(sigPayload).digest("hex");
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS);

            const res = await fetch(endpoint.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Anybill-Signature": sig,
                    "X-Anybill-Timestamp": timestamp,
                    "X-Anybill-Event": delivery.event,
                    "X-Anybill-Delivery-Id": delivery.id,
                    "User-Agent": "AnyBill-Webhook/1.0",
                },
                body: delivery.payload,
                signal: ctrl.signal,
            });
            clearTimeout(timeout);

            delivery.responseCode = res.status;
            delivery.responseBody = (await res.text().catch(() => "")).slice(0, MAX_BODY_LEN);

            if (res.ok) {
                delivery.status = "success";
                delivery.deliveredAt = new Date();
                delivery.nextRetryAt = null;
            } else {
                this.scheduleRetry(delivery);
            }
        } catch (err: any) {
            delivery.error = err.message || "Unknown error";
            this.scheduleRetry(delivery);
        }

        await repo.save(delivery);
    }

    /** Schedule next retry or mark as permanently failed. */
    private scheduleRetry(delivery: WebhookDelivery): void {
        if (delivery.attempts >= MAX_RETRIES) {
            delivery.status = "failed";
            delivery.nextRetryAt = null;
            return;
        }
        const delay = RETRY_DELAYS_MS[delivery.attempts - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        delivery.status = "pending";
        delivery.nextRetryAt = new Date(Date.now() + delay);
    }

    /** Background worker: process all due retries. */
    private async processRetries(): Promise<void> {
        try {
            const dlvRepo = AppDataSource.getRepository(WebhookDelivery);
            const epRepo = AppDataSource.getRepository(WebhookEndpoint);

            const pending = await dlvRepo.find({
                where: { status: "pending", nextRetryAt: LessThanOrEqual(new Date()) },
                take: RETRY_BATCH,
            });

            for (const d of pending) {
                const ep = await epRepo.findOneBy({ id: d.endpointId });
                if (!ep || !ep.isActive) {
                    d.status = "failed";
                    d.error = "Endpoint disabled or deleted";
                    d.nextRetryAt = null;
                    await dlvRepo.save(d);
                    continue;
                }
                await this.attemptDelivery(d, ep);
            }
        } catch (err: any) {
            this.logger.error("Retry worker error:", err.message);
        }
    }
}
