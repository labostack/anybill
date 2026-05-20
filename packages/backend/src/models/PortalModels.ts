/**
 * @module models/PortalModels
 *
 * Request body models for client area portal endpoints.
 */

import { Required, MinLength, Format } from "@tsed/schema";

/** Body for `POST /api/portal/cancel` — cancel a subscription. */
export class PortalCancelBody {
    /** Encrypted portal token. */
    @Required()
    @MinLength(1)
    token!: string;

    /** Subscriber ID to cancel. */
    @Required()
    @Format("uuid")
    subscriberId!: string;
}

/** Body for `POST /api/portal/change` — change subscription plan. */
export class PortalChangeBody {
    /** Encrypted portal token. */
    @Required()
    @MinLength(1)
    token!: string;

    /** Current subscriber ID to cancel. */
    @Required()
    @Format("uuid")
    subscriberId!: string;

    /** New subscription plan ID to switch to. */
    @Required()
    @Format("uuid")
    newSubscriptionId!: string;
}

/** Body for `POST /api/portal/renew` — renew an expired/cancelled subscription. */
export class PortalRenewBody {
    /** Encrypted portal token. */
    @Required()
    @MinLength(1)
    token!: string;

    /** Subscriber ID to renew. */
    @Required()
    @Format("uuid")
    subscriberId!: string;
}
