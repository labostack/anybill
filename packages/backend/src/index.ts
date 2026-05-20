/**
 * @module backend
 *
 * AnyBill backend entrypoint.
 *
 * Bootstraps the Ts.ED platform on Express and starts listening.
 * All configuration is in {@link Server} and environment variables.
 */

if (process.env.NODE_ENV !== "production") {
    try {
        require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });
    } catch {
        // dotenv is optional in production
    }
}

import { PlatformExpress } from "@tsed/platform-express";
import { $log } from "@tsed/common";
import { Server } from "./core/Server";

/**
 * Bootstrap and start the AnyBill backend server.
 */
async function main(): Promise<void> {
    const platform = await PlatformExpress.bootstrap(Server);
    await platform.listen();

    $log.info("Server ready");
}

main().catch((err) => { $log.error("Startup failed", err); process.exit(1); });
