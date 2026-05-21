import { onCleanup } from "solid-js";

/**
 * Returns a debounced version of `fn` that delays execution by `ms` milliseconds.
 * Previous pending calls are cancelled when a new call arrives.
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 400): T {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounced = (...args: Parameters<T>) => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => { fn(...args); timer = undefined; }, ms);
    };
    onCleanup(() => { if (timer !== undefined) clearTimeout(timer); });
    return debounced as T;
}
