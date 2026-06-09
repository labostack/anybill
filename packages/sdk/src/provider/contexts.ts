/**
 * @module @anybill/sdk/provider/contexts
 *
 * Typed context contracts passed to decorated provider methods.
 *
 * Import these types when implementing a custom payment provider to get
 * full type safety and editor autocompletion on the `ctx` argument.
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
 * import type { PaymentContext, WebhookPayload } from "@anybill/sdk";
 *
 * class MyProvider extends AnybillProvider {
 *   @CreatePaymentLink()
 *   async createLink(ctx: PaymentContext) {
 *     const { plan, user, metadata } = ctx;
 *     return PaymentLink.url("https://pay.example.com/...").id("inv_123");
 *   }
 *
 *   @ValidateWebhook()
 *   verify(ctx: WebhookPayload): boolean {
 *     const sig = ctx.headers["x-my-signature"];
 *     return verifyHmac(ctx.body, sig);
 *   }
 *
 *   @IncomingWebhook()
 *   async handle(ctx: WebhookPayload) {
 *     const event = JSON.parse(ctx.body as string);
 *     return Payment.id(event.id).confirm();
 *   }
 * }
 * ```
 */

// ─── CreatePaymentLink ctx ───────────────────────────────────────────

/**
 * Plan data passed inside {@link PaymentContext.plan}.
 *
 * Mirrors the AnyBill `Subscription` entity fields enriched with
 * invoice-specific values at payment creation time.
 */
export interface PaymentPlan {
    /** UUID of the subscription plan. */
    id: string;
    /** Display name of the plan. */
    name: string;
    /** Short description of the plan. */
    description: string | null;
    /**
     * Price in **minor units** (e.g. cents for USD).
     * Already adjusted for any applied coupon discount.
     */
    amount: number;
    /** ISO 4217 currency code (e.g. `"USD"`, `"EUR"`). */
    currency: string;
    /** Billing interval type. */
    interval: "day" | "week" | "month" | "year" | "one_time";
    /** Number of intervals per billing cycle (e.g. `3` for quarterly). */
    intervalCount: number;
    /** UUID of the pending invoice created for this payment. */
    invoiceId: string;
    /** Arbitrary plan metadata set in the admin panel. */
    metadata: Record<string, any> | null;
}

/**
 * User data passed inside {@link PaymentContext.user}.
 */
export interface PaymentUser {
    /** External user ID from your application (the value you pass to AnyBill). */
    uid: string;
    /** AnyBill internal subscriber UUID. */
    subscriberId: string;
}

/**
 * Context passed to a `@CreatePaymentLink()` method.
 *
 * The engine populates this object before calling your provider and passes
 * it as the sole argument to the decorated method.
 *
 * @example
 * ```ts
 * @CreatePaymentLink()
 * async createLink(ctx: PaymentContext) {
 *   const { plan, user } = ctx;
 *   const session = await stripe.checkout.sessions.create({
 *     line_items: [{ price_data: { currency: plan.currency, unit_amount: plan.amount }, quantity: 1 }],
 *     metadata: { invoiceId: plan.invoiceId, uid: user.uid },
 *   });
 *   return PaymentLink.url(session.url!).id(session.id);
 * }
 * ```
 */
export interface PaymentContext {
    /** The subscription plan being purchased. */
    plan: PaymentPlan;
    /** The subscriber / user initiating the payment. */
    user: PaymentUser;
    /**
     * Origin (scheme + host) of the checkout page that initiated the payment.
     * Derived from the request's `Origin` header (falls back to `Referer`).
     *
     * Providers can use this to build absolute callback URLs, e.g.:
     * ```ts
     * success_url: `${ctx.origin}/confirm/${ctx.plan.invoiceId}`
     * ```
     *
     * May be `undefined` if the request had no Origin/Referer header
     * (e.g. server-to-server calls).
     */
    origin?: string;
    /**
     * IP address of the client initiating the payment.
     * Resolved in order: `X-Real-IP` → first value of `X-Forwarded-For` → socket remote address.
     * May be `undefined` if the IP could not be determined.
     */
    clientIp?: string;
    /**
     * Arbitrary key-value metadata forwarded from the checkout request.
     * Use this to pass provider-specific options (e.g. locale, return URL).
     */
    metadata?: Record<string, any>;
}

// ─── ValidateWebhook / IncomingWebhook ctx ───────────────────────────

/**
 * Raw HTTP webhook data passed to `@ValidateWebhook()` and `@IncomingWebhook()` methods.
 *
 * `@ValidateWebhook()` must return `true` (valid) or `false` (invalid).
 * `@IncomingWebhook()` must return a {@link PaymentResult} via the {@link Payment} builder.
 */
export interface WebhookPayload {
    /**
     * Raw request body exactly as received, before any JSON parsing.
     *
     * Keeping it raw is required by most HMAC signature schemes (e.g. Stripe)
     * because JSON serialisation is not guaranteed to be stable.
     *
     * The AnyBill backend passes a Node.js `Buffer` here at runtime — since
     * `Buffer` extends `Uint8Array`, this type is compatible without requiring
     * `@types/node` as a dependency of the SDK.
     */
    body: string | Uint8Array;

    /**
     * HTTP headers from the incoming webhook request, normalised to lowercase keys.
     *
     * @example
     * ```ts
     * const sig = ctx.headers["stripe-signature"];
     * ```
     */
    headers: Record<string, string>;
}

// ─── RefundPayment / CancelPayment ctx ──────────────────────────────

/**
 * Context passed to `@RefundPayment()` and `@CancelPayment()` methods.
 */
export interface RefundContext {
    /** The provider-side invoice / payment ID to refund or cancel. */
    providerInvoiceId: string;

    /**
     * Amount to refund in minor units (e.g. cents).
     * If omitted, a full refund should be issued.
     */
    amount?: number;

    /** ISO 4217 currency code (e.g. `"USD"`). */
    currency?: string;

    /** Arbitrary extra data forwarded from the application layer. */
    metadata?: Record<string, any>;
}
