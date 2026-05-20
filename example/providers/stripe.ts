/**
 * Example Stripe provider for AnyBill.
 *
 * Replace the placeholder logic with real Stripe SDK calls.
 * Install the Stripe SDK: npm install stripe
 */

import {
    AnybillProvider,
    CreatePaymentLink,
    ValidateWebhook,
    IncomingWebhook,
    PaymentLink,
    Payment,
} from "@anybill/sdk";

// import Stripe from "stripe";
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
// const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

class StripeProvider extends AnybillProvider {
    get displayName() {
        return "Stripe";
    }

    get capabilities() {
        return ["one_time", "recurring"] as const;
    }

    @CreatePaymentLink()
    async createLink(ctx: any) {
        // const session = await stripe.checkout.sessions.create({
        //     mode: "payment",
        //     line_items: [{ price_data: { currency: ctx.plan.currency, unit_amount: ctx.plan.amount, product_data: { name: ctx.plan.name } }, quantity: 1 }],
        //     success_url: `${process.env.CHECKOUT_ORIGIN}/confirm/${ctx.plan.invoiceId}`,
        //     metadata: { invoiceId: ctx.plan.invoiceId },
        // });
        // return PaymentLink.url(session.url!).id(session.id);

        throw new Error("Replace with real Stripe integration");
    }

    @ValidateWebhook()
    verify(ctx: any) {
        // const sig = ctx.headers["stripe-signature"];
        // try {
        //     stripe.webhooks.constructEvent(ctx.body, sig, webhookSecret);
        //     return true;
        // } catch {
        //     return false;
        // }

        return true;
    }

    @IncomingWebhook()
    async webhook(ctx: any) {
        // const event = JSON.parse(ctx.body);
        // if (event.type === "checkout.session.completed") {
        //     return Payment.id(event.data.object.id)
        //         .metadata({ invoiceId: event.data.object.metadata.invoiceId })
        //         .confirm();
        // }
        // return Payment.ignore();

        throw new Error("Replace with real Stripe integration");
    }
}

export default { name: "stripe", provider: new StripeProvider() };
