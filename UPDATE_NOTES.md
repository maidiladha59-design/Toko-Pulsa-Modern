# AIDIL STORE v25 — Automated PPOB Test Suite + Atomic Provider Claim

## Added
- `supabase/migrations_v25_ppob_atomic_claim.sql`
- Atomic `claim_ppob_transaction(uuid)` function.
- `fulfillPpobOrder()` now claims each transaction before calling the provider.
- Cron/manual retry queues no longer pre-claim rows; the atomic claim inside fulfillment is the single provider-call gate.
- Node built-in test suite under `tests/production/ppob-production.test.mjs`.
- `npm test` and `npm run test:production` scripts.

## Covered checks
- wallet idempotency
- authentication/target validation
- wallet row locking and insufficient balance
- refund idempotency
- provider max-attempt/cooldown gate
- terminal order status mapping
- webhook signature ordering
- cron secret protection

## Run
```bash
npm test
```

For live/provider integration, configure a dedicated test Supabase/credentials and do not use production customer money.

## v37 - Harga & Biaya Transaksi
- Added `supabase/migrations_v37_pricing_engine.sql`.
- Added pricing rules with GLOBAL/CATEGORY/BRAND/SKU precedence.
- Added fixed/percentage fee, min/max fee and nominal-range controls.
- Prepaid Digiflazz sync now applies the configured pricing rule to provider cost before publishing customer price.
- Postpaid inquiry now applies the same pricing engine to provider selling price and stores AIDIL fee/rule snapshot.
- Added `/admin/pricing` and `/api/admin/pricing` for administrator pricing management.
- Provider price, provider admin and provider selling price are snapshotted on `ppob_services`.
- Top-up method fees from v36 remain separate from PPOB transaction pricing.
