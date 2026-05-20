/**
 * @module @anybill/sdk
 *
 * Zero-dependency TypeScript client for the AnyBill billing API.
 *
 * @example
 * ```ts
 * import { AnybillSDK } from "@anybill/sdk";
 *
 * const client = new AnybillSDK({
 *   baseUrl: "https://billing.example.com",
 *   apiKey: "ak_...",
 * });
 *
 * const plans = await client.getSubscriptions();
 * const subscriber = await client.getSubscriberByUid("user_123");
 * ```
 */

import type { AnybillSDKConfig, Subscription, Subscriber, Invoice } from "./types";

/**
 * AnyBill SDK client.
 *
 * Provides typed methods for querying subscriptions, subscribers,
 * and invoices via the `/api/sdk` endpoints.
 */
export class AnybillSDK {
    private readonly baseUrl: string;
    private readonly apiKey: string;

    /**
     * @param config - SDK configuration (base URL + API key).
     */
    constructor(config: AnybillSDKConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.apiKey = config.apiKey;
    }

    /**
     * Perform an authenticated GET request to the SDK API.
     *
     * @param path - Endpoint path (relative to `/api/sdk`).
     * @returns Parsed JSON response.
     * @throws {Error} If the response is not OK.
     */
    private async request<T>(path: string): Promise<T> {
        const res = await fetch(`${this.baseUrl}/api/sdk${path}`, {
            headers: { "X-Api-Key": this.apiKey },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: res.statusText }));
            throw new Error(`AnybillSDK: ${err.message}`);
        }
        return res.json();
    }

    /** List all active subscription plans. */
    async getSubscriptions(): Promise<Subscription[]> {
        return this.request("/subscriptions");
    }

    /**
     * Find subscribers by external user ID.
     *
     * @param uid - External user identifier from your application.
     */
    async getSubscriberByUid(uid: string): Promise<Subscriber[]> {
        return this.request(`/subscribers?uid=${encodeURIComponent(uid)}`);
    }

    /**
     * Get a single subscriber by internal AnyBill ID.
     *
     * @param id - AnyBill subscriber UUID.
     */
    async getSubscriber(id: string): Promise<Subscriber> {
        return this.request(`/subscribers/${id}`);
    }

    /**
     * Get a single invoice by ID.
     *
     * @param id - AnyBill invoice UUID.
     */
    async getInvoice(id: string): Promise<Invoice> {
        return this.request(`/invoices/${id}`);
    }

    /**
     * Build a checkout URL for a subscription plan.
     *
     * @param subscriptionId - Plan ID to purchase.
     * @param uid            - External user identifier.
     * @returns Full checkout URL to redirect the user to.
     */
    checkoutUrl(subscriptionId: string, uid: string): string {
        return `${this.baseUrl}/pay/checkout?sub_id=${subscriptionId}&uid=${encodeURIComponent(uid)}`;
    }
}
