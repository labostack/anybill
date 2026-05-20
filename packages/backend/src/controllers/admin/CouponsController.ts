/**
 * @module controllers/admin/CouponsController
 *
 * Coupon / promo code management (admin dashboard).
 *
 * CRUD for discount coupons. Codes are stored uppercase.
 * The `code`, `type`, `value`, and `currency` fields are immutable
 * after creation — only limits, restrictions, and status can be updated.
 */

import { Controller, Get, Post, Put, Delete, BodyParams, PathParams, UseBefore } from "@tsed/common";
import { NotFound, Conflict, BadRequest } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Coupon } from "../../entities/Coupon";
import { CreateCouponBody, UpdateCouponBody } from "../../models/CouponModels";

@Controller("/coupons")
@UseBefore(AdminGuard)
@Tags("Admin")
export class CouponsController {
    private repo() { return AppDataSource.getRepository(Coupon); }

    /** List all coupons, newest first. */
    @Get("/")
    @Summary("List coupons")
    @Description("Returns all coupons ordered by creation date (newest first).")
    @Returns(200)
    async list() {
        return this.repo().find({ order: { createdAt: "DESC" } });
    }

    /** Get a single coupon by ID. */
    @Get("/:id")
    @Summary("Get coupon")
    @Returns(200)
    @Returns(404)
    async get(@PathParams("id") id: string) {
        const coupon = await this.repo().findOneBy({ id });
        if (!coupon) throw new NotFound("Coupon not found");
        return coupon;
    }

    /** Create a new coupon. */
    @Post("/")
    @Summary("Create coupon")
    @Description("Creates a new coupon / promo code. Code is normalised to uppercase.")
    @Returns(201)
    @Returns(400)
    @Returns(409)
    async create(@BodyParams() body: CreateCouponBody) {
        // Validate: fixed type requires currency
        if (body.type === "fixed" && !body.currency) {
            throw new BadRequest("Currency is required for fixed-amount coupons");
        }

        // Normalize code to uppercase
        const code = body.code.toUpperCase();

        // Check uniqueness
        const existing = await this.repo().findOneBy({ code });
        if (existing) throw new Conflict("A coupon with this code already exists");

        const coupon = this.repo().create({
            code,
            type: body.type as "percent" | "fixed",
            value: body.value,
            currency: body.type === "fixed" ? body.currency!.toUpperCase() : null,
            maxRedemptions: body.maxRedemptions ?? null,
            maxRedemptionsPerUser: body.maxRedemptionsPerUser ?? 1,
            minAmount: body.minAmount ?? 0,
            subscriptionIds: body.subscriptionIds ?? null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            isActive: true,
        });
        await this.repo().save(coupon);
        return coupon;
    }

    /** Update coupon settings. Code, type, value, and currency are immutable. */
    @Put("/:id")
    @Summary("Update coupon")
    @Description("Updates coupon settings. The code, type, value, and currency cannot be changed after creation.")
    @Returns(200)
    @Returns(404)
    async update(@PathParams("id") id: string, @BodyParams() body: UpdateCouponBody) {
        const coupon = await this.repo().findOneBy({ id });
        if (!coupon) throw new NotFound("Coupon not found");

        if (body.isActive !== undefined) coupon.isActive = body.isActive;
        if (body.maxRedemptions !== undefined) coupon.maxRedemptions = body.maxRedemptions;
        if (body.maxRedemptionsPerUser !== undefined) coupon.maxRedemptionsPerUser = body.maxRedemptionsPerUser;
        if (body.minAmount !== undefined) coupon.minAmount = body.minAmount;
        if (body.subscriptionIds !== undefined) coupon.subscriptionIds = body.subscriptionIds;
        if (body.expiresAt !== undefined) coupon.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

        await this.repo().save(coupon);
        return coupon;
    }

    /** Delete a coupon. Only allowed if it has never been redeemed. */
    @Delete("/:id")
    @Summary("Delete coupon")
    @Description("Deletes a coupon. Only coupons with zero redemptions can be deleted.")
    @Returns(200)
    @Returns(404)
    @Returns(409)
    async delete(@PathParams("id") id: string) {
        const coupon = await this.repo().findOneBy({ id });
        if (!coupon) throw new NotFound("Coupon not found");
        if (coupon.timesRedeemed > 0) {
            throw new Conflict("Cannot delete a coupon that has been used");
        }
        await this.repo().remove(coupon);
        return { deleted: true };
    }
}
