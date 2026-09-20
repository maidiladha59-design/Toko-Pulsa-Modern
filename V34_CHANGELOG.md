# AIDIL STORE v34 — PPOB Catalog Expansion + Automatic Pakasir Wallet Top Up

## Implemented

### 1. Automatic wallet Top Up via Pakasir
- `/api/topup` now creates a Pakasir payment instead of requiring manual transfer proof.
- Supports QRIS and the currently supported Pakasir VA methods already used by the project.
- Idempotency key prevents duplicate payment records from double-click/refresh.
- `topups` stores provider order ID, payment number, fee, total payment, expiry and paid timestamp.
- Existing `/api/payments/pakasir/webhook` handles both normal orders and `TOPUP-*` wallet deposits.
- Webhook re-checks payment through Pakasir Transaction Detail API before crediting wallet.
- Wallet credit is performed by a service-role-only `confirm_pakasir_topup()` RPC with row locking and APPROVED-state idempotency.
- A wallet ledger entry and notification are created when the top up is credited.
- `/wallet/topup` no longer asks for proof upload or admin approval.

### 2. Digiflazz category expansion
The sync mapping now recognizes the requested prepaid, international, postpaid and special categories, including:
- Pulsa, Data, Games, Voucher, PLN
- China/Malaysia/Philippines/Singapore/Thailand/Vietnam TOPUP
- SMS & Telpon, Streaming, TV, Aktivasi Voucher, Masa Aktif, Bundling, Aktivasi Perdana
- Gas, Media Sosial, Hotel
- PLN PASCABAYAR, PDAM, HP PASCABAYAR, INTERNET PASCABAYAR
- BPJS Kesehatan, Multifinance, PBB, Gas Negara, TV Pascabayar, SAMSAT
- BPJS Ketenagakerjaan, PLN Nontaglis
- Telkomsel Omni, Indosat Only4u, Tri CuanMax, XL Axis Cuanku, by.U

SKUs are still obtained from the Digiflazz price list. The code does not invent or hard-code individual SKUs.

## Database migration
Apply:
- `supabase/migrations_v34_pakasir_wallet_topup.sql`

Do not rerun `schema.sql` on the existing database.

## Tests
- `node --test tests/**/*.test.mjs`
- 21 tests passed.
- Migration preflight reports 0 errors. The existing v5 duplicate-version warning remains from v33.

## External configuration
After deployment, configure Pakasir's project Webhook URL to the existing endpoint:
`/api/payments/pakasir/webhook`

Set server environment variables already defined by v33:
- `PAKASIR_PROJECT`
- `PAKASIR_API_KEY`

Do not expose the API key to the browser or commit it to GitHub.
