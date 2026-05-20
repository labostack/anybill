# @anybill/sdk

TypeScript SDK for the [AnyBill](https://github.com/dortanes/anybill) billing platform.

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

// Check if a user has an active subscription
const subscribers = await client.getSubscriberByUid("user_123");
const isActive = subscribers.some((s) => s.status === "active");

// Create a secure checkout link
const link = await client.createCheckoutLink("plan-uuid", "user_123");
// link.url → redirect user here

// Create a portal link for subscriber self-service
const portal = await client.createPortalLink("user_123");
// portal.url → redirect user to manage their subscription
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

### Methods

| Method                     | Description                          |
| -------------------------- | ------------------------------------ |
| `getSubscriptions()`                  | List all active subscription plans        |
| `getSubscriberByUid(uid)`             | Find subscribers by external user ID      |
| `getSubscriber(id)`                   | Get a subscriber by AnyBill ID            |
| `getInvoice(id)`                      | Get an invoice by ID                      |
| `createCheckoutLink(planId, uid, ttl?)` | Create a secure, time-limited checkout URL |
| `createPortalLink(uid, ttl?)`           | Create a time-limited subscriber portal URL        |
| `client.checkAccess(uid, subscriptionId?)` | Check if user has access (direct or squad) |
| `client.squads.create(subscriberId)` | Create a squad for a subscriber |
| `client.squads.get(squadId)` | Get squad by ID |
| `client.squads.getByOwnerUid(uid)` | Find squad by owner's uid |
| `client.squads.dissolve(squadId)` | Dissolve a squad |
| `client.squads.addMember(squadId, uid)` | Add member to squad |
| `client.squads.removeMember(squadId, uid)` | Remove member from squad |
| `client.squads.getMembers(squadId)` | List active squad members |

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

> **Note:** Provider plugins require `experimentalDecorators` in their `tsconfig.json`. See the [example provider](https://github.com/dortanes/anybill/tree/main/example/providers) for a complete setup.

## License

MIT
