/**
 * @module entities/WebhookDelivery
 *
 * Record of a single webhook delivery attempt.
 *
 * Tracks the payload, response, retry state, and timing for each attempt
 * to deliver an event to an outgoing webhook endpoint. Failed deliveries
 * are retried with exponential backoff (up to {@link MAX_RETRIES} times
 * in the {@link OutgoingWebhookService}).
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { WebhookEndpoint } from "./WebhookEndpoint";

/**
 * Delivery lifecycle status.
 *
 * - `"pending"` — Awaiting first attempt or scheduled for retry.
 * - `"success"` — Delivered successfully (HTTP 2xx response).
 * - `"failed"`  — All retry attempts exhausted.
 */
export type DeliveryStatus = "pending" | "success" | "failed";

@Entity()
export class WebhookDelivery {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** The endpoint this delivery targets. */
    @ManyToOne(() => WebhookEndpoint, (e) => e.deliveries)
    endpoint!: WebhookEndpoint;

    /** Foreign key to the webhook endpoint. */
    @Column()
    endpointId!: string;

    /** Event type that triggered this delivery (e.g. `"payment.confirmed"`). */
    @Column()
    event!: string;

    /** Serialized JSON payload that was (or will be) sent. */
    @Column({ type: "text" })
    payload!: string;

    /** Current delivery status. */
    @Column({ type: "varchar", default: "pending" })
    status!: DeliveryStatus;

    /** HTTP status code from the target server (set after each attempt). */
    @Column({ type: "integer", nullable: true })
    responseCode!: number | null;

    /** Truncated response body from the target server (max 2048 chars). */
    @Column({ type: "text", nullable: true })
    responseBody!: string | null;

    /** Total number of delivery attempts so far. */
    @Column({ type: "integer", default: 0 })
    attempts!: number;

    /** Scheduled time for the next retry (`null` if no more retries). */
    @Column({ type: "datetime", nullable: true })
    nextRetryAt!: Date | null;

    /** Error message from the most recent failed attempt. */
    @Column({ type: "text", nullable: true })
    error!: string | null;

    /** Timestamp when the delivery was successfully completed. */
    @Column({ type: "datetime", nullable: true })
    deliveredAt!: Date | null;

    @CreateDateColumn()
    createdAt!: Date;
}
