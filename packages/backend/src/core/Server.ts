/**
 * @module core/Server
 *
 * Ts.ED server configuration and lifecycle management.
 *
 * Mounts all API controllers under their respective path prefixes:
 * - `/api/admin`    — Admin dashboard endpoints (JWT-protected)
 * - `/api/checkout` — Public checkout flow endpoints
 * - `/api/webhook`  — Incoming provider webhooks
 * - `/api/sdk`      — SDK/API endpoints (API key-protected)
 * - `/health`       — Container health check
 *
 * In production, also serves the admin and checkout SPA bundles
 * as static files from `/admin` and `/` respectively.
 *
 * CORS is configured to allow requests from the admin and checkout
 * frontend origins (configurable via environment variables).
 */

import { Configuration, Inject } from "@tsed/di";
import { PlatformApplication } from "@tsed/common";
import { Logger } from "@tsed/logger";
import "@tsed/platform-express";
import "@tsed/swagger";
import "@tsed/ajv";
import cors from "cors";
import helmet from "helmet";
import express from "express";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { AppDataSource } from "./datasource";

// ─── Exception Filters (auto-registered by Ts.ED DI) ───────────────
import "./filters/HttpExceptionFilter";
import "./filters/GlobalErrorFilter";

const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));

// ─── Admin Controllers ──────────────────────────────────────────────
import { AuthController } from "../controllers/admin/AuthController";
import { SubscriptionsController } from "../controllers/admin/SubscriptionsController";
import { SubscribersController } from "../controllers/admin/SubscribersController";
import { InvoicesController } from "../controllers/admin/InvoicesController";
import { DashboardController } from "../controllers/admin/DashboardController";
import { SettingsController } from "../controllers/admin/SettingsController";
import { ApiKeysController } from "../controllers/admin/ApiKeysController";
import { WebhooksController } from "../controllers/admin/WebhooksController";
import { CheckoutLinksController } from "../controllers/admin/CheckoutLinksController";
import { CouponsController } from "../controllers/admin/CouponsController";

// ─── Checkout Controllers ───────────────────────────────────────────
import { CheckoutController } from "../controllers/checkout/CheckoutController";

// ─── Portal Controllers ─────────────────────────────────────────────
import { PortalController } from "../controllers/portal/PortalController";

// ─── Webhook Controllers ────────────────────────────────────────────
import { WebhookController } from "../controllers/webhook/WebhookController";

// ─── SDK Controllers ────────────────────────────────────────────────
import { SdkController } from "../controllers/sdk/SdkController";
import { SquadController } from "../controllers/sdk/SquadController";
import { SdkEventsController } from "../controllers/sdk/SdkEventsController";

// ─── Health ─────────────────────────────────────────────────────────
import { HealthController } from "../controllers/HealthController";

// ─── Background Workers (side-effect imports for DI registration) ───
import "../services/InvoiceExpirationWorker";



@Configuration({
    port: Number(process.env.PORT) || 3000,
    acceptMimes: ["application/json", "text/event-stream"],
    mount: {
        "/api/admin": [
            AuthController,
            SubscriptionsController,
            SubscribersController,
            InvoicesController,
            DashboardController,
            SettingsController,
            ApiKeysController,
            WebhooksController,
            CheckoutLinksController,
            CouponsController,
        ],
        "/api/checkout": [CheckoutController],
        "/api/portal": [PortalController],
        "/api/webhook": [WebhookController],
        "/api/sdk": [SdkController, SquadController, SdkEventsController],
        "/": [HealthController],
    },
    swagger: [
        {
            path: "/api/docs",
            specVersion: "3.0.3",
            spec: {
                info: {
                    title: "AnyBill API",
                    version: pkg.version,
                    description:
                        "Headless, provider-agnostic billing platform. " +
                        "Self-hosted, API-first, zero vendor lock-in.",
                    license: { name: "MIT", url: "https://github.com/dortanes/anybill/blob/main/LICENSE" },
                },
                components: {
                    securitySchemes: {
                        cookieAuth: {
                            type: "apiKey",
                            in: "cookie",
                            name: "anybill_session",
                            description: "JWT session cookie (set by POST /api/admin/auth/login)",
                        },
                        apiKeyAuth: {
                            type: "apiKey",
                            in: "header",
                            name: "X-Api-Key",
                            description: "API key from the admin dashboard (Settings → API Keys)",
                        },
                    },
                },
            },
        },
    ],
    middlewares: [
        helmet({
            contentSecurityPolicy: false, // SPAs manage their own CSP.
            crossOriginEmbedderPolicy: false,
        }),
        cors({
            origin: [
                process.env.ADMIN_ORIGIN || "http://localhost:3001",
                process.env.CHECKOUT_ORIGIN || "http://localhost:3002",
            ],
            credentials: true,
        }),
        express.json({
            verify: (req: any, _res, buf) => {
                // Preserve the raw request body (as Buffer) for webhook signature verification.
                // Providers need the original bytes — once parsed to an object, HMAC can't be recomputed.
                req.rawBody = buf;
            },
        }),
        express.text({ type: "text/plain" }),
        express.urlencoded({ extended: true }),
    ],
    logger: {
        level: (process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug")) as "debug" | "info" | "warn" | "error" | "off",
        disableRoutesSummary: process.env.NODE_ENV === "production",
        logRequest: true,
        requestFields: ["reqId", "method", "url", "duration"],
    },
})
export class Server {
    @Inject()
    app!: PlatformApplication;

    @Inject()
    logger!: Logger;

    /**
     * Create the database directory before TypeORM initializes.
     * Runs before the Ts.ED IoC container is built.
     */
    async $beforeInit(): Promise<void> {
        mkdirSync(process.env.DB_DIR || "./data", { recursive: true });
    }

    /**
     * Initialize the TypeORM DataSource after the server is configured.
     */
    async $afterInit(): Promise<void> {
        await AppDataSource.initialize();
        this.logger.info("Database connected");
    }

    /**
     * Gracefully close the database connection on shutdown.
     */
    async $onDestroy(): Promise<void> {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    }
}
