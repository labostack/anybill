#!/bin/sh
set -e

# Create data directory if it doesn't exist.
mkdir -p "${DB_DIR:-/data}"

# Start Caddy in the background.
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &

# Start the backend (foreground).
exec node dist/index.js
