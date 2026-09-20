# AIDIL STORE v35 — Configurable Top Up Fees

## Added
- Admin-configurable Top Up fee: FIXED or PERCENTAGE.
- Configurable minimum and maximum Top Up.
- Server-side fee calculation; client preview is informational only.
- `topups.admin_fee` stores the AIDIL STORE fee.
- `topups.payment_amount` stores the amount sent to Pakasir before Pakasir's own gateway fee.
- Wallet credits only the requested `topups.amount`.
- Pakasir webhook verifies against `payment_amount`, preventing accidental credit based on gateway fee/total.
- Admin page `/admin/topups` now contains fee settings and automatic/manual history.
- Legacy manual top-ups remain visible and can still be approved/rejected; Pakasir top-ups are not manually approved.

## Example
If user requests Rp50.000 and Admin fee is Rp1.000:
- Wallet credit: Rp50.000
- AIDIL STORE fee: Rp1.000
- Amount sent to Pakasir: Rp51.000
- Pakasir gateway fee: depends on the selected method/account
- Final payment: returned by Pakasir

## Migration
Apply only:
`supabase/migrations_v35_topup_fee_settings.sql`

Apply it after v34 and do not rerun `schema.sql` on the existing database.
