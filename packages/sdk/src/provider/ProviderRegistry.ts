/**
 * Metadata store for decorated provider methods.
 *
 * Uses a global symbol so the registry is shared across multiple copies
 * of this module (backend + provider's own @anybill/sdk).
 */

export type ProviderRole =
    | "createLink"
    | "validateWebhook"
    | "incomingWebhook"
    | "refund"
    | "cancel";

const REGISTRY_KEY = Symbol.for("anybill:provider-registry");
const registry: Map<object, Map<string, ProviderRole>> =
    (globalThis as any)[REGISTRY_KEY] ??= new Map();

export function registerMethod(target: object, methodName: string, role: ProviderRole): void {
    if (!registry.has(target)) {
        registry.set(target, new Map());
    }
    registry.get(target)!.set(methodName, role);
}

function resolveMethodsMap(instance: object): Map<string, ProviderRole> | undefined {
    const merged = new Map<string, ProviderRole>();
    let current: object | null = instance;
    while (current && current !== Object.prototype) {
        const methods = registry.get(current);
        if (methods) {
            for (const [name, role] of methods) {
                if (!merged.has(name)) merged.set(name, role);
            }
        }
        current = Object.getPrototypeOf(current);
    }
    return merged.size > 0 ? merged : undefined;
}

export function hasMethod(instance: object, role: ProviderRole): boolean {
    const methods = resolveMethodsMap(instance);
    if (!methods) return false;
    for (const r of methods.values()) {
        if (r === role) return true;
    }
    return false;
}

export function getMethodForRole(instance: object, role: ProviderRole): string | undefined {
    const methods = resolveMethodsMap(instance);
    if (!methods) return undefined;
    for (const [name, r] of methods.entries()) {
        if (r === role) return name;
    }
    return undefined;
}

export function getRegisteredRoles(instance: object): ProviderRole[] {
    const methods = resolveMethodsMap(instance);
    if (!methods) return [];
    return Array.from(new Set(methods.values()));
}
