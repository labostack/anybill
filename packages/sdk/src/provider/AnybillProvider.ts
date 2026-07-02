/**
 * Abstract base class for payment provider implementations.
 *
 * Every payment provider (Stripe, crypto, etc.) must extend this
 * class and decorate its methods with the appropriate role decorators.
 */

/** Capability flag indicating what billing modes a provider supports. */
export type ProviderCapability = "one_time" | "recurring";

/** Localized display name: either a plain string or a locale→string map. */
export type DisplayName = string | Record<string, string>;

/**
 * A provider variant — a sub-option within a payment provider.
 *
 * Variants let a single provider expose multiple payment paths, typically
 * differing by currency or payment instrument. When variants are defined,
 * the checkout UI presents them as nested choices under the provider.
 *
 * @example
 * ```ts
 * get variants(): ProviderVariant[] {
 *   return [
 *     { id: "GBP", displayName: { en: "Card (GBP)", ru: "Карта (GBP)" }, currency: "GBP" },
 *     { id: "JPY", displayName: { en: "Card (JPY)", ru: "Карта (JPY)" }, currency: "JPY" },
 *   ];
 * }
 * ```
 */
export interface ProviderVariant {
    /** Unique variant identifier within this provider (e.g. `"GBP"`, `"crypto_btc"`). */
    id: string;
    /** Human-readable label shown in the checkout UI. */
    displayName: DisplayName;
    /**
     * ISO 4217 currency code that this variant charges in.
     * When different from the plan's currency, AnyBill auto-converts the amount.
     */
    currency: string;
}

/**
 * Abstract base class for all payment providers.
 *
 * Subclasses declare their capabilities, optional variants, and implement
 * payment lifecycle methods using role decorators.
 */
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

    /**
     * Declares sub-options (variants) for this provider.
     *
     * When a provider returns a non-empty array, the checkout UI shows these
     * as nested choices underneath the provider. Each variant can specify a
     * different target currency — AnyBill will auto-convert the plan amount
     * using live exchange rates.
     *
     * Return an empty array (default) if the provider has no sub-options.
     */
    get variants(): ProviderVariant[] {
        return [];
    }
}
