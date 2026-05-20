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
    /** Whether this plan supports squads (group/family subscriptions). */
    squadEnabled: boolean;
    /** Maximum members per squad (excluding the owner). 0 = unlimited. */
    squadMaxMembers: number;
}

/** Subscriber (a user with an active or past subscription). */
export interface Subscriber {
    id: string;
    /** External user ID from your application. */
    uid: string;
    subscriptionId: string;
    subscription?: Subscription;
    status: "pending" | "active" | "cancelled" | "expired" | "past_due";
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
    /** Amount in minor units (after discount, if any). */
    amount: number;
    /** ISO 4217 currency code. */
    currency: string;
    /** Original amount before discount (minor units). */
    originalAmount?: number;
    /** Discount amount in minor units. */
    discountAmount?: number;
    /** Reference to the coupon used for this invoice. */
    couponId?: string;
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

/** Squad — a group/family subscription unit. */
export interface Squad {
    id: string;
    /** Internal AnyBill subscriber ID of the owner. */
    ownerId: string;
    /** Maximum members allowed (excluding owner). 0 = unlimited. */
    maxMembers: number;
    /** Active members of the squad. */
    members: SquadMember[];
    createdAt: string;
    updatedAt: string;
}

/** A member of a squad, identified by external user ID. */
export interface SquadMember {
    id: string;
    /** External user ID from your application. */
    uid: string;
    status: "active" | "removed";
    joinedAt: string;
    removedAt: string | null;
}

/** Result of an access check. */
export interface AccessCheck {
    /** Whether the user has access. */
    hasAccess: boolean;
    /** How the user has access (direct subscription or squad membership). */
    accessType?: "direct" | "squad";
    /** Squad ID (only when accessType is "squad"). */
    squadId?: string;
    /** Owner's external user ID (only when accessType is "squad"). */
    ownerUid?: string;
    /** The subscriber record (owner in case of squad access). */
    subscriber?: Subscriber;
    /** The subscription plan. */
    subscription?: Subscription;
}

/** Discount coupon / promo code. */
export interface Coupon {
    id: string;
    code: string;
    type: "percent" | "fixed";
    value: number;
    currency?: string;
    maxRedemptions?: number;
    maxRedemptionsPerUser: number;
    timesRedeemed: number;
    subscriptionIds?: string[];
    minAmount: number;
    expiresAt?: string;
    isActive: boolean;
    createdAt: string;
}
