/**
 * @module core/filters/GlobalErrorFilter
 *
 * Catch-all exception filter for unhandled errors.
 *
 * Intercepts any `Error` that isn't already handled by a more specific
 * filter (like {@link HttpExceptionFilter}). Maps known domain error
 * types to appropriate HTTP status codes and prevents internal details
 * (stack traces, raw error messages) from leaking to clients in production.
 *
 * Handled error types:
 * - {@link BillingError} — maps `code` to HTTP status (NOT_FOUND→404, etc.)
 * - TypeORM `EntityNotFoundError` — 404
 * - Everything else — 500 (message hidden in production)
 */

import { Catch, ExceptionFilterMethods, PlatformContext } from "@tsed/common";
import { BillingError } from "../../billing/BillingError";

/** Maps BillingError codes to HTTP status codes. */
const BILLING_ERROR_STATUS: Record<string, number> = {
    NOT_FOUND: 404,
    CONFLICT: 409,
    BAD_REQUEST: 400,
};

@Catch(Error)
export class GlobalErrorFilter implements ExceptionFilterMethods<Error> {
    catch(exception: Error, ctx: PlatformContext): void {
        const { response, logger } = ctx;

        // ── BillingError → mapped HTTP status ────────────────────
        if (exception instanceof BillingError) {
            const status = BILLING_ERROR_STATUS[exception.code] || 500;
            logger.warn({ billing_error: exception.code, message: exception.message });
            response.status(status).body({ status, message: exception.message });
            return;
        }

        // ── TypeORM EntityNotFoundError → 404 ────────────────────
        if (exception.name === "EntityNotFoundError") {
            logger.warn({ message: exception.message });
            response.status(404).body({ status: 404, message: "Resource not found" });
            return;
        }

        // ── Unknown errors → 500, no detail leak ────────────────
        logger.error({
            message: exception.message,
            stack: exception.stack,
            url: ctx.request.url,
            method: ctx.request.method,
        });

        response.status(500).body({
            status: 500,
            message: process.env.NODE_ENV === "production"
                ? "Internal server error"
                : exception.message,
        });
    }
}
