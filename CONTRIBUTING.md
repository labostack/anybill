# Contributing to AnyBill

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+
- Git

### Getting Started

```bash
# Clone the repo
git clone https://github.com/dortanes/anybill.git
cd anybill

# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env
# Edit .env — set JWT_SECRET (generate with: openssl rand -hex 32)

# Start all services in dev mode
pnpm dev
```

This starts:

| Service  | URL                    |
| -------- | ---------------------- |
| Backend  | http://localhost:3000   |
| Admin    | http://localhost:3001   |
| Checkout | http://localhost:3002   |

### Project Structure

```
packages/
├── backend/     Ts.ED + TypeORM + SQLite (API server)
├── admin/       Solid.js admin dashboard
├── checkout/    Solid.js checkout SPA
└── sdk/         TypeScript SDK (@anybill/sdk)
```

### Useful Commands

```bash
pnpm dev          # Start all packages in dev mode
pnpm build        # Build all packages
pnpm typecheck    # Run TypeScript type checking
```

## Making Changes

### Branch Naming

- `feat/short-description` — new features
- `fix/short-description` — bug fixes
- `docs/short-description` — documentation
- `refactor/short-description` — code restructuring

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add coupon support to checkout flow
fix: prevent duplicate one-time purchases
docs: update provider creation guide
refactor: extract webhook retry logic into service
```

### Code Style

- **TypeScript** throughout — no `any` unless unavoidable
- **JSDoc** on all exported functions, classes, and interfaces
- **@tsed/schema** decorators for all API input validation (see `packages/backend/src/models/`)
- Keep `console.log` calls prefixed with `[anybill]` or `[billing]`

### Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes with clear commit messages
3. Run `pnpm typecheck` to verify types
4. Open a PR against `main` with a clear description
5. Fill in the PR template

## Architecture Notes

### Billing Engine

The billing engine (`packages/backend/src/billing/`) is provider-agnostic. Key concepts:

- **Providers** extend `AnybillProvider` and use decorators (`@CreatePaymentLink()`, etc.)
- **Registry** maps decorated methods to lifecycle roles at runtime
- **Engine** orchestrates payment creation, webhook handling, and event emission

### Provider Plugins

External payment providers live outside the main codebase in a `providers/` directory. They import from `@anybill/sdk` and are auto-discovered at startup. See the [`example/`](example/) directory for a reference implementation.

### Outgoing Webhooks

AnyBill dispatches HMAC-SHA256 signed events to user-configured endpoints with exponential backoff retry. The webhook service (`OutgoingWebhookService`) runs a background worker that polls for due retries.

## Reporting Issues

- Use [GitHub Issues](https://github.com/dortanes/anybill/issues) for bugs and feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)
