/**
 * @module core/checkoutToken
 *
 * Stateless checkout token utilities.
 *
 * Tokens are self-contained HMAC-SHA256 signed payloads (mini-JWT style).
 * They carry `sub_id`, `uid`, and `exp` — no database storage required.
 *
 * Format: `base64url(payload) + "." + base64url(HMAC-SHA256(payload, JWT_SECRET))`
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Checkout token payload. */
export interface CheckoutTokenPayload {
    /** Subscription plan ID (UUID). */
    sub_id: string;
    /** External user identifier from the client application. */
    uid: string;
    /** Expiration timestamp (Unix seconds). */
    exp: number;
}

/** Default token TTL in seconds (30 minutes). */
const DEFAULT_TTL = 1800;

// ─── Base64url helpers ──────────────────────────────────────────────

function base64urlEncode(data: Buffer | string): string {
    const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    return buf.toString("base64url");
}

function base64urlDecode(str: string): Buffer {
    return Buffer.from(str, "base64url");
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Create a signed checkout token.
 *
 * @param subId      - Subscription plan UUID.
 * @param uid        - External user identifier.
 * @param ttlSeconds - Token lifetime in seconds (default 1800 = 30 min).
 * @returns The signed token string and its expiration date.
 */
export function createCheckoutToken(
    subId: string,
    uid: string,
    ttlSeconds: number = DEFAULT_TTL,
): { token: string; expiresAt: Date } {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = base64urlEncode(JSON.stringify({ sub_id: subId, uid, exp }));
    const sig = sign(payload);

    return {
        token: `${payload}.${base64urlEncode(sig)}`,
        expiresAt: new Date(exp * 1000),
    };
}

/**
 * Verify a checkout token and extract its payload.
 *
 * Checks HMAC signature (timing-safe) and expiration.
 *
 * @param token - The raw token string (`payload.signature`).
 * @returns Decoded payload, or `null` if invalid/expired.
 */
export function verifyCheckoutToken(token: string): CheckoutTokenPayload | null {
    const dotIndex = token.indexOf(".");
    if (dotIndex === -1) return null;

    const payloadPart = token.substring(0, dotIndex);
    const sigPart = token.substring(dotIndex + 1);

    // Verify signature (timing-safe comparison).
    const expected = sign(payloadPart);
    const actual = base64urlDecode(sigPart);

    if (expected.length !== actual.length) return null;
    if (!timingSafeEqual(expected, actual)) return null;

    // Decode and validate payload.
    try {
        const data: CheckoutTokenPayload = JSON.parse(
            base64urlDecode(payloadPart).toString("utf-8"),
        );

        if (!data.sub_id || !data.uid || !data.exp) return null;
        if (data.exp < Math.floor(Date.now() / 1000)) return null;

        return data;
    } catch {
        return null;
    }
}

// ─── Internal ───────────────────────────────────────────────────────

/** Compute HMAC-SHA256 of the payload using JWT_SECRET. */
function sign(payload: string): Buffer {
    return createHmac("sha256", process.env.JWT_SECRET!)
        .update(payload)
        .digest();
}
