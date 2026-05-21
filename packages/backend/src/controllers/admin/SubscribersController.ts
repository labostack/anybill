/**
 * @module controllers/admin/SubscribersController
 *
 * Subscriber management endpoints (admin dashboard).
 *
 * Provides listing, detail view, status update, cancellation, refund,
 * and manual plan grant/revoke for admin overrides.
 */

import { Controller, Get, Put, Post, PathParams, QueryParams, BodyParams, UseBefore } from "@tsed/common";
import { NotFound, BadRequest } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Subscriber } from "../../entities/Subscriber";
import { Subscription } from "../../entities/Subscription";
import { Squad } from "../../entities/Squad";
import { Invoice } from "../../entities/Invoice";
import { BillingService } from "../../services/BillingService";
import { AppError } from "../../core/errors/AppError";
import { ErrorCode } from "../../core/errors/ErrorCode";
import { UpdateSubscriberBody, GrantPlanBody } from "../../models/SubscriberModels";
import { SubscriberListQuery } from "../../models/QueryModels";
import { OutgoingWebhookService } from "../../services/OutgoingWebhookService";
import { Like } from "typeorm";

@Controller("/subscribers")
@UseBefore(AdminGuard)
@Tags("Subscribers")

export class SubscribersController {
    constructor(
        private readonly billing: BillingService,
        private readonly outgoingWebhooks: OutgoingWebhookService,
    ) {}

    private repo() {
        return AppDataSource.getRepository(Subscriber);
    }

    /** List subscribers with optional status/uid/plan/date filter and pagination. */
    @Get("/")
    @Summary("List subscribers")
    @Description("Returns a paginated list of subscribers with optional status, UID, plan, and date filters.")
    @Returns(200)
    async list(@QueryParams() query: SubscriberListQuery) {
        const { status, uid, subscriptionId, createdFrom, createdTo, page, limit } = query;

        const qb = this.repo()
            .createQueryBuilder("sub")
            .leftJoinAndSelect("sub.subscription", "subscription")
            .orderBy("sub.createdAt", "DESC")
            .skip((page - 1) * limit)
            .take(limit);

        if (uid) qb.andWhere("sub.uid LIKE :uid", { uid: `%${uid}%` });
        if (status) qb.andWhere("sub.status = :status", { status });
        if (subscriptionId) qb.andWhere("sub.subscriptionId = :subscriptionId", { subscriptionId });
        if (createdFrom) qb.andWhere("sub.createdAt >= :createdFrom", { createdFrom: new Date(createdFrom) });
        if (createdTo) {
            // include the whole end day
            const end = new Date(createdTo);
            end.setHours(23, 59, 59, 999);
            qb.andWhere("sub.createdAt <= :createdTo", { createdTo: end });
        }

        const [items, total] = await qb.getManyAndCount();
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

        // Sort invoices newest first
        if (sub.invoices) {
            sub.invoices.sort((a: Invoice, b: Invoice) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
        }

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

    /** Update subscriber fields (status, metadata, plan, period). */
    @Put("/:id")
    @Summary("Update subscriber")
    @Description("Updates subscriber status, metadata, plan assignment, and/or billing period dates.")
    @Returns(200)
    @Returns(404)
    async update(@PathParams("id") id: string, @BodyParams() data: UpdateSubscriberBody) {
        const sub = await this.repo().findOneBy({ id });
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIBER_NOT_FOUND, "Subscriber not found");

        // Apply whitelisted fields.
        if (data.status !== undefined) sub.status = data.status;
        if (data.metadata !== undefined) sub.metadata = data.metadata;
        if (data.currentPeriodStart !== undefined) sub.currentPeriodStart = new Date(data.currentPeriodStart);
        if (data.currentPeriodEnd !== undefined) sub.currentPeriodEnd = new Date(data.currentPeriodEnd);

        // Plan reassignment — validate the new plan exists.
        let planChanged = false;
        let newPlan: Subscription | null = null;
        if (data.subscriptionId !== undefined) {
            newPlan = await AppDataSource.getRepository(Subscription).findOneBy({ id: data.subscriptionId });
            if (!newPlan) throw new AppError(404, ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription plan not found");
            sub.subscriptionId = data.subscriptionId;
            planChanged = true;
        }

        const saved = await this.repo().save(sub);

        // Sync squad.maxMembers when the plan changes via direct update.
        if (planChanged && newPlan) {
            const squadRepo = AppDataSource.getRepository(Squad);
            const existingSquad = await squadRepo.findOneBy({ ownerId: saved.id });
            if (existingSquad && newPlan.squadEnabled) {
                existingSquad.maxMembers = newPlan.squadMaxMembers || 0;
                await squadRepo.save(existingSquad);
            }
        }

        return saved;
    }

    /**
     * Grant a subscriber access to a plan without payment.
     *
     * Creates the subscriber record (or updates existing) and sets status to `active`.
     * Used for manual admin overrides: comp plans, corrections, etc.
     */
    @Post("/:id/grant")
    @Summary("Grant plan access")
    @Description("Grants a subscriber access to a plan without going through the payment flow. Admin override only.")
    @Returns(200)
    @Returns(404)
    async grant(@PathParams("id") id: string, @BodyParams() data: GrantPlanBody) {
        const sub = await this.repo().findOneBy({ id });
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIBER_NOT_FOUND, "Subscriber not found");

        // If a new subscriptionId is provided, validate it.
        if (data.subscriptionId) {
            const plan = await AppDataSource.getRepository(Subscription).findOneBy({ id: data.subscriptionId });
            if (!plan) throw new AppError(404, ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription plan not found");
            sub.subscriptionId = data.subscriptionId;
        }

        sub.status = "active";
        sub.currentPeriodStart = new Date();

        // Resolve period end: explicit date > days > no end.
        if (data.periodEnd) {
            sub.currentPeriodEnd = new Date(data.periodEnd);
        } else if (data.periodDays && data.periodDays > 0) {
            const end = new Date();
            end.setDate(end.getDate() + data.periodDays);
            sub.currentPeriodEnd = end;
        }
        // else: keep existing or null — one-time / manual management

        const saved = await this.repo().save(sub);

        // Auto-create squad if the plan requires it and subscriber doesn't have one yet.
        // If a squad already exists, sync maxMembers to the (possibly new) plan's limit.
        const planId = data.subscriptionId || sub.subscriptionId;
        if (planId) {
            const plan = await AppDataSource.getRepository(Subscription).findOneBy({ id: planId });
            if (plan?.squadEnabled) {
                const squadRepo = AppDataSource.getRepository(Squad);
                const existingSquad = await squadRepo.findOneBy({ ownerId: saved.id });
                if (!existingSquad) {
                    const squad = squadRepo.create({
                        ownerId: saved.id,
                        maxMembers: plan.squadMaxMembers || 0,
                    });
                    await squadRepo.save(squad);
                    await this.outgoingWebhooks.dispatch("squad.created", {
                        squadId: squad.id,
                        ownerUid: saved.uid,
                        subscriberId: saved.id,
                        subscriptionId: plan.id,
                    });
                } else {
                    // Sync maxMembers to the new plan's limit (plan upgrade/downgrade via admin override).
                    existingSquad.maxMembers = plan.squadMaxMembers || 0;
                    await squadRepo.save(existingSquad);
                }
            }
        }

        return saved;
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
