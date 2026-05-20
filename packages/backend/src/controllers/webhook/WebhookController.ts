/**
 * @module controllers/webhook/WebhookController
 *
 * Incoming webhook receiver for payment providers.
 *
 * Providers call `POST /api/webhook/:provider` to deliver payment
 * notifications. The request is forwarded to the billing engine which
 * handles signature validation and state transitions.
 */

import { Controller, Post, PathParams, Req, Res } from "@tsed/common";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { BillingService } from "../../services/BillingService";

@Controller("/")
@Tags("Provider Webhooks")
export class WebhookController {
    constructor(private readonly billing: BillingService) {}

    /**
     * Receive and process an incoming provider webhook.
     *
     * @param provider - Provider name from the URL path.
     * @param req      - Raw Express request.
     * @param res      - Express response.
     */
    @Post("/:provider")
    @Summary("Receive provider webhook")
    @Description("Receives and processes an incoming payment notification from a provider plugin.")
    @Returns(200)
    @Returns(400)
    async handle(
        @PathParams("provider") provider: string,
        @Req() req: any,
        @Res() res: any,
    ) {
        try {
            const result = await this.billing.handleWebhook(provider, req.body, req.headers);
            return res.json({ ok: true, action: result?.action ?? "ignored" });
        } catch (err: any) {
            console.error(`[webhook] Error processing ${provider} webhook:`, err.message);
            return res.status(400).json({ ok: false, message: err.message });
        }
    }
}
