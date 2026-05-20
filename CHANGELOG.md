# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.1] — 2025-05-20

### Added

- **Client Portal** — Subscriber self-service dashboard for managing subscriptions (cancel, renew, change plan)
- **Portal API** — 5 new endpoints (`/api/portal`) with AES-256-GCM encrypted token authentication
- **Portal Links** — Generate time-limited portal URLs via admin dashboard or SDK
- **SDK method** — `createPortalLink(uid, ttl?)` for creating subscriber portal URLs
- **Checkout redirect flow** — Plan changes and renewals redirect to the standard checkout page for payment
- **New webhook event** — `subscription.cancelled` dispatched when a subscription is cancelled via portal

### Changed

- Secure tokens (checkout & portal) now use AES-256-GCM encryption instead of HMAC-JWT
- Admin "Payment Links" page redesigned as unified "Links" page with checkout and portal tabs
- Portal `change` and `renew` endpoints return checkout URLs instead of handling payment directly

## [0.1.0] — 2025-05-20

### Added

- **Billing Engine** — Provider-agnostic payment orchestration with decorator-based plugin system
- **Provider Plugins** — Auto-discovery of `.ts`/`.js` provider files with on-the-fly esbuild transpilation
- **Admin Dashboard** — Solid.js SPA with dark theme for managing subscriptions, subscribers, invoices, webhooks, and API keys
- **Checkout Flow** — Solid.js SPA for end-user payment processing
- **TypeScript SDK** — Zero-dependency client library (`@anybill/sdk`) for querying the billing API and authoring provider plugins
- **Outgoing Webhooks** — HMAC-SHA256 signed event delivery with exponential backoff retries
- **API Key Management** — Multiple named keys with SHA-256 hashing, creation, rotation, and revocation
- **Docker Deployment** — Multi-stage Dockerfile with Caddy reverse proxy, single-port access
- **CI/CD** — GitHub Actions for typecheck, multi-arch Docker builds (amd64/arm64), and SDK publishing to npm

