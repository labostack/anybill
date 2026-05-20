/**
 * @module core/SdkGuard
 *
 * Ts.ED middleware that protects SDK/API routes with API key authentication.
 *
 * Validates the `X-Api-Key` header against the {@link ApiKey} table.
 * On success, updates the key's `lastUsedAt` timestamp (fire-and-forget)
 * and attaches the account ID to the request.
 */

import { Middleware, Req } from "@tsed/common";
import { Unauthorized } from "@tsed/exceptions";
import { AppDataSource } from "./datasource";
import { Account } from "../entities/Account";
import { ApiKey } from "../entities/ApiKey";
import { hashApiKey } from "./auth";
import type { AuthenticatedRequest } from "./types";

@Middleware()
export class SdkGuard {
    /**
     * Validate the API key from the `X-Api-Key` header.
     *
     * @param req - Express request object.
     * @throws {Unauthorized} If the header is missing or the key is invalid.
     */
    async use(@Req() req: Req): Promise<void> {
        const apiKeyHeader = req.headers["x-api-key"] as string;
        if (!apiKeyHeader) {
            throw new Unauthorized("Missing X-Api-Key header");
        }

        const keyRepo = AppDataSource.getRepository(ApiKey);
        const apiKeyEntity = await keyRepo.findOneBy({ key: hashApiKey(apiKeyHeader) });

        if (!apiKeyEntity) {
            throw new Unauthorized("Invalid API key");
        }

        // Track usage (non-blocking).
        apiKeyEntity.lastUsedAt = new Date();
        keyRepo.save(apiKeyEntity).catch(() => {});

        // Resolve the singleton account.
        const account = await AppDataSource.getRepository(Account).findOne({ where: {} });
        if (account) {
            (req as AuthenticatedRequest).accountId = account.id;
        }
    }
}
