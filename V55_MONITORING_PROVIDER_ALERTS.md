# AIDIL STORE v55 — Monitoring, Provider Status & Automatic Alerts

v55 adds operational provider telemetry and scheduled monitoring.

- `provider_health_checks` stores provider health checks without secrets.
- `/api/monitoring/cron` is protected by `CRON_SECRET` and checks Digiflazz prepaid pricelist availability.
- Provider DOWN/DEGRADED states create deduplicated monitoring alerts.
- Admin monitoring API exposes recent provider health checks.
- Vercel Cron runs provider monitoring every 5 minutes.

The check is observational: it does not change wallet balances, orders, PPOB transactions, or provider configuration.
