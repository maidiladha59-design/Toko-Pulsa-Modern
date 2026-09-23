# AIDIL STORE — v33 Production Integration Verification

Generated: 2026-09-23T08:28:12.754Z

## Scope
Static verification of the Supabase/Vercel/FR3 NEWERA/Digiflazz/OAuth/cron integration contract. Live external verification is only performed when the --live flag is explicitly used in a real deployment environment.

## Result
- Checks: 32
- Failures: 2
- Warnings: 4

❌ **FAILED**

## Checks
- PASS — file:package.json
- PASS — file:.env.example
- PASS — file:.gitignore
- PASS — file:vercel.json
- PASS — file:src/app/auth/callback/route.ts
- PASS — file:src/app/api/payments/fr3newera/webhook/route.ts
- PASS — file:src/app/api/ppob/webhook/route.ts
- PASS — file:src/app/api/ppob/cron/route.ts
- PASS — env:NEXT_PUBLIC_SUPABASE_URL
- PASS — env:NEXT_PUBLIC_SUPABASE_ANON_KEY
- PASS — env:SUPABASE_SERVICE_ROLE_KEY
- PASS — env:FR3NEWERA_API_KEY
- PASS — env:DIGIFLAZZ_USERNAME
- PASS — env:DIGIFLAZZ_API_KEY
- PASS — env:DIGIFLAZZ_WEBHOOK_SECRET
- PASS — env:INTERNAL_CRON_SECRET
- PASS — env:CRON_SECRET
- WARN — local-env-present — Do not commit .env.local; values are intentionally not inspected.
- WARN — digiflazz-default — No explicit testing=true default; verify before live use.
- PASS — cron-auth — Cron route references CRON_SECRET.
- PASS — fulfillment-auth — Internal fulfillment references INTERNAL_CRON_SECRET.
- PASS — digiflazz-webhook-auth — Digiflazz webhook signature handling present.
- PASS — pakasir-webhook-handler — FR3 NEWERA webhook handler present.
- PASS — oauth-exchange — OAuth callback exchanges code for session.
- PASS — oauth-error-path — OAuth callback contains an error/redirect path.
- FAIL — vercel-cron-route — PPOB cron route not found in vercel.json.
- FAIL — vercel-cron-schedule — No cron schedule declaration.
- PASS — digiflazz-transaction-endpoint
- PASS — digiflazz-pricelist-endpoint
- WARN — pakasir-client — FR3 NEWERA hostname not found statically.
- WARN — live-verification — Not run: use npm run verify:integration:live only inside the production environment with real credentials.
- PASS — production-tests — Production test suite completed successfully.

## Warnings
- local-env-present: Do not commit .env.local; values are intentionally not inspected.
- digiflazz-default: No explicit testing=true default; verify before live use.
- pakasir-client: FR3 NEWERA hostname not found statically.
- live-verification: Not run: use npm run verify:integration:live only inside the production environment with real credentials.

## Production limitation
A static/local audit cannot prove that remote Supabase migrations, Vercel environment variables, OAuth provider configuration, FR3 NEWERA callbacks, or Digiflazz callbacks are actually active. Those require the target production environment.
