/**
 * @module models/SettingsModels
 *
 * Request body models for account settings endpoints.
 */

import { Optional, Format, Property } from "@tsed/schema";

/** Body for `PUT /api/admin/settings/checkout` — update checkout appearance. */
export class UpdateCheckoutSettingsBody {
    @Optional()
    @Property(Object)
    checkoutConfig?: Record<string, unknown>;

    @Optional()
    @Format("uri")
    @Property(String)
    successRedirectUrl?: string | null;
}
