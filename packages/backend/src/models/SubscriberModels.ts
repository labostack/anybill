/**
 * @module models/SubscriberModels
 *
 * Request body models for subscriber management endpoints.
 */

import { Optional, Enum, Property } from "@tsed/schema";
import type { SubscriberStatus } from "../entities/Subscriber";

const SUBSCRIBER_STATUSES = ["pending", "active", "cancelled", "expired", "past_due"] as const;

/** Body for `PUT /api/admin/subscribers/:id` — update subscriber status/metadata. */
export class UpdateSubscriberBody {
    @Optional()
    @Enum(...SUBSCRIBER_STATUSES)
    status?: SubscriberStatus;

    @Optional()
    @Property(Object)
    metadata?: Record<string, unknown> | null;
}
