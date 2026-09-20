# AIDIL STORE v36 — Platform Expansion

## Added
- Separate Top Up admin fees for QRIS, Bank and Bank Digital using `topup_fee_methods`.
- Top Up stores `amount` (wallet credit) separately from `payment_amount` (amount charged before gateway fee).
- Home flash announcement editable by admin.
- Home banner/poster carousel: automatic 3-second rotation, manual dots, image/PDF support through private upload flow.
- Product favorites.
- Referral code/link and qualification tracking; reward logic: 20 qualified referrals → Rp5.000 wallet credit, idempotently.
- Mission framework with active/inactive control, image upload and automatic wallet rewards.
- Customer notifications page.
- Profile menu, settings, referral, mission, KYC and QRIS scan pages.
- Private KYC bucket for KTP/KK uploads.
- Admin platform settings and customer wallet adjustment endpoint.
- Customer analytics table for all users, transaction count, total completed spending and wallet balance.
- Transfer Uang/Kirim Uang Bank catalog entry with admin-configurable service fee.
- Editable category logo/media URLs and upload endpoint.
- Expanded public navigation and mobile hamburger menu.
- Removed customer-facing product search from home/navbar.
- Native browser back behavior is preserved; no custom history trap is added.

## Important integration boundaries
- QRIS scanner decodes a QR payload. It does not pretend to debit a user's AIDIL wallet to an arbitrary merchant QRIS. Merchant QRIS payments require an acquiring/payment API that explicitly supports that flow.
- Transfer Uang is a catalog/UI layer until a real payout/transfer provider is connected. No fake bank transfer is executed.
- Email verification remains handled by Supabase Auth. WhatsApp/SMS phone OTP requires a configured OTP provider and is not fabricated in this release.
- KYC documents are stored in a private bucket; admin review UI/provider integration can be extended separately.

## Verification
- `npm test`: 21/21 passed.
- `npm run validate:migrations`: 0 errors; v35 and v36 detected; existing v5 duplicate warning remains.
- Full Next.js production build was not run because dependencies were not installed in the build workspace.

### v36 fee configuration
The previous v35 global fee setting remains available for backward compatibility. v36 introduces `topup_fee_methods` so QRIS, Bank and Bank Digital can have independent settings without changing the v35 table contract.
