/**
 * @module core/encryptedToken
 *
 * AES-256-GCM encrypted token utilities.
 *
 * Tokens are fully opaque — the payload is encrypted and authenticated,
 * so it cannot be read or tampered with without the encryption key.
 *
 * Format: `base64url(iv[12] + ciphertext + authTag[16])`
 *
 * Uses `LINK_SECRET` env var for the encryption key.
 * The application will not start without it.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

/** AES-256-GCM constants. */
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

// ─── Key Derivation ─────────────────────────────────────────────────

/** Cached key buffer (derived once per process). */
let _cachedKey: Buffer | null = null;

/**
 * Derive a 32-byte AES key from LINK_SECRET.
 *
 * @throws {Error} If LINK_SECRET is not set.
 */
function getKey(): Buffer {
    if (_cachedKey) return _cachedKey;

    if (!process.env.LINK_SECRET) {
        throw new Error("[anybill] LINK_SECRET environment variable is required. Refusing to start.");
    }

    _cachedKey = createHmac("sha256", process.env.LINK_SECRET)
        .update("anybill:aes-key")
        .digest();

    return _cachedKey;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Encrypt an arbitrary payload into an opaque token string.
 *
 * The payload is JSON-serialized, then encrypted with AES-256-GCM.
 * A random 12-byte IV ensures identical payloads produce different tokens.
 *
 * @param payload - JSON-serializable object to encrypt.
 * @returns Opaque base64url-encoded token.
 */
export function encryptToken<T extends object>(payload: T): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const plaintext = JSON.stringify(payload);

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack: iv + ciphertext + authTag
    return Buffer.concat([iv, encrypted, authTag]).toString("base64url");
}

/**
 * Decrypt and verify a token, returning the original payload.
 *
 * Validates the AES-GCM authentication tag (tamper detection) and
 * checks the `exp` field if present (expiration).
 *
 * @param token - Opaque base64url-encoded token.
 * @returns Decoded payload, or `null` if invalid, tampered, or expired.
 */
export function decryptToken<T extends object>(token: string): T | null {
    try {
        const key = getKey();
        const raw = Buffer.from(token, "base64url");

        // Minimum size: iv(12) + at least 1 byte ciphertext + authTag(16)
        if (raw.length < IV_LENGTH + 1 + AUTH_TAG_LENGTH) return null;

        const iv = raw.subarray(0, IV_LENGTH);
        const authTag = raw.subarray(raw.length - AUTH_TAG_LENGTH);
        const ciphertext = raw.subarray(IV_LENGTH, raw.length - AUTH_TAG_LENGTH);

        const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const data: T = JSON.parse(decrypted.toString("utf-8"));

        // Check expiration if present.
        if ("exp" in data && typeof (data as any).exp === "number") {
            if ((data as any).exp < Math.floor(Date.now() / 1000)) return null;
        }

        return data;
    } catch {
        return null;
    }
}

/**
 * Reset the cached key. Useful for testing with different secrets.
 * @internal
 */
export function _resetKeyCache(): void {
    _cachedKey = null;
}
