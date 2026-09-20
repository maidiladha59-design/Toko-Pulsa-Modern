# AIDIL STORE v46 — Customer Experience & Transaction Rules

Implemented on top of v45:

- Keranjang/cart removed from customer navigation.
- One active automatic wallet top-up per user; new top-up is blocked until previous top-up is paid, expires, or is cancelled.
- Customer can cancel an eligible pending top-up.
- Top-up history shows pending/processing, approved, failed/rejected, expired and cancelled states.
- Admin-configurable top-up payment methods (supported Pakasir methods only): label, description, order and active status.
- Admin can add/edit/toggle payment information methods used by the customer UI.
- Product checkout keeps explicit payment-method selection.
- Home adds Scan QRIS and compact category navigation with `Lihat Semua`.
- QR scanner uses camera scanning with image fallback and parses common EMVCo QRIS fields.
- KYC review center for admin; VERIFIED changes profile `account_type` to RESELLER.
- Unverified CUSTOMER accounts can still use top-up and prepaid pulsa, paket data and game; restricted services such as transfer and postpaid require KYC.
- Email verification remains link-based; phone verification uses Supabase Auth phone OTP after email verification.
- Signup legal text uses short summaries + `Baca selengkapnya`, without forcing the user to scroll a legal-text box before checking consent.
- Duplicate email errors are surfaced as an explicit already-registered message.
- FAQ is stored in Supabase and editable from Admin → FAQ.
- Receipt has a real print action using the browser/system print dialog.

## Required Supabase migration

Run:

`supabase/migrations_v46_customer_experience_security.sql`

## Phone OTP requirement

Enable and configure Supabase Auth Phone provider/SMS before expecting real SMS OTP delivery. Email confirmation must also be enabled for the email-link step.

## QRIS limitation

The scanner reliably reads the QR payload and displays destination fields when present. Paying an arbitrary merchant QRIS from an internal wallet still requires a payment/acquiring provider that supports merchant QRIS transactions; the scanner does not pretend to provide that capability by itself.
