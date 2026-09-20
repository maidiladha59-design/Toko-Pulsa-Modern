# AIDIL STORE v57 — Production Launch Pack

v57 is a deployment-readiness layer on top of v56. It does not enable live payments by itself.

## Pre-deploy gate

1. Run `npm ci` using the committed `package-lock.json` (generate/commit it on a networked development machine if absent).
2. Run `npm run lint`.
3. Run `npm run build`.
4. Run `npm test` and `npm run test:production`.
5. Run `npm run validate:migrations`.
6. Run `npm run validate:production` with production environment variables supplied through the deployment platform.
7. Apply migrations to the intended Supabase project and record the migration result.
8. Configure HTTPS custom domain and provider webhooks.
9. Configure Digiflazz/Pakasir production credentials and provider IP allowlisting.
10. Configure `CRON_SECRET` and verify all four scheduled endpoints execute.
11. Configure VAPID keys only if browser push is enabled.
12. Perform provider-approved sandbox/live smoke tests before accepting real customer funds.

## Rollback

- Keep the previous known-good deployment available.
- Do not roll back database migrations destructively unless a tested rollback exists.
- Disable customer transaction entry points first if provider/payment integrity is uncertain.
- Keep webhook and reconciliation endpoints available while investigating payment state.

## Backup and recovery

- Export/backup Supabase database before production migration batches.
- Store migration output and deployment commit SHA with the release record.
- Test restoration periodically in a non-production project.
- Never store provider secrets in the repository or ZIP release.

## Operational rule

A source-level PASS is not a production-live PASS. Production status requires live deployment evidence from the actual Supabase, Vercel, Pakasir and Digiflazz projects.
