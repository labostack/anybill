/**
 * @module entities/Subscriber
 *
 * Subscriber entity — a user who has purchased (or is purchasing) a plan.
 *
 * A subscriber is uniquely identified by the combination of `uid`
 * (external user ID from the client's application) and `subscriptionId`.
 * This allows the same user to hold multiple active subscriptions.
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from "typeorm";
import { Subscription } from "./Subscription";
import { Invoice } from "./Invoice";

/**
 * Subscriber lifecycle status.
 *
 * | Status      | Meaning                                         |
 * |-------------|-------------------------------------------------|
 * | `pending`   | Created, awaiting first payment confirmation.    |
 * | `trialing`  | On a free trial, access granted until trialEnd.  |
 * | `active`    | Currently subscribed, within the billing period. |
 * | `cancelled` | Subscription was explicitly cancelled.           |
 * | `expired`   | Billing period ended without renewal.            |
 * | `past_due`  | Payment failed, grace period may apply.          |
 */
export type SubscriberStatus = "pending" | "trialing" | "active" | "cancelled" | "expired" | "past_due";

@Entity()
export class Subscriber {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** External user identifier from the client's application. */
    @Column()
    uid!: string;

    /** The subscription plan this subscriber is on. */
    @ManyToOne(() => Subscription, (s) => s.subscribers)
    subscription!: Subscription;

    /** Foreign key to the subscription plan. */
    @Column()
    subscriptionId!: string;

    /** Current lifecycle status. */
    @Column({ type: "varchar", default: "pending" })
    status!: SubscriberStatus;

    /** Start of the current billing period. */
    @Column({ type: "datetime", nullable: true })
    currentPeriodStart!: Date | null;

    /** End of the current billing period (`null` for one-time purchases). */
    @Column({ type: "datetime", nullable: true })
    currentPeriodEnd!: Date | null;

    /** Arbitrary metadata (e.g. external user profile data). */
    @Column({ type: "simple-json", nullable: true })
    metadata!: Record<string, any> | null;

    /** End of the free trial period (null if no trial or after conversion to paid). */
    @Column({ type: "datetime", nullable: true })
    trialEnd!: Date | null;

    /**
     * Actual renewal mode for this subscriber, determined at payment time.
     *
     * - `"manual"` — subscriber must re-purchase when the period expires.
     * - `"provider_managed"` — the provider handles recurring billing automatically.
     *
     * Determined by the payment provider's capabilities: if the provider
     * supports recurring billing and the plan is not one-time, the mode
     * is set to `"provider_managed"`. Otherwise, it defaults to `"manual"`.
     */
    @Column({ type: "varchar", default: "manual" })
    renewalMode!: "manual" | "provider_managed";

    /** Payment provider used for the current subscription period (e.g. `"stripe"`, `"paypal"`). */
    @Column({ type: "varchar", nullable: true })
    provider!: string | null;

    /** Payment invoices for this subscriber. */
    @OneToMany(() => Invoice, (i) => i.subscriber)
    invoices!: Invoice[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
