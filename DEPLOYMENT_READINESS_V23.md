# AIDIL STORE v23 — Deployment Readiness

## 1. Environment Variables
Set these in the hosting provider, never commit real values:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SITE_URL
- SUPABASE_SERVICE_ROLE_KEY
- PAKASIR_PROJECT
- PAKASIR_API_KEY
- PAKASIR_SANDBOX=true for testing
- DIGIFLAZZ_USERNAME
- DIGIFLAZZ_API_KEY
- DIGIFLAZZ_TESTING=true for testing
- DIGIFLAZZ_WEBHOOK_SECRET
- CRON_SECRET
- INTERNAL_CRON_SECRET (optional legacy/internal endpoint protection)

## 2. Supabase migrations
Apply migrations in version order from the repository. Do not skip the PPOB migrations.

## 3. Webhooks
Configure the Digiflazz callback URL to:
`/api/ppob/webhook`
Use the webhook secret configured in `DIGIFLAZZ_WEBHOOK_SECRET`.
Configure the Pakasir payment callback to the project's existing Pakasir webhook route.

## 4. Automatic PPOB worker
Vercel Cron calls `/api/ppob/cron` every 2 minutes. It processes eligible WAITING/PROCESSING transactions and respects the existing retry/cooldown logic.
The route accepts Vercel's `Authorization: Bearer <CRON_SECRET>` header.

## 5. Safe testing order
1. Keep Pakasir and Digiflazz in sandbox/testing mode.
2. Sync the provider pricelist.
3. Confirm a test SKU is active and has a valid provider SKU.
4. Test prepaid purchase with a test target.
5. Test postpaid inquiry before payment.
6. Verify webhook updates the transaction.
7. Verify PROCESSING transactions are picked up by cron.
8. Verify failed transactions follow the existing refund path.
9. Only after all checks pass, switch production credentials/modes.

## 6. Production checklist
- Never expose service-role, Digiflazz API key, Pakasir API key, or cron secrets in client code.
- Configure Supabase RLS and verify policies after migrations.
- Confirm webhook URLs use HTTPS and the production domain.
- Keep sandbox/testing enabled until end-to-end tests are complete.
- Monitor provider health, webhook audit, retry queue, refunds, and wallet ledger after launch.
