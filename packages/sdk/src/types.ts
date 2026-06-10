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
    /** Number of free trial days. 0 = no trial. */
    trialDays: number;
}

/** Subscriber (a user with an active or past subscription). */
export interface Subscriber {
    id: string;
    /** External user ID from your application. */
    uid: string;
    subscriptionId: string;
    subscription?: Subscription;
    status: "pending" | "trialing" | "active" | "cancelled" | "expired" | "past_due";
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
    metadata: Record<string, any> | null;
    /**
     * Actual renewal mode determined at payment time.
     * - `"manual"` — subscriber must re-purchase when period expires.
     * - `"provider_managed"` — provider handles recurring billing automatically.
     */
    renewalMode: "manual" | "provider_managed";
    /** Payment provider used for the current subscription period. */
    provider: string | null;
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
    /** External user ID of the owner (from your application). */
    ownerUid: string;
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

/** Status of a squad invite. */
export type InviteStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

/** A squad invite — sent from the owner to a potential member. */
export interface SquadInvite {
    id: string;
    /** Squad UUID the invite belongs to. */
    squadId: string;
    /** External user ID of the invited user. */
    uid: string;
    status: InviteStatus;
    /** ISO 8601 expiration timestamp. Null = no expiration. */
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
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

/** Options for granting a subscription without payment. */
export interface GrantSubscriptionOptions {
    /**
     * Custom duration in days. Overrides the plan's standard interval.
     * Must be >= 1. When omitted, the plan's normal interval is used.
     */
    days?: number;
    /**
     * Custom start date (ISO 8601 string, e.g. `"2025-01-15T00:00:00Z"`).
     * When omitted, defaults to now.
     */
    startDate?: string;
}

/** Result returned after granting a subscription. */
export interface GrantSubscriptionResult {
    /** AnyBill subscriber UUID. */
    subscriberId: string;
    /** Always `"active"` for a successful grant. */
    status: "active";
    /** ISO 8601 period start timestamp. */
    currentPeriodStart: string;
    /** ISO 8601 period end timestamp (`null` for one-time plans without custom days). */
    currentPeriodEnd: string | null;
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

// ─── Event Streaming Types ──────────────────────────────────────────

/** All event types emitted by AnyBill. */
export type WebhookEventType =
    | "payment.confirmed"
    | "payment.failed"
    | "payment.refunded"
    | "payment.cancelled"
    | "subscription.renewed"
    | "subscription.expired"
    | "subscription.cancelled"
    | "squad.created"
    | "squad.dissolved"
    | "squad.member_added"
    | "squad.member_removed"
    | "squad.invite_created"
    | "squad.invite_accepted"
    | "squad.invite_declined"
    | "squad.invite_cancelled"
    | "coupon.redeemed"
    | "trial.started"
    | "trial.expired";

/** Payload for `payment.confirmed` event. */
export interface PaymentConfirmedEvent {
    invoiceId: string;
    subscriberId: string;
    subscriptionId: string;
    amount: number;
    currency: string;
    provider: string;
    providerInvoiceId: string | null;
    paidAt: string;
}

/** Payload for `payment.failed` event. */
export interface PaymentFailedEvent {
    invoiceId: string;
    subscriberId: string;
    subscriptionId: string;
    amount: number;
    currency: string;
    provider: string;
}

/** Payload for `payment.refunded` event. */
export interface PaymentRefundedEvent {
    invoiceId: string;
    subscriberId: string;
    subscriptionId: string;
    amount: number;
    currency: string;
    provider: string;
}

/** Payload for `payment.cancelled` event. */
export interface PaymentCancelledEvent {
    invoiceId: string;
    subscriberId: string;
    subscriptionId: string;
    amount: number;
    currency: string;
    provider: string;
    reason?: string;
}

/** Payload for `subscription.renewed` event. */
export interface SubscriptionRenewedEvent {
    invoiceId: string;
    subscriberId: string;
    subscriptionId: string;
    amount: number;
    currency: string;
    provider: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
}

/** Payload for `subscription.expired` event. */
export interface SubscriptionExpiredEvent {
    subscriberId: string;
    subscriptionId: string;
    uid: string;
    expiredAt: string;
}

/** Payload for `subscription.cancelled` event. */
export interface SubscriptionCancelledEvent {
    subscriberId: string;
    subscriptionId: string;
    uid: string;
    cancelledVia: "portal" | "plan_change";
    accessUntil: string | null;
    /** Present when cancelled due to plan change. */
    newSubscriberId?: string;
    /** Present when cancelled due to plan change. */
    newSubscriptionId?: string;
}

/** Payload for `squad.created` event. */
export interface SquadCreatedEvent {
    squadId: string;
    ownerUid: string;
    subscriberId: string;
    subscriptionId: string;
    maxMembers?: number;
    ownerId?: string;
}

/** Payload for `squad.dissolved` event. */
export interface SquadDissolvedEvent {
    squadId: string;
    ownerUid: string;
}

/** Payload for `squad.member_added` event. */
export interface SquadMemberAddedEvent {
    squadId: string;
    memberUid: string;
    memberId: string;
    ownerUid: string;
    subscriptionId: string;
}

/** Payload for `squad.member_removed` event. */
export interface SquadMemberRemovedEvent {
    squadId: string;
    memberUid: string;
    memberId: string;
    ownerUid: string;
    subscriptionId: string;
}

/** Payload for `squad.invite_created` event. */
export interface SquadInviteCreatedEvent {
    squadId: string;
    inviteId: string;
    ownerUid: string;
    inviteeUid: string;
    expiresAt: string | null;
}

/** Payload for `squad.invite_accepted` event. */
export interface SquadInviteAcceptedEvent {
    squadId: string;
    inviteId: string;
    ownerUid: string;
    inviteeUid: string;
}

/** Payload for `squad.invite_declined` event. */
export interface SquadInviteDeclinedEvent {
    squadId: string;
    inviteId: string;
    ownerUid: string;
    inviteeUid: string;
}

/** Payload for `squad.invite_cancelled` event. */
export interface SquadInviteCancelledEvent {
    squadId: string;
    inviteId: string;
    ownerUid: string;
    inviteeUid: string;
}

/** Payload for `coupon.redeemed` event. */
export interface CouponRedeemedEvent {
    couponId: string;
    invoiceId: string;
    subscriberId: string;
    subscriptionId: string;
    discountAmount: number;
    originalAmount: number;
    finalAmount: number;
}

/** Payload for `trial.started` event. */
export interface TrialStartedEvent {
    subscriberId: string;
    subscriptionId: string;
    uid: string;
    trialDays: number;
    trialEnd: string;
}

/** Payload for `trial.expired` event. */
export interface TrialExpiredEvent {
    subscriberId: string;
    subscriptionId: string;
    uid: string;
    trialEnd: string;
}

/**
 * Maps each webhook event type to its typed payload.
 *
 * Used by {@link EventStream} to provide type-safe event handlers.
 */
export interface WebhookEventMap {
    "payment.confirmed": PaymentConfirmedEvent;
    "payment.failed": PaymentFailedEvent;
    "payment.refunded": PaymentRefundedEvent;
    "payment.cancelled": PaymentCancelledEvent;
    "subscription.renewed": SubscriptionRenewedEvent;
    "subscription.expired": SubscriptionExpiredEvent;
    "subscription.cancelled": SubscriptionCancelledEvent;
    "squad.created": SquadCreatedEvent;
    "squad.dissolved": SquadDissolvedEvent;
    "squad.member_added": SquadMemberAddedEvent;
    "squad.member_removed": SquadMemberRemovedEvent;
    "squad.invite_created": SquadInviteCreatedEvent;
    "squad.invite_accepted": SquadInviteAcceptedEvent;
    "squad.invite_declined": SquadInviteDeclinedEvent;
    "squad.invite_cancelled": SquadInviteCancelledEvent;
    "coupon.redeemed": CouponRedeemedEvent;
    "trial.started": TrialStartedEvent;
    "trial.expired": TrialExpiredEvent;
}
