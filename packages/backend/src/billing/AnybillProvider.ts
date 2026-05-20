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
export abstract class AnybillProvider {
    /**
     * Human-readable name shown in the checkout UI.
     * Override this getter to customize the display name.
     *
     * @returns The provider's display name (defaults to the class name).
     */
    get displayName(): string {
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
