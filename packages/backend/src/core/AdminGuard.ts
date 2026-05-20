/**
 * @module core/AdminGuard
 *
 * Ts.ED middleware that protects admin API routes with JWT authentication.
 *
 * Reads the JWT from the `anybill_session` HttpOnly cookie.
 * Verifies it and attaches the account ID to the request for downstream handlers.
 */

import { Middleware, Req } from "@tsed/common";
import { Forbidden, Unauthorized } from "@tsed/exceptions";
import { verifyJwt } from "./auth";
import type { AuthenticatedRequest } from "./types";

const COOKIE_NAME = "anybill_session";

@Middleware()
export class AdminGuard {
    /**
     * Verify the JWT from the session cookie.
     *
     * @param req - Express request object.
     * @throws {Unauthorized} If the cookie is missing.
     * @throws {Forbidden} If the token is invalid or expired.
     */
    use(@Req() req: Req): void {
        // Extract token from cookie.
        let token: string | undefined;
        const cookies = (req.headers.cookie || "").split(";").map((c) => c.trim());
        const sessionCookie = cookies.find((c) => c.startsWith(COOKIE_NAME + "="));
        if (sessionCookie) {
            token = sessionCookie.split("=")[1];
        }

        if (!token) {
            throw new Unauthorized("Not authenticated");
        }

        try {
            const payload = verifyJwt(token);
            (req as AuthenticatedRequest).accountId = payload.sub as string;
        } catch {
            throw new Forbidden("Invalid or expired session");
        }
    }
}
