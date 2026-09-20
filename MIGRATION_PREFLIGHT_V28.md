# AIDIL STORE v28 — Supabase Migration Preflight

This project uses versioned SQL migration files under `supabase/`. Before applying them to a production database, run:

```bash
npm run validate:migrations
```

The validator checks:
- required PPOB migration versions and missing versions;
- duplicate version numbers;
- presence of core PPOB tables/functions in key migrations;
- documented version gaps.

## Important

This is a **preflight validator**, not proof that migrations have already been applied to a remote Supabase project. The authoritative applied state is the migration history of the target Supabase database/project.

For a fresh database, start from the project's base schema/official setup and apply migrations in their documented dependency order. For an existing production database, back up first and apply one migration at a time, checking the SQL result after each step.

Known intentional gaps in the PPOB sequence include v12, v17, v20, v22, v23 and v26 because those releases were application/configuration changes rather than standalone SQL migrations.


### v36
Platform expansion migration: `migrations_v36_platform_features.sql` (per-method Top Up fees, banners, announcements, favorites, referrals, missions, KYC, settings, transfer services, category media and admin wallet adjustment).
