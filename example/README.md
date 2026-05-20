# AnyBill — Example Project

This is a minimal example showing how to deploy AnyBill with a custom payment provider.

## Setup

```bash
# 1. Configure
cp .env.example .env
# Edit .env — set JWT_SECRET

# 2. Install provider-specific dependencies (if any)
# cd providers && npm install && cd ..

# 3. Run
docker compose up -d
```

> **Note:** `@anybill/sdk` is automatically injected by the engine — you do NOT
> need to install it in the providers directory. Only install provider-specific
> packages (e.g. `stripe`, `axios`) if your provider uses them.

## Structure

```
├── docker-compose.yml   # AnyBill container + volumes
├── .env.example         # Environment variables
└── providers/
    ├── tsconfig.json    # TypeScript config for providers
    └── stripe.ts        # Example Stripe provider
```

The `providers/` directory is mounted into the container at `/providers`.
AnyBill auto-discovers all `.ts`/`.js` files in that directory on startup.
