/**
 * @module models/QueryModels
 *
 * Query parameter models for list/filter endpoints.
 *
 * These models enable automatic validation and type coercion of
 * URL query parameters via `@tsed/ajv`. Query strings arrive as
 * raw strings — the AJV pipe coerces them to the declared types.
 */

import { Optional, Required, Min, Max, Default, Enum, Format, Integer } from "@tsed/schema";

// ─── Base ───────────────────────────────────────────────────────────

/** Reusable pagination query parameters. */
export class PaginationQuery {
    @Optional()
    @Integer()
    @Min(1)
    @Default(1)
    page!: number;

    @Optional()
    @Integer()
    @Min(1)
    @Max(100)
    @Default(50)
    limit!: number;
}

// ─── Admin: Subscribers ─────────────────────────────────────────────

/** Query params for `GET /api/admin/subscribers`. */
export class SubscriberListQuery extends PaginationQuery {
    @Optional()
    @Enum("active", "cancelled", "expired", "past_due")
    status?: string;
}

// ─── Admin: Invoices ────────────────────────────────────────────────

/** Query params for `GET /api/admin/invoices`. */
export class InvoiceListQuery extends PaginationQuery {
    @Optional()
    @Enum("pending", "paid", "failed", "refunded", "cancelled")
    status?: string;

    @Optional()
    from?: string;

    @Optional()
    to?: string;
}

// ─── Admin: Dashboard ───────────────────────────────────────────────

/** Query params for `GET /api/admin/dashboard/stats`. */
export class DashboardQuery {
    @Optional()
    from?: string;

    @Optional()
    to?: string;

    @Optional()
    @Enum("pending", "paid", "failed", "refunded", "cancelled")
    status?: string;
}

// ─── Admin: Webhook Deliveries ──────────────────────────────────────

/** Query params for `GET /api/admin/webhooks/deliveries`. */
export class DeliveryListQuery extends PaginationQuery {
    @Optional()
    endpoint_id?: string;
}

// ─── Checkout ───────────────────────────────────────────────────────

/** Query params for `GET /api/checkout/info`. */
export class CheckoutInfoQuery {
    @Required()
    sub_id!: string;
}
