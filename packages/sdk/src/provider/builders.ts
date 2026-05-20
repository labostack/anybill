/**
 * Fluent builders for structured provider return values.
 */

// ─── PaymentLink Builder ────────────────────────────────────────────

export interface PaymentLinkResult {
    url: string;
    id?: string;
    metadata?: Record<string, any>;
}

export class PaymentLink {
    private _url = "";
    private _id?: string;
    private _metadata?: Record<string, any>;

    static url(url: string): PaymentLink {
        const link = new PaymentLink();
        link._url = url;
        return link;
    }

    id(id: string): this { this._id = id; return this; }
    metadata(meta: Record<string, any>): this { this._metadata = meta; return this; }

    build(): PaymentLinkResult {
        if (!this._url) throw new Error("PaymentLink: url is required");
        return { url: this._url, id: this._id, metadata: this._metadata };
    }
}

// ─── Payment Builder ────────────────────────────────────────────────

export type PaymentAction = "confirmed" | "failed" | "cancelled" | "refunded" | "renewed" | "ignored";

export interface PaymentResult {
    id: string;
    action: PaymentAction;
    metadata?: Record<string, any>;
}

export class Payment {
    private _id = "";
    private _metadata?: Record<string, any>;

    static id(id: string): Payment {
        const p = new Payment();
        p._id = id;
        return p;
    }

    static ignore(): PaymentResult {
        return { id: "", action: "ignored" };
    }

    metadata(meta: Record<string, any>): this { this._metadata = meta; return this; }
    confirm(): PaymentResult { return { id: this._id, action: "confirmed", metadata: this._metadata }; }
    failure(): PaymentResult { return { id: this._id, action: "failed", metadata: this._metadata }; }
    cancel(): PaymentResult { return { id: this._id, action: "cancelled", metadata: this._metadata }; }
    refund(): PaymentResult { return { id: this._id, action: "refunded", metadata: this._metadata }; }
    renew(): PaymentResult { return { id: this._id, action: "renewed", metadata: this._metadata }; }
}
