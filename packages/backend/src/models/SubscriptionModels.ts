/**
 * @module models/SubscriptionModels
 *
 * Request body models for subscription CRUD endpoints.
 *
 * Uses the entity types directly for enum fields to ensure type
 * compatibility between validated input and TypeORM entities.
 */

import { Required, Optional, MinLength, MaxLength, Integer, Min, Pattern, Enum, Default, Property, CollectionOf } from "@tsed/schema";
import type { SubscriptionInterval } from "../entities/Subscription";

const INTERVALS = ["day", "week", "month", "year", "one_time"] as const;


/** Body for `POST /api/admin/subscriptions` — create a subscription plan. */
export class CreateSubscriptionBody {
    @Required()
    @MinLength(1)
    @MaxLength(255)
    name!: string;

    @Optional()
    @Property(String)
    description?: string | null;

    @Required()
    @Integer()
    @Min(1)
    amount!: number;

    @Required()
    @Pattern(/^[A-Z]{3}$/)
    currency!: string;

    @Enum(...INTERVALS)
    @Default("month")
    interval!: SubscriptionInterval;

    @Integer()
    @Min(1)
    @Default(1)
    intervalCount!: number;


    @Default(true)
    isActive!: boolean;

    @Optional()
    @Property(Object)
    metadata?: Record<string, unknown> | null;

    @Default(false)
    squadEnabled!: boolean;

    @Integer()
    @Min(0)
    @Default(0)
    squadMaxMembers!: number;

    @Integer()
    @Min(0)
    @Default(0)
    trialDays!: number;
}

/** Body for `PUT /api/admin/subscriptions/:id` — update a subscription plan. */
export class UpdateSubscriptionBody {
    @Optional()
    @MinLength(1)
    @MaxLength(255)
    name?: string;

    @Optional()
    @Property(String)
    description?: string | null;

    @Optional()
    @Integer()
    @Min(1)
    amount?: number;

    @Optional()
    @Pattern(/^[A-Z]{3}$/)
    currency?: string;

    @Optional()
    @Enum(...INTERVALS)
    interval?: SubscriptionInterval;

    @Optional()
    @Integer()
    @Min(1)
    intervalCount?: number;


    @Optional()
    isActive?: boolean;

    @Optional()
    @Property(Object)
    metadata?: Record<string, unknown> | null;

    @Optional()
    squadEnabled?: boolean;

    @Optional()
    @Integer()
    @Min(0)
    squadMaxMembers?: number;

    @Optional()
    @Integer()
    @Min(0)
    trialDays?: number;
}

/** Body for `PUT /api/admin/subscriptions/reorder` */
export class ReorderSubscriptionsBody {
    @Required()
    @CollectionOf(String)
    ids!: string[];
}
