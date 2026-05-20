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
import { CouponService } from "../../services/CouponService";
import { CheckoutPayBody } from "../../models/CheckoutModels";
import { verifyCheckoutToken } from "../../core/checkoutToken";

@Controller("/")
@Tags("Checkout")
export class CheckoutController {
    constructor(
        private readonly billing: BillingService,
        private readonly couponService: CouponService,
    ) {}

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
    async pay(@BodyParams() { token, provider, couponCode }: CheckoutPayBody) {
        const payload = verifyCheckoutToken(token);
        if (!payload) {
            throw new BadRequest("Invalid or expired checkout token");
        }
        // Use couponCode from body, or from token if pre-applied
        const effectiveCouponCode = couponCode || payload.coupon_code;
        return this.billing.createPayment(payload.sub_id, payload.uid, provider, effectiveCouponCode);
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
     * Verifies the encrypted token and expiration, then returns
     * the subscription info and user ID embedded in the token.
     *
     * @param token - Encrypted checkout token from the URL.
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

        // If token has a pre-applied coupon, validate and return coupon data.
        let coupon = undefined;
        if (payload.coupon_code) {
            const result = await this.couponService.validateCoupon(payload.coupon_code, subscription.id, payload.uid);
            if (result.valid && result.coupon) {
                const disc = this.couponService.calculateDiscount(result.coupon, subscription.amount);
                coupon = {
                    code: result.coupon.code,
                    type: result.coupon.type,
                    value: result.coupon.value,
                    discountAmount: disc.discountAmount,
                    finalAmount: disc.finalAmount,
                };
            }
        }

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
            coupon,
        };
    }

    /**
     * Validate and preview a coupon code against a checkout token.
     *
     * Used by the checkout SPA to show a discount preview before
     * the user submits payment.
     *
     * @returns Validation result with discount details.
     */
    @Post("/apply-coupon")
    @Summary("Apply coupon to checkout")
    @Description("Validates a coupon code against a checkout token and returns discount preview.")
    @Returns(200)
    @Returns(400)
    async applyCoupon(@BodyParams() body: { token: string; code: string }) {
        const payload = verifyCheckoutToken(body.token);
        if (!payload) throw new BadRequest("Invalid or expired checkout token");

        const result = await this.couponService.validateCoupon(body.code, payload.sub_id, payload.uid);
        if (!result.valid) return { valid: false, error: result.error };

        const subscription = await AppDataSource.getRepository(Subscription).findOneBy({ id: payload.sub_id });
        if (!subscription) throw new NotFound("Subscription not found");

        const discount = this.couponService.calculateDiscount(result.coupon!, subscription.amount);
        return {
            valid: true,
            coupon: { code: result.coupon!.code, type: result.coupon!.type, value: result.coupon!.value },
            discountAmount: discount.discountAmount,
            finalAmount: discount.finalAmount,
        };
    }
}
