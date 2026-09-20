# AIDIL STORE v39 — Transaction Security

- Transaction PIN stored as salted scrypt hash; plaintext PIN is never persisted.
- PIN required for wallet-funded checkout, prepaid PPOB wallet payment, and postpaid wallet payment.
- Five failed PIN attempts trigger a 15-minute lock.
- PIN verification uses server-side timing-safe comparison.
- Settings page supports PIN creation/change.
- Idempotency from existing v19/v34 flows remains in place.
- This release does not claim live-provider verification; Supabase/Pakasir/Digiflazz still require deployment smoke tests.

- PIN failure counters are updated through service-role-only security-definer functions from authenticated server routes; clients cannot call these functions directly.
