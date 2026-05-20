/**
 * @module models/CheckoutModels
 *
 * Request body models for checkout flow endpoints.
 */

import { Required, Format, MinLength, MaxLength } from "@tsed/schema";

/** Body for `POST /api/checkout/pay` — initiate a payment. */
export class CheckoutPayBody {
    @Required()
    @Format("uuid")
    sub_id!: string;

    @Required()
    @MinLength(1)
    @MaxLength(512)
    uid!: string;

    @Required()
    @MinLength(1)
    provider!: string;
}
