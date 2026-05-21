/**
 * @module billing/builders
 *
 * Fluent builders for structured provider return values.
 *
 * Providers use these builders in their decorated methods to construct
 * type-safe results without dealing with raw object shapes.
 *
 * @example
 * ```ts
 * // In a @CreatePaymentLink() method:
 * return PaymentLink.url("https://gateway.com/pay/123").id("inv_abc");
 *
 * // In a @IncomingWebhook() method:
 * return Payment.id("inv_abc").confirm();
 * ```
 */

// ─── PaymentLink Builder ────────────────────────────────────────────

/**
 * Resolved payment link data returned from {@link PaymentLink.build}.
 */
export interface PaymentLinkResult {
    /** URL the user should be redirected to for payment. */
    url: string;
    /** Provider-assigned identifier for this payment session. */
    id?: string;
    /** Arbitrary key-value data to persist alongside the invoice. */
    metadata?: Record<string, any>;
}

/**
 * Fluent builder for payment link results.
 *
 * Returned from `@CreatePaymentLink()` methods. The engine calls
 * `.build()` automatically if the result is a builder instance.
 *
 * @example
 * ```ts
 * PaymentLink
 *   .url("https://checkout.stripe.com/c/cs_xxx")
 *   .id("pi_xxx")
 *   .metadata({ customerId: "cus_123" });
 * ```
 */
export class PaymentLink {
    private _url = "";
    private _id?: string;
    private _metadata?: Record<string, any>;

    /**
     * Start building a payment link with the given URL.
     *
     * @param url - The payment gateway URL.
     * @returns A new `PaymentLink` builder.
     */
    static url(url: string): PaymentLink {
        const link = new PaymentLink();
        link._url = url;
        return link;
    }

    /**
     * Set the provider-assigned payment ID.
     *
     * @param id - External payment identifier.
     */
    id(id: string): this {
        this._id = id;
        return this;
    }

    /**
     * Attach arbitrary metadata to persist with the invoice.
     *
     * @param meta - Key-value pairs.
     */
    metadata(meta: Record<string, any>): this {
        this._metadata = meta;
        return this;
    }

    /**
     * Finalize the builder into a plain result object.
     *
     * @throws {Error} If no URL was set.
     * @returns Resolved payment link data.
     */
    build(): PaymentLinkResult {
        if (!this._url) {
            throw new Error("PaymentLink: url is required");
        }
        return { url: this._url, id: this._id, metadata: this._metadata };
    }
}

// ─── Payment Builder ────────────────────────────────────────────────

/**
 * Outcome of a webhook or refund operation.
 *
 * | Action       | Meaning                                           |
 * |--------------|---------------------------------------------------|
 * | `confirmed`  | Payment succeeded, activate the subscription.     |
 * | `failed`     | Payment failed.                                   |
 * | `cancelled`  | Payment was cancelled before completion.           |
 * | `refunded`   | A completed payment was refunded.                 |
 * | `renewed`    | Provider-managed subscription renewed.             |
 * | `ignored`    | Webhook was valid but no action needed.            |
 */
export type PaymentAction =
    | "confirmed"
    | "failed"
    | "cancelled"
    | "refunded"
    | "renewed"
    | "ignored";

/**
 * Resolved payment result returned from webhook/refund handlers.
 */
export interface PaymentResult {
    /** Provider-assigned payment identifier. */
    id: string;
    /** The action the engine should take. */
    action: PaymentAction;
    /** Optional metadata from the provider response. */
    metadata?: Record<string, any>;
    /**
     * Optional raw body to return verbatim to the webhook caller.
     * Set via `Payment.ignore(body)`. Can be a string, Uint8Array, or any
     * JSON-serialisable value. When present, the webhook controller
     * responds with this value directly instead of the default JSON envelope.
     */
    ignoreBody?: string | Uint8Array | Record<string, any> | unknown;
}

/**
 * Fluent builder for payment results.
 *
 * Used in `@IncomingWebhook()` and `@RefundPayment()` methods to express
 * the outcome of a provider interaction.
 *
 * @example
 * ```ts
 * // Confirm a payment:
 * return Payment.id("pi_xxx").confirm();
 *
 * // Ignore an irrelevant webhook event:
 * return Payment.ignore();
 *
 * // Provider-managed renewal:
 * return Payment.id("sub_xxx").renew();
 * ```
 */
export class Payment {
    private _id = "";
    private _metadata?: Record<string, any>;

    /**
     * Start building a payment result with the given provider ID.
     *
     * @param id - The provider-assigned payment/invoice identifier.
     * @returns A new `Payment` builder.
     */
    static id(id: string): Payment {
        const p = new Payment();
        p._id = id;
        return p;
    }

    /**
     * Create an "ignored" result for irrelevant webhook events.
     *
     * Use this when the webhook is valid but represents an event
     * AnyBill doesn't need to act on (e.g. `charge.updated`).
     *
     * When `body` is provided it is returned verbatim to the calling
     * provider in the HTTP response — useful for challenge/verify
     * handshakes that require a specific plaintext or JSON reply.
     *
     * @param body - Optional response body to echo back (string, Buffer, or object).
     * @returns A pre-built `PaymentResult` with `action: "ignored"`.
     *
     * @example
     * // Plain-text echo (e.g. status check)
     * return Payment.ignore("YES");
     *
     * // JSON echo (e.g. challenge handshake)
     * return Payment.ignore({ challenge: params.hub_challenge });
     */
    static ignore(body?: string | Uint8Array | Record<string, any> | unknown): PaymentResult {
        return { id: "", action: "ignored", ...(body !== undefined && { ignoreBody: body }) };
    }

    /**
     * Attach arbitrary metadata to the result.
     *
     * @param meta - Key-value pairs from the provider response.
     */
    metadata(meta: Record<string, any>): this {
        this._metadata = meta;
        return this;
    }

    /** Finalize as a confirmed payment. */
    confirm(): PaymentResult {
        return { id: this._id, action: "confirmed", metadata: this._metadata };
    }

    /** Finalize as a failed payment. */
    failure(): PaymentResult {
        return { id: this._id, action: "failed", metadata: this._metadata };
    }

    /** Finalize as a cancelled payment. */
    cancel(): PaymentResult {
        return { id: this._id, action: "cancelled", metadata: this._metadata };
    }

    /** Finalize as a refunded payment. */
    refund(): PaymentResult {
        return { id: this._id, action: "refunded", metadata: this._metadata };
    }

    /**
     * Finalize as a provider-managed renewal.
     *
     * The provider already charged the user; AnyBill records the new
     * invoice and shifts the subscription period forward.
     */
    renew(): PaymentResult {
        return { id: this._id, action: "renewed", metadata: this._metadata };
    }
}
