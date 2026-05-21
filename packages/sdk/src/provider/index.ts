/**
 * @module @anybill/sdk/provider
 *
 * Provider authoring API for AnyBill.
 *
 * This module provides everything needed to write a custom payment provider:
 * - {@link AnybillProvider} — abstract base class
 * - Decorators — `@CreatePaymentLink()`, `@ValidateWebhook()`, etc.
 * - Builders — `PaymentLink`, `Payment` fluent builders
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
 *   PaymentContext,
 *   WebhookPayload,
 * } from "@anybill/sdk";
 *
 * class StripeProvider extends AnybillProvider {
 *   get displayName() { return "Stripe"; }
 *
 *   @CreatePaymentLink()
 *   async createLink(ctx: PaymentContext) {
 *     return PaymentLink.url("https://...").id("pi_xxx");
 *   }
 *
 *   @ValidateWebhook()
 *   verify(ctx: WebhookPayload): boolean { return true; }
 *
 *   @IncomingWebhook()
 *   async webhook(ctx: WebhookPayload) {
 *     return Payment.id("pi_xxx").confirm();
 *   }
 * }
 *
 * export default { name: "stripe", provider: new StripeProvider() };
 * ```
 */

// ─── Provider Base ──────────────────────────────────────────────────
export { AnybillProvider } from "./AnybillProvider";
export type { ProviderCapability, DisplayName } from "./AnybillProvider";

// ─── Decorators ─────────────────────────────────────────────────────
export { CreatePaymentLink, ValidateWebhook, IncomingWebhook, RefundPayment, CancelPayment } from "./decorators";

// ─── Fluent Builders ────────────────────────────────────────────────
export { PaymentLink, Payment } from "./builders";
export type { PaymentLinkResult, PaymentResult, PaymentAction } from "./builders";

// ─── Context Contracts ──────────────────────────────────────────────
export type { PaymentContext, PaymentPlan, PaymentUser, WebhookPayload, RefundContext } from "./contexts";

// ─── Registry (internal, but needed for cross-module compatibility) ─
export { registerMethod, hasMethod, getMethodForRole, getRegisteredRoles } from "./ProviderRegistry";
export type { ProviderRole } from "./ProviderRegistry";
