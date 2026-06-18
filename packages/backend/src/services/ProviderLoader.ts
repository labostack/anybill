/**
 * @module services/ProviderLoader
 *
 * Auto-discovery service for payment provider plugins.
 *
 * Scans the directory specified by the `PROVIDERS` environment variable
 * for `.ts`/`.js` files and loads each at runtime.
 * Every file must default-export `{ name: string; provider: AnybillProvider }`.
 *
 * TypeScript files are transparently transpiled via esbuild before loading,
 * so providers can be authored in `.ts` without any pre-compilation step.
 *
 * `@anybill/sdk` is automatically injected at load time — providers do NOT
 * need to install the SDK in their own `node_modules/`.
 *
 * If `PROVIDERS` is not set, the platform starts with zero providers.
 */

import { Injectable, Inject } from "@tsed/di";
import { Logger } from "@tsed/logger";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import Module from "module";
import type { AnybillProvider } from "../billing/AnybillProvider";
import * as billingExports from "../billing/index";

// ─── SDK Module ID ──────────────────────────────────────────────────

const SDK_MODULE_ID = "@anybill/sdk";

// ─── SDK Injection Hook ─────────────────────────────────────────────

/**
 * Install a temporary `require()` hook that intercepts `@anybill/sdk`
 * and returns the backend's own billing exports instead of looking for
 * the package in the provider's `node_modules/`.
 *
 * This means provider authors can write:
 *   `import { AnybillProvider, CreatePaymentLink, ... } from "@anybill/sdk"`
 * without installing anything — the engine provides everything.
 *
 * The hook is scoped: call the returned `unhook()` function to restore
 * the original behaviour after loading is complete.
 *
 * If the provider has its own `node_modules/@anybill/sdk` installed,
 * the hook takes precedence (same version, guaranteed compatible).
 *
 * @returns A cleanup function that removes the hook.
 */
function installSdkHook(): () => void {
    const originalResolve = (Module as any)._resolveFilename;

    (Module as any)._resolveFilename = function (
        request: string,
        parent: any,
        isMain: boolean,
        options: any,
    ) {
        if (request === SDK_MODULE_ID) {
            return SDK_MODULE_ID;
        }
        return originalResolve.call(this, request, parent, isMain, options);
    };

    // Pre-populate require.cache with backend's billing exports
    const cachedModule = new Module(SDK_MODULE_ID, module);
    cachedModule.filename = SDK_MODULE_ID;
    (cachedModule as any).loaded = true;
    cachedModule.exports = billingExports;
    require.cache[SDK_MODULE_ID] = cachedModule;

    return () => {
        (Module as any)._resolveFilename = originalResolve;
        delete require.cache[SDK_MODULE_ID];
    };
}

// ─── Transpilation ──────────────────────────────────────────────────

/**
 * Transpile a TypeScript source string to CommonJS JavaScript using esbuild.
 *
 * Uses `esbuild.transformSync` which only strips types and converts syntax —
 * it does NOT bundle or resolve imports. Module resolution is handled by
 * Node's own `require()` when the code is evaluated via `Module._compile`.
 */
function transpileTs(source: string, filename: string): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { transformSync } = require("esbuild") as typeof import("esbuild");

    const result = transformSync(source, {
        loader: "ts",
        format: "cjs",
        target: "node20",
        sourcefile: filename,
        tsconfigRaw: JSON.stringify({
            compilerOptions: {
                experimentalDecorators: true,
                emitDecoratorMetadata: false,
            },
        }),
    });

    return result.code;
}

// ─── .ts Require Extension ──────────────────────────────────────────

/**
 * Install a temporary Node `require()` extension for `.ts` files.
 *
 * When a provider file does `require('./lib/freekassa-base')`, Node
 * normally cannot resolve `.ts` files. This hook registers a
 * `require.extensions['.ts']` handler that transpiles the TypeScript
 * source on-the-fly via esbuild, exactly like the top-level provider
 * files.
 *
 * @returns A cleanup function that restores the original `.ts` handler.
 */
function installTsExtension(): () => void {
    // Use Module._extensions directly — it's the same object as the
    // deprecated `require.extensions` but without the TS deprecation warning.
    const extensions = (Module as any)._extensions as Record<string, Function>;
    const originalHandler = extensions[".ts"];

    extensions[".ts"] = (m: any, filename: string) => {
        const source = readFileSync(filename, "utf-8");
        const js = transpileTs(source, filename);
        m._compile(js, filename);
    };

    return () => {
        if (originalHandler) {
            extensions[".ts"] = originalHandler;
        } else {
            delete extensions[".ts"];
        }
    };
}

// ─── Service ────────────────────────────────────────────────────────

@Injectable()
export class ProviderLoader {
    private readonly providers = new Map<string, AnybillProvider>();
    private loaded = false;

    @Inject()
    logger!: Logger;

    async load(): Promise<Map<string, AnybillProvider>> {
        if (this.loaded) return this.providers;

        const dir = process.env.PROVIDERS;
        if (!dir) {
            this.loaded = true;
            return this.providers;
        }

        const resolved = resolve(dir);
        if (!existsSync(resolved)) {
            this.logger.warn(`Providers directory not found: ${resolved}`);
            this.loaded = true;
            return this.providers;
        }

        const files = readdirSync(resolved).filter(
            (f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"),
        );

        // Install hooks:
        // 1. SDK hook — providers can `import ... from "@anybill/sdk"`
        //    without having the package in their own node_modules.
        // 2. TS extension — providers can import other `.ts` files
        //    within the providers directory (e.g. `./lib/freekassa-base`).
        const unhookSdk = installSdkHook();
        const unhookTs = installTsExtension();

        try {
            for (const file of files) {
                try {
                    const fullPath = join(resolved, file);

                    // Clear cached version to pick up changes on reload.
                    try { delete require.cache[require.resolve(fullPath)]; } catch { /* not cached */ }
                    const mod = require(fullPath);

                    const exported = mod.default ?? mod;

                    if (!exported.name || !exported.provider) {
                        this.logger.warn(`Skipping ${file}: missing 'name' or 'provider' export`);
                        continue;
                    }

                    this.providers.set(exported.name, exported.provider);
                    this.logger.info(`Loaded provider: ${exported.name} (${file})`);
                } catch (err) {
                    this.logger.error(`Failed to load provider ${file}:`, err);
                }
            }
        } finally {
            unhookTs();
            unhookSdk();
        }

        this.loaded = true;
        return this.providers;
    }

    getProviders(): Map<string, AnybillProvider> {
        return this.providers;
    }

    getProviderNames(): string[] {
        return Array.from(this.providers.keys());
    }
}
