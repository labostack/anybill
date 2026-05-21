/**
 * @module billing/AnybillProvider
 *
 * Abstract base class for payment provider implementations.
 *
 * Every payment provider (Stripe, crypto, etc.) must extend this
 * class and decorate its methods with the appropriate role decorators:
 *
 * - `@CreatePaymentLink()` — generates a payment URL for the user
 * - `@ValidateWebhook()` — verifies the incoming webhook signature
 * - `@IncomingWebhook()` — processes the webhook payload
 * - `@RefundPayment()` — initiates a refund through the provider
 * - `@CancelPayment()` — cancels a pending payment
 *
 * @example
 * ```ts
 * class StripeProvider extends AnybillProvider {
 *   get displayName() { return "Stripe"; }
 *   // or localized:
 *   get displayName() { return { en: "Fast Payments System", ru: "Система быстрых платежей" }; }
 *   get capabilities(): ProviderCapability[] { return ["one_time", "recurring"]; }
 *
 *   @CreatePaymentLink()
 *   async createLink(ctx: PaymentContext) { ... }
 * }
 * ```
 */

/** Capability flag indicating what billing modes a provider supports. */
export type ProviderCapability = "one_time" | "recurring";

/**
 * Abstract base class for all payment providers.
 *
 * Subclasses declare their capabilities and implement payment lifecycle
 * methods using role decorators. The {@link BillingEngine} discovers
 * decorated methods at runtime via the {@link ProviderRegistry}.
 */
/** Localized display name: either a plain string or a locale→string map. */
export type DisplayName = string | Record<string, string>;

export abstract class AnybillProvider {
    /**
     * Human-readable name shown in the checkout UI.
     * Can return a plain string or a locale map `{ en: "...", ru: "..." }`.
     * The checkout UI will pick the string matching the user's locale,
     * falling back to `"en"` and then to the first available key.
     *
     * @returns The provider's display name (defaults to the class name).
     */
    get displayName(): DisplayName {
        return this.constructor.name;
    }

    /**
     * Declares which billing modes this provider supports.
     *
     * - `"one_time"` — single payments (default)
     * - `"recurring"` — provider manages recurring billing natively
     *
     * Override in subclasses to advertise additional capabilities.
     *
     * @returns Array of supported capability flags.
     */
    get capabilities(): ProviderCapability[] {
        return ["one_time"];
    }
}
