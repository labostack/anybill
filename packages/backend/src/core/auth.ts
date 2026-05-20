/**
 * @module core/auth
 *
 * Authentication utilities for the AnyBill platform.
 *
 * Provides JWT token management, password hashing (bcrypt), and
 * API key generation. Used by the admin auth flow and SDK guard.
 *
 * Required environment variables:
 * - `JWT_SECRET` — signing key for JWT tokens (app will not start without it)
 *
 * Optional environment variables:
 * - `JWT_EXPIRY`    — token lifetime (default: `"7d"`)
 * - `BCRYPT_ROUNDS` — cost factor for password hashing (default: `12`)
 */

import jwt from "jsonwebtoken";
import { compareSync, hashSync, genSaltSync } from "bcryptjs";
import { randomBytes, createHash } from "crypto";

if (!process.env.JWT_SECRET) {
    throw new Error("[anybill] JWT_SECRET environment variable is required. Refusing to start.");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

const JWT_EXPIRY = process.env.JWT_EXPIRY || "7d";
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

/**
 * Sign a JWT token with the given payload.
 *
 * @param payload - Claims to include (e.g. `{ sub: accountId }`).
 * @returns Signed JWT string.
 */
export function signJwt(payload: Record<string, any>): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY as any });
}

/**
 * Verify and decode a JWT token.
 *
 * @param token - The JWT string to verify.
 * @returns Decoded payload.
 * @throws {JsonWebTokenError} If the token is invalid or expired.
 */
export function verifyJwt(token: string): Record<string, any> {
    return jwt.verify(token, JWT_SECRET) as Record<string, any>;
}

/**
 * Hash a plain-text password using bcrypt.
 *
 * @param password - The plain-text password.
 * @returns bcrypt hash string.
 */
export function hashPassword(password: string): string {
    return hashSync(password, genSaltSync(BCRYPT_ROUNDS));
}

/**
 * Compare a plain-text password against a bcrypt hash.
 *
 * @param plain - The plain-text password to check.
 * @param hash  - The stored bcrypt hash.
 * @returns `true` if the password matches.
 */
export function comparePassword(plain: string, hash: string): boolean {
    return compareSync(plain, hash);
}

/**
 * Generate a new API key with the `ak_` prefix.
 *
 * Produces 48 hex characters (24 random bytes) prefixed with `ak_`.
 *
 * @returns A new unique API key string.
 */
export function generateApiKey(): string {
    return `ak_${randomBytes(24).toString("hex")}`;
}

/**
 * Hash an API key using SHA-256 for secure storage.
 *
 * API keys are never stored in plain text — only the hash is persisted.
 * On each request, the incoming key is hashed and compared to the stored value.
 *
 * @param key - The plain-text API key to hash.
 * @returns Hex-encoded SHA-256 hash.
 */
export function hashApiKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
}
