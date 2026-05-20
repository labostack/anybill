/**
 * @module entities/Invoice
 *
 * Invoice entity — a single payment transaction.
 *
 * Every time a user initiates a payment, a pending invoice is created.
 * The invoice tracks the provider, amount, status, and timing through
 * the full payment lifecycle (pending → paid/failed/cancelled/refunded).
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from "typeorm";
import { Subscriber } from "./Subscriber";
import { Subscription } from "./Subscription";

/**
 * Invoice lifecycle status.
 *
 * | Status      | Meaning                                        |
 * |-------------|------------------------------------------------|
 * | `pending`   | Awaiting payment from the user.                |
 * | `paid`      | Payment confirmed by the provider.              |
 * | `failed`    | Payment attempt failed.                        |
 * | `refunded`  | A completed payment was refunded.              |
 * | `cancelled` | Superseded or explicitly cancelled.            |
 */
export type InvoiceStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

@Entity()
export class Invoice {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** The subscriber who initiated this payment. */
    @ManyToOne(() => Subscriber, (s) => s.invoices)
    subscriber!: Subscriber;

    /** Foreign key to the subscriber. */
    @Column()
    subscriberId!: string;

    /** The subscription plan being purchased. */
    @ManyToOne(() => Subscription, (s) => s.invoices)
    subscription!: Subscription;

    /** Foreign key to the subscription plan. */
    @Column()
    subscriptionId!: string;

    /** Payment provider that processed this invoice (e.g. `"stripe"`, `"cloudpayments"`). */
    @Column()
    provider!: string;

    /** External ID assigned by the payment provider. */
    @Column({ type: "text", nullable: true })
    providerInvoiceId!: string | null;

    /** Amount in minor units (cents). */
    @Column({ type: "integer" })
    amount!: number;

    /** ISO 4217 currency code. */
    @Column({ length: 3 })
    currency!: string;

    /** Original amount before discount (minor units). null if no coupon applied. */
    @Column({ type: "integer", nullable: true, default: null })
    originalAmount!: number | null;

    /** Discount amount in minor units. 0 if no coupon applied. */
    @Column({ type: "integer", default: 0 })
    discountAmount!: number;

    /** Reference to the coupon used for this invoice. null if no coupon applied. */
    @Column({ type: "text", nullable: true, default: null })
    couponId!: string | null;

    /** Current payment status. */
    @Column({ type: "varchar", default: "pending" })
    status!: InvoiceStatus;

    /** URL where the user completes payment (set after link creation). */
    @Column({ type: "text", nullable: true })
    paymentUrl!: string | null;

    /** Raw response data from the payment provider (stored as JSON). */
    @Column({ type: "simple-json", nullable: true })
    providerData!: Record<string, any> | null;

    /** Timestamp when the payment was confirmed. */
    @Column({ type: "datetime", nullable: true })
    paidAt!: Date | null;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
