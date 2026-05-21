/**
 * @module models/SubscriberModels
 *
 * Request body models for subscriber management endpoints.
 */

import { Optional, Enum, Property, Format } from "@tsed/schema";
import type { SubscriberStatus } from "../entities/Subscriber";

const SUBSCRIBER_STATUSES = ["pending", "trialing", "active", "cancelled", "expired", "past_due"] as const;

/** Body for `PUT /api/admin/subscribers/:id` — update subscriber status/metadata/plan/period. */
export class UpdateSubscriberBody {
    @Optional()
    @Enum(...SUBSCRIBER_STATUSES)
    status?: SubscriberStatus;

    @Optional()
    @Property(Object)
    metadata?: Record<string, unknown> | null;

    /** Reassign subscriber to a different subscription plan (admin override, no payment). */
    @Optional()
    @Property(String)
    subscriptionId?: string;

    /** Override the current period start date (ISO string). */
    @Optional()
    @Property(String)
    currentPeriodStart?: string;

    /** Override the current period end date (ISO string). */
    @Optional()
    @Property(String)
    currentPeriodEnd?: string;
}

/** Body for `POST /api/admin/subscribers/:id/grant` — grant plan access without payment. */
export class GrantPlanBody {
    /** Target subscription plan ID. */
    @Optional()
    @Property(String)
    subscriptionId?: string;

    /** Optional: access expires after this many days from now. 0 = no expiry. */
    @Optional()
    @Property(Number)
    periodDays?: number;

    /** Optional: explicit period end date (ISO string). Takes priority over periodDays. */
    @Optional()
    @Property(String)
    periodEnd?: string;
}

