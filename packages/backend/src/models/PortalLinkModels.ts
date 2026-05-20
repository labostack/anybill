/**
 * @module models/PortalLinkModels
 *
 * Request body models for portal link generation endpoints.
 */

import { Required, MinLength, MaxLength, Optional, Min, Max } from "@tsed/schema";

/** Body for `POST /api/sdk/portal-links`. */
export class CreatePortalLinkBody {
    /** External user identifier from the client application. */
    @Required()
    @MinLength(1)
    @MaxLength(512)
    uid!: string;

    /** Token lifetime in seconds (60–86400). Defaults to 1800 (30 min). */
    @Optional()
    @Min(60)
    @Max(86400)
    ttl?: number;
}
