/**
 * @module services/ExchangeRateService
 *
 * In-memory cached currency exchange rate service.
 *
 * Fetches rates from a free public API (currency-api.pages.dev) and caches
 * them for a configurable TTL. Used by the billing layer to auto-convert
 * plan amounts when a provider variant requires a different currency.
 *
 * @example
 * ```ts
 * const service = new ExchangeRateService();
 * // Convert 999 cents USD → GBP minor units
 * const gbpAmount = await service.convert(999, "USD", "GBP");
 * ```
 */

import { Injectable, Inject } from "@tsed/di";
import { Logger } from "@tsed/logger";

/**
 * Base URL pattern for the currency exchange rate API.
 * `{base}` is replaced with the lowercase source currency code.
 *
 * @see https://github.com/fawazahmed0/exchange-api
 */
const API_URL_TEMPLATE =
    process.env.EXCHANGE_RATE_URL ??
    "https://latest.currency-api.pages.dev/v1/currencies/{base}.json";

/** How long cached rates remain valid (in milliseconds). */
const CACHE_TTL_MS =
    (Number(process.env.EXCHANGE_RATE_TTL_HOURS) || 6) * 60 * 60 * 1000;

/** Cached rate table for a single base currency. */
interface RateCache {
    /** Unix timestamp when the cache was populated. */
    fetchedAt: number;
    /** Map of target currency (lowercase) → rate multiplier. */
    rates: Record<string, number>;
}

@Injectable()
export class ExchangeRateService {
    @Inject()
    private logger!: Logger;

    /** In-memory cache keyed by lowercase base currency code. */
    private readonly cache = new Map<string, RateCache>();

    /**
     * Get the exchange rate from one currency to another.
     *
     * Returns `1` when `from === to` (no conversion needed).
     * Fetches and caches rates on first call or when the cache expires.
     *
     * @param from - Source currency code (ISO 4217, case-insensitive).
     * @param to   - Target currency code (ISO 4217, case-insensitive).
     * @returns The rate multiplier (e.g. `0.79` for USD→GBP).
     * @throws {Error} If the API is unreachable or the currency pair is unknown.
     */
    async getRate(from: string, to: string): Promise<number> {
        const fromLower = from.toLowerCase();
        const toLower = to.toLowerCase();

        if (fromLower === toLower) return 1;

        const rates = await this.fetchRates(fromLower);
        const rate = rates[toLower];

        if (rate === undefined) {
            throw new Error(
                `Exchange rate not found: ${from.toUpperCase()} → ${to.toUpperCase()}`,
            );
        }

        return rate;
    }

    /**
     * Convert an amount from one currency to another.
     *
     * The result is always rounded **up** (ceiling) to avoid underpaying
     * the provider. Both input and output are in **minor units** (cents).
     *
     * @param amount - Amount in minor units of the source currency.
     * @param from   - Source currency code (ISO 4217).
     * @param to     - Target currency code (ISO 4217).
     * @returns Converted amount in minor units of the target currency.
     */
    async convert(amount: number, from: string, to: string): Promise<number> {
        if (from.toLowerCase() === to.toLowerCase()) return amount;

        const rate = await this.getRate(from, to);
        return Math.ceil(amount * rate);
    }

    /**
     * Fetch (or return cached) rate table for the given base currency.
     *
     * @param baseLower - Lowercase base currency code.
     * @returns Map of lowercase target currencies to rate multipliers.
     */
    private async fetchRates(baseLower: string): Promise<Record<string, number>> {
        const cached = this.cache.get(baseLower);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            return cached.rates;
        }

        const url = API_URL_TEMPLATE.replace("{base}", baseLower);
        this.logger.info(`Fetching exchange rates: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(
                `Exchange rate API error: ${response.status} ${response.statusText} (${url})`,
            );
        }

        const data = await response.json() as Record<string, Record<string, number> | string>;

        // The API returns `{ date: "...", <base>: { <target>: rate, ... } }`
        const ratesRaw = data[baseLower];
        if (!ratesRaw || typeof ratesRaw !== "object") {
            throw new Error(
                `Unexpected exchange rate API response for "${baseLower}": missing rates object`,
            );
        }

        const rates = ratesRaw as Record<string, number>;

        this.cache.set(baseLower, { fetchedAt: Date.now(), rates });
        this.logger.info(
            `Cached ${Object.keys(rates).length} exchange rates for ${baseLower.toUpperCase()} (TTL: ${CACHE_TTL_MS / 3600000}h)`,
        );

        return rates;
    }
}
