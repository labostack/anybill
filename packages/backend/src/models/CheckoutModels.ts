/**
 * @module models/CheckoutModels
 *
 * Request body models for checkout flow endpoints.
 */

import { Required, Optional, MinLength } from "@tsed/schema";

/**
 * Body for `POST /api/checkout/pay` — initiate a payment.
 *
 * Requires a signed checkout token (from `/api/sdk/checkout-links` or
 * `/api/admin/checkout-links`). The `sub_id` and `uid` are extracted
 * from the verified token — they cannot be supplied directly.
 */
export class CheckoutPayBody {
    /** Signed checkout token containing sub_id, uid, and expiration. */
    @Required()
    @MinLength(1)
    token!: string;

    /** Payment provider identifier (e.g. "stripe", "heleket"). */
    @Required()
    @MinLength(1)
    provider!: string;

    /** Optional coupon / promo code to apply to this payment. */
    @Optional()
    couponCode?: string;
}
