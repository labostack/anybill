/**
 * @module core/filters/HttpExceptionFilter
 *
 * Exception filter for `@tsed/exceptions` HTTP error classes.
 *
 * Catches all {@link Exception} subclasses (`BadRequest`, `NotFound`,
 * `Conflict`, `Unauthorized`, `Forbidden`, etc.) and returns a
 * consistent JSON error response format.
 *
 * This filter takes priority over the generic `@Catch(Error)` filter
 * for any error that extends {@link Exception}.
 */

import { Catch, ExceptionFilterMethods, PlatformContext } from "@tsed/common";
import { Exception } from "@tsed/exceptions";
import { AppError } from "../errors/AppError";

@Catch(Exception)
export class HttpExceptionFilter implements ExceptionFilterMethods<Exception> {
    catch(exception: Exception, ctx: PlatformContext): void {
        const { response, logger } = ctx;

        const status = exception.status || 500;

        let errorCode = "INTERNAL_SERVER_ERROR";
        let details = undefined;

        if (exception instanceof AppError) {
            errorCode = exception.code;
            details = exception.details;
        } else if (exception.body?.errors) {
            errorCode = "VALIDATION_FAILED";
        } else if (exception.name) {
            errorCode = exception.name.toUpperCase().replace(/\s/g, "_");
        }

        // Log 4xx as warnings, 5xx as errors.
        if (status >= 500) {
            logger.error({ error_name: exception.name, errorCode, message: exception.message, status });
        } else {
            logger.warn({ error_name: exception.name, errorCode, message: exception.message, status });
        }

        response.status(status).body({
            valid: false,
            status,
            errorCode,
            message: exception.message,
            ...(details && { details }),
            ...(exception.body?.errors && { validation: exception.body.errors }),
        });
    }
}
