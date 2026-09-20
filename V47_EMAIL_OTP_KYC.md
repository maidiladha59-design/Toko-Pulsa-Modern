# AIDIL STORE v47 — Email OTP + KTP/Selfie KYC

## Perubahan
- Email registration verification now uses Supabase email OTP (6 digit) only; registration no longer sets `emailRedirectTo`.
- Duplicate email is checked server-side before OTP is sent.
- `/verify-email` verifies the OTP and then sets the account password.
- KYC now requires KTP plus a selfie/face photo. KTP can be captured with the rear camera on supported mobile browsers; selfie can request the front camera.
- KYC documents remain in the private `kyc-private` bucket.
- New KYC submissions are `SUBMITTED` and show an estimated 1–3 day admin review period.
- Admin can verify/reject and add a review note. Verification changes the profile account type to `RESELLER` and sends an in-app notification: "Selamat, akun kamu sudah terverifikasi dan resmi menjadi Reseller...".
- Rejection sends an in-app notification with the rejection reason.

## Important configuration
In Supabase Auth, configure the Email provider/template for OTP and ensure the email template exposes the 6-digit OTP token (`{{ .Token }}`). Do not rely on confirmation links for this flow.

The face step in this version is **selfie capture + manual admin comparison**, not automated biometric/liveness matching. A third-party KYC/face provider is required if automated face matching/liveness is desired.
