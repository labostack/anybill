/**
 * @module @anybill/sdk
 *
 * Public API surface for the AnyBill SDK package.
 *
 * Two categories of exports:
 *
 * 1. **Client SDK** — `AnybillSDK` for querying the billing API from
 *    your application backend.
 *
 * 2. **Provider API** — `AnybillProvider`, decorators, and fluent builders
 *    for writing custom payment provider plugins.
 *
 * @example Client SDK
 * ```ts
 * import { AnybillSDK } from "@anybill/sdk";
 *
 * const client = new AnybillSDK({ baseUrl: "...", apiKey: "ak_..." });
 * const plans = await client.getSubscriptions();
 * ```
 *
 * @example Provider Plugin
 * ```ts
 * import {
 *   AnybillProvider,
 *   CreatePaymentLink,
 *   PaymentLink,
 *   Payment,
 * } from "@anybill/sdk";
 *
 * class MyProvider extends AnybillProvider {
 *   @CreatePaymentLink()
 *   async createLink(ctx) {
 *     return PaymentLink.url("https://...").id("inv_123");
 *   }
 * }
 *
 * export default { name: "my-provider", provider: new MyProvider() };
 * ```
 */

// ─── Client SDK ─────────────────────────────────────────────────────
export { AnybillSDK } from "./AnybillSDK";
export type { AnybillSDKConfig, Subscription, Subscriber, Invoice, CheckoutLink, PortalLink, Squad, SquadMember, AccessCheck, Coupon } from "./types";

// ─── Provider API ───────────────────────────────────────────────────
export { AnybillProvider } from "./provider/AnybillProvider";
export type { ProviderCapability } from "./provider/AnybillProvider";
export { CreatePaymentLink, ValidateWebhook, IncomingWebhook, RefundPayment, CancelPayment } from "./provider/decorators";
export { PaymentLink, Payment } from "./provider/builders";
export type { PaymentLinkResult, PaymentResult, PaymentAction } from "./provider/builders";
