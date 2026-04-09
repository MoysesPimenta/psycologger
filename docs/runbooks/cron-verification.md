# Cron Job Verification Runbook

## Overview

Psycologger uses scheduled cron jobs (via Vercel crons) to perform critical maintenance tasks:
- LGPD data retention purges
- Session soft-delete cleanup
- File cleanup and archival
- Payment reminders
- Appointment reminders
- Health checks and monitoring

This runbook documents how to verify that all configured crons are running correctly.

## Configured Crons

### Current Crons (from `vercel.json`)

Review your `vercel.json` file to identify all scheduled crons:

```bash
cat vercel.json | jq '.crons // []'
```

Expected output structure:
```json
{
  "crons": [
    {
      "path": "/api/crons/lgpd-purge",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/crons/session-cleanup",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/crons/file-cleanup",
      "schedule": "0 4 * * *"
    },
    {
      "path": "/api/crons/payment-reminders",
      "schedule": "0 9 * * MON-FRI"
    },
    {
      "path": "/api/crons/appointment-reminders",
      "schedule": "30 7 * * *"
    }
  ]
}
```

### Cron Schedule Reference

| Schedule | Meaning |
|----------|---------|
| `0 2 * * *` | Daily at 2:00 AM UTC |
| `0 3 * * *` | Daily at 3:00 AM UTC |
| `0 4 * * *` | Daily at 4:00 AM UTC |
| `0 9 * * MON-FRI` | 9:00 AM UTC, Monday–Friday |
| `30 7 * * *` | 7:30 AM UTC daily |
| `0 0 * * 0` | Weekly on Sunday at midnight UTC |

