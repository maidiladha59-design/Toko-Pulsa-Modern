# AIDIL STORE v50 — Operational Reconciliation & Refund Center

v50 extends v40 with an automatic scheduled reconciliation runner and customer refund requests.

- `/api/reconciliation/cron` runs with `CRON_SECRET` and checks recent Pakasir top-ups plus internal orders/PPOB.
- Provider amount/status mismatches are recorded as `MISMATCH`/review evidence; the runner never auto-credits a wallet merely because a provider says paid.
- Customers can submit refund requests; requests enter `PENDING` and do not directly credit the wallet.
- Admin retry remains idempotent through `create_system_refund`.
- Vercel Cron runs reconciliation every 5 minutes.
