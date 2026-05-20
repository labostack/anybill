/**
 * @module models/AuthModels
 *
 * Request body models for authentication endpoints.
 *
 * Used by {@link AuthController} for automatic validation via `@tsed/ajv`.
 */

import { Required, Email, MinLength } from "@tsed/schema";

/** Body for `POST /api/admin/auth/setup` — initial account registration. */
export class AuthSetupBody {
    @Required()
    @Email()
    email!: string;

    @Required()
    @MinLength(8)
    password!: string;
}

/** Body for `POST /api/admin/auth/login` — JWT authentication. */
export class AuthLoginBody {
    @Required()
    @Email()
    email!: string;

    @Required()
    @MinLength(1)
    password!: string;
}

/** Body for `PUT /api/admin/settings/password` — password change. */
export class ChangePasswordBody {
    @Required()
    @MinLength(1)
    currentPassword!: string;

    @Required()
    @MinLength(8)
    newPassword!: string;

    @Required()
    @MinLength(1)
    confirmPassword!: string;
}
