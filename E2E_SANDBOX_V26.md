# AIDIL STORE v26 — PPOB E2E Sandbox

This is a dependency-free local state-machine harness. It does **not** call Digiflazz, Pakasir, Supabase production, or move real money.

## Run

```bash
npm run test:e2e:sandbox
```

The suite covers:

1. Wallet debit → provider processing → webhook success → completed.
2. Provider failure → exactly one refund.
3. Duplicate webhook delivery.
4. Duplicate wallet checkout using the same idempotency key.
5. Insufficient wallet balance.
6. Provider-pending transaction finalized by webhook without a second wallet debit.

## Production test boundary

Passing this sandbox only validates the modeled transaction state machine. Before production, run the same scenarios against staging/test credentials and verify the actual Supabase RLS/RPCs, payment gateway callbacks, provider webhook signature, and cron authentication.
