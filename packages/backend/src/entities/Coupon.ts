/**
 * @module entities/Coupon
 *
 * Coupon entity — a discount coupon or promo code.
 *
 * Coupons can be applied during checkout to reduce the invoice amount.
 * They support percentage-based and fixed-amount discounts, per-user
 * limits, plan restrictions, minimum order thresholds, and expiration.
 *
 * Amounts and values are stored in **minor units** (cents, kopecks) to
 * avoid floating-point precision issues.
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

/** Coupon discount type. */
export type CouponType = "percent" | "fixed";

@Entity()
export class Coupon {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** The promo code text (stored uppercase, unique). */
    @Column({ unique: true })
    code!: string;

    /** Discount type: `"percent"` or `"fixed"`. */
    @Column({ type: "varchar" })
    type!: CouponType;

    /** Discount value. For percent: 10 = 10%. For fixed: minor units (500 = $5.00). */
    @Column({ type: "integer" })
    value!: number;

    /** ISO 4217 currency code. Required for `"fixed"` type, null for `"percent"`. */
    @Column({ type: "varchar", length: 3, nullable: true })
    currency!: string | null;

    /** Maximum total redemptions across all users. null = unlimited. */
    @Column({ type: "integer", nullable: true })
    maxRedemptions!: number | null;

    /** Maximum redemptions per individual user. */
    @Column({ type: "integer", default: 1 })
    maxRedemptionsPerUser!: number;

    /** Number of times this coupon has been redeemed. */
    @Column({ type: "integer", default: 0 })
    timesRedeemed!: number;

    /** Subscription plan IDs this coupon is valid for. null/[] = all plans. */
    @Column({ type: "simple-json", nullable: true })
    subscriptionIds!: string[] | null;

    /** Minimum order amount in minor units. 0 = no minimum. */
    @Column({ type: "integer", default: 0 })
    minAmount!: number;

    /** Expiration date. null = never expires. */
    @Column({ type: "datetime", nullable: true })
    expiresAt!: Date | null;

    /** Whether this coupon is currently active. */
    @Column({ type: "boolean", default: true })
    isActive!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
