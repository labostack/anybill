/**
 * @module entities/Subscription
 *
 * Subscription plan entity (a "product" or "pricing tier").
 *
 * Plans define what a user purchases: name, price, billing interval, and
 * renewal strategy. Multiple plans can share the same name to create
 * grouped pricing tiers (e.g. "Pro Monthly" + "Pro Yearly").
 *
 * Amounts are stored in **minor units** (cents, kopecks) to avoid
 * floating-point precision issues.
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Subscriber } from "./Subscriber";
import { Invoice } from "./Invoice";

/** Supported billing intervals. */
export type SubscriptionInterval = "day" | "week" | "month" | "year" | "one_time";

@Entity()
export class Subscription {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** Display name shown to users (e.g. "Pro", "Enterprise"). */
    @Column()
    name!: string;

    /** Optional description for the checkout page. */
    @Column({ type: "text", nullable: true })
    description!: string | null;

    /** Price in minor units (e.g. 999 = $9.99). */
    @Column({ type: "integer" })
    amount!: number;

    /** ISO 4217 currency code (e.g. `"USD"`, `"EUR"`). */
    @Column({ length: 3 })
    currency!: string;

    /** Billing interval (`"month"`, `"year"`, `"one_time"`, etc.). */
    @Column({ type: "varchar", default: "month" })
    interval!: SubscriptionInterval;

    /** Number of intervals per billing cycle (e.g. `3` months). Defaults to `1`. */
    @Column({ type: "integer", default: 1 })
    intervalCount!: number;

    /** Whether this plan is currently available for purchase. */
    @Column({ type: "boolean", default: true })
    isActive!: boolean;

    /** Arbitrary key-value metadata (stored as JSON). */
    @Column({ type: "simple-json", nullable: true })
    metadata!: Record<string, any> | null;

    /** Order of the plan for UI sorting. */
    @Column({ type: "integer", default: 0 })
    sortOrder!: number;

    /** Number of free trial days. 0 = no trial available. */
    @Column({ type: "integer", default: 0 })
    trialDays!: number;

    /** Whether this plan supports squads (group/family subscriptions). */
    @Column({ type: "boolean", default: false })
    squadEnabled!: boolean;

    /** Maximum members per squad (excluding the owner). 0 = unlimited. */
    @Column({ type: "integer", default: 0 })
    squadMaxMembers!: number;

    /** Users subscribed to this plan. */
    @OneToMany(() => Subscriber, (s) => s.subscription)
    subscribers!: Subscriber[];

    /** Invoices generated for this plan. */
    @OneToMany(() => Invoice, (i) => i.subscription)
    invoices!: Invoice[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
