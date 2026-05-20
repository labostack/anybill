/**
 * @module billing/BillingEngine
 *
 * Central orchestrator for payment provider interactions.
 *
 * The engine holds the provider registry, dispatches payment creation
 * and webhook handling to the appropriate provider methods, and emits
 * lifecycle events that the application layer subscribes to.
 *
 * @example
 * ```ts
 * const engine = new BillingEngine({ debug: true });
 * engine.provider("stripe", new StripeProvider());
 *
 * engine.on("payment:confirmed", async ({ provider, payment }) => {
 *   console.log(`Payment ${payment.id} confirmed via ${provider}`);
 * });
 *
 * const link = await engine.createPaymentLink("stripe", { plan: myPlan });
 * ```
 */

import { AnybillProvider } from "./AnybillProvider";
import { getMethodForRole, getRegisteredRoles, hasMethod } from "./ProviderRegistry";
import type { PaymentLinkResult, PaymentResult } from "./builders";

// ─── Public Interfaces ──────────────────────────────────────────────

/** Context passed to `@CreatePaymentLink()` methods. */
export interface PaymentContext {
    /** Subscription plan data (shape defined by the application). */
    plan: unknown;
    /** Optional user/subscriber data. */
    user?: unknown;
    /** Arbitrary metadata to forward to the provider. */
    metadata?: Record<string, any>;
}

/** Raw webhook data passed to `@ValidateWebhook()` and `@IncomingWebhook()` methods. */
export interface WebhookPayload {
    /** Raw request body (string or Buffer). */
    body: string | Buffer;
    /** HTTP headers from the incoming request. */
    headers: Record<string, string>;
}

/** Serializable provider info returned by {@link BillingEngine.getProviders}. */
export interface ProviderInfo {
    /** Unique provider identifier (registration key). */
    id: string;
    /** Human-readable display name. */
    displayName: string;
    /** Supported capabilities (e.g. `["one_time", "recurring"]`). */
    capabilities: string[];
}

// ─── Internal Types ─────────────────────────────────────────────────

/** Callback for billing engine events. */
type EventHandler = (data: any) => void | Promise<void>;

/** Configuration options for the billing engine. */
interface BillingEngineOptions {
    /** Enable verbose logging (defaults to `false`). */
    debug?: boolean;
}

// ─── Engine ─────────────────────────────────────────────────────────

/**
 * Billing engine — the core orchestrator.
 *
 * Responsibilities:
 * 1. Maintain a registry of named provider instances.
 * 2. Dispatch `createPaymentLink()` calls to the correct provider method.
 * 3. Handle incoming webhooks: validate → process → emit events.
 * 4. Dispatch refund requests to providers that support them.
 * 5. Provide an event bus for the application layer to react to outcomes.
 */
export class BillingEngine {
    /** Registered providers keyed by their unique name. */
    private readonly providers = new Map<string, AnybillProvider>();

    /** Event handlers keyed by event name. */
    private readonly events = new Map<string, EventHandler[]>();

    /** Whether to log debug information. */
    private readonly debug: boolean;

    constructor(opts?: BillingEngineOptions) {
        this.debug = opts?.debug ?? false;
    }

    // ─── Provider Management ────────────────────────────────────

    /**
     * Register a payment provider under a unique name.
     *
     * @param name     - Unique identifier (e.g. `"stripe"`, `"cloudpayments"`).
     * @param instance - An instance of an {@link AnybillProvider} subclass.
     * @returns `this` for chaining.
     */
    provider(name: string, instance: AnybillProvider): this {
        this.providers.set(name, instance);
        if (this.debug) {
            const roles = getRegisteredRoles(instance);
            console.log(`[billing] Registered provider: ${name} (${roles.join(", ")})`);
        }
        return this;
    }

