/**
 * @module controllers/admin/DashboardController
 *
 * Dashboard analytics endpoint (admin dashboard).
 *
 * Aggregates revenue by currency, daily payment activity, and
 * subscriber counts for a given date range.
 */

import { Controller, Get, QueryParams, UseBefore } from "@tsed/common";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Invoice } from "../../entities/Invoice";
import { Subscriber } from "../../entities/Subscriber";
import { DashboardQuery } from "../../models/QueryModels";

/** Default dashboard lookback period (30 days in milliseconds). */
const DEFAULT_LOOKBACK_MS = 30 * 86_400_000;

@Controller("/dashboard")
@UseBefore(AdminGuard)
@Tags("Dashboard")

export class DashboardController {
    @Get("/stats")
    @Summary("Get dashboard statistics")
    @Description("Aggregates revenue by currency, daily payment chart data, and subscriber counts for the given date range.")
    @Returns(200)
    async stats(@QueryParams() query: DashboardQuery) {
        const { from, to, status } = query;
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        const subscriberRepo = AppDataSource.getRepository(Subscriber);

        const dateFrom = from ? new Date(from) : new Date(Date.now() - DEFAULT_LOOKBACK_MS);
        const dateTo = to ? new Date(to) : new Date();

        const qb = invoiceRepo
            .createQueryBuilder("i")
            .where("i.createdAt BETWEEN :from AND :to", {
                from: dateFrom.toISOString(),
                to: dateTo.toISOString(),
            });

        if (status) qb.andWhere("i.status = :status", { status });

        const invoices = await qb.getMany();

        // Daily aggregation grouped by currency (for chart).
        const daily = new Map<string, { count: number; amounts: Record<string, number> }>();
        for (const inv of invoices) {
            const day = inv.createdAt.toISOString().slice(0, 10);
            const entry = daily.get(day) || { count: 0, amounts: {} };
            entry.count++;
            entry.amounts[inv.currency] = (entry.amounts[inv.currency] || 0) + inv.amount;
            daily.set(day, entry);
        }

        // Revenue by currency (paid invoices only).
        const paidInvoices = invoices.filter((i) => i.status === "paid");
        const revenueByCurrency: Record<string, number> = {};
        for (const inv of paidInvoices) {
            revenueByCurrency[inv.currency] = (revenueByCurrency[inv.currency] || 0) + inv.amount;
        }

        const totalSubscribers = await subscriberRepo.count();
        const activeSubscribers = await subscriberRepo
            .createQueryBuilder("s")
            .where("s.status = :status", { status: "active" })
            .andWhere("(s.currentPeriodEnd IS NULL OR s.currentPeriodEnd > :now)", { now: new Date() })
            .getCount();

        return {
            chart: Array.from(daily.entries())
                .map(([date, data]) => ({ date, ...data }))
                .sort((a, b) => a.date.localeCompare(b.date)),
            totals: {
                invoices: invoices.length,
                revenueByCurrency,
                subscribers: totalSubscribers,
                activeSubscribers,
            },
        };
    }
}
