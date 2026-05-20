/**
 * @module controllers/admin/InvoicesController
 *
 * Invoice listing endpoint (admin dashboard).
 *
 * Provides paginated, filterable access to all payment invoices.
 */

import { Controller, Get, QueryParams, UseBefore } from "@tsed/common";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Invoice } from "../../entities/Invoice";
import { Between, type FindOptionsWhere } from "typeorm";
import { InvoiceListQuery } from "../../models/QueryModels";

@Controller("/invoices")
@UseBefore(AdminGuard)
@Tags("Invoices")

export class InvoicesController {
    private repo() {
        return AppDataSource.getRepository(Invoice);
    }

    /** List invoices with optional status and date range filters. */
    @Get("/")
    @Summary("List invoices")
    @Description("Returns a paginated list of invoices with optional status and date range filters.")
    @Returns(200)
    async list(@QueryParams() query: InvoiceListQuery) {
        const { status, from, to, page, limit } = query;
        const where: FindOptionsWhere<Invoice> = {};
        if (status) where.status = status as any;
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
}
