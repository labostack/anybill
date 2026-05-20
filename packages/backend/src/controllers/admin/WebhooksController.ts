/**
 * @module controllers/admin/WebhooksController
 *
 * Outgoing webhook endpoint management (admin dashboard).
 *
 * CRUD for webhook endpoints, secret rotation, test events,
 * and delivery log viewing.
 */

import { Controller, Get, Post, Put, Delete, BodyParams, PathParams, QueryParams, UseBefore } from "@tsed/common";
import { NotFound } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { WebhookEndpoint } from "../../entities/WebhookEndpoint";
import { WebhookDelivery } from "../../entities/WebhookDelivery";
import { AppError } from "../../core/errors/AppError";
import { ErrorCode } from "../../core/errors/ErrorCode";
import { OutgoingWebhookService } from "../../services/OutgoingWebhookService";
import { randomBytes } from "crypto";
import { CreateWebhookBody, UpdateWebhookBody } from "../../models/WebhookModels";
import { DeliveryListQuery } from "../../models/QueryModels";

function generateSecret(): string {
    return `whsec_${randomBytes(24).toString("hex")}`;
}

@Controller("/webhooks")
@UseBefore(AdminGuard)
@Tags("Webhooks")

export class WebhooksController {
    constructor(private readonly webhookService: OutgoingWebhookService) {}

    private epRepo() { return AppDataSource.getRepository(WebhookEndpoint); }
    private dlvRepo() { return AppDataSource.getRepository(WebhookDelivery); }

    @Get("/")
    @Summary("List webhook endpoints")
    @Description("Returns all webhook endpoints with delivery stats.")
    @Returns(200)
    async list() {
        const endpoints = await this.epRepo().find({ order: { createdAt: "DESC" } });
        return Promise.all(endpoints.map(async (ep) => {
            const totalDeliveries = await this.dlvRepo().countBy({ endpointId: ep.id });
            const failedDeliveries = await this.dlvRepo().countBy({ endpointId: ep.id, status: "failed" });
            return { ...ep, secret: this.maskSecret(ep.secret), totalDeliveries, failedDeliveries };
        }));
    }

    @Post("/")
    @Summary("Create webhook endpoint")
    @Description("Creates a new webhook endpoint. Signing secret is shown only once.")
    @Returns(201)
    async create(@BodyParams() data: CreateWebhookBody) {
        const secret = generateSecret();
        const ep = this.epRepo().create({
            url: data.url, secret, description: data.description || null,
            events: data.events, isActive: true,
        });
        await this.epRepo().save(ep);
        return { ...ep, secret };
    }

    @Put("/:id")
    @Summary("Update webhook endpoint")
    @Returns(200)
    @Returns(404)
    async update(@PathParams("id") id: string, @BodyParams() data: UpdateWebhookBody) {
        const ep = await this.epRepo().findOneBy({ id });
        if (!ep) throw new AppError(404, ErrorCode.WEBHOOK_ENDPOINT_NOT_FOUND, "Endpoint not found");
        if (data.url !== undefined) ep.url = data.url;
        if (data.description !== undefined) ep.description = data.description;
        if (data.events !== undefined) ep.events = data.events;
        if (data.isActive !== undefined) ep.isActive = data.isActive;
        await this.epRepo().save(ep);
        return { ...ep, secret: this.maskSecret(ep.secret) };
    }

    @Delete("/:id")
    @Summary("Delete webhook endpoint")
    @Returns(200)
    @Returns(404)
    async delete(@PathParams("id") id: string) {
        const ep = await this.epRepo().findOneBy({ id });
        if (!ep) throw new AppError(404, ErrorCode.WEBHOOK_ENDPOINT_NOT_FOUND, "Endpoint not found");
        await this.dlvRepo().createQueryBuilder().delete().where("endpointId = :id", { id }).execute();
        await this.epRepo().remove(ep);
        return { deleted: true };
    }

    @Post("/:id/rotate-secret")
    @Summary("Rotate signing secret")
    @Description("Generates a new signing secret. The old one is invalidated immediately.")
    @Returns(200)
    @Returns(404)
    async rotateSecret(@PathParams("id") id: string) {
        const ep = await this.epRepo().findOneBy({ id });
        if (!ep) throw new AppError(404, ErrorCode.WEBHOOK_ENDPOINT_NOT_FOUND, "Endpoint not found");
        const secret = generateSecret();
        ep.secret = secret;
        await this.epRepo().save(ep);
        return { secret };
    }

    @Post("/:id/test")
    @Summary("Send test event")
    @Returns(200)
    @Returns(404)
    async test(@PathParams("id") id: string) {
        const ep = await this.epRepo().findOneBy({ id });
        if (!ep) throw new AppError(404, ErrorCode.WEBHOOK_ENDPOINT_NOT_FOUND, "Endpoint not found");
        await this.webhookService.dispatch("payment.confirmed", {
            test: true, message: "This is a test event from AnyBill", endpointId: id,
        });
        return { sent: true };
    }

    @Get("/deliveries")
    @Summary("List delivery logs")
    @Description("Returns paginated webhook delivery logs, optionally filtered by endpoint.")
    @Returns(200)
    async deliveries(@QueryParams() query: DeliveryListQuery) {
        const { endpoint_id: endpointId, page, limit } = query;
        const where: any = {};
        if (endpointId) where.endpointId = endpointId;
        const [deliveries, total] = await this.dlvRepo().findAndCount({
            where, order: { createdAt: "DESC" },
            skip: (page - 1) * limit, take: limit,
        });
        return { deliveries, total, page, limit };
    }

    private maskSecret(secret: string): string {
        if (secret.length <= 12) return "••••••••";
        return `${secret.slice(0, 9)}...${secret.slice(-4)}`;
    }
}
