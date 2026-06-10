# @anybill/sdk

TypeScript SDK for the [AnyBill](https://github.com/labostack/anybill) billing platform.

Two use cases:

1. **Client SDK** — query subscriptions, subscribers, and invoices from your backend
2. **Provider API** — build custom payment provider plugins

## Installation

```bash
npm install @anybill/sdk
```

## Client SDK

```typescript
import { AnybillSDK } from "@anybill/sdk";

const client = new AnybillSDK({
  baseUrl: "https://billing.example.com",
  apiKey: "ak_...",
});

// List active plans
const plans = await client.getSubscriptions();

// Check if a user has an active subscription (including trial status)
const subscribers = await client.getSubscriberByUid("user_123");
const isActive = subscribers.some(
  (s) => s.status === "active" || s.status === "trialing",
);

// Start a free trial for a user
const trial = await client.startTrial("user_123");
// trial.status → "trialing"
// trial.trialEnd → Date string (ISO 8601)

// Create a secure checkout link
const link = await client.createCheckoutLink("plan-uuid", "user_123");
// link.url → redirect user here

// With custom success redirect (overrides account setting)
const link2 = await client.createCheckoutLink("plan-uuid", "user_123", {
  successUrl: "https://myapp.com/thanks",
});

// Create a portal link for subscriber self-service
const portal = await client.createPortalLink("user_123");
// portal.url → redirect user to manage their subscription

// Grant a subscription without payment (admin/promo)
const grant = await client.grantSubscription("plan-uuid", "user_123");
// grant.status → "active"

// Grant for 90 days starting from a specific date
const grant2 = await client.grantSubscription("plan-uuid", "user_123", {
  days: 90,
  startDate: "2025-02-01T00:00:00Z",
});
```

```typescript
// --- Squads (group subscriptions) ---

// Check access (covers both direct subscribers and squad members)
const access = await client.checkAccess("user-123");
if (access.hasAccess) {
  console.log(access.accessType); // "direct" or "squad"
}

// Squad is auto-created when purchasing a squad-enabled plan.
// To manage members:
const members = await client.squads.getMembers("squad-id");
await client.squads.addMember("squad-id", "friend-uid");
await client.squads.removeMember("squad-id", "friend-uid");
```

```typescript
// --- Real-time Event Streaming (SSE) ---

const stream = client.events.subscribe([
  "payment.confirmed",
  "subscription.renewed",
]);

stream.on("payment.confirmed", (data) => {
  // data is fully typed: invoiceId, amount, currency, provider, paidAt, ...
  console.log(`Payment ${data.invoiceId}: ${data.amount} ${data.currency}`);
});

stream.on("subscription.renewed", (data) => {
  console.log(`Renewed until ${data.currentPeriodEnd}`);
});

// Lifecycle events
stream.on("connected", () => console.log("SSE connected"));
stream.on("error", (err) => console.error(err));

// Subscribe to ALL events
const allStream = client.events.subscribe();

// Clean up when done
stream.close();
```

### Methods

| Method                                           | Description                                                   |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `getSubscriptions()`                             | List all active subscription plans                            |
| `getSubscriberByUid(uid)`                        | Find subscribers by external user ID                          |
| `getSubscriber(id)`                              | Get a subscriber by AnyBill ID                                |
| `getInvoice(id)`                                 | Get an invoice by ID                                          |
| `createCheckoutLink(planId, uid, opts?)`         | Create a secure checkout URL (`opts`: `ttl`, `couponCode`, `successUrl`) |
| `createPortalLink(uid, ttl?)`                    | Create a time-limited subscriber portal URL                   |
| `checkAccess(uid, subscriptionId?)`              | Check if user has access (direct or squad)                    |
| `startTrial(uid, subscriptionId?)`               | Start a free trial for a user (auto-resolves plan if omitted) |
| `grantSubscription(planId, uid, opts?)`          | Grant a subscription without payment (`opts`: `days`, `startDate`) |
| `squads.create(subscriberId)`                    | Create a squad for a subscriber                               |
| `squads.get(squadId)`                            | Get squad by ID                                               |
| `squads.getByOwnerUid(uid)`                      | Find squad by owner's uid                                     |
| `squads.dissolve(squadId)`                       | Dissolve a squad                                              |
| `squads.addMember(squadId, uid)`                 | Add member to squad                                           |
| `squads.removeMember(squadId, uid)`              | Remove member from squad                                      |
| `squads.getMembers(squadId)`                     | List active squad members                                     |
| `squads.invites.create(squadId, uid)`            | Create an invite for a user                                   |
| `squads.invites.list(squadId)`                   | List squad invites                                            |
| `squads.invites.accept(squadId, inviteId, uid)`  | Accept an invite                                              |
| `squads.invites.decline(squadId, inviteId, uid)` | Decline an invite                                             |
| `squads.invites.cancel(squadId, inviteId)`       | Cancel an invite (owner)                                      |
| `squads.invites.incoming(uid)`                   | Get incoming invites for a user                               |
| `events.subscribe(events?)`                      | Open SSE stream for real-time events                          |

### Event Streaming

`events.subscribe()` returns an `EventStream` with typed `.on()` handlers. Supports auto-reconnect and `Last-Event-ID` replay.

Available events: `payment.confirmed`, `payment.failed`, `payment.refunded`, `payment.cancelled`, `subscription.renewed`, `subscription.expired`, `subscription.cancelled`, `squad.created`, `squad.dissolved`, `squad.member_added`, `squad.member_removed`, `squad.invite_created`, `squad.invite_accepted`, `squad.invite_declined`, `squad.invite_cancelled`, `coupon.redeemed`, `trial.started`, `trial.expired`.

## Provider API

Build custom payment providers using the decorator-based plugin system.

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
    return PaymentLink.url(session.url!).id(session.id);
  }

  @ValidateWebhook()
  verify(ctx) {
    return stripe.webhooks.constructEvent(ctx.body, ctx.headers["stripe-signature"], secret);
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

| Decorator              | Purpose                           |
| ---------------------- | --------------------------------- |
| `@CreatePaymentLink()` | Generate a payment URL            |
| `@ValidateWebhook()`   | Verify incoming webhook signature |
| `@IncomingWebhook()`   | Process webhook payload           |
| `@RefundPayment()`     | Issue a refund                    |
| `@CancelPayment()`     | Cancel a pending payment          |

### Builders

| Builder                       | Usage                        |
| ----------------------------- | ---------------------------- |
| `PaymentLink.url(url).id(id)` | Build a payment link result  |
| `Payment.id(id).confirm()`    | Confirm a payment            |
| `Payment.id(id).failure()`    | Mark payment as failed       |
| `Payment.id(id).renew()`      | Provider-managed renewal     |
| `Payment.ignore()`            | Ignore an irrelevant webhook |

> **Note:** Provider plugins require `experimentalDecorators` in their `tsconfig.json`. See the [example provider](https://github.com/labostack/anybill/tree/main/example/providers) for a complete setup.

## License

MIT
