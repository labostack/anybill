/**
 * @module controllers/checkout/CheckoutController
 *
 * Public checkout flow endpoints.
 *
 * These endpoints are unauthenticated — used by the checkout SPA to
 * load plan info, initiate payments, and poll confirmation status.
 */

import { Controller, Get, Post, BodyParams, QueryParams, PathParams } from "@tsed/common";
import { BadRequest, NotFound } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AppDataSource } from "../../core/datasource";
import { Subscription } from "../../entities/Subscription";
import { Account } from "../../entities/Account";
import { BillingService } from "../../services/BillingService";
import { validate, CheckoutPaySchema } from "../../core/validation";

@Controller("/")
@Tags("Checkout")
export class CheckoutController {
    constructor(private readonly billing: BillingService) {}

    /**
     * Get subscription info and available providers for the checkout page.
     *
     * @param subId - Subscription plan ID.
     * @returns Subscription data, provider list, and checkout config.
     */
    @Get("/info")
    @Summary("Get checkout info")
    @Description("Returns subscription details, available payment providers, and checkout branding config.")
    @Returns(200)
    @Returns(400)
    @Returns(404)
    async info(@QueryParams("sub_id") subId: string) {
        if (!subId) throw new BadRequest("sub_id is required");

        const subscription = await AppDataSource.getRepository(Subscription).findOneBy({ id: subId, isActive: true });
        if (!subscription) throw new NotFound("Subscription not found");

        const account = await AppDataSource.getRepository(Account).findOne({ where: {} });

        return {
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

    /**
     * Initiate a payment.
     *
     * Creates a subscriber (if needed), generates an invoice, and returns
     * a payment URL to redirect the user to the provider's gateway.
     *
     * @returns Invoice ID and payment URL.
     */
    @Post("/pay")
    @Summary("Initiate payment")
    @Description("Creates a subscriber (if needed), generates an invoice, and returns a payment URL.")
    @Returns(200)
    @Returns(400)
    async pay(@BodyParams() body: unknown) {
        const { sub_id, uid, provider } = validate(CheckoutPaySchema, body);
        return this.billing.createPayment(sub_id, uid, provider);
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
}
