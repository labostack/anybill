<p align="center">
  <h1 align="center">anybill</h1>
</p>

<p align="center">
  <strong>Self-hosted, provider-agnostic billing platform.</strong><br/>
  <span>Connect any payment provider through a decorator-based SDK. One container, zero dependencies.</span>
</p>

<p align="center">
  <a href="https://github.com/labostack/anybill/actions/workflows/ci.yml"><img src="https://github.com/labostack/anybill/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@anybill/sdk"><img src="https://img.shields.io/npm/v/@anybill/sdk.svg" alt="npm"></a>
  <a href="https://github.com/labostack/anybill/blob/main/LICENSE"><img src="https://img.shields.io/github/license/labostack/anybill" alt="License"></a>
  <a href="https://ghcr.io/labostack/anybill"><img src="https://img.shields.io/badge/ghcr.io-anybill-blue" alt="Docker"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#creating-a-provider">Providers</a> &bull;
  <a href="#sdk">SDK</a> &bull;
  <a href="#api-reference">API</a> &bull;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## What is AnyBill?

AnyBill is a headless billing platform you deploy on your own infrastructure. It handles subscription management, payment processing, and subscriber lifecycle — while staying completely independent from any specific payment provider.

Payment providers are connected through the `@anybill/sdk` — you extend a base class, add a few decorators, and drop the file into a `providers/` directory. AnyBill discovers it on startup. No forks, no config files, no rebuilds.

- **Headless** — API-first. Bring your own frontend, or use the included admin dashboard and checkout UI.
- **Provider-agnostic** — connect any payment gateway through the SDK's decorator-based provider system.
- **Self-contained** — ships as a single Docker container with SQLite. No Redis, no Postgres, no external services.
- **Group subscriptions** — built-in Squads: an owner pays, members get access. Auto-created on purchase of squad-enabled plans.
- **Squad invite flow** — owners invite users by UID; invitees accept or decline via SDK. Configurable TTL, auto-expiry, full webhook coverage.
- **Outgoing webhooks** — HMAC-SHA256 signed events dispatched to your endpoints with exponential backoff retries.
- **Client portal** — encrypted-token-based subscriber self-service: cancel, renew, change plan.
- **Coupons & promo codes** — percentage or fixed-amount discounts with per-user limits, plan restrictions, and expiration.
- **Trial periods** — free trial days configurable per subscription plan, with seamless SDK-driven activation.
- **Real-time events** — SSE-based event streaming through the SDK with typed payloads, auto-reconnect, and `Last-Event-ID` replay.

## Quick Start

```bash
mkdir anybill && cd anybill

# Generate required secrets
cat > .env << EOF
JWT_SECRET=$(openssl rand -hex 32)
LINK_SECRET=$(openssl rand -hex 32)
EOF

# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  anybill:
    image: ghcr.io/labostack/anybill:latest
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - LINK_SECRET=${LINK_SECRET}
      - PROVIDERS=/providers
    volumes:
      - anybill-data:/data
      - ./providers:/providers:ro

volumes:
  anybill-data:
EOF

docker compose up -d
```

Open `http://localhost:3000/admin` to create your account.

| Path             | Description                             |
| ---------------- | --------------------------------------- |
| `/admin`         | Admin dashboard                         |
| `/pay/s/:token`  | Checkout page                           |
| `/portal/:token` | Subscriber self-service portal          |
| `/api/docs`      | Interactive API documentation (Swagger) |

## Creating a Provider

Providers are TypeScript or JavaScript files that AnyBill auto-discovers from the `providers/` directory. Each provider extends `AnybillProvider` from `@anybill/sdk` and uses decorators to define payment lifecycle methods.

```
providers/
├── tsconfig.json        # { "compilerOptions": { "experimentalDecorators": true } }
├── stripe.ts
└── cloudpayments.ts
```

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

class MyProvider extends AnybillProvider {
  get displayName() {
    return "My Gateway";
  }
  get capabilities(): ProviderCapability[] {
    return ["one_time", "recurring"];
  }

  @CreatePaymentLink()
  async createLink(ctx) {
    const session = await gateway.createSession({ amount: ctx.plan.amount });
    return PaymentLink.url(session.url).id(session.id);
  }

