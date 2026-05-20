/**
 * @module models/TrialModels
 *
 * Request body model for the trial activation endpoint.
 */

import { Required, Optional, MinLength } from "@tsed/schema";

/** Body for `POST /api/sdk/start-trial` — activate a free trial. */
export class StartTrialBody {
    /** External user identifier from the client's application. */
    @Required()
    @MinLength(1)
    uid!: string;

    /**
     * Optional subscription plan ID.
     *
     * When omitted, the backend auto-resolves the single active plan
     * with `trialDays > 0`. If multiple trial plans exist, this field
     * becomes required.
     */
    @Optional()
    subscriptionId?: string;
}
