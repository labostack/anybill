/**
 * @module @anybill/sdk/types
 *
 * Type definitions for the AnyBill SDK.
 */

/** Subscription plan (pricing tier). */
export interface Subscription {
    id: string;
    name: string;
    description: string | null;
    /** Price in minor units (e.g. 999 = $9.99). */
    amount: number;
    /** ISO 4217 currency code. */
    currency: string;
    interval: "day" | "week" | "month" | "year" | "one_time";
    intervalCount: number;
    isActive: boolean;
    metadata: Record<string, any> | null;
}

/** Subscriber (a user with an active or past subscription). */
export interface Subscriber {
    id: string;
    /** External user ID from your application. */
    uid: string;
    subscriptionId: string;
    subscription?: Subscription;
    status: "active" | "cancelled" | "expired" | "past_due";
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    metadata: Record<string, any> | null;
}

/** Payment invoice. */
export interface Invoice {
    id: string;
    subscriberId: string;
    subscriptionId: string;
    provider: string;
    providerInvoiceId: string | null;
    /** Amount in minor units. */
    amount: number;
    /** ISO 4217 currency code. */
    currency: string;
    status: "pending" | "paid" | "failed" | "refunded" | "cancelled";
    paidAt: string | null;
}

/** SDK client configuration. */
export interface AnybillSDKConfig {
    /** Base URL of the AnyBill backend (e.g. `"https://billing.example.com"`). */
    baseUrl: string;
    /** API key from the AnyBill admin dashboard. */
    apiKey: string;
}

/** Secure checkout link returned by the API. */
export interface CheckoutLink {
    /** Signed checkout token. */
    token: string;
    /** Full checkout URL to redirect the user to. */
    url: string;
    /** ISO 8601 expiration timestamp. */
    expiresAt: string;
}

/** Secure portal link returned by the API. */
export interface PortalLink {
    /** Encrypted portal token. */
    token: string;
    /** Full portal URL to redirect the user to. */
    url: string;
    /** ISO 8601 expiration timestamp. */
    expiresAt: string;
}
