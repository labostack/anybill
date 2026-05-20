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
 * If `PROVIDERS` is not set, the platform starts with zero providers.
 */

import { Injectable, Inject } from "@tsed/di";
import { Logger } from "@tsed/logger";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import Module from "module";
import type { AnybillProvider } from "../billing/AnybillProvider";

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

/**
 * Load a `.ts` file by transpiling it on-the-fly and evaluating
 * the resulting JS in the context of the original file's directory.
 *
 * This preserves Node module resolution — `require("@anybill/sdk")`
 * inside the provider will resolve from the provider directory's
 * own `node_modules/`, exactly as the user expects.
 */
function requireTs(filePath: string): any {
    const source = readFileSync(filePath, "utf-8");
    const js = transpileTs(source, filePath);

    const m = new Module(filePath, module);
    m.filename = filePath;
    (m as any).paths = (Module as any)._nodeModulePaths(dirname(filePath));
    (m as any)._compile(js, filePath);

    return m.exports;
}

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

        for (const file of files) {
            try {
                const fullPath = join(resolved, file);

                let mod: any;
                if (file.endsWith(".ts")) {
                    mod = requireTs(fullPath);
                } else {
                    delete require.cache[require.resolve(fullPath)];
                    mod = require(fullPath);
                }

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
