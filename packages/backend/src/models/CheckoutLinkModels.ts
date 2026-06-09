/**
 * @module models/CheckoutLinkModels
 *
 * Request body models for checkout link generation endpoints.
 */

import { Required, Format, MinLength, MaxLength, Optional, Min, Max } from "@tsed/schema";

/** Body for `POST /api/sdk/checkout-links` and `POST /api/admin/checkout-links`. */
export class CreateCheckoutLinkBody {
    /** Subscription plan ID. */
    @Required()
    @Format("uuid")
    sub_id!: string;

    /** External user identifier from the client application. */
    @Required()
    @MinLength(1)
    @MaxLength(512)
    uid!: string;

    /** Token lifetime in seconds (60–86400). Defaults to 1800 (30 min). */
    @Optional()
    @Min(60)
    @Max(86400)
    ttl?: number;

    /** Optional coupon code to pre-apply to the checkout link. */
    @Optional()
    @MaxLength(32)
    coupon_code?: string;

    /**
     * Custom success redirect URL. Overrides the account-level `successRedirectUrl`.
     * The user is redirected here after payment confirmation.
     */
    @Optional()
    @MaxLength(2048)
    success_url?: string;
}
