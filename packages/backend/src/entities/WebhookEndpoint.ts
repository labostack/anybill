/**
 * @module entities/WebhookEndpoint
 *
 * Outgoing webhook endpoint configuration.
 *
 * Represents a URL that AnyBill will POST events to when payment
 * lifecycle changes occur (e.g. `payment.confirmed`, `subscription.renewed`).
 *
 * Each endpoint has a unique HMAC-SHA256 signing secret so the receiver
 * can verify the authenticity of incoming payloads.
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { WebhookDelivery } from "./WebhookDelivery";

@Entity()
export class WebhookEndpoint {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** Target URL to deliver webhook events to. */
    @Column()
    url!: string;

    /** HMAC-SHA256 signing secret (`whsec_...`). */
    @Column()
    secret!: string;

    /**
     * Which event types this endpoint subscribes to.
     * An empty array means "all events".
     */
    @Column({ type: "simple-json", default: "[]" })
    events!: string[];

    /** Whether this endpoint is currently receiving deliveries. */
    @Column({ type: "boolean", default: true })
    isActive!: boolean;

    /** Optional human-readable label (e.g. "Production backend"). */
    @Column({ type: "text", nullable: true })
    description!: string | null;

    /** Delivery attempts to this endpoint. */
    @OneToMany(() => WebhookDelivery, (d) => d.endpoint)
    deliveries!: WebhookDelivery[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
