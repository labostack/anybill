/**
 * @module controllers/webhook/WebhookController
 *
 * Incoming webhook receiver for payment providers.
 *
 * Providers call `POST /api/webhook/:provider` to deliver payment
 * notifications. The request is forwarded to the billing engine which
 * handles signature validation and state transitions.
 */

import { Controller, Post, PathParams, Req, Res, Context } from "@tsed/common";
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
        @Context() ctx: any,
    ) {
        try {
            // Use the raw body Buffer for signature verification.
            // express.json() with the `verify` callback saves the original bytes on req.rawBody.
            // If rawBody is missing (empty body), fall back to req.body.
            const rawBody: Buffer | string = (req as any).rawBody ?? req.body;
            const result = await this.billing.handleWebhook(provider, rawBody, req.headers);

            // If the provider returned an explicit ignore body, echo it verbatim.
            if (result?.ignoreBody !== undefined) {
                const body = result.ignoreBody;
                if (typeof body === "string" || Buffer.isBuffer(body) || body instanceof Uint8Array) {
                    return res.send(body);
                }
                return res.json(body);
            }

            return res.json({ ok: true, action: result?.action ?? "ignored" });
        } catch (err: any) {
            ctx.logger.error({ provider, error: err.message });
            return res.status(400).json({ ok: false, message: err.message });
        }
    }
}