  @ValidateWebhook()
  verify(ctx) {
    return verifySignature(ctx.body, ctx.headers["x-signature"], secret);
  }

  @IncomingWebhook()
  async webhook(ctx) {
    const event = JSON.parse(ctx.body);
    if (event.status === "paid") {
      return Payment.id(event.id).confirm();
    }
    return Payment.ignore();
  }
}

export default { name: "my-gateway", provider: new MyProvider() };
```

| Decorator              | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `@CreatePaymentLink()` | Generate a payment URL for the subscriber               |
| `@ValidateWebhook()`   | Verify the authenticity of an incoming webhook          |
| `@IncomingWebhook()`   | Process the webhook payload and return a payment action |
| `@RefundPayment()`     | Issue a refund through the provider                     |
| `@CancelPayment()`     | Cancel a pending payment                                |

See [`example/`](example/) for a complete reference setup.

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

// Check if a user has access (direct subscription or squad membership)
const access = await client.checkAccess("user_123");

// Generate a checkout link
const { url } = await client.createCheckoutLink("plan_id", "user_123");

// Generate a self-service portal link
const portal = await client.createPortalLink("user_123");

// Manage squad members
await client.squads.addMember("squad_id", "friend_uid");
const members = await client.squads.getMembers("squad_id");

// Squad invite flow
await client.squads.invites.create("squad_id", "friend_uid"); // owner invites
const inbox = await client.squads.invites.incoming("friend_uid", "pending"); // friend's inbox
await client.squads.invites.accept("squad_id", inbox[0].id, "friend_uid"); // friend accepts

// Real-time event streaming (SSE)
const stream = client.events.subscribe([
  "payment.confirmed",
  "subscription.renewed",
]);

stream.on("payment.confirmed", (data) => {
  console.log(`Paid: ${data.invoiceId}, ${data.amount} ${data.currency}`);
});

stream.on("subscription.renewed", (data) => {
  console.log(`Renewed until ${data.currentPeriodEnd}`);
});

// When done:
stream.close();
```

Full SDK reference: [`packages/sdk/README.md`](packages/sdk/README.md)

## Outgoing Webhooks

AnyBill dispatches signed events to your configured endpoints. Each delivery includes HMAC-SHA256 signature, timestamp (replay protection), event type, and a unique delivery ID in the headers.

Failed deliveries are retried with exponential backoff (10s → 1m → 5m → 30m → 1h).

| Event                    | Trigger                              |
| ------------------------ | ------------------------------------ |
| `payment.confirmed`      | Payment completed                    |
| `payment.failed`         | Payment failed                       |
| `payment.refunded`       | Payment refunded                     |
| `payment.cancelled`      | Payment cancelled                    |
| `subscription.renewed`   | Recurring subscription renewed       |
| `subscription.expired`   | Billing period ended without renewal |
| `subscription.cancelled` | Subscription cancelled               |
| `squad.created`          | Squad created on plan purchase       |
| `squad.dissolved`        | Squad dissolved                      |
| `squad.member_added`     | Member added to squad                |
| `squad.member_removed`   | Member removed from squad            |
| `squad.invite_created`   | Owner sent an invite                 |
| `squad.invite_accepted`  | Invitee accepted an invite           |
| `squad.invite_declined`  | Invitee declined an invite           |
| `squad.invite_cancelled` | Owner cancelled an invite            |
| `coupon.redeemed`        | Coupon applied to a paid invoice     |
| `trial.started`          | Free trial activated                 |
| `trial.expired`          | Free trial period ended              |

