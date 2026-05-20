<p align="center">
  <strong>anybill</strong>
</p>

<p align="center">
  Lightweight, self-hosted, provider-agnostic billing platform.<br>
  Connect any payment provider through a simple plugin system.
</p>

<p align="center">
  <a href="https://github.com/dortanes/anybill/actions/workflows/ci.yml"><img src="https://github.com/dortanes/anybill/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@anybill/sdk"><img src="https://img.shields.io/npm/v/@anybill/sdk.svg" alt="npm"></a>
  <a href="https://github.com/dortanes/anybill/blob/main/LICENSE"><img src="https://img.shields.io/github/license/dortanes/anybill" alt="License"></a>
  <a href="https://ghcr.io/dortanes/anybill"><img src="https://img.shields.io/badge/ghcr.io-anybill-blue" alt="Docker"></a>
</p>

---

## Features

- **Headless** — API-first, no frontend lock-in
- **Provider-agnostic** — Stripe, crypto, anything — just drop a plugin file
- **Self-contained** — single container, SQLite, zero external dependencies
- **Outgoing webhooks** — HMAC-signed events with exponential backoff retries
- **SDK** — zero-dep TypeScript client for your backend

## Quick Start

> The recommended way to run AnyBill is via Docker Compose.

**1. Create a project directory**

```bash
mkdir anybill && cd anybill
```

**2. Create `docker-compose.yml`**

```yaml
services:
  anybill:
    image: ghcr.io/dortanes/anybill:latest
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - PROVIDERS=/providers
    volumes:
      - anybill-data:/data
      - ./providers:/providers:ro

volumes:
  anybill-data:
```

**3. Create `.env`**

```bash
# Required — generate with: openssl rand -hex 32
JWT_SECRET=your-secret-here
```

**4. Start**

```bash
docker compose up -d
```

| Path | Description |
| --- | --- |
| `http://localhost:3000/admin` | Admin dashboard |
| `http://localhost:3000/pay/s/:token` | Secure checkout page |
| `http://localhost:3000/api/...` | API endpoints |

On first visit to `/admin`, you'll be prompted to create an account and receive your initial API key.

## Configuration

All configuration is via environment variables.

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_SECRET` | — | **Required.** JWT signing key |
| `DB_PATH` | `/data/anybill.db` | SQLite database file path |
| `PROVIDERS` | — | Path to provider plugins directory |
| `CHECKOUT_ORIGIN` | `http://localhost:3002` | Checkout domain (used in payment links and CORS) |
| `ADMIN_ORIGIN` | `http://localhost:3001` | Admin domain (CORS) |
| `JWT_EXPIRY` | `7d` | Admin session lifetime |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost factor |

<details>
<summary>Outgoing webhook settings</summary>

| Variable | Default | Description |
| --- | --- | --- |
| `WEBHOOK_MAX_RETRIES` | `5` | Max delivery attempts |
| `WEBHOOK_RETRY_DELAYS_MS` | `10000,60000,...` | Comma-separated retry delays |
| `WEBHOOK_RETRY_POLL_MS` | `15000` | Retry worker poll interval |
| `WEBHOOK_RETRY_BATCH` | `20` | Max retries per cycle |
| `WEBHOOK_TIMEOUT_MS` | `10000` | HTTP timeout per delivery |
| `WEBHOOK_MAX_BODY_LEN` | `2048` | Max response body to store |

</details>

## Creating a Provider

Providers are `.ts` or `.js` files in the `providers/` directory. AnyBill auto-discovers them on startup.

`@anybill/sdk` is **automatically injected** by the engine — no `npm install` needed. Just create your provider file and go:

```
providers/
├── tsconfig.json      # { "compilerOptions": { "experimentalDecorators": true } }
├── stripe.ts          # Provider implementation
└── cloudpayments.ts   # Another provider
```

### Provider Implementation

```typescript
import {
  AnybillProvider,
  ProviderCapability,
  CreatePaymentLink,
  ValidateWebhook,
  IncomingWebhook,
  PaymentLink,
  Payment,
} from "@anybill/sdk";

class StripeProvider extends AnybillProvider {
  get displayName() { return "Stripe"; }
  get capabilities(): ProviderCapability[] { return ["one_time", "recurring"]; }

  @CreatePaymentLink()
  async createLink(ctx) {
    const session = await stripe.checkout.sessions.create({ ... });
    return PaymentLink.url(session.url).id(session.id);
  }

  @ValidateWebhook()
  verify(ctx) {
    return stripe.webhooks.constructEvent(
      ctx.body, ctx.headers["stripe-signature"], secret
    );
  }

  @IncomingWebhook()
  async webhook(ctx) {
    const event = JSON.parse(ctx.body);
    if (event.type === "checkout.session.completed") {
      return Payment.id(event.data.object.id).confirm();
    }
    return Payment.ignore();
  }
}

export default { name: "stripe", provider: new StripeProvider() };
```

### Decorators

