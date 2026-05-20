/**
 * @module controllers/sdk/SdkController
 *
 * Public SDK/API endpoints for external integrations.
 *
 * Protected by API key authentication via the {@link SdkGuard}.
 * Used by the `@anybill/sdk` client library and third-party integrations.
 */

import { Controller, Get, PathParams, QueryParams, UseBefore } from "@tsed/common";
import { NotFound } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { SdkGuard } from "../../core/SdkGuard";
import { AppDataSource } from "../../core/datasource";
import { Subscription } from "../../entities/Subscription";
import { Subscriber } from "../../entities/Subscriber";
import { Invoice } from "../../entities/Invoice";

@Controller("/")
@UseBefore(SdkGuard)
@Tags("SDK")

export class SdkController {
    /** List all active subscription plans. */
    @Get("/subscriptions")
    @Summary("List active plans")
    @Description("Returns all active subscription plans. Used by external integrations.")
    @Returns(200)
    async subscriptions() {
        return AppDataSource.getRepository(Subscription).find({
            where: { isActive: true },
            order: { createdAt: "DESC" },
        });
    }

    /** Find subscribers by external user ID, or list all. */
    @Get("/subscribers")
    @Summary("Find subscribers")
    @Description("Returns subscribers, optionally filtered by external user ID (uid).")
    @Returns(200)
    async subscribers(@QueryParams("uid") uid?: string) {
        const where: any = {};
        if (uid) where.uid = uid;
        return AppDataSource.getRepository(Subscriber).find({
            where,
            relations: ["subscription"],
        });
    }

    /** Get a subscriber by internal ID. */
    @Get("/subscribers/:id")
    @Summary("Get subscriber by ID")
    @Returns(200)
    @Returns(404)
    async subscriber(@PathParams("id") id: string) {
        const sub = await AppDataSource.getRepository(Subscriber).findOne({
            where: { id },
            relations: ["subscription"],
        });
        if (!sub) throw new NotFound("Subscriber not found");
        return sub;
    }

    /** Get an invoice by ID. */
    @Get("/invoices/:id")
    @Summary("Get invoice by ID")
    @Returns(200)
    @Returns(404)
    async invoice(@PathParams("id") id: string) {
        const inv = await AppDataSource.getRepository(Invoice).findOneBy({ id });
        if (!inv) throw new NotFound("Invoice not found");
        return inv;
    }
}