All events are also available as a real-time SSE stream — see [Event Streaming](#event-streaming).

## Event Streaming

The SDK provides real-time event streaming via Server-Sent Events (SSE). Events are delivered as they occur, with fully typed payloads.

```typescript
import { AnybillSDK } from "@anybill/sdk";
import type { PaymentConfirmedEvent } from "@anybill/sdk";

const client = new AnybillSDK({ baseUrl: "...", apiKey: "ak_..." });

// Subscribe to specific events
const stream = client.events.subscribe([
  "payment.confirmed",
  "subscription.cancelled",
]);

// Type-safe handlers — IDE autocompletes payload fields
stream.on("payment.confirmed", (data) => {
  // data: PaymentConfirmedEvent
  console.log(data.invoiceId, data.amount, data.currency);
});

stream.on("subscription.cancelled", (data) => {
  // data: SubscriptionCancelledEvent
  console.log(`${data.uid} cancelled via ${data.cancelledVia}`);
});

// Subscribe to all events
const allStream = client.events.subscribe();

// Lifecycle
stream.on("connected", () => console.log("SSE connected"));
stream.on("error", (err) => console.error("SSE error:", err));

// Clean up
stream.close();
```

## Configuration

All configuration is via environment variables.

| Variable          | Default                 | Description                                                |
| ----------------- | ----------------------- | ---------------------------------------------------------- |
| `JWT_SECRET`      | —                       | **Required.** JWT signing key                              |
| `LINK_SECRET`     | —                       | **Required.** Encryption key for checkout and portal links |
| `DB_PATH`         | `/data/anybill.db`      | SQLite database path                                       |
| `PROVIDERS`       | —                       | Path to provider plugins directory                         |
| `CHECKOUT_ORIGIN` | `http://localhost:3002` | Checkout domain (CORS and payment links)                   |
| `ADMIN_ORIGIN`    | `http://localhost:3001` | Admin domain (CORS)                                        |
| `JWT_EXPIRY`      | `7d`                    | Admin session lifetime                                     |
| `BCRYPT_ROUNDS`   | `12`                    | Password hashing cost factor                               |

<details>
<summary>Webhook settings</summary>

| Variable                  | Default           | Description                    |
| ------------------------- | ----------------- | ------------------------------ |
| `WEBHOOK_MAX_RETRIES`     | `5`               | Maximum delivery attempts      |
| `WEBHOOK_RETRY_DELAYS_MS` | `10000,60000,...` | Comma-separated retry delays   |
| `WEBHOOK_RETRY_POLL_MS`   | `15000`           | Retry worker poll interval     |
| `WEBHOOK_RETRY_BATCH`     | `20`              | Maximum retries per cycle      |
| `WEBHOOK_TIMEOUT_MS`      | `10000`           | HTTP timeout per delivery      |
| `WEBHOOK_MAX_BODY_LEN`    | `2048`            | Maximum response body to store |

</details>

## API Reference

Interactive documentation is available at `/api/docs` when the server is running.

<details>
<summary>Admin API — <code>/api/admin</code></summary>

JWT-protected. Manages plans, subscribers, invoices, settings, API keys, and webhook endpoints.

| Method                | Path                          | Description              |
| --------------------- | ----------------------------- | ------------------------ |
| `POST`                | `/auth/setup`                 | Initial account creation |
| `POST`                | `/auth/login`                 | Login                    |
| `POST`                | `/auth/logout`                | Logout                   |
| `GET`                 | `/auth/status`                | Check if account exists  |
| `GET/POST/PUT/DELETE` | `/subscriptions[/:id]`        | Subscription plans       |
| `GET/PUT`             | `/subscribers[/:id]`          | Subscribers              |
| `POST`                | `/subscribers/:id/cancel`     | Cancel subscription      |
| `POST`                | `/subscribers/:id/refund`     | Refund subscriber        |
| `GET`                 | `/invoices`                   | Invoices                 |
| `GET`                 | `/dashboard/stats`            | Revenue analytics        |
| `GET/PUT`             | `/settings`                   | Account settings         |
| `PUT`                 | `/settings/password`          | Change password          |
| `PUT`                 | `/settings/checkout`          | Checkout customization   |
| `GET`                 | `/settings/providers`         | Loaded providers         |
| `GET/POST/DELETE`     | `/api-keys[/:id]`             | API keys                 |
| `POST`                | `/api-keys/:id/rename`        | Rename API key           |
| `GET/POST/PUT/DELETE` | `/webhooks[/:id]`             | Webhook endpoints        |
| `POST`                | `/webhooks/:id/rotate-secret` | Rotate signing secret    |
| `POST`                | `/webhooks/:id/test`          | Send test event          |
| `GET`                 | `/webhooks/deliveries`        | Delivery log             |
| `POST`                | `/checkout-links`             | Generate checkout link   |
| `POST`                | `/portal-links`               | Generate portal link     |
| `GET/POST/PUT/DELETE` | `/coupons[/:id]`              | Coupon management        |

</details>

<details>
<summary>SDK API — <code>/api/sdk</code></summary>

API key-protected. Used by client applications via the TypeScript SDK.

| Method   | Path                              | Description                    |
| -------- | --------------------------------- | ------------------------------ |
| `GET`    | `/subscriptions`                  | List active plans              |
| `GET`    | `/subscribers[?uid=]`             | Find subscribers               |
| `GET`    | `/subscribers/:id`                | Get subscriber by ID           |
| `GET`    | `/invoices/:id`                   | Get invoice by ID              |
| `POST`   | `/checkout-links`                 | Create checkout link           |
| `POST`   | `/portal-links`                   | Create portal link             |
| `GET`    | `/access`                         | Check access (direct or squad) |
| `POST`   | `/start-trial`                    | Start a free trial             |
| `POST`   | `/squads`                         | Create a squad                 |
| `GET`    | `/squads/:id`                     | Get squad by ID                |
| `GET`    | `/squads`                         | Find squad by owner UID        |
| `DELETE` | `/squads/:id`                     | Dissolve a squad               |
| `POST`   | `/squads/:id/members`             | Add member                     |
| `DELETE` | `/squads/:id/members/:uid`        | Remove member                  |
| `GET`    | `/squads/:id/members`             | List members                   |
| `POST`   | `/squads/:id/invites`             | Create invite                  |
| `GET`    | `/squads/:id/invites`             | List squad invites             |
| `POST`   | `/squads/:id/invites/:id/accept`  | Accept invite                  |
| `POST`   | `/squads/:id/invites/:id/decline` | Decline invite                 |
| `DELETE` | `/squads/:id/invites/:id`         | Cancel invite                  |
| `GET`    | `/invites`                        | List incoming invites by UID   |
| `GET`    | `/stream`                         | SSE real-time event stream     |

</details>

<details>
<summary>Checkout API — <code>/api/checkout</code></summary>

Public. Powers the checkout flow.

| Method | Path                  | Description               |
| ------ | --------------------- | ------------------------- |
| `GET`  | `/resolve/:token`     | Resolve checkout token    |
| `POST` | `/pay`                | Initiate payment          |
| `POST` | `/apply-coupon`       | Validate & preview coupon |
| `GET`  | `/confirm/:invoiceId` | Poll payment status       |

</details>

<details>
<summary>Portal API — <code>/api/portal</code></summary>

Token-protected. Subscriber self-service.

| Method | Path              | Description                     |
| ------ | ----------------- | ------------------------------- |
| `GET`  | `/resolve/:token` | Subscriber state and squad role |
| `POST` | `/cancel`         | Cancel subscription             |
| `POST` | `/change`         | Change plan                     |
| `POST` | `/renew`          | Renew subscription              |
| `GET`  | `/invoices`       | Invoice history                 |

</details>

<details>
<summary>Webhook API — <code>/api/webhook</code></summary>

Provider callbacks.

| Method | Path         | Description               |
| ------ | ------------ | ------------------------- |
| `POST` | `/:provider` | Incoming provider webhook |

</details>

## Architecture

```
anybill/
├── packages/
│   ├── backend/          Ts.ED + TypeORM + SQLite
│   ├── admin/            Solid.js admin dashboard
│   ├── checkout/         Solid.js checkout SPA
│   └── sdk/              TypeScript SDK (@anybill/sdk)
├── example/              Reference provider setup
├── Dockerfile            Multi-stage production build
├── Caddyfile             Reverse proxy config
└── turbo.json            Turborepo pipeline
```

## Development

```bash
git clone https://github.com/labostack/anybill.git
cd anybill
pnpm install

cp .env.example .env
# Set JWT_SECRET and LINK_SECRET (openssl rand -hex 32)

pnpm dev
```

| Service  | URL                   |
| -------- | --------------------- |
| Backend  | http://localhost:3000 |
| Admin    | http://localhost:3001 |
| Checkout | http://localhost:3002 |

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Support

If you find AnyBill useful, consider giving it a ⭐ on GitHub — it helps others discover the project.

## License

[MIT](LICENSE)
