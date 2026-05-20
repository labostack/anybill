/**
 * @module controllers/checkout/CheckoutController
 *
 * Public checkout flow endpoints.
 *
 * These endpoints are used by the checkout SPA to initiate payments,
 * resolve secure checkout tokens, and poll confirmation status.
 */

import { Controller, Get, Post, BodyParams, PathParams } from "@tsed/common";
import { BadRequest, NotFound } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AppDataSource } from "../../core/datasource";
import { Subscription } from "../../entities/Subscription";
import { Account } from "../../entities/Account";
import { BillingService } from "../../services/BillingService";
import { CheckoutPayBody } from "../../models/CheckoutModels";
import { verifyCheckoutToken } from "../../core/checkoutToken";

@Controller("/")
@Tags("Checkout")
export class CheckoutController {
    constructor(private readonly billing: BillingService) {}

    /**
     * Initiate a payment.
     *
     * Verifies the checkout token, extracts `sub_id` and `uid` from it,
     * then creates a subscriber (if needed), generates an invoice, and
     * returns a payment URL to redirect the user to the provider's gateway.
     *
     * @returns Invoice ID and payment URL.
     */
    @Post("/pay")
    @Summary("Initiate payment")
    @Description("Verifies the checkout token, creates a subscriber (if needed), generates an invoice, and returns a payment URL.")
    @Returns(200)
    @Returns(400)
    async pay(@BodyParams() { token, provider }: CheckoutPayBody) {
        const payload = verifyCheckoutToken(token);
        if (!payload) {
            throw new BadRequest("Invalid or expired checkout token");
        }
        return this.billing.createPayment(payload.sub_id, payload.uid, provider);
    }

    /**
     * Poll invoice status for the payment confirmation page.
     *
     * @param invoiceId - Invoice ID to check.
     * @returns Invoice status and optional redirect URL.
     */
    @Get("/confirm/:invoiceId")
    @Summary("Poll payment status")
    @Description("Polls the invoice status for the payment confirmation page. Returns status and optional redirect URL.")
    @Returns(200)
    @Returns(404)
    async confirm(@PathParams("invoiceId") invoiceId: string) {
        const result = await this.billing.getInvoiceStatus(invoiceId);
        if (!result) throw new NotFound("Invoice not found");
        return result;
    }

    /**
     * Resolve a secure checkout token.
     *
     * Verifies the HMAC signature and expiration, then returns
     * the subscription info and user ID embedded in the token.
     *
     * @param token - Signed checkout token from the URL.
     * @returns Subscription data, uid, providers, and checkout config.
     */
    @Get("/resolve/:token")
    @Summary("Resolve checkout token")
    @Description("Verifies a secure checkout token and returns subscription info, user ID, providers, and branding config.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async resolve(@PathParams("token") token: string) {
        const payload = verifyCheckoutToken(token);
        if (!payload) {
            throw new BadRequest("Invalid or expired checkout link");
        }

        const subscription = await AppDataSource.getRepository(Subscription).findOneBy({
            id: payload.sub_id,
            isActive: true,
        });
        if (!subscription) {
            throw new NotFound("Subscription not found or inactive");
        }

        const account = await AppDataSource.getRepository(Account).findOne({ where: {} });

        return {
            sub_id: payload.sub_id,
            uid: payload.uid,
            subscription: {
                id: subscription.id,
                name: subscription.name,
                description: subscription.description,
                amount: subscription.amount,
                currency: subscription.currency,
                interval: subscription.interval,
                intervalCount: subscription.intervalCount,
            },
            providers: this.billing.getProviders(),
            checkoutConfig: account?.checkoutConfig || {},
        };
    }
}

