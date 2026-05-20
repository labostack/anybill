/**
 * @module controllers/admin/ApiKeysController
 *
 * API key management endpoints (admin dashboard).
 *
 * Supports creating, listing, renaming, and revoking API keys.
 * The full key value is only returned once upon creation.
 * Keys are stored as SHA-256 hashes — never in plain text.
 */

import { Controller, Get, Post, Delete, BodyParams, PathParams, UseBefore } from "@tsed/common";
import { NotFound } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { ApiKey } from "../../entities/ApiKey";
import { generateApiKey, hashApiKey } from "../../core/auth";
import { validate, CreateApiKeySchema, RenameApiKeySchema } from "../../core/validation";

@Controller("/api-keys")
@UseBefore(AdminGuard)
@Tags("API Keys")

export class ApiKeysController {
    private repo() {
        return AppDataSource.getRepository(ApiKey);
    }

    @Get("/")
    @Summary("List API keys")
    @Description("Returns all API keys with masked values.")
    @Returns(200)
    async list() {
        const keys = await this.repo().find({ order: { createdAt: "DESC" } });
        return keys.map((k) => ({
            id: k.id, name: k.name, prefix: k.prefix,
            lastUsedAt: k.lastUsedAt, createdAt: k.createdAt,
        }));
    }

    @Post("/")
    @Summary("Create an API key")
    @Description("Generates a new API key. Full value shown only once.")
    @Returns(201)
    async create(@BodyParams() body: unknown) {
        const { name } = validate(CreateApiKeySchema, body);
        const key = generateApiKey();
        const prefix = key.slice(0, 11) + "...";
        const entity = this.repo().create({ name, key: hashApiKey(key), prefix });
        await this.repo().save(entity);
        return { id: entity.id, name: entity.name, key, prefix, createdAt: entity.createdAt };
    }

    @Post("/:id/rename")
    @Summary("Rename an API key")
    @Returns(200)
    @Returns(404)
    async rename(@PathParams("id") id: string, @BodyParams() body: unknown) {
        const { name } = validate(RenameApiKeySchema, body);
        const key = await this.repo().findOneBy({ id });
        if (!key) throw new NotFound("API key not found");
        key.name = name;
        await this.repo().save(key);
        return { success: true };
    }

    @Delete("/:id")
    @Summary("Revoke an API key")
    @Returns(200)
    @Returns(404)
    async revoke(@PathParams("id") id: string) {
        const key = await this.repo().findOneBy({ id });
        if (!key) throw new NotFound("API key not found");
        await this.repo().remove(key);
        return { success: true };
    }
}
