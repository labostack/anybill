# AnyBill — Example Project

This is a minimal example showing how to deploy AnyBill with a custom payment provider.

## Setup

```bash
# 1. Configure
cp .env.example .env
# Edit .env — set JWT_SECRET

# 2. Install provider dependencies
cd providers && npm install && cd ..

# 3. Run
docker compose up -d
```

## Structure

```
├── docker-compose.yml   # AnyBill container + volumes
├── .env.example         # Environment variables
└── providers/
    ├── package.json     # Provider dependencies (@anybill/sdk)
    ├── tsconfig.json    # TypeScript config for providers
    └── stripe.ts        # Example Stripe provider
```

The `providers/` directory is mounted into the container at `/providers`.
AnyBill auto-discovers all `.ts`/`.js` files in that directory on startup.
