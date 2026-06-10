/**
 * @module models/GrantModels
 *
 * Request body model for the subscription grant endpoint.
 */

import { Required, Optional, MinLength, Min } from "@tsed/schema";

/** Body for `POST /api/sdk/grant` — grant a subscription to a user without payment. */
export class GrantSubscriptionBody {
    /** External user identifier from the client's application. */
    @Required()
    @MinLength(1)
    uid!: string;

    /** Subscription plan ID to grant. */
    @Required()
    @MinLength(1)
    subscriptionId!: string;

    /**
     * Optional duration in days. Overrides the plan's standard interval.
     * Must be >= 1. When omitted, the plan's normal interval is used.
     */
    @Optional()
    @Min(1)
    days?: number;

    /**
     * Optional start date (ISO 8601 string).
     * When omitted, defaults to now.
     */
    @Optional()
    startDate?: string;
}
