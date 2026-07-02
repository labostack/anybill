/**
 * @module billing
 *
 * Public API of the AnyBill billing engine.
 *
 * Provider plugin files import from `@anybill/sdk` to access the base class,
 * decorators, and fluent builders needed to implement a payment provider.
 *
 * @example
 * ```ts
 * import {
 *   AnybillProvider,
 *   CreatePaymentLink,
 *   ValidateWebhook,
 *   IncomingWebhook,
 *   PaymentLink,
 *   Payment,
 * } from "@anybill/sdk";
 * ```
 */

// ─── Provider Base ──────────────────────────────────────────────────
export { AnybillProvider } from "./AnybillProvider";
export type { ProviderCapability, ProviderVariant } from "./AnybillProvider";

// ─── Decorators ─────────────────────────────────────────────────────
export { CreatePaymentLink, ValidateWebhook, IncomingWebhook, RefundPayment, CancelPayment } from "./decorators";

// ─── Fluent Builders ────────────────────────────────────────────────
export { PaymentLink, Payment } from "./builders";
export type { PaymentLinkResult, PaymentResult, PaymentAction } from "./builders";

// ─── Engine ─────────────────────────────────────────────────────────
export { BillingEngine } from "./BillingEngine";
export type { PaymentContext, WebhookPayload, ProviderInfo } from "./BillingEngine";
