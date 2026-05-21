# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in AnyBill, **please do not open a public issue.**

Instead, report it privately:

1. **GitHub Security Advisories** (preferred): Go to [Security → Advisories → New draft advisory](https://github.com/dortanes/anybill/security/advisories/new) and submit your report.
2. **Email**: Send details to the maintainers listed in the repository.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to expect

- **Acknowledgment** within 48 hours
- **Status update** within 7 days
- **Fix release** as soon as a patch is verified

We will credit reporters in the release notes (unless you prefer to remain anonymous).

## Security Best Practices

When self-hosting AnyBill:

- **Always set strong `JWT_SECRET` and `LINK_SECRET`** — generate with `openssl rand -hex 32`
- **Use HTTPS** in production — place a reverse proxy (Caddy, nginx) with TLS in front
- **Restrict access** to the admin dashboard — use firewall rules or VPN
- **Keep Docker images updated** — pull `ghcr.io/dortanes/anybill:latest` regularly
- **Rotate API keys** periodically via the admin dashboard
- **Rotate webhook secrets** if a signing secret is compromised
