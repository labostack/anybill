/**
 * Abstract base class for payment provider implementations.
 *
 * Every payment provider (Stripe, crypto, etc.) must extend this
 * class and decorate its methods with the appropriate role decorators.
 */

/** Capability flag indicating what billing modes a provider supports. */
export type ProviderCapability = "one_time" | "recurring";

/**
 * Abstract base class for all payment providers.
 *
 * Subclasses declare their capabilities and implement payment lifecycle
 * methods using role decorators.
 */
export abstract class AnybillProvider {
    /**
     * Human-readable name shown in the checkout UI.
     * Override this getter to customize the display name.
     */
    get displayName(): string {
        return this.constructor.name;
    }

    /**
     * Declares which billing modes this provider supports.
     *
     * - `"one_time"` — single payments (default)
     * - `"recurring"` — provider manages recurring billing natively
     */
    get capabilities(): ProviderCapability[] {
        return ["one_time"];
    }
}
