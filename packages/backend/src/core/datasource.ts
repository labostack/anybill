/**
 * @module core/datasource
 *
 * TypeORM DataSource configuration for AnyBill.
 *
 * Uses `better-sqlite3` for a zero-config, single-file database.
 * In production, set `DB_PATH` to persist data outside the project tree.
 *
 * @remarks
 * `synchronize: true` auto-creates/updates tables on startup — suitable for
 * self-hosted deployments. For high-traffic or multi-instance setups,
 * consider switching to PostgreSQL and using migrations instead.
 */

import { DataSource } from "typeorm";
import { Account } from "../entities/Account";
import { Subscription } from "../entities/Subscription";
import { Subscriber } from "../entities/Subscriber";
import { Invoice } from "../entities/Invoice";
import { ApiKey } from "../entities/ApiKey";
import { WebhookEndpoint } from "../entities/WebhookEndpoint";
import { WebhookDelivery } from "../entities/WebhookDelivery";

/** Shared TypeORM DataSource instance. */
export const AppDataSource = new DataSource({
    type: "better-sqlite3",
    database: process.env.DB_PATH || "./data/anybill.db",
    entities: [Account, Subscription, Subscriber, Invoice, ApiKey, WebhookEndpoint, WebhookDelivery],
    synchronize: true,
    logging: process.env.VERBOSE_LOGS === "true",
});
