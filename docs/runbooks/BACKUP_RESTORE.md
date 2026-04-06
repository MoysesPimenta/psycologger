# Runbook — Supabase Backup & Restore Drill

**Owner:** Moyses · **Last drilled:** _(fill in)_ · **Cadence:** quarterly

> ⚠️ Requires Supabase **Pro plan** ($25/mo) for PITR + database branches. On Free plan this runbook is aspirational; daily backups still exist but no point-in-time restore.

## Objective
Prove that the Supabase Postgres backup can be restored to a working state
in under 60 minutes, before we actually need it.

## Scope
- Primary DB: Supabase project (prod)
- Critical tables: Tenant, User, Patient, ClinicalSession, JournalEntry, Charge
- Retention: Supabase PITR default (7 days on Pro) + daily logical dumps

## Pre-drill checklist
- [ ] Confirm Supabase plan includes PITR
- [ ] `supabase` CLI installed locally (`brew install supabase/tap/supabase`)
- [ ] Service-role key available in 1Password
- [ ] Free branch slot in Supabase project (delete stale branches first)

## Drill procedure

### 1. Create a branch from prod at a known-good timestamp
```bash
supabase branches create drill-$(date +%Y%m%d)   --project-ref tgkgcapoykcazkimiwzw   --restore-at "2026-04-05T00:00:00Z"
```
_Or via Supabase dashboard → Branches → New branch → Restore from PITR._

### 2. Grab the branch connection string
Dashboard → Branches → drill-YYYYMMDD → Connection string (transaction pooler).

### 3. Smoke-test restored data
```bash
DATABASE_URL="<branch-url>" pnpm prisma db pull --print | head -50
DATABASE_URL="<branch-url>" psql -c "SELECT count(*) FROM "Patient";"
DATABASE_URL="<branch-url>" psql -c "SELECT count(*) FROM "ClinicalSession" WHERE "deletedAt" IS NULL;"
```
Expected counts should be within a few % of prod.

### 4. Point a local app build at the branch
```bash
DATABASE_URL="<branch-url>" pnpm dev
```
Log in as a known tenant and verify:
- Patient list loads
- Open a clinical session → decrypted note renders
- Portal login → magic link flow (use a test email)

### 5. Tear down
```bash
supabase branches delete drill-YYYYMMDD --project-ref tgkgcapoykcazkimiwzw
```

## Success criteria
- Branch creation → psql connection: **< 10 min**
- End-to-end app boot against restored branch: **< 30 min**
- Row counts within 2 % of live
- No decryption failures on ClinicalSession notes

## If it fails
1. File an incident — this is a critical finding.
2. Check `ENCRYPTION_KEY` / `ENCRYPTION_KEY_PREVIOUS` — a missing prior key
   will break decryption of older rows.
3. Escalate to Supabase support if PITR restore itself fails.

## Off-site logical dumps (belt-and-braces)
Weekly `pg_dump` to S3 (TODO — not yet wired up). See
`docs/runbooks/OFFSITE_BACKUPS.md` once implemented.
