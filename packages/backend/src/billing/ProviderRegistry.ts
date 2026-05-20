/**
 * @module billing/ProviderRegistry
 *
 * Metadata store for decorated provider methods.
 *
 * When a provider author applies `@CreatePaymentLink()`, `@ValidateWebhook()`,
 * etc., the decorator calls {@link registerMethod} to associate the method name
 * with a {@link ProviderRole}. The {@link BillingEngine} later queries this
 * registry to dispatch calls to the correct method at runtime.
 *
 * The registry is prototype-chain aware: if `ChildProvider extends ParentProvider`,
 * roles registered on the parent are inherited automatically.
 */

/**
 * Identifies the lifecycle role a decorated method fulfills.
 *
 * | Role               | Decorator              | Purpose                                  |
 * |--------------------|------------------------|------------------------------------------|
 * | `createLink`       | `@CreatePaymentLink()` | Generate a payment URL                   |
 * | `validateWebhook`  | `@ValidateWebhook()`   | Verify incoming webhook signature        |
 * | `incomingWebhook`  | `@IncomingWebhook()`   | Process the webhook and return a result  |
 * | `refund`           | `@RefundPayment()`     | Issue a refund through the provider      |
 * | `cancel`           | `@CancelPayment()`     | Cancel a pending payment                 |
 */
export type ProviderRole =
    | "createLink"
    | "validateWebhook"
    | "incomingWebhook"
    | "refund"
    | "cancel";

/**
 * Internal map: `prototype → { methodName → role }`.
 * Keyed on the prototype (or instance) where the decorator was applied.
 *
 * Uses a global symbol so that the registry is shared across multiple copies
 * of this module (e.g. when providers load `@anybill/sdk` from their own
 * `node_modules` alongside the backend's built-in copy).
 */
const REGISTRY_KEY = Symbol.for("anybill:provider-registry");
const registry: Map<object, Map<string, ProviderRole>> =
    (globalThis as any)[REGISTRY_KEY] ??= new Map();

/**
 * Register a method under a specific role.
 *
 * Called by the role decorator factory when a method is decorated.
 * Supports both prototype-level (legacy decorators) and instance-level
 * (TC39 Stage 3 initializers) registration.
 *
 * @param target     - The prototype or instance to register on.
 * @param methodName - The decorated method's name.
 * @param role       - The lifecycle role this method fulfills.
 */
export function registerMethod(target: object, methodName: string, role: ProviderRole): void {
    if (!registry.has(target)) {
        registry.set(target, new Map());
    }
    registry.get(target)!.set(methodName, role);
}

/**
 * Walk the prototype chain and merge all registered method→role mappings.
 *
 * Child registrations take precedence over parent registrations when
 * the same method name appears at multiple levels.
 *
 * @param instance - The provider instance to resolve.
 * @returns Merged map, or `undefined` if no registrations exist.
 */
function resolveMethodsMap(instance: object): Map<string, ProviderRole> | undefined {
    const merged = new Map<string, ProviderRole>();

    let current: object | null = instance;
    while (current && current !== Object.prototype) {
        const methods = registry.get(current);
        if (methods) {
            for (const [name, role] of methods) {
                // First-seen wins (child overrides parent).
                if (!merged.has(name)) {
                    merged.set(name, role);
                }
            }
        }
        current = Object.getPrototypeOf(current);
    }

    return merged.size > 0 ? merged : undefined;
}

/**
 * Check whether a provider instance has a method registered for `role`.
 *
 * @param instance - The provider instance.
 * @param role     - The role to look for.
 * @returns `true` if at least one method is registered under `role`.
 */
export function hasMethod(instance: object, role: ProviderRole): boolean {
    const methods = resolveMethodsMap(instance);
    if (!methods) return false;
    for (const r of methods.values()) {
        if (r === role) return true;
    }
    return false;
}

/**
 * Get the name of the method registered for `role`.
 *
 * @param instance - The provider instance.
 * @param role     - The role to look up.
 * @returns The method name, or `undefined` if the role is not registered.
 */
export function getMethodForRole(instance: object, role: ProviderRole): string | undefined {
    const methods = resolveMethodsMap(instance);
    if (!methods) return undefined;
    for (const [name, r] of methods.entries()) {
        if (r === role) return name;
    }
    return undefined;
}

/**
 * Get all roles that a provider instance has registered.
 *
 * Useful for debug logging and capability introspection.
 *
 * @param instance - The provider instance.
 * @returns De-duplicated array of registered roles.
 */
export function getRegisteredRoles(instance: object): ProviderRole[] {
    const methods = resolveMethodsMap(instance);
    if (!methods) return [];
    return Array.from(new Set(methods.values()));
}
