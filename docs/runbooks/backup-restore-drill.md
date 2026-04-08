# Backup & Restore Runbook

## Current backup posture

| Item           | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Strategy       | GitHub Actions → encrypted `pg_dump` → artifact storage        |
| Cadence        | Hourly at `:05` (UTC), plus manual `workflow_dispatch`         |
| Retention      | 30 days (GitHub artifact `retention-days: 30`)                 |
| Encryption     | GPG symmetric, AES-256, passphrase in `BACKUP_PASSPHRASE` secret |
| Scope          | Application schema (`public`), excludes Supabase internals     |
| Integrity      | `sha256sum` sidecar shipped with every artifact                |
| Trigger file   | `.github/workflows/db-backup.yml`                              |
| Restore script | `scripts/restore-backup.sh`                                    |

The dump excludes these Supabase-managed schemas so the artifact stays
portable across projects: `auth`, `storage`, `graphql*`, `realtime`,
`supabase_functions`, `extensions`, `pgsodium*`, `vault`. The
application's own `public` schema is captured in full — including
NextAuth's `User`, `Account`, `Session`, and `VerificationToken` tables,
so staff logins survive a restore.

## One-time setup (do this first)

1. **Generate the passphrase.** Strong random string, store in a
   password manager BEFORE adding to GitHub — if you lose it, every
   backup becomes unrecoverable ciphertext.

   ```bash
   openssl rand -base64 48
   ```

2. **Add the two repo secrets** at
   `Settings → Secrets and variables → Actions → New repository secret`:

   - `SUPABASE_DIRECT_URL` — Supabase → Project Settings → Database →
     Connection string → **URI** tab. Use the **direct** connection
     (port 5432), NOT the pooler (6543). Format:
     `postgresql://postgres.<ref>:<password>@<host>:5432/postgres`
   - `BACKUP_PASSPHRASE` — the passphrase from step 1.

3. **Trigger a manual run**: `Actions → Database backup → Run workflow
   → main`. First run takes 30–90s and produces an artifact named
   `psycologger-backup-YYYYMMDDTHHMMSSZ`.

4. **Verify decryption locally** — this is the single most important
   step. A backup that can't be decrypted isn't a backup.

   ```bash
   gh run download <run-id> --name psycologger-backup-<stamp>
   export BACKUP_PASSPHRASE='...the passphrase...'
   gpg --batch --pinentry-mode loopback \
     --passphrase "$BACKUP_PASSPHRASE" \
     --decrypt psycologger-<stamp>.dump.gpg > /tmp/test.dump
   pg_restore --list /tmp/test.dump | head   # should list tables
   rm /tmp/test.dump
   ```

   If this fails, fix it *now* — not during an outage.

## Recovery drill (run quarterly)

A backup is only as good as the last successful restore. Schedule a
30-minute drill every quarter.

1. **Create a throwaway Supabase project** (free tier, any region).
   Copy its direct connection string.

2. **Download the most recent backup:**

   ```bash
   gh run list --workflow db-backup.yml --limit 5
   gh run download <run-id>
   ```

3. **Run the restore script:**

   ```bash
   export BACKUP_PASSPHRASE='...'
   scripts/restore-backup.sh \
     psycologger-<stamp>.dump.gpg \
     'postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres'
   ```

4. **Sanity-check in the Supabase SQL editor:**

   ```sql
   SELECT COUNT(*) FROM "Tenant";
   SELECT COUNT(*) FROM "User";
   SELECT COUNT(*) FROM "Patient";
   SELECT COUNT(*) FROM "Appointment";
   SELECT MAX("createdAt") FROM "Appointment";
   ```

   `MAX(createdAt)` shows how close to the backup moment your data lands.

5. **Record the drill** in the log below.

6. **Delete the throwaway project** — don't leave orphans accumulating.

## Recovery from a real disaster

1. Identify the most recent **clean** backup (before whatever broke prod).
2. `gh run download <run-id>` to retrieve the artifact.
3. **Never restore over the live database directly.** Instead:
   - Restore into a fresh Supabase project via `scripts/restore-backup.sh`.
   - Verify the restored data.
   - Point Vercel's `DATABASE_URL` at the new project.
   - Redeploy.
   - Flip DNS / domain aliases if applicable.
4. Only after the new project is serving traffic, pause the broken
   project (don't delete — it may be forensically useful).
5. Write a postmortem within 48 hours. Blame-free, focused on what the
   system allowed to go wrong.

## Drill log

| Date       | Drilled by | Result | Restore time | Notes                          |
| ---------- | ---------- | ------ | ------------ | ------------------------------ |
| _TBD_      | _TBD_      | _TBD_  | _TBD_        | First drill pending user setup |

## Known limitations

- **Hourly RPO** means worst-case data loss is ~1 hour. If you need
  tighter, enable Supabase Point-in-Time Recovery (paid add-on) — that
  gives minute-level recovery without replacing this workflow.
- **30-day retention.** If LGPD requires longer, add a second job that
  periodically copies artifacts to Cloudflare R2 / Backblaze B2 / a
  private GitHub release.
- **Supabase Auth `auth` schema is excluded.** NextAuth uses its own
  tables in `public`, so staff login survives. If you migrate to
  Supabase Auth, revisit the schema excludes in the workflow.
- **Application secrets are not backed up here.** Vercel's env store
  is the source of truth; keep a copy of `.env` in a password manager.

## TODO

- [ ] Sentry alert on `db-backup` workflow failure.
- [ ] Quarterly drill calendar entry.
- [ ] Long-term cold storage for LGPD retention if required.
