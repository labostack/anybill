/**
 * @module models/CouponModels
 *
 * Request body models for coupon management endpoints.
 */

import { Required, Optional, MinLength, MaxLength, Min, Enum, Nullable } from "@tsed/schema";

/** Body for `POST /api/admin/coupons` — create a coupon. */
export class CreateCouponBody {
    /** Promo code text (2–32 chars, stored uppercase). */
    @Required()
    @MinLength(2)
    @MaxLength(32)
    code!: string;

    /** Discount type: `"percent"` or `"fixed"`. */
    @Required()
    @Enum("percent", "fixed")
    type!: string;

    /** Discount value. For percent: 10 = 10%. For fixed: minor units (500 = $5.00). */
    @Required()
    @Min(1)
    value!: number;

    /** ISO 4217 currency code. Required when type is `"fixed"`. */
    @Optional()
    currency?: string;

    /** Maximum total redemptions. Omit for unlimited. */
    @Optional()
    @Min(1)
    maxRedemptions?: number;

    /** Maximum redemptions per individual user. Defaults to 1. */
    @Optional()
    @Min(1)
    maxRedemptionsPerUser?: number;

    /** Minimum order amount in minor units. 0 = no minimum. */
    @Optional()
    @Min(0)
    minAmount?: number;

    /** Subscription plan IDs this coupon is valid for. Omit for all plans. */
    @Optional()
    subscriptionIds?: string[];

    /** ISO 8601 expiration date string. Omit for no expiry. */
    @Optional()
    expiresAt?: string;
}

/** Body for `PUT /api/admin/coupons/:id` — update a coupon. */
export class UpdateCouponBody {
    /** Whether the coupon is active. */
    @Optional()
    isActive?: boolean;

    /** Maximum total redemptions. */
    @Optional()
    @Min(1)
    maxRedemptions?: number;

    /** Maximum redemptions per individual user. */
    @Optional()
    @Min(1)
    maxRedemptionsPerUser?: number;

    /** Minimum order amount in minor units. */
    @Optional()
    @Min(0)
    minAmount?: number;

    /** Subscription plan IDs this coupon is valid for. */
    @Optional()
    subscriptionIds?: string[];

    /** ISO 8601 expiration date string. Set to null to remove expiry. */
    @Optional()
    @Nullable(String)
    expiresAt?: string | null;
}
