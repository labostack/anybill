/**
 * @module core/validation
 *
 * Centralized input validation schemas (Zod).
 *
 * All API request bodies are validated through Zod schemas before
 * processing. The {@link validate} helper converts Zod errors into
 * HTTP 400 responses with human-readable messages.
 */

import { z } from "zod";
import { BadRequest } from "@tsed/exceptions";

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Validate input against a Zod schema.
 *
 * @param schema - Zod schema to validate against.
 * @param data   - Raw input data (usually `req.body`).
 * @returns Parsed and typed data.
 * @throws {BadRequest} With a human-readable validation error message.
 */
export function validate<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
    const result = schema.safeParse(data);
    if (!result.success) {
        const messages = result.error.issues.map((i) => {
            const path = i.path.length ? `${i.path.join(".")}: ` : "";
            return `${path}${i.message}`;
        });
        throw new BadRequest(messages.join("; "));
    }
    return result.data;
}

// ─── Auth ───────────────────────────────────────────────────────────

export const AuthSetupSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

export const AuthLoginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

export const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Password confirmation is required"),
}).refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

// ─── Subscriptions ──────────────────────────────────────────────────

const INTERVALS = ["day", "week", "month", "year", "one_time"] as const;
const RENEWAL_MODES = ["manual", "provider_managed"] as const;

export const CreateSubscriptionSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(255),
    description: z.string().nullable().optional(),
    amount: z.number().int("Amount must be an integer (minor units)").positive("Amount must be positive"),
    currency: z.string().regex(/^[A-Z]{3}$/, "Must be a 3-letter ISO 4217 code (e.g. USD)"),
    interval: z.enum(INTERVALS).default("month"),
    intervalCount: z.number().int().positive().default(1),
    renewalMode: z.enum(RENEWAL_MODES).default("manual"),
    isActive: z.boolean().default(true),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const UpdateSubscriptionSchema = z.object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    amount: z.number().int("Amount must be an integer").positive("Amount must be positive").optional(),
    currency: z.string().regex(/^[A-Z]{3}$/, "Must be a 3-letter ISO 4217 code").optional(),
    interval: z.enum(INTERVALS).optional(),
    intervalCount: z.number().int().positive().optional(),
    renewalMode: z.enum(RENEWAL_MODES).optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── Subscribers ────────────────────────────────────────────────────

const SUBSCRIBER_STATUSES = ["active", "cancelled", "expired", "past_due"] as const;

export const UpdateSubscriberSchema = z.object({
    status: z.enum(SUBSCRIBER_STATUSES).optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── Webhooks ───────────────────────────────────────────────────────

export const CreateWebhookSchema = z.object({
    url: z.string().url("Must be a valid URL"),
    description: z.string().nullable().optional(),
    events: z.array(z.string()).default([]),
});

export const UpdateWebhookSchema = z.object({
    url: z.string().url("Must be a valid URL").optional(),
    description: z.string().nullable().optional(),
    events: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
});

// ─── Checkout ───────────────────────────────────────────────────────

export const CheckoutPaySchema = z.object({
    sub_id: z.string().uuid("Invalid subscription ID"),
    uid: z.string().min(1, "User ID is required").max(512),
    provider: z.string().min(1, "Provider is required"),
});

// ─── Settings ───────────────────────────────────────────────────────

export const UpdateCheckoutSettingsSchema = z.object({
    checkoutConfig: z.record(z.string(), z.unknown()).optional(),
    successRedirectUrl: z.string().url().nullable().optional(),
});

// ─── API Keys ───────────────────────────────────────────────────────

export const CreateApiKeySchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100),
});

export const RenameApiKeySchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100),
});