    /**
     * Get the list of registered provider identifiers.
     *
     * @returns Array of provider name strings.
     */
    getProviderNames(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Get detailed information about all registered providers.
     *
     * @returns Array of provider info objects (safe to serialize to JSON).
     */
    getProviders(): ProviderInfo[] {
        return Array.from(this.providers.entries()).map(([id, instance]) => ({
            id,
            displayName: instance.displayName,
            capabilities: [...instance.capabilities],
        }));
    }

    /**
     * Check if a provider has a specific decorated role.
     *
     * @param providerName - The registered provider name.
     * @param role         - The role to check (e.g. `"refund"`).
     * @returns `true` if the provider has a method for the role.
     */
    can(providerName: string, role: string): boolean {
        const provider = this.providers.get(providerName);
        if (!provider) return false;
        return hasMethod(provider, role as any);
    }

    // ─── Event Bus ──────────────────────────────────────────────

    /**
     * Subscribe to a billing engine event.
     *
     * Events emitted:
     * - `payment:link.created` — after a payment link is generated
     * - `payment:confirmed`   — after a confirmed webhook
     * - `payment:failed`      — after a failed webhook
     * - `payment:refunded`    — after a refund
     * - `payment:renewed`     — after a provider-managed renewal
     * - `webhook:rejected`    — when signature validation fails
     *
     * @param event   - Event name.
     * @param handler - Async callback receiving event data.
     * @returns `this` for chaining.
     */
    on(event: string, handler: EventHandler): this {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(handler);
        return this;
    }

    /**
     * Emit an event to all registered handlers.
     *
     * Errors in individual handlers are caught and logged to prevent
     * one faulty handler from blocking others.
     */
    private async emit(event: string, data: any): Promise<void> {
        const handlers = this.events.get(event) || [];
        for (const handler of handlers) {
            try {
                await handler(data);
            } catch (err) {
                console.error(`[billing] Error in "${event}" handler:`, err);
            }
        }
    }

    // ─── Payment Operations ─────────────────────────────────────

    /**
     * Create a payment link via the named provider.
     *
     * Finds the `@CreatePaymentLink()` method on the provider,
     * invokes it with the given context, and emits `payment:link.created`.
     *
     * @param providerName - The registered provider name.
     * @param ctx          - Payment context (plan, user, metadata).
     * @returns Resolved payment link data.
     * @throws {Error} If the provider is unknown or has no link creator.
     */
    async createPaymentLink(providerName: string, ctx: PaymentContext): Promise<PaymentLinkResult> {
        const provider = this.resolveProvider(providerName);
        const methodName = getMethodForRole(provider, "createLink");
        if (!methodName) {
            throw new Error(`Provider "${providerName}" has no @CreatePaymentLink() method`);
        }

        if (this.debug) console.log(`[billing] → ${providerName}.${methodName}()`);

        const result = await (provider as any)[methodName](ctx);
        const link = result.build ? result.build() : result;

        await this.emit("payment:link.created", { provider: providerName, link });
        return link;
    }

    /**
     * Handle an incoming webhook from a payment provider.
     *
     * Lifecycle:
     * 1. Validate the signature via `@ValidateWebhook()` (if registered).
     * 2. Process the payload via `@IncomingWebhook()`.
     * 3. Emit the appropriate `payment:*` event.
     *
     * @param providerName - The registered provider name.
     * @param payload      - Raw webhook body and headers.
     * @returns The parsed payment result, or `null` if ignored.
     * @throws {Error} If validation fails or the provider is misconfigured.
     */
    async handleWebhook(providerName: string, payload: WebhookPayload): Promise<PaymentResult | null> {
        const provider = this.resolveProvider(providerName);

        // Step 1: Validate signature (optional).
        const validateMethod = getMethodForRole(provider, "validateWebhook");
        if (validateMethod) {
            const valid = await (provider as any)[validateMethod](payload);
            if (!valid) {
                await this.emit("webhook:rejected", { provider: providerName });
                throw new Error(`Webhook signature verification failed for provider "${providerName}"`);
            }
        }

        // Step 2: Process webhook.
        const handleMethod = getMethodForRole(provider, "incomingWebhook");
        if (!handleMethod) {
            throw new Error(`Provider "${providerName}" has no @IncomingWebhook() method`);
        }

        if (this.debug) console.log(`[billing] → ${providerName}.${handleMethod}()`);

        const result: PaymentResult = await (provider as any)[handleMethod](payload);

        // Step 3: Emit event (skip for "ignored" actions).
        if (result.action !== "ignored") {
            await this.emit(`payment:${result.action}`, { provider: providerName, payment: result });
        }

        return result;
    }

    /**
     * Issue a refund via the named provider.
     *
     * @param providerName - The registered provider name.
     * @param ctx          - Refund context (invoiceId, amount, etc.).
     * @returns The refund result from the provider.
     * @throws {Error} If the provider doesn't support refunds.
     */
    async refund(providerName: string, ctx: Record<string, any>): Promise<PaymentResult> {
        const provider = this.resolveProvider(providerName);
        const methodName = getMethodForRole(provider, "refund");
        if (!methodName) {
            throw new Error(`Provider "${providerName}" does not support refunds (@RefundPayment)`);
        }

        if (this.debug) console.log(`[billing] → ${providerName}.${methodName}()`);

        const result: PaymentResult = await (provider as any)[methodName](ctx);

        if (result.action === "refunded") {
            await this.emit("payment:refunded", { provider: providerName, payment: result });
        }

        return result;
    }

    // ─── Private Helpers ────────────────────────────────────────

    /**
     * Resolve a provider by name, throwing a descriptive error if not found.
     *
     * @param name - The registered provider name.
     * @returns The provider instance.
     * @throws {Error} With a list of available providers.
     */
    private resolveProvider(name: string): AnybillProvider {
        const provider = this.providers.get(name);
        if (!provider) {
            const available = this.getProviderNames().join(", ");
            throw new Error(`Unknown provider "${name}". Available: ${available || "none"}`);
        }
        return provider;
    }
}