See [crontab.guru](https://crontab.guru/) for schedule help.

## Verification Steps

### Step 1: Check Vercel Cron Logs

**Via Vercel Dashboard:**

1. Go to [vercel.com](https://vercel.com)
2. Select your project → **Deployments** → Latest deployment
3. Click **Functions** tab
4. Click on each cron endpoint (e.g., `/api/crons/lgpd-purge`)
5. Review recent invocations and logs

**Via Vercel CLI:**

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Login
vercel login

# View recent logs (requires project context)
vercel logs --follow --tail=100 --filter="crons"
```

### Step 2: Check Application Logs

Search application logs (Sentry, CloudFlare, or your logging service) for cron execution:

```bash
# Example: CloudFlare Workers Tail
wrangler tail --format pretty --status ok

# Example: Sentry
# Filter by tags: environment:production, type:cron_execution
```

Look for success or failure indicators:
- Success: "Cron executed successfully", HTTP 200
- Failure: Error messages, HTTP non-200 status codes

### Step 3: Verify Cron Execution Timestamps

Query the database to check when crons last ran:

```sql
-- Check when LGPD purges occurred
SELECT action, MAX(createdAt) as last_run
FROM "AuditLog"
WHERE action = 'TENANT_LGPD_PURGED'
GROUP BY action;

-- Check session cleanup
SELECT COUNT(*) as deleted_sessions, MAX("deletedAt") as latest_cleanup
FROM "ClinicalSession"
WHERE "deletedAt" > NOW() - INTERVAL '1 day';

-- Check file cleanup
SELECT COUNT(*) as deleted_files, MAX("deletedAt") as latest_cleanup
FROM "FileObject"
WHERE "deletedAt" > NOW() - INTERVAL '1 day';
```

### Step 4: Manual Cron Invocation (Testing)

To test a cron without waiting for the scheduled time:

```bash
# Use curl with proper authentication
curl -X POST https://your-domain/api/crons/lgpd-purge \
  -H "Authorization: Bearer $(date +%s | sha256sum | cut -c1-32)" \
  -H "Content-Type: application/json"
```

**Important**: Crons typically require a secret token for security. Check your implementation:

```typescript
// Example from src/app/api/crons/lgpd-purge/route.ts
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ... cron logic
}
```

Use the correct `CRON_SECRET`:

```bash
curl -X POST https://your-domain/api/crons/lgpd-purge \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Step 5: Check Cron Response Format

Expected responses for successful cron execution:

```json
{
  "status": "success",
  "action": "lgpd-purge",
  "processed": 5,
  "duration_ms": 2340,
  "timestamp": "2026-03-15T02:00:15Z"
}
```

Expected responses for failures:

```json
{
  "status": "error",
  "action": "lgpd-purge",
  "error": "Database connection failed",
  "timestamp": "2026-03-15T02:00:15Z"
}
```

## Monitoring Checklist

### Daily (Automated)

- [ ] All crons execute within their scheduled time window (±5 minutes)
- [ ] No crons return HTTP 500 or other error codes
- [ ] Database query performance for cron operations is acceptable (<5s)
- [ ] Audit logs record successful cron executions

### Weekly (Manual Review)

- [ ] Review Vercel cron logs for the past 7 days
- [ ] Verify database state changes from cron operations:
  - LGPD: Check for tenant purges and data deletions
  - Session cleanup: Verify soft-deleted sessions are removed after 30 days
  - File cleanup: Verify orphaned files are cleaned up
- [ ] Check for any errors in application logs
- [ ] Validate audit trail reflects all operations

### Monthly (Full Audit)

- [ ] Review all cron endpoints in code (`src/app/api/crons/*/route.ts`)
- [ ] Verify cron secrets are not logged or exposed
- [ ] Check that cron execution respects tenant isolation
- [ ] Verify rate limiting on cron endpoints (if enabled)
- [ ] Test manual invocation of each cron
- [ ] Review and update `vercel.json` if crons have changed

## Troubleshooting

### Cron Not Running

**Symptom**: Cron endpoint receives no invocations

**Checks**:
1. Verify `vercel.json` has the correct cron path and schedule
2. Deploy to production (crons only work on production)
3. Check Vercel dashboard for deployment status
4. Ensure cron endpoint returns HTTP 200 or 204 on success

**Resolution**:
```bash
# Redeploy to trigger cron registration
vercel deploy --prod
```

### Cron Runs but Fails

**Symptom**: Cron invokes but returns error status

**Checks**:
1. Review error message in logs
2. Test endpoint manually to reproduce
3. Check database connectivity
4. Verify environment variables (e.g., `CRON_SECRET`)

**Resolution**:
```bash
# Test cron endpoint manually
curl -X POST https://your-domain/api/crons/lgpd-purge \
  -H "Authorization: Bearer $CRON_SECRET" \
  -v

# Check Vercel logs for detailed error
vercel logs --follow --filter="lgpd-purge"
```

### Cron Timeout

**Symptom**: Cron invocation exceeds time limit (typically 60 seconds on Vercel)

**Causes**:
- Processing too many records in a single batch
- Database query performance is poor
- Network latency to database

**Resolution**:
1. Implement batching (process N records per invocation)
2. Add database indexes for cron queries
3. Optimize query performance
4. Split cron into multiple smaller crons

Example batching:

```typescript
const BATCH_SIZE = 100;
let processed = 0;

while (true) {
  const records = await db.record.findMany({
    where: { needsProcessing: true },
    take: BATCH_SIZE,
  });

  if (records.length === 0) break;

  for (const record of records) {
    // Process record
    processed++;
  }

  // Stop if approaching timeout (60s limit on Vercel)
  if (processed > 1000) break;
}

return Response.json({
  status: "success",
  processed,
  hasMore: processed >= 1000,
});
```

### High Database Load from Crons

**Symptom**: Database connection pool exhausted, queries slow during cron windows

**Resolution**:
1. Shift cron times to avoid peak traffic
2. Implement rate limiting or throttling
3. Add database connection pooling
4. Split heavy crons into multiple batches

## Security Considerations

### Cron Secret Protection

Ensure `CRON_SECRET` is:
- Stored as an environment variable (never hardcoded)
- Not logged or exposed in error messages
- Different from API keys or database passwords
- Rotated periodically

### Authentication

All cron endpoints should require authentication:

```typescript
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    // Log attempt without exposing token
    console.warn("[cron] Unauthorized access attempt");
    return new Response("Unauthorized", { status: 401 });
  }
  // ... trusted cron logic
}
```

### Tenant Isolation

Crons that operate on tenant data must:
- Iterate over all tenants
- Respect tenant-specific settings (e.g., LGPD retention periods)
- Not expose data across tenants

## References

- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- [Crontab Guru](https://crontab.guru/)
- LGPD Configuration: `src/lib/lgpd.ts`
- Health Check Endpoint: `src/app/api/v1/health/route.ts`
