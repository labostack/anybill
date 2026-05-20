/**
 * @module controllers/sdk/SdkController
 *
 * Public SDK/API endpoints for external integrations.
 *
 * Protected by API key authentication via the {@link SdkGuard}.
 * Used by the `@anybill/sdk` client library and third-party integrations.
 */

import { Controller, Get, Post, BodyParams, PathParams, QueryParams, UseBefore } from "@tsed/common";
import { NotFound } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { SdkGuard } from "../../core/SdkGuard";
import { AppDataSource } from "../../core/datasource";
import { Subscription } from "../../entities/Subscription";
import { Subscriber } from "../../entities/Subscriber";
import { Invoice } from "../../entities/Invoice";
import { Coupon } from "../../entities/Coupon";
import { createCheckoutToken } from "../../core/checkoutToken";
import { createPortalToken } from "../../core/portalToken";
import { CreateCheckoutLinkBody } from "../../models/CheckoutLinkModels";
import { CreatePortalLinkBody } from "../../models/PortalLinkModels";

const CHECKOUT_ORIGIN = process.env.CHECKOUT_ORIGIN || "http://localhost:3002";

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

    /**
     * Generate a secure checkout link.
     *
     * Creates an AES-256-GCM encrypted token containing the subscription ID and user ID.
     * The resulting URL can be shared with the end-user to access the checkout page.
     *
     * @returns Token, full checkout URL, and expiration timestamp.
     */
    @Post("/checkout-links")
    @Summary("Create checkout link")
    @Description("Generates a secure, time-limited checkout URL for a subscription plan and user.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async createCheckoutLink(@BodyParams() { sub_id, uid, ttl, coupon_code }: CreateCheckoutLinkBody) {
        const subscription = await AppDataSource.getRepository(Subscription).findOneBy({
            id: sub_id,
            isActive: true,
        });
        if (!subscription) {
            throw new NotFound("Subscription not found or inactive");
        }

        // Validate coupon exists and is active (full per-user validation happens at checkout).
        if (coupon_code) {
            const coupon = await AppDataSource.getRepository(Coupon).findOneBy({ code: coupon_code.toUpperCase(), isActive: true });
            if (!coupon) throw new NotFound("Coupon not found or inactive");
        }

        const { token, expiresAt } = createCheckoutToken(sub_id, uid, ttl, coupon_code?.toUpperCase());

        return {
            token,
            url: `${CHECKOUT_ORIGIN}/pay/s/${token}`,
            expiresAt: expiresAt.toISOString(),
        };
    }

    /**
     * Generate a secure portal link.
     *
     * Creates an AES-256-GCM encrypted token containing the user ID.
     * The resulting URL grants the end-user access to their subscription
     * management portal (view, cancel, change plan, renew).
     *
     * @returns Token, full portal URL, and expiration timestamp.
     */
    @Post("/portal-links")
    @Summary("Create portal link")
    @Description("Generates a secure, time-limited portal URL for subscriber self-service.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async createPortalLink(@BodyParams() { uid, ttl }: CreatePortalLinkBody) {
        // Verify at least one subscriber exists for this uid.
        const subscriber = await AppDataSource.getRepository(Subscriber).findOneBy({ uid });
        if (!subscriber) {
            throw new NotFound("No subscriber found for this uid");
        }

        const { token, expiresAt } = createPortalToken(uid, ttl);

        return {
            token,
            url: `${CHECKOUT_ORIGIN}/portal/${token}`,
            expiresAt: expiresAt.toISOString(),
        };
    }
}
