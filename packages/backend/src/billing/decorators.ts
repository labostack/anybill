/**
 * @module billing/decorators
 *
 * Role decorators for payment provider methods.
 *
 * Each decorator marks a method with a specific lifecycle role so the
 * {@link BillingEngine} can discover and invoke it at runtime.
 *
 * Supports both **TC39 Stage 3** decorators (native) and **legacy
 * `experimentalDecorators`** (TypeScript). The factory detects the
 * calling convention automatically.
 *
 * @example
 * ```ts
 * class MyProvider extends AnybillProvider {
 *   @CreatePaymentLink()
 *   async createLink(ctx: PaymentContext) {
 *     return PaymentLink.url("https://...").id("inv_123");
 *   }
 * }
 * ```
 */

import { registerMethod, type ProviderRole } from "./ProviderRegistry";

/**
 * Creates a method decorator that registers the target method under `role`.
 *
 * The returned decorator factory (called with `()`) produces a decorator
 * compatible with both TC39 Stage 3 and legacy TypeScript decorators.
 *
 * @param role - The lifecycle role to assign.
 * @returns A parameterless decorator factory.
 *
 * @internal
 */
function createRoleDecorator(role: ProviderRole) {
    return function () {
        return function (targetOrMethod: any, contextOrKey?: any, descriptor?: any): any {
            // ── TC39 Stage 3 path: (method, context) ──
            if (contextOrKey && typeof contextOrKey === "object" && "kind" in contextOrKey) {
                contextOrKey.addInitializer(function (this: any) {
                    registerMethod(this, contextOrKey.name as string, role);
                });
                return targetOrMethod;
            }

            // ── Legacy experimentalDecorators path: (prototype, key, descriptor) ──
            if (typeof contextOrKey === "string") {
                const original = descriptor.value;
                descriptor.value = function (this: any, ...args: any[]) {
                    registerMethod(this, contextOrKey, role);
                    return original.apply(this, args);
                };
                // Eagerly register on prototype for capability checks before first call.
                registerMethod(targetOrMethod, contextOrKey, role);
                return descriptor;
            }
        };
    };
}

/**
 * Marks a method as the **payment link creator**.
 *
 * The decorated method receives a {@link PaymentContext} and must return
 * a {@link PaymentLink} builder (or a plain `PaymentLinkResult` object).
 */
export const CreatePaymentLink = createRoleDecorator("createLink");

/**
 * Marks a method as the **webhook signature validator**.
 *
 * Called automatically before `@IncomingWebhook()`. Must return a boolean
 * indicating whether the signature is valid. If it returns `false`, the
 * engine rejects the webhook.
 */
export const ValidateWebhook = createRoleDecorator("validateWebhook");

/**
 * Marks a method as the **incoming webhook handler**.
 *
 * Only invoked after `@ValidateWebhook()` passes (or if no validator is
 * registered). Must return a {@link Payment} builder result describing
 * the outcome (confirmed, failed, renewed, etc.).
 */
export const IncomingWebhook = createRoleDecorator("incomingWebhook");

/**
 * Marks a method as the **refund handler**.
 *
 * Called when the admin triggers a refund through the dashboard.
 * Must return a `PaymentResult` with `action: "refunded"`.
 */
export const RefundPayment = createRoleDecorator("refund");

/**
 * Marks a method as the **cancellation handler**.
 *
 * Called when a pending payment needs to be cancelled through the provider.
 * Must return a `PaymentResult` with `action: "cancelled"`.
 */
export const CancelPayment = createRoleDecorator("cancel");
