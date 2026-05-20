/**
 * @module controllers/admin/SubscribersController
 *
 * Subscriber management endpoints (admin dashboard).
 *
 * Provides listing, detail view, status update, cancellation, and refund.
 */

import { Controller, Get, Put, Post, PathParams, QueryParams, BodyParams, UseBefore } from "@tsed/common";
import { NotFound, BadRequest } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Subscriber } from "../../entities/Subscriber";
import { Squad } from "../../entities/Squad";
import { BillingService } from "../../services/BillingService";
import { AppError } from "../../core/errors/AppError";
import { ErrorCode } from "../../core/errors/ErrorCode";
import { UpdateSubscriberBody } from "../../models/SubscriberModels";
import { SubscriberListQuery } from "../../models/QueryModels";

@Controller("/subscribers")
@UseBefore(AdminGuard)
@Tags("Subscribers")

export class SubscribersController {
    constructor(private readonly billing: BillingService) {}

    private repo() {
        return AppDataSource.getRepository(Subscriber);
    }

    /** List subscribers with optional status filter and pagination. */
    @Get("/")
    @Summary("List subscribers")
    @Description("Returns a paginated list of subscribers with optional status filter.")
    @Returns(200)
    async list(@QueryParams() query: SubscriberListQuery) {
        const { status, page, limit } = query;
        const where: any = {};
        if (status) where.status = status;

        const [items, total] = await this.repo().findAndCount({
            where,
            relations: ["subscription"],
            order: { createdAt: "DESC" },
            skip: (page - 1) * limit,
            take: limit,
        });

        return { items, total, page, limit };
    }

    /** Get subscriber details with related subscription, invoices, and squad. */
    @Get("/:id")
    @Summary("Get subscriber details")
    @Description("Returns a subscriber with their subscription plan, invoice history, and squad (if any).")
    @Returns(200)
    @Returns(404)
    async get(@PathParams("id") id: string) {
        const sub = await this.repo().findOne({ where: { id }, relations: ["subscription", "invoices"] });
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIBER_NOT_FOUND, "Subscriber not found");

        // Load squad owned by this subscriber (if any)
        const squad = await AppDataSource.getRepository(Squad).findOne({
            where: { ownerId: id },
            relations: ["members"],
        });

        return {
            ...sub,
            squad: squad ? {
                ...squad,
                members: squad.members.filter((m: any) => m.status === "active"),
            } : null,
        };
    }

    /** Update subscriber fields (status, metadata). */
    @Put("/:id")
    @Summary("Update subscriber")
    @Description("Updates subscriber status and/or metadata.")
    @Returns(200)
    @Returns(404)
    async update(@PathParams("id") id: string, @BodyParams() data: UpdateSubscriberBody) {
        const sub = await this.repo().findOneBy({ id });
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIBER_NOT_FOUND, "Subscriber not found");

        // Apply only validated & whitelisted fields.
        if (data.status !== undefined) sub.status = data.status;
        if (data.metadata !== undefined) sub.metadata = data.metadata;

        return this.repo().save(sub);
    }

    /** Cancel a recurring subscription. One-time plans cannot be cancelled. */
    @Post("/:id/cancel")
    @Summary("Cancel subscription")
    @Description("Cancels a recurring subscription. One-time plans cannot be cancelled.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async cancel(@PathParams("id") id: string) {
        const sub = await this.repo().findOne({ where: { id }, relations: ["subscription"] });
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIBER_NOT_FOUND, "Subscriber not found");
        if (sub.subscription?.interval === "one_time") {
            throw new AppError(400, ErrorCode.SUBSCRIPTION_NOT_CANCELLABLE, "One-time subscriptions cannot be cancelled");
        }
        sub.status = "cancelled";
        return this.repo().save(sub);
    }

    /** Refund an active subscriber's latest paid invoice. */
    @Post("/:id/refund")
    @Summary("Refund subscriber")
    @Description("Refunds the latest paid invoice for an active subscriber via the payment provider.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async refund(@PathParams("id") id: string) {
        const sub = await this.repo().findOneBy({ id });
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIBER_NOT_FOUND, "Subscriber not found");
        if (sub.status !== "active") {
            throw new AppError(400, ErrorCode.BAD_REQUEST, "Only active subscribers can be refunded");
        }
        return this.billing.refundSubscriber(id);
    }
}
