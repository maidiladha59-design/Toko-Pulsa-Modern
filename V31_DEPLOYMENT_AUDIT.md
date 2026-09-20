# AIDIL STORE — v31 Production Deployment Audit

This release adds a static deployment-readiness gate for the Next.js/Vercel PPOB application.

## Checks
- Required deployment/configuration files exist.
- Vercel PPOB cron exists at `/api/ppob/cron` with the documented 2-minute schedule.
- All production environment variables are documented in `.env.example`.
- Cron endpoint enforces `CRON_SECRET` as a Bearer token.
- Digiflazz webhook performs signature verification.
- `.env.local` is excluded from Git.
- Production validator, migration preflight, and Supabase smoke-test scripts are present.
- Legacy Midtrans references in executable `src` code are reported.

## Command

```bash
npm run audit:deployment
```

## Important limitation
This is a static release audit. It does **not** prove that Vercel environment variables are populated, that the target Supabase migrations are applied, or that external providers accept live requests. Run the existing production validator and live Supabase smoke test in the actual deployment environment.
