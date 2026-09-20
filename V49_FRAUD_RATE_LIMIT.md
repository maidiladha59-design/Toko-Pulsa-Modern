# AIDIL STORE v49 — Fraud & Rate Limit

v49 adds production-oriented abuse controls without automatically blocking a customer from a single signal.

## Included
- DB-backed atomic rate limiting for auth/email check, OTP, transaction PIN, top-up, checkout, PPOB inquiry/payment, refund, and webhook routes.
- HTTP 429 + Retry-After when a limit is exceeded.
- Risk event and risk profile tables with NORMAL/REVIEW/HIGH_RISK/BLOCKED states.
- Failed transaction PIN attempts add risk points while the existing PIN lock remains authoritative.
- Admin Fraud & Risk Center for review, clearing, or manual blocking.
- Admin actions are written to audit_logs by the database function.
- Risk score is capped at 100 and a single signal does not automatically set BLOCKED.

## Important
Rate limiting is enforced by the database function so it is not dependent on a single Vercel instance's in-memory state. IP addresses are hashed before being used as the rate-limit key in middleware; raw IP is not stored by the v49 rate-limit path.

## Migration
Run `supabase/migrations_v49_fraud_rate_limit.sql` after v48.
