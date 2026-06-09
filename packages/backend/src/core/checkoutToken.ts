/**
 * @module core/checkoutToken
 *
 * Checkout token utilities — thin wrapper over {@link encryptedToken}.
 *
 * Tokens carry `sub_id`, `uid`, and `exp`. They are fully encrypted
 * via AES-256-GCM, making them opaque to anyone without the server key.
 *
 * Used by the checkout flow to generate secure, time-limited payment links.
 */

import { encryptToken, decryptToken } from "./encryptedToken";

/** Checkout token payload. */
export interface CheckoutTokenPayload {
    /** Subscription plan ID (UUID). */
    sub_id: string;
    /** External user identifier from the client application. */
    uid: string;
    /** Expiration timestamp (Unix seconds). */
    exp: number;
    /** Pre-applied coupon code (optional). */
    coupon_code?: string;
    /**
     * Previous subscriber ID for plan-change flow.
     * When set, the old subscriber is cancelled only after this payment is confirmed.
     */
    prev_subscriber_id?: string;
    /**
     * Custom success redirect URL (optional).
     * Overrides the account-level `successRedirectUrl` after payment confirmation.
     */
    success_url?: string;
}

/** Default token TTL in seconds (30 minutes). */
const DEFAULT_TTL = 1800;

/**
 * Create an encrypted checkout token.
 *
 * @param subId              - Subscription plan UUID.
 * @param uid                - External user identifier.
 * @param ttlSeconds         - Token lifetime in seconds (default 1800 = 30 min).
 * @param couponCode         - Optional pre-applied coupon code.
 * @param prevSubscriberId   - Previous subscriber ID for plan-change flows.
 * @returns The encrypted token string and its expiration date.
 */
export function createCheckoutToken(
    subId: string,
    uid: string,
    ttlSeconds: number = DEFAULT_TTL,
    couponCode?: string,
    prevSubscriberId?: string,
    successUrl?: string,
): { token: string; expiresAt: Date } {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload: CheckoutTokenPayload = { sub_id: subId, uid, exp };
    if (couponCode) payload.coupon_code = couponCode;
    if (prevSubscriberId) payload.prev_subscriber_id = prevSubscriberId;
    if (successUrl) payload.success_url = successUrl;
    const token = encryptToken(payload);

    return {
        token,
        expiresAt: new Date(exp * 1000),
    };
}

/**
 * Verify and decrypt a checkout token.
 *
 * Checks AES-GCM authentication (tamper detection) and expiration.
 *
 * @param token - The encrypted token string.
 * @returns Decoded payload, or `null` if invalid/expired/tampered.
 */
export function verifyCheckoutToken(token: string): CheckoutTokenPayload | null {
    const data = decryptToken<CheckoutTokenPayload>(token);
    if (!data) return null;

    // Validate required fields.
    if (!data.sub_id || !data.uid || !data.exp) return null;

    return data;
}
