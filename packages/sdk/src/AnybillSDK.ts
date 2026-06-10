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

import type { AnybillSDKConfig, Subscription, Subscriber, Invoice, CheckoutLink, PortalLink, Squad, SquadMember, SquadInvite, InviteStatus, AccessCheck, GrantSubscriptionOptions, GrantSubscriptionResult } from "./types";
import { EventStream } from "./EventStream";
import type { WebhookEventType } from "./types";

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
     * @param options        - Optional settings: `ttl` (60–86400), `couponCode`, `successUrl`.
     * @returns Checkout link with token, URL, and expiration.
     */
    async createCheckoutLink(
        subscriptionId: string,
        uid: string,
        options?: { ttl?: number; couponCode?: string; successUrl?: string },
    ): Promise<CheckoutLink> {
        const body: Record<string, any> = { sub_id: subscriptionId, uid };
        if (options?.ttl !== undefined) body.ttl = options.ttl;
        if (options?.couponCode) body.coupon_code = options.couponCode;
        if (options?.successUrl) body.success_url = options.successUrl;
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
     * Grant a subscription to a user without requiring payment.
     *
     * Immediately activates the subscription for the specified user.
     * Useful for admin overrides, promotional grants, comp accounts, etc.
     *
     * @param subscriptionId - Plan ID to grant.
     * @param uid            - External user identifier.
     * @param options        - Optional: `days` (custom duration), `startDate` (ISO 8601).
     * @returns Grant result with subscriber ID, status, and period dates.
     *
     * @example
     * ```ts
     * // Grant with plan's default interval
     * await sdk.grantSubscription("plan_id", "user_123");
     *
     * // Grant for 90 days starting from a specific date
     * await sdk.grantSubscription("plan_id", "user_123", {
     *   days: 90,
     *   startDate: "2025-02-01T00:00:00Z",
     * });
     * ```
     */
    async grantSubscription(
        subscriptionId: string,
        uid: string,
        options?: GrantSubscriptionOptions,
    ): Promise<GrantSubscriptionResult> {
        const body: Record<string, any> = { uid, subscriptionId };
        if (options?.days !== undefined) body.days = options.days;
        if (options?.startDate) body.startDate = options.startDate;
        return this.post("/grant", body);
    }

    /**
     * Cancel a subscriber's subscription.
     *
     * The subscriber retains access until the end of their current
     * billing period (`currentPeriodEnd`). One-time subscriptions
     * cannot be cancelled.
     *
     * @param subscriberId - AnyBill subscriber UUID.
     * @returns Updated subscriber record.
     */
    async cancelSubscriber(subscriberId: string): Promise<Subscriber> {
        return this.post(`/subscribers/${subscriberId}/cancel`, {});
    }

    /**
     * Revoke a subscriber's access immediately.
     *
     * Unlike `cancelSubscriber`, this clears billing period dates
     * so the subscriber loses access right away (no grace period).
     *
     * @param subscriberId - AnyBill subscriber UUID.
     * @returns Updated subscriber record.
     */
    async revokeSubscriber(subscriberId: string): Promise<Subscriber> {
        return this.post(`/subscribers/${subscriberId}/revoke`, {});
    }

    /**
     * Permanently delete a subscriber and all related records.
     *
     * Cascade-deletes the subscriber's invoices, squad, squad members,
     * and squad invites. **This action cannot be undone.**
     *
     * @param subscriberId - AnyBill subscriber UUID.
     * @returns `{ deleted: true }` on success.
     */
    async deleteSubscriber(subscriberId: string): Promise<{ deleted: boolean }> {
        return this.del(`/subscribers/${subscriberId}`);
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

        /**
         * Squad invite management.
         *
         * Invites allow an owner to request a user join their squad.
         * The user (invitee) can accept or decline via their own SDK call.
         */
        invites: {
            /**
             * Create an invite for a user to join a squad.
             *
             * TTL defaults to the global setting (Settings → Billing → inviteTtlDays).
             * Pass `ttlDays` to override per-invite; `0` = no expiration.
             *
             * @param squadId - Squad UUID.
             * @param uid     - External user ID of the invitee.
             * @param options - Optional `ttlDays` override.
             */
            create: (squadId: string, uid: string, options?: { ttlDays?: number }): Promise<SquadInvite> =>
                this.post(`/squads/${squadId}/invites`, { uid, ttlDays: options?.ttlDays }),

            /**
             * List invites for a squad.
             *
             * @param squadId - Squad UUID.
             * @param status  - Optional status filter.
             */
            list: (squadId: string, status?: InviteStatus): Promise<SquadInvite[]> => {
                const url = status
                    ? `/squads/${squadId}/invites?status=${encodeURIComponent(status)}`
                    : `/squads/${squadId}/invites`;
                return this.request(url);
            },

            /**
             * Accept a squad invite.
             *
             * The uid must match the invite's target uid.
             *
             * @param squadId  - Squad UUID.
             * @param inviteId - Invite UUID.
             * @param uid      - External user ID of the invitee.
             */
            accept: (squadId: string, inviteId: string, uid: string): Promise<SquadInvite> =>
                this.post(`/squads/${squadId}/invites/${inviteId}/accept`, { uid }),

            /**
             * Decline a squad invite.
             *
             * The uid must match the invite's target uid.
             *
             * @param squadId  - Squad UUID.
             * @param inviteId - Invite UUID.
             * @param uid      - External user ID of the invitee.
             */
            decline: (squadId: string, inviteId: string, uid: string): Promise<SquadInvite> =>
                this.post(`/squads/${squadId}/invites/${inviteId}/decline`, { uid }),

            /**
             * Cancel a pending invite (owner action).
             *
             * @param squadId  - Squad UUID.
             * @param inviteId - Invite UUID.
             */
            cancel: (squadId: string, inviteId: string): Promise<{ cancelled: boolean }> =>
                this.del(`/squads/${squadId}/invites/${inviteId}`),

            /**
             * Get incoming invites for a user (invitee's inbox).
             *
             * @param uid    - External user ID.
             * @param status - Optional status filter (e.g. "pending").
             */
            incoming: (uid: string, status?: InviteStatus): Promise<SquadInvite[]> => {
                let url = `/invites?uid=${encodeURIComponent(uid)}`;
                if (status) url += `&status=${encodeURIComponent(status)}`;
                return this.request(url);
            },
        },
    };

    /**
     * Real-time event streaming via Server-Sent Events (SSE).
     *
     * Subscribe to billing events in real time. The SDK maintains
     * a persistent connection to the AnyBill backend and delivers
     * events as they occur.
     *
     * @example
     * ```ts
     * const stream = sdk.events.subscribe(["payment.confirmed"]);
     *
     * stream.on("payment.confirmed", (data) => {
     *   console.log("Paid!", data.invoiceId, data.amount);
     * });
     *
     * // Listen to all events:
     * const allStream = sdk.events.subscribe();
     *
     * // Clean up when done:
     * stream.close();
     * ```
     */
    readonly events = {
        /**
         * Open an SSE stream and subscribe to real-time events.
         *
         * @param events - Event types to listen for. Omit or pass empty array for all events.
         * @returns An {@link EventStream} instance with typed `.on()` handlers.
         */
        subscribe: (events?: WebhookEventType[]): EventStream => {
            return new EventStream({
                baseUrl: this.baseUrl,
                apiKey: this.apiKey,
                events,
            });
        },
    };

}
