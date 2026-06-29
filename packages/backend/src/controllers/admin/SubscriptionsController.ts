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
import { AppError } from "../../core/errors/AppError";
import { ErrorCode } from "../../core/errors/ErrorCode";
import { Subscriber } from "../../entities/Subscriber";
import { Invoice } from "../../entities/Invoice";
import { CreateSubscriptionBody, UpdateSubscriptionBody, ReorderSubscriptionsBody } from "../../models/SubscriptionModels";

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
        const subs = await this.repo().find({ order: { sortOrder: "ASC", createdAt: "DESC" } });

        const counts = await AppDataSource.getRepository(Subscriber)
            .createQueryBuilder("s")
            .select("s.subscriptionId", "subscriptionId")
            .addSelect("COUNT(*)", "count")
            .where("s.status IN (:...statuses)", { statuses: ["active", "trialing"] })
            .andWhere("(s.currentPeriodEnd IS NULL OR s.currentPeriodEnd > :now)", { now: new Date() })
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
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
        return sub;
    }

    @Post("/")
    @Summary("Create a plan")
    @Description("Creates a new subscription plan. One-time plans always use manual renewal.")
    @Returns(201)
    @Returns(400)
    async create(@BodyParams() data: CreateSubscriptionBody) {

        if (data.interval === "one_time") {
            data.trialDays = 0;
        }

        const syncSquad = data.syncSquadToVariants;
        delete (data as any).syncSquadToVariants;

        const sub = this.repo().create(data);
        const saved = await this.repo().save(sub);

        if (syncSquad) {
            await this.syncSquadSettings(saved.name, saved.id, saved.squadEnabled, saved.squadMaxMembers);
        }

        return saved;
    }

    @Put("/reorder")
    @Summary("Reorder plans")
    @Description("Reorders subscription plans by ID.")
    @Returns(200)
    async reorder(@BodyParams() data: ReorderSubscriptionsBody) {
        const subs = await this.repo().find();
        
        for (const sub of subs) {
            const index = data.ids.indexOf(sub.id);
            if (index !== -1) {
                sub.sortOrder = index;
            } else {
                // Keep unrecognized ids at the end
                sub.sortOrder = 999;
            }
        }
        
        await this.repo().save(subs);
        return { success: true };
    }

    @Put("/:id")
    @Summary("Update a plan")
    @Description("Updates an existing subscription plan. Partial updates are supported.")
    @Returns(200)
    @Returns(404)
    @Returns(400)
    async update(@PathParams("id") id: string, @BodyParams() data: UpdateSubscriptionBody) {
        const sub = await this.repo().findOneBy({ id });
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");

        const interval = data.interval ?? sub.interval;
        if (interval === "one_time") {
            data.trialDays = 0;
        }

        const syncSquad = data.syncSquadToVariants;

        if (data.name !== undefined) sub.name = data.name;
        if (data.description !== undefined) sub.description = data.description;
        if (data.amount !== undefined) sub.amount = data.amount;
        if (data.currency !== undefined) sub.currency = data.currency;
        if (data.interval !== undefined) sub.interval = data.interval;
        if (data.intervalCount !== undefined) sub.intervalCount = data.intervalCount;
        if (data.isActive !== undefined) sub.isActive = data.isActive;
        if (data.metadata !== undefined) sub.metadata = data.metadata;
        if (data.squadEnabled !== undefined) sub.squadEnabled = data.squadEnabled;
        if (data.squadMaxMembers !== undefined) sub.squadMaxMembers = data.squadMaxMembers;
        if (data.trialDays !== undefined) sub.trialDays = data.trialDays;

        const saved = await this.repo().save(sub);

        if (syncSquad) {
            await this.syncSquadSettings(saved.name, saved.id, saved.squadEnabled, saved.squadMaxMembers);
        }

        return saved;
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
        if (!sub) throw new AppError(404, ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");

        const subscriberRepo = AppDataSource.getRepository(Subscriber);
        const invoiceRepo = AppDataSource.getRepository(Invoice);

        const now = new Date();
        const activeCount = await subscriberRepo
            .createQueryBuilder("s")
            .where("s.subscriptionId = :id", { id })
            .andWhere("s.status IN (:...statuses)", { statuses: ["active", "trialing"] })
            .andWhere("(s.currentPeriodEnd IS NULL OR s.currentPeriodEnd > :now)", { now })
            .getCount();
        if (activeCount > 0) {
            throw new AppError(400, ErrorCode.BAD_REQUEST,
                "Cannot delete subscription. There are active subscribers linked to it.",
            );
        }

        await invoiceRepo.createQueryBuilder().delete().where("subscriptionId = :id", { id }).execute();
        await subscriberRepo.createQueryBuilder().delete().where("subscriptionId = :id", { id }).execute();
        await this.repo().remove(sub);

        return { deleted: true };
    }

    /**
     * Sync squad settings to all other plans with the same name.
     */
    private async syncSquadSettings(name: string, excludeId: string, squadEnabled: boolean, squadMaxMembers: number) {
        await this.repo()
            .createQueryBuilder()
            .update()
            .set({ squadEnabled, squadMaxMembers })
            .where("name = :name AND id != :excludeId", { name, excludeId })
            .execute();
    }
}