| Decorator | Purpose |
| --- | --- |
| `@CreatePaymentLink()` | Generate a payment URL |
| `@ValidateWebhook()` | Verify incoming webhook signature |
| `@IncomingWebhook()` | Process webhook payload |
| `@RefundPayment()` | Issue a refund |
| `@CancelPayment()` | Cancel a pending payment |

> See [`example/`](example/) for a complete working setup.

## SDK

```bash
npm install @anybill/sdk
```

```typescript
import { AnybillSDK } from "@anybill/sdk";

const client = new AnybillSDK({
  baseUrl: "https://billing.example.com",
  apiKey: "ak_...",
});

// Check if a user has an active subscription
const subscribers = await client.getSubscriberByUid("user_123");
const isActive = subscribers.some((s) => s.status === "active");

// Create a secure checkout link
const link = await client.createCheckoutLink("plan_uuid", "user_123");
// Redirect user to link.url
```

See the full SDK docs in [`packages/sdk/README.md`](packages/sdk/README.md).

## Outgoing Webhooks

AnyBill dispatches HMAC-SHA256 signed events to your endpoints:

| Event | Trigger |
| --- | --- |
| `payment.confirmed` | Payment completed successfully |
| `payment.failed` | Payment attempt failed |
| `payment.refunded` | Payment refunded |
| `payment.cancelled` | Payment cancelled |
| `subscription.renewed` | Recurring subscription renewed |
| `subscription.expired` | Subscription period ended |

Each delivery includes:

| Header | Description |
| --- | --- |
| `X-Anybill-Signature` | HMAC-SHA256 signature |
| `X-Anybill-Timestamp` | Unix timestamp (for replay protection) |
| `X-Anybill-Event` | Event type |
| `X-Anybill-Delivery-Id` | Unique delivery ID |

Failed deliveries are retried with exponential backoff (10s → 1m → 5m → 30m → 1h).

## API Overview

<details>
<summary>Admin API — <code>/api/admin</code> (JWT-protected)</summary>

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/setup` | Initial account registration |
| `POST` | `/auth/login` | Login (returns JWT cookie) |
| `POST` | `/auth/logout` | Logout (clears cookie) |
| `GET` | `/auth/status` | Check initialization state |
| `GET/POST/PUT/DELETE` | `/subscriptions[/:id]` | CRUD subscription plans |
| `GET/PUT` | `/subscribers[/:id]` | List/update subscribers |
| `POST` | `/subscribers/:id/cancel` | Cancel a subscription |
| `POST` | `/subscribers/:id/refund` | Refund a subscriber |
| `GET` | `/invoices` | List invoices (filterable) |
| `GET` | `/dashboard/stats` | Revenue and subscriber analytics |
| `GET/PUT` | `/settings` | Account settings |
| `PUT` | `/settings/password` | Change password |
| `PUT` | `/settings/checkout` | Checkout page config |
| `GET` | `/settings/providers` | List loaded providers |
| `GET/POST/DELETE` | `/api-keys[/:id]` | Manage API keys |
| `POST` | `/api-keys/:id/rename` | Rename an API key |
| `GET/POST/PUT/DELETE` | `/webhooks[/:id]` | Manage webhook endpoints |
| `POST` | `/webhooks/:id/rotate-secret` | Rotate signing secret |
| `POST` | `/webhooks/:id/test` | Send test event |
| `GET` | `/webhooks/deliveries` | Delivery log |

</details>

<details>
<summary>Checkout API — <code>/api/checkout</code> (public)</summary>

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/resolve/:token` | Verify token, return checkout info |
| `POST` | `/pay` | Initiate payment (requires token) |
| `GET` | `/confirm/:invoiceId` | Poll payment status |

</details>

<details>
<summary>Webhook API — <code>/api/webhook</code> (provider callbacks)</summary>

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/:provider` | Incoming provider webhook |

</details>

<details>
<summary>SDK API — <code>/api/sdk</code> (API key-protected)</summary>

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/subscriptions` | List active plans |
| `GET` | `/subscribers[?uid=]` | Find subscribers |
| `GET` | `/subscribers/:id` | Get subscriber by ID |
| `GET` | `/invoices/:id` | Get invoice by ID |
| `POST` | `/checkout-links` | Create a secure checkout link |

</details>

## Architecture

```
anybill/
├── packages/
│   ├── backend/     Ts.ED + TypeORM + SQLite
│   ├── admin/       Solid.js admin dashboard
│   ├── checkout/    Solid.js checkout SPA
│   └── sdk/         TypeScript SDK (@anybill/sdk)
├── example/         Reference deployment with Stripe provider
├── Dockerfile       Multi-stage production build
├── Caddyfile        Reverse proxy (single-port in Docker)
└── turbo.json       Turborepo pipeline
```

## Development

```bash
git clone https://github.com/dortanes/anybill.git
cd anybill
pnpm install

cp .env.example .env
# Set JWT_SECRET: openssl rand -hex 32

pnpm dev
```

| Service | URL |
| --- | --- |
| Backend | http://localhost:3000 |
| Admin | http://localhost:3001 |
| Checkout | http://localhost:3002 |

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## License

[MIT](LICENSE)
