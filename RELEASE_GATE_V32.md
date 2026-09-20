# AIDIL STORE — v32 Final Build & Release Gate

v32 is the final static release gate before production deployment.

## Checks
- required project/deployment files
- package scripts and release commands
- Vercel PPOB cron configuration
- production environment template
- Git exclusions for secrets/build output
- obvious hard-coded production secret patterns
- critical PPOB/webhook/status routes
- release-gate scripts and prior audit documents
- service-role key is not referenced from client components

## Scope
This is a static repository audit. It does **not** prove that remote Supabase migrations, Vercel environment variables, Digiflazz, or Pakasir credentials are live and valid. Those require the real production environment.

Run:
```bash
npm run release:gate
```
