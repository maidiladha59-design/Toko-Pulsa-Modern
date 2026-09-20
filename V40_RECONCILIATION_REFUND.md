# AIDIL STORE v40 — Payment Reconciliation & Refund Center

## Scope
- Idempotent refund center with PENDING/PROCESSING/COMPLETED/FAILED.
- Automatic PPOB failure refund now records a refund-center row and wallet ledger entry.
- Unique order guard prevents a second refund for the same order.
- Reconciliation table for Pakasir/topup, order payment and Digiflazz/PPOB checks.
- Admin-only reconciliation records; customer can read their own refund records.

## Important
v40 does not claim that provider data is live. Reconciliation must be run against the configured production providers before treating a mismatch as confirmed.
