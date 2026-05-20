/**
 * @module models/SquadModels
 *
 * Request body models for squad endpoints.
 */

import { Required, Optional, Property } from "@tsed/schema";

/** Body for `POST /api/sdk/squads` — create a squad. */
export class CreateSquadBody {
    @Required()
    subscriberId!: string;
}

/** Body for `POST /api/sdk/squads/:id/members` — add a member. */
export class AddSquadMemberBody {
    @Required()
    uid!: string;
}
