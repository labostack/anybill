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

@Catch(Exception)
export class HttpExceptionFilter implements ExceptionFilterMethods<Exception> {
    catch(exception: Exception, ctx: PlatformContext): void {
        const { response, logger } = ctx;

        const status = exception.status || 500;

        // Log 4xx as warnings, 5xx as errors.
        if (status >= 500) {
            logger.error({ error_name: exception.name, message: exception.message, status });
        } else {
            logger.warn({ error_name: exception.name, message: exception.message, status });
        }

        response.status(status).body({
            status,
            message: exception.message,
            ...(exception.body?.errors && { errors: exception.body.errors }),
        });
    }
}
