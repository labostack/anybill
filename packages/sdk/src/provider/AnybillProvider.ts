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
/** Localized display name: either a plain string or a locale→string map. */
export type DisplayName = string | Record<string, string>;

export abstract class AnybillProvider {
    /**
     * Human-readable name shown in the checkout UI.
     * Can return a plain string or a locale map `{ en: "...", ru: "..." }`.
     * The checkout UI will pick the string matching the user's locale,
     * falling back to `"en"` and then to the first available key.
     */
    get displayName(): DisplayName {
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
