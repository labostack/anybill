/**
 * @module core/portalToken
 *
 * Portal token utilities — thin wrapper over {@link encryptedToken}.
 *
 * Tokens carry `uid` and `exp`. They are fully encrypted via AES-256-GCM,
 * making them opaque to anyone without the server key.
 *
 * Used by the client area portal to grant subscriber access via secure links.
 * Unlike checkout tokens, portal tokens do not carry a subscription ID —
 * the portal resolves all subscriptions for the given uid.
 */

import { encryptToken, decryptToken } from "./encryptedToken";

/** Portal token payload. */
export interface PortalTokenPayload {
    /** External user identifier from the client application. */
    uid: string;
    /** Expiration timestamp (Unix seconds). */
    exp: number;
}

/** Default token TTL in seconds (30 minutes). */
const DEFAULT_TTL = 1800;

/**
 * Create an encrypted portal token.
 *
 * @param uid        - External user identifier.
 * @param ttlSeconds - Token lifetime in seconds (default 1800 = 30 min).
 * @returns The encrypted token string and its expiration date.
 */
export function createPortalToken(
    uid: string,
    ttlSeconds: number = DEFAULT_TTL,
): { token: string; expiresAt: Date } {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = encryptToken({ uid, exp });

    return {
        token,
        expiresAt: new Date(exp * 1000),
    };
}

/**
 * Verify and decrypt a portal token.
 *
 * Checks AES-GCM authentication (tamper detection) and expiration.
 *
 * @param token - The encrypted token string.
 * @returns Decoded payload, or `null` if invalid/expired/tampered.
 */
export function verifyPortalToken(token: string): PortalTokenPayload | null {
    const data = decryptToken<PortalTokenPayload>(token);
    if (!data) return null;

    // Validate required fields.
    if (!data.uid || !data.exp) return null;

    return data;
}
