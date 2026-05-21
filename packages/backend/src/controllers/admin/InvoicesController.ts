/**
 * @module controllers/admin/InvoicesController
 *
 * Invoice listing endpoint (admin dashboard).
 *
 * Provides paginated, filterable access to all payment invoices.
 * Supports filtering by status, date range, subscriber UID, and provider.
 */

import { Controller, Get, QueryParams, PathParams, UseBefore } from "@tsed/common";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Invoice } from "../../entities/Invoice";
import { Between, Like, type FindOptionsWhere } from "typeorm";
import { InvoiceListQuery } from "../../models/QueryModels";
import { AppError } from "../../core/errors/AppError";
import { ErrorCode } from "../../core/errors/ErrorCode";

@Controller("/invoices")
@UseBefore(AdminGuard)
@Tags("Invoices")

export class InvoicesController {
    private repo() {
        return AppDataSource.getRepository(Invoice);
    }

    /** List invoices with optional status, date range, subscriber UID, and provider filters. */
    @Get("/")
    @Summary("List invoices")
    @Description("Returns a paginated list of invoices with optional filters: status, date range, subscriber UID, and provider.")
    @Returns(200)
    async list(@QueryParams() query: InvoiceListQuery) {
        const { status, from, to, subscriberUid, provider, page, limit } = query;

        // When filtering by subscriberUid we need a join-based query
        if (subscriberUid) {
            const qb = this.repo()
                .createQueryBuilder("inv")
                .leftJoinAndSelect("inv.subscriber", "subscriber")
                .leftJoinAndSelect("inv.subscription", "subscription")
                .where("subscriber.uid LIKE :uid", { uid: `%${subscriberUid}%` })
                .orderBy("inv.createdAt", "DESC")
                .skip((page - 1) * limit)
                .take(limit);

            if (status) qb.andWhere("inv.status = :status", { status });
            if (provider) qb.andWhere("inv.provider = :provider", { provider });
            if (from && to) qb.andWhere("inv.createdAt BETWEEN :from AND :to", { from, to });

            const [items, total] = await qb.getManyAndCount();
            return { items, total, page, limit };
        }

        const where: FindOptionsWhere<Invoice> = {};
        if (status) where.status = status as any;
        if (provider) where.provider = provider;
        if (from && to) where.createdAt = Between(new Date(from), new Date(to));

        const [items, total] = await this.repo().findAndCount({
            where,
            relations: ["subscriber", "subscription"],
            order: { createdAt: "DESC" },
            skip: (page - 1) * limit,
            take: limit,
        });

        return { items, total, page, limit };
    }

    /** Get invoice details by ID */
    @Get("/:id")
    @Summary("Get invoice details")
    @Description("Returns detailed information about a specific invoice by its ID.")
    @Returns(200, Invoice)
    async get(@PathParams("id") id: string) {
        const invoice = await this.repo().findOne({
            where: { id },
            relations: ["subscriber", "subscription"],
        });

        if (!invoice) {
            throw new AppError(404, ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
        }

        return invoice;
    }
}
