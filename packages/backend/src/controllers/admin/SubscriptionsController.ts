/**
 * @module controllers/admin/SubscriptionsController
 *
 * CRUD endpoints for subscription plans (admin dashboard).
 *
 * Plans define pricing tiers that users can purchase. Plans with the
 * same name are grouped together in the UI as billing period variants.
 */

import { Controller, Get, Post, Put, Delete, BodyParams, PathParams, UseBefore } from "@tsed/common";
import { BadRequest, NotFound } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Subscription } from "../../entities/Subscription";
import { Subscriber } from "../../entities/Subscriber";
import { Invoice } from "../../entities/Invoice";
import { validate, CreateSubscriptionSchema, UpdateSubscriptionSchema } from "../../core/validation";

@Controller("/subscriptions")
@UseBefore(AdminGuard)
@Tags("Subscriptions")

export class SubscriptionsController {
    private repo() {
        return AppDataSource.getRepository(Subscription);
    }

    @Get("/")
    @Summary("List all plans")
    @Description("Returns all subscription plans with active subscriber counts.")
    @Returns(200)
    async list() {
        const subs = await this.repo().find({ order: { createdAt: "DESC" } });

        const counts = await AppDataSource.getRepository(Subscriber)
            .createQueryBuilder("s")
            .select("s.subscriptionId", "subscriptionId")
            .addSelect("COUNT(*)", "count")
            .where("s.status = :status", { status: "active" })
            .groupBy("s.subscriptionId")
            .getRawMany();

        const countMap: Record<string, number> = {};
        for (const row of counts) {
            countMap[row.subscriptionId] = Number(row.count);
        }

        return subs.map((sub) => ({
            ...sub,
            activeSubscribers: countMap[sub.id] || 0,
        }));
    }

    @Get("/:id")
    @Summary("Get a plan")
    @Description("Returns a single subscription plan by UUID.")
    @Returns(200)
    @Returns(404)
    async get(@PathParams("id") id: string) {
        const sub = await this.repo().findOneBy({ id });
        if (!sub) throw new NotFound("Subscription not found");
        return sub;
    }

    @Post("/")
    @Summary("Create a plan")
    @Description("Creates a new subscription plan. One-time plans always use manual renewal.")
    @Returns(201)
    @Returns(400)
    async create(@BodyParams() body: unknown) {
        const data = validate(CreateSubscriptionSchema, body);

        if (data.interval === "one_time") {
            data.renewalMode = "manual";
        }

        const sub = this.repo().create(data);
        return this.repo().save(sub);
    }

    @Put("/:id")
    @Summary("Update a plan")
    @Description("Updates an existing subscription plan. Partial updates are supported.")
    @Returns(200)
    @Returns(404)
    @Returns(400)
    async update(@PathParams("id") id: string, @BodyParams() body: unknown) {
        const sub = await this.repo().findOneBy({ id });
        if (!sub) throw new NotFound("Subscription not found");

        const data = validate(UpdateSubscriptionSchema, body);

        const interval = data.interval ?? sub.interval;
        if (interval === "one_time") {
            data.renewalMode = "manual";
        }

        if (data.name !== undefined) sub.name = data.name;
        if (data.description !== undefined) sub.description = data.description;
        if (data.amount !== undefined) sub.amount = data.amount;
        if (data.currency !== undefined) sub.currency = data.currency;
        if (data.interval !== undefined) sub.interval = data.interval;
        if (data.intervalCount !== undefined) sub.intervalCount = data.intervalCount;
        if (data.renewalMode !== undefined) sub.renewalMode = data.renewalMode;
        if (data.isActive !== undefined) sub.isActive = data.isActive;
        if (data.metadata !== undefined) sub.metadata = data.metadata;

        return this.repo().save(sub);
    }

    /**
     * Delete a plan and all associated data.
     *
     * Blocked if active subscribers exist — they must be cancelled first.
     */
    @Delete("/:id")
    @Summary("Delete a plan")
    @Description("Deletes a plan and cascades to its invoices and subscribers. Blocked if active subscribers exist.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async delete(@PathParams("id") id: string) {
        const sub = await this.repo().findOneBy({ id });
        if (!sub) throw new NotFound("Subscription not found");

        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const invoiceRepo = AppDataSource.getRepository(Invoice);

        const activeCount = await subscriberRepo.count({
            where: { subscriptionId: id, status: "active" },
        });
        if (activeCount > 0) {
            throw new BadRequest(
                `Cannot delete: ${activeCount} active subscriber(s). Cancel their subscriptions first.`,
            );
        }

        await invoiceRepo.createQueryBuilder().delete().where("subscriptionId = :id", { id }).execute();
        await subscriberRepo.createQueryBuilder().delete().where("subscriptionId = :id", { id }).execute();
        await this.repo().remove(sub);

        return { deleted: true };
    }
}
