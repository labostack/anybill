/**
 * Role decorators for payment provider methods.
 *
 * Supports both TC39 Stage 3 decorators (native) and legacy
 * `experimentalDecorators` (TypeScript).
 */

import { registerMethod, type ProviderRole } from "./ProviderRegistry";

function createRoleDecorator(role: ProviderRole) {
    return function () {
        return function (targetOrMethod: any, contextOrKey?: any, descriptor?: any): any {
            // TC39 Stage 3 path: (method, context)
            if (contextOrKey && typeof contextOrKey === "object" && "kind" in contextOrKey) {
                contextOrKey.addInitializer(function (this: any) {
                    registerMethod(this, contextOrKey.name as string, role);
                });
                return targetOrMethod;
            }

            // Legacy experimentalDecorators path: (prototype, key, descriptor)
            if (typeof contextOrKey === "string") {
                const original = descriptor.value;
                descriptor.value = function (this: any, ...args: any[]) {
                    registerMethod(this, contextOrKey, role);
                    return original.apply(this, args);
                };
                registerMethod(targetOrMethod, contextOrKey, role);
                return descriptor;
            }
        };
    };
}

/** Marks a method as the payment link creator. */
export const CreatePaymentLink = createRoleDecorator("createLink");

/** Marks a method as the webhook signature validator. */
export const ValidateWebhook = createRoleDecorator("validateWebhook");

/** Marks a method as the incoming webhook handler. */
export const IncomingWebhook = createRoleDecorator("incomingWebhook");

/** Marks a method as the refund handler. */
export const RefundPayment = createRoleDecorator("refund");

/** Marks a method as the cancellation handler. */
export const CancelPayment = createRoleDecorator("cancel");
