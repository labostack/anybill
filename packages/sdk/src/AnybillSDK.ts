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

import type { AnybillSDKConfig, Subscription, Subscriber, Invoice, CheckoutLink, PortalLink, Squad, SquadMember, AccessCheck } from "./types";

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

    /**
     * Perform an authenticated POST request to the SDK API.
     *
     * @param path - Endpoint path (relative to `/api/sdk`).
     * @param body - JSON-serialisable request body.
     * @returns Parsed JSON response.
     * @throws {Error} If the response is not OK.
     */
    private async post<T>(path: string, body: unknown): Promise<T> {
        const res = await fetch(`${this.baseUrl}/api/sdk${path}`, {
            method: "POST",
            headers: {
                "X-Api-Key": this.apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: res.statusText }));
            throw new Error(`AnybillSDK: ${err.message}`);
        }
        return res.json();
    }

    /**
     * Perform an authenticated DELETE request to the SDK API.
     *
     * @param path - Endpoint path (relative to `/api/sdk`).
     * @returns Parsed JSON response.
     * @throws {Error} If the response is not OK.
     */
    private async del<T>(path: string): Promise<T> {
        const res = await fetch(`${this.baseUrl}/api/sdk${path}`, {
            method: "DELETE",
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
     * Create a secure checkout link.
     *
     * The returned URL can be shared with end-users. It contains a signed
     * token that expires after `ttl` seconds (default: 30 minutes).
     *
     * @param subscriptionId - Plan ID to purchase.
     * @param uid            - External user identifier.
     * @param options        - Optional settings: `ttl` (60–86400), `couponCode`.
     * @returns Checkout link with token, URL, and expiration.
     */
    async createCheckoutLink(
        subscriptionId: string,
        uid: string,
        options?: { ttl?: number; couponCode?: string },
    ): Promise<CheckoutLink> {
        const body: Record<string, any> = { sub_id: subscriptionId, uid };
        if (options?.ttl !== undefined) body.ttl = options.ttl;
        if (options?.couponCode) body.coupon_code = options.couponCode;
        return this.post("/checkout-links", body);
    }

    /**
     * Create a secure portal link.
     *
     * The returned URL grants the end-user access to their subscription
     * management portal (view, cancel, change plan, renew).
     * The link expires after `ttl` seconds (default: 30 minutes).
     *
     * @param uid - External user identifier.
     * @param ttl - Optional token lifetime in seconds (60–86400).
     * @returns Portal link with token, URL, and expiration.
     */
    async createPortalLink(uid: string, ttl?: number): Promise<PortalLink> {
        const body: Record<string, any> = { uid };
        if (ttl !== undefined) body.ttl = ttl;
        return this.post("/portal-links", body);
    }

    /**
     * Check if a user has access — either through a direct subscription
     * or through a squad membership.
     *
     * @param uid            - External user identifier.
     * @param subscriptionId - Optional: limit check to a specific plan.
     * @returns Access check result.
     */
    async checkAccess(uid: string, subscriptionId?: string): Promise<AccessCheck> {
        let path = `/access?uid=${encodeURIComponent(uid)}`;
        if (subscriptionId) path += `&subscription_id=${encodeURIComponent(subscriptionId)}`;
        return this.request(path);
    }

    /**
     * Start a free trial for a user.
     *
     * Activates a free trial for a user. The subscription plan is auto-resolved
     * if subscriptionId is omitted (valid if exactly one plan with trialDays > 0 exists).
     *
     * @param uid - External user identifier.
     * @param subscriptionId - Optional plan ID (auto-resolved if omitted).
     * @returns Trial subscriber data with trialEnd date.
     */
    async startTrial(
        uid: string,
        subscriptionId?: string,
    ): Promise<{ subscriberId: string; trialEnd: string; status: "trialing" }> {
        const body: Record<string, any> = { uid };
        if (subscriptionId) body.subscriptionId = subscriptionId;
        return this.post("/start-trial", body);
    }

    /**
     * Squad management methods.
     *
     * Squads enable group/family subscriptions where an owner pays and
     * members get access through the owner's subscription.
     */
    readonly squads = {
        /**
         * Create a squad for a subscriber.
         *
         * @param subscriberId - AnyBill subscriber UUID (the owner).
         */
        create: (subscriberId: string): Promise<Squad> =>
            this.post("/squads", { subscriberId }),

        /**
         * Get a squad by ID.
         *
         * @param id - Squad UUID.
         */
        get: (id: string): Promise<Squad> =>
            this.request(`/squads/${id}`),

        /**
         * Find a squad by the owner's external user ID.
         *
         * @param ownerUid       - Owner's external user ID.
         * @param subscriptionId - Subscription plan ID.
         */
        getByOwnerUid: (ownerUid: string, subscriptionId: string): Promise<Squad[]> =>
            this.request(`/squads?owner_uid=${encodeURIComponent(ownerUid)}&subscription_id=${encodeURIComponent(subscriptionId)}`),

        /**
         * Dissolve a squad, removing all members.
         *
         * @param id - Squad UUID.
         */
        dissolve: (id: string): Promise<{ dissolved: boolean }> =>
            this.del(`/squads/${id}`),

        /**
         * Add a member to a squad.
         *
         * @param squadId - Squad UUID.
         * @param uid     - External user ID of the member.
         */
        addMember: (squadId: string, uid: string): Promise<SquadMember> =>
            this.post(`/squads/${squadId}/members`, { uid }),

        /**
         * Remove a member from a squad.
         *
         * @param squadId - Squad UUID.
         * @param uid     - External user ID of the member.
         */
        removeMember: (squadId: string, uid: string): Promise<{ removed: boolean }> =>
            this.del(`/squads/${squadId}/members/${encodeURIComponent(uid)}`),

        /**
         * List active members of a squad.
         *
         * @param squadId - Squad UUID.
         */
        getMembers: (squadId: string): Promise<SquadMember[]> =>
            this.request(`/squads/${squadId}/members`),
    };

}
