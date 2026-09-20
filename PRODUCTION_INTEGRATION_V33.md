# AIDIL STORE — v33 Production Integration Verification

Generated: 2026-09-18T17:43:28.706Z

## Scope
Static verification of the Supabase/Vercel/Pakasir/Digiflazz/OAuth/cron integration contract. Live external verification is only performed when the --live flag is explicitly used in a real deployment environment.

## Result
- Checks: 33
- Failures: 0
- Warnings: 3

✅ **PASSED**

## Checks
- PASS — file:package.json
- PASS — file:.env.example
- PASS — file:.gitignore
- PASS — file:vercel.json
- PASS — file:src/app/auth/callback/route.ts
- PASS — file:src/app/api/payments/pakasir/webhook/route.ts
- PASS — file:src/app/api/ppob/webhook/route.ts
- PASS — file:src/app/api/ppob/cron/route.ts
- PASS — env:NEXT_PUBLIC_SUPABASE_URL
- PASS — env:NEXT_PUBLIC_SUPABASE_ANON_KEY
- PASS — env:SUPABASE_SERVICE_ROLE_KEY
- PASS — env:PAKASIR_PROJECT
- PASS — env:PAKASIR_API_KEY
- PASS — env:DIGIFLAZZ_USERNAME
- PASS — env:DIGIFLAZZ_API_KEY
- PASS — env:DIGIFLAZZ_WEBHOOK_SECRET
- PASS — env:INTERNAL_CRON_SECRET
- PASS — env:CRON_SECRET
- WARN — pakasir-default — No explicit sandbox=true default; verify before live use.
- WARN — digiflazz-default — No explicit testing=true default; verify before live use.
- PASS — cron-auth — Cron route references CRON_SECRET.
- PASS — fulfillment-auth — Internal fulfillment references INTERNAL_CRON_SECRET.
- PASS — digiflazz-webhook-auth — Digiflazz webhook signature handling present.
- PASS — pakasir-webhook-handler — Pakasir webhook handler present.
- PASS — oauth-exchange — OAuth callback exchanges code for session.
- PASS — oauth-error-path — OAuth callback contains an error/redirect path.
- PASS — vercel-cron-route — vercel.json references PPOB cron.
- PASS — vercel-cron-schedule — Cron schedule declaration present.
- PASS — digiflazz-transaction-endpoint
- PASS — digiflazz-pricelist-endpoint
- PASS — pakasir-client — Pakasir integration module present.
- WARN — live-verification — Not run: use npm run verify:integration:live only inside the production environment with real credentials.
- PASS — production-tests — Production test suite completed successfully.

## Warnings
- pakasir-default: No explicit sandbox=true default; verify before live use.
- digiflazz-default: No explicit testing=true default; verify before live use.
- live-verification: Not run: use npm run verify:integration:live only inside the production environment with real credentials.

## Production limitation
A static/local audit cannot prove that remote Supabase migrations, Vercel environment variables, OAuth provider configuration, Pakasir callbacks, or Digiflazz callbacks are actually active. Those require the target production environment.
