# Sentry Alert Configuration

**Status:** TODO — configure in Sentry UI (this can't be done from code).

## Goal

Sentry without alerts is just a logbook. Configure these three rules so production errors actually wake somebody up.

## Rules to create

In Sentry → Alerts → Create Alert → "Issues":

### 1. Any new issue in production

- **Trigger:** A new issue is created
- **Filter:** `environment` equals `production`
- **Action:** Send email to ops inbox + (optionally) Slack `#alerts`
- **Frequency:** Once per issue (never)
- **Why:** First time we see a class of error in prod, we want to know immediately.

### 2. Error rate spike

- **Trigger:** Number of events in an issue is more than 20 in 5 minutes
- **Filter:** `environment` equals `production`
- **Action:** Send email + Slack
- **Frequency:** Once per hour per issue
- **Why:** Catches things that were fine in deploy then broke under traffic. The threshold is intentionally low for a small user base — raise to 100/5min once you have >1000 DAU.

### 3. Patient portal errors (high sensitivity)

- **Trigger:** A new issue is created
- **Filter:** `environment` equals `production` AND `transaction` starts with `/portal/` OR `/api/v1/portal/`
- **Action:** Send email + Slack with `[PORTAL]` prefix
- **Frequency:** Once per issue (never)
- **Why:** Portal errors are seen by patients, not staff. Higher urgency.

## Vercel deployment failure alert

Separately, in Vercel → Project Settings → Notifications, enable email for "Deployment Error" and "Deployment Ready (production only)". This catches build failures the same way Sentry catches runtime failures.

## Verification

After configuring rules 1–3, hit the test endpoint to confirm rule 1 fires:

```bash
curl -i https://psycologger.vercel.app/api/debug/sentry-test \
  -H "Authorization: Bearer $CRON_SECRET"
```

You should receive an alert email within ~60 seconds. If you don't, the rule's environment filter is wrong (the test endpoint reports `environment=production`).
