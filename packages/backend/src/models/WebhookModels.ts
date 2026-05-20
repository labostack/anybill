/**
 * @module models/WebhookModels
 *
 * Request body models for outgoing webhook management endpoints.
 */

import { Required, Optional, Format, Default, CollectionOf, Property } from "@tsed/schema";

/** Body for `POST /api/admin/webhooks` — create a webhook endpoint. */
export class CreateWebhookBody {
    @Required()
    @Format("uri")
    url!: string;

    @Optional()
    @Property(String)
    description?: string | null;

    @Default([])
    @CollectionOf(String)
    events!: string[];
}

/** Body for `PUT /api/admin/webhooks/:id` — update a webhook endpoint. */
export class UpdateWebhookBody {
    @Optional()
    @Format("uri")
    url?: string;

    @Optional()
    @Property(String)
    description?: string | null;

    @Optional()
    @CollectionOf(String)
    events?: string[];

    @Optional()
    isActive?: boolean;
}
