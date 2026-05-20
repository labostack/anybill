/**
 * @module controllers/admin/CheckoutLinksController
 *
 * Admin endpoints for generating secure links (checkout + portal).
 *
 * Same functionality as the SDK endpoints, but protected by JWT auth
 * (AdminGuard) instead of API key auth. Useful for testing and manual
 * link generation from the admin dashboard.
 */

import { Controller, Post, BodyParams, UseBefore } from "@tsed/common";
import { NotFound } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Subscription } from "../../entities/Subscription";
import { Subscriber } from "../../entities/Subscriber";
import { createCheckoutToken } from "../../core/checkoutToken";
import { createPortalToken } from "../../core/portalToken";
import { CreateCheckoutLinkBody } from "../../models/CheckoutLinkModels";
import { CreatePortalLinkBody } from "../../models/PortalLinkModels";

const CHECKOUT_ORIGIN = process.env.CHECKOUT_ORIGIN || "http://localhost:3002";

@Controller("/")
@UseBefore(AdminGuard)
@Tags("Admin")
export class CheckoutLinksController {
    /**
     * Generate a secure checkout link from the admin dashboard.
     *
     * @returns Token, full checkout URL, and expiration timestamp.
     */
    @Post("/checkout-links")
    @Summary("Create checkout link (admin)")
    @Description("Generates a secure, time-limited checkout URL. Same as the SDK endpoint but uses admin JWT auth.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async createCheckoutLink(@BodyParams() { sub_id, uid, ttl }: CreateCheckoutLinkBody) {
        const subscription = await AppDataSource.getRepository(Subscription).findOneBy({
            id: sub_id,
            isActive: true,
        });
        if (!subscription) {
            throw new NotFound("Subscription not found or inactive");
        }

        const { token, expiresAt } = createCheckoutToken(sub_id, uid, ttl);

        return {
            token,
            url: `${CHECKOUT_ORIGIN}/pay/s/${token}`,
            expiresAt: expiresAt.toISOString(),
        };
    }

    /**
     * Generate a secure portal link from the admin dashboard.
     *
     * @returns Token, full portal URL, and expiration timestamp.
     */
    @Post("/portal-links")
    @Summary("Create portal link (admin)")
    @Description("Generates a secure, time-limited portal URL for subscriber self-service. Same as the SDK endpoint but uses admin JWT auth.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async createPortalLink(@BodyParams() { uid, ttl }: CreatePortalLinkBody) {
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
