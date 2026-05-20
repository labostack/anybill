/**
 * @module core/types
 *
 * Shared type definitions for the AnyBill backend.
 */

import type { Request } from "express";

/**
 * Express Request extended with AnyBill authentication context.
 *
 * Populated by {@link AdminGuard} and {@link SdkGuard} after
 * successful authentication.
 */
export interface AuthenticatedRequest extends Request {
    /** UUID of the authenticated account. */
    accountId: string;
}
