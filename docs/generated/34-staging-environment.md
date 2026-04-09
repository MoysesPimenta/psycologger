# Staging environment setup — Psycologger

Goal: a second Vercel environment that mirrors prod but writes to an isolated Supabase project (`kwqazxlnvbcwyabbomvc`), so destructive tests, migration dry-runs, and QA don't touch real patient data.

## One-time Vercel wiring

1. In the Vercel dashboard for `psycologger`, go to Settings → Git and add a second Production Branch named `staging`.
   - If Vercel only allows one production branch on Hobby, use the default Preview environment instead and pin the `staging` branch to it under Settings → Environment Variables → Preview → "Git branch override".
2. Create a Vercel env group called `staging`:
   - `DATABASE_URL` → pooled connection string for `kwqazxlnvbcwyabbomvc`
   - `DIRECT_URL` → direct connection string for `kwqazxlnvbcwyabbomvc`
   - `NEXTAUTH_URL` → `https://staging.psycologger.com` (or the Vercel-generated staging hostname)
   - `NEXTAUTH_SECRET` → **new value, never share with prod**
   - `ENCRYPTION_KEY` → **new 32-byte base64 key, never reuse prod**
   - `ENCRYPTION_KEY_PREVIOUS` → leave unset until the first rotation
   - `CRON_SECRET` → new value
   - `STRIPE_SECRET_KEY` → `sk_test_...` (Stripe Test mode only)
   - `STRIPE_WEBHOOK_SECRET` → whatever Stripe CLI prints for the staging endpoint
   - `RESEND_API_KEY` → new restricted key; do NOT send real email from staging
   - `RESEND_WEBHOOK_SECRET` + `RESEND_WEBHOOK_SECRET_INBOUND` → new values
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → from the staging Supabase project
   - `MOBILE_BEARER_ENABLED` → `true` on staging so mobile client work can be validated
   - `MOBILE_JWT_SECRET` → new value
3. Scope each variable to `Preview` (or your new `staging` production environment) and leave `Production` pointing at the existing prod values.

## Git workflow

- `main` → prod (`tgkgcapoykcazkimiwzw`)
- `staging` → staging (`kwqazxlnvbcwyabbomvc`)

Merge flow: work on feature branches, PR → `staging`, smoke-test on the staging URL, then PR `staging → main` once green. The existing `vercel.json` cron schedule applies to both environments automatically, which means the staging-keepalive cron (already in-tree at `src/app/api/v1/cron/staging-keepalive/route.ts`) will continue to hit `STAGING_DATABASE_URL` on the prod deployment — that's fine, it's read-only.

## Supabase staging project

- Project ref: `kwqazxlnvbcwyabbomvc`
- Apply all existing migrations once: `DATABASE_URL=<staging-direct-url> npx prisma migrate deploy`
- Seed with `prisma/seed.ts` if you want a baseline tenant. Never clone prod data.
- Create matching Storage buckets (`patient-files`, `clinical-files`, `support-attachments`, etc.) with the same private/public settings as prod.

## Email isolation

Resend staging domain should be something like `staging.psycologger.com`. Configure Resend to send all outbound to a catch-all inbox or use `RESEND_SAFE_MODE=true` (if we add it) to route to a test mailbox. For now, keep `RESEND_API_KEY` as a test-mode key so nothing real goes out.

## Testing against staging

The existing `.env.local` pulls from Vercel development env. For staging runs, pull the staging env locally: `vercel env pull .env.staging --environment=preview`, then `npm run dev -- --env-file .env.staging`.

## What still needs human action

1. Pick the staging hostname (e.g. `staging.psycologger.com`) and add the DNS record.
2. Create the Stripe test-mode webhook pointing at `https://<staging-host>/api/v1/webhooks/stripe`.
3. Create the Resend inbound webhook pointing at `https://<staging-host>/api/v1/webhooks/resend-inbound` with its own Svix secret.
4. (Optional) Add a Vercel Preview Protection password so staging isn't public.
