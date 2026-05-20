/**
 * @module models/ApiKeyModels
 *
 * Request body models for API key management endpoints.
 */

import { Required, MinLength, MaxLength } from "@tsed/schema";

/** Body for `POST /api/admin/api-keys` — create an API key. */
export class CreateApiKeyBody {
    @Required()
    @MinLength(1)
    @MaxLength(100)
    name!: string;
}

/** Body for `POST /api/admin/api-keys/:id/rename` — rename an API key. */
export class RenameApiKeyBody {
    @Required()
    @MinLength(1)
    @MaxLength(100)
    name!: string;
}
