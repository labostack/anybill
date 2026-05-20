# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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

