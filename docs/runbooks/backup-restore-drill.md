# Backup & Restore Drill — Supabase PITR

**Owner:** ops
**Cadence:** quarterly (calendar a recurring 30-min slot)
**Last drill:** never (as of 2026-04-07 — schedule one)

## Why

Supabase takes daily logical + physical backups and supports Point-in-Time Recovery (PITR) on Pro+ plans. None of that matters if we've never restored from one. This runbook is the test.

## What you're testing

1. The PITR snapshot from N hours ago is actually restorable.
2. Encrypted columns (`enc:v1:...`) round-trip through the restored DB and decrypt with the current `ENCRYPTION_KEY`.
3. The auto-RLS event trigger (`trg_auto_enable_rls_on_new_tables`) survives the restore.
4. Prisma migrations on the restored DB are at the expected version.
5. Estimated wall-clock time from "fire" to "app readable on a side URL" — record it for your incident playbook.

## Steps

### 1. Create a temporary restore target

In the Supabase dashboard for the **production** project (`tgkgcapoykcazkimiwzw`):
- Settings → Database → Backups → "Restore to a new project"
- Pick a snapshot ~24h old
- Name: `psycologger-restore-drill-YYYY-MM-DD`
- Region: same as prod

Wait for the new project to provision (usually 5–10 min). Note the new `project_ref`.

### 2. Verify schema and trigger

In the Supabase SQL editor for the restored project:

```sql
-- All app tables present + RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public'
ORDER BY tablename;

-- Auto-RLS event trigger restored
SELECT evtname, evtenabled
FROM pg_event_trigger
WHERE evtname='trg_auto_enable_rls_on_new_tables';

-- Prisma migration history matches main
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY finished_at DESC
LIMIT 10;
```

All app tables should have `rowsecurity = true`. The event trigger should be `O` (enabled). The latest migration name should match `prisma/migrations/` HEAD.

### 3. Verify encrypted-field round-trip

Pick one patient row with an encrypted CPF:

```sql
SELECT id, "cpfEncrypted"
FROM "Patient"
WHERE "cpfEncrypted" IS NOT NULL
LIMIT 1;
```

Copy the row id and the encrypted value. Then locally:

```bash
# Point a temporary .env at the restored project's connection string
DATABASE_URL="postgresql://postgres:[PW]@db.<restored-ref>.supabase.co:5432/postgres" \
ENCRYPTION_KEY="$ENCRYPTION_KEY_PROD" \
npx tsx -e '
  import { decryptCpf } from "./src/lib/cpf-crypto";
  // paste the encrypted value
  const enc = "enc:v1:...";
  console.log(decryptCpf(enc, { tenantId: "...", patientId: "..." }));
'
```

Should print the original CPF in digit form. If it throws, your `ENCRYPTION_KEY` rotation history is wrong — investigate before restoring in a real incident.

### 4. Boot the app against the restored DB (optional but recommended)

Spin up a Vercel preview deployment with `DATABASE_URL` pointed at the restored project. Log in as a known therapist. Open one patient. Confirm the page renders, the CPF displays correctly (decrypted), and the appointments calendar loads.

Record the wall-clock time from step 1 to here. That's your **realistic RTO**.

### 5. Tear down

- Delete the restored Supabase project (Settings → General → Delete project)
- Delete the Vercel preview deployment
- Update this file's "Last drill" date and add a note in the changelog below

## Drill changelog

| Date | Operator | Snapshot age | Wall-clock RTO | Notes |
|------|----------|--------------|----------------|-------|
| _never_ | _ | _ | _ | _initial drill not yet performed_ |

## Failure modes to watch for

- **Encryption key not in rotation history.** If the restored row was encrypted under an older key not present in your current `encryptionKey.rotationHistory`, decryption silently returns garbage or throws. Fix: keep historical keys forever.
- **Migration drift.** If the restored DB is at a Prisma migration ahead of or behind `main`, your app code won't match the schema. Fix: never delete old migrations from `prisma/migrations/`.
- **Event trigger missing.** If `trg_auto_enable_rls_on_new_tables` isn't there, the snapshot predates the migration `auto_enable_rls_on_new_public_tables` (applied 2026-04-07). Re-apply it manually after restore.
- **Stripe webhook secret mismatch.** A restored DB has stale `EmailReminder.resendMessageId` references and historical Stripe charge IDs. The reconcile cron will see "drift" against current Stripe data. Don't run crons against the restored DB.
