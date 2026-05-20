/**
 * @module billing/BillingError
 *
 * Domain-level error for the billing engine layer.
 *
 * The billing engine is provider-agnostic and must not depend on HTTP
 * framework types (`@tsed/exceptions`). Instead, it throws `BillingError`
 * with a semantic {@link BillingErrorCode}. The global exception filter
 * maps these codes to appropriate HTTP status codes.
 *
 * | Code          | HTTP Status | Meaning                              |
 * |---------------|-------------|--------------------------------------|
 * | `NOT_FOUND`   | 404         | Provider or resource not found       |
 * | `CONFLICT`    | 409         | Duplicate or conflicting operation   |
 * | `BAD_REQUEST` | 400         | Invalid configuration or parameters  |
 */

/** Semantic error codes for billing engine domain errors. */
export type BillingErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";

/**
 * Billing engine domain error.
 *
 * Thrown by {@link BillingEngine} when an operation cannot be completed
 * due to missing providers, unsupported features, or invalid state.
 * The global exception filter converts these into HTTP responses.
 */
export class BillingError extends Error {
    constructor(
        message: string,
        public readonly code: BillingErrorCode,
    ) {
        super(message);
        this.name = "BillingError";
    }
}
