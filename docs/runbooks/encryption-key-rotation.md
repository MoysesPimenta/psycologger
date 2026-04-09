# Encryption Key Rotation Runbook

## Overview

Psycologger uses AES-256-GCM for encrypting sensitive data at rest:
- Patient CPF (Brazilian tax ID)
- Clinical session notes
- Journal entries
- Patient notes
- Integration credentials

The encryption system supports seamless key rotation via versioning, allowing old data to remain accessible during the transition period.

## Key Rotation Procedure

### Prerequisites

- Access to production environment variables (Vercel, .env.local, or secrets manager)
- Node.js (for key generation and verification)
- Database access (read-only for verification)
- No concurrent encryption operations during the process

### Step 1: Generate New Encryption Key

Generate a new 256-bit (32-byte) base64-encoded key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Example output:
```
xK9gZ2L4pQ1vM8nB3cD5eF7hJ9oR4tU6wX2yA8pL5qN7rS9sT1uV3wX5yZ7aB9cD
```

### Step 2: Deploy New Key (Phase 1: Dual Key Support)

1. **Set environment variables** in your deployment system:
   - `ENCRYPTION_KEY` = the new key (from Step 1)
   - `ENCRYPTION_KEY_PREVIOUS` = the current/old key (to maintain compatibility)

2. **Deploy** the updated environment to production.

3. **Verify deployment**:
   ```bash
   curl https://your-domain/api/v1/health
   ```
   Check that `checks.encryption.status` is `"ok"`.

4. **Monitor logs** for 24 hours to ensure no decryption failures:
   ```bash
   # Look for error logs containing "Decryption failed"
   # These indicate data encrypted with an unavailable key
   ```

At this stage:
- All **new encryptions** use the new key
- **Old data** (encrypted with the old key) still decrypts using `ENCRYPTION_KEY_PREVIOUS`
- Both keys are available to decrypt any record

### Step 3: Re-encrypt Existing Data (Optional but Recommended)

To consolidate all data under the new key, run a re-encryption migration:

```bash
# Create a migration script (example)
npx ts-node scripts/reencrypt-all-data.ts
```

Example script structure:

```typescript
import { db } from "@/lib/db";
import { decrypt, encrypt, needsReEncryption } from "@/lib/crypto";

async function reencryptAll() {
  // Re-encrypt CPF fields
  const patientsWithCpf = await db.patient.findMany({
    where: { cpf: { not: null } },
    select: { id: true, cpf: true },
  });

  for (const patient of patientsWithCpf) {
    if (await needsReEncryption(patient.cpf!)) {
      const decrypted = await decrypt(patient.cpf!);
      const reencrypted = await encrypt(decrypted);
      await db.patient.update({
        where: { id: patient.id },
        data: { cpf: reencrypted },
      });
      console.log(`Re-encrypted CPF for patient ${patient.id}`);
    }
  }

  // Repeat for: patient.notes, clinicalSession.noteText, journalEntry.noteText, etc.
}

reencryptAll().catch(console.error);
```

Monitor progress and re-encrypt:
- Patient CPF (`Patient.cpf`)
- Patient notes (`Patient.notes`)
- Clinical session notes (`ClinicalSession.noteText`)
- Journal entries (`JournalEntry.noteText`)
- Journal note annotations (`JournalNote.noteText`)
- Integration credentials (`IntegrationCredential.encryptedJson`)

### Step 4: Remove Old Key (Phase 2: Single Key)

Once all data has been re-encrypted to the new key:

1. **Remove** `ENCRYPTION_KEY_PREVIOUS` from environment variables.
2. **Deploy** to production.
3. **Verify** via health check and logs that no decryption errors occur.

The system now uses only the new key. The old key is no longer accessible.

## Rollback Procedure

If rotation fails or needs to be reversed:

1. Revert environment variables to the original state.
2. Deploy to production.
3. Monitor health checks and logs.

**Note**: Data encrypted with the new key during Phase 1 becomes inaccessible if you rollback without keeping the new key as `ENCRYPTION_KEY_PREVIOUS`. Plan rollbacks carefully.

## Monitoring and Validation

### Health Check

```bash
curl https://your-domain/api/v1/health
```

Success response:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-15T10:30:00Z",
  "checks": {
    "database": { "status": "ok", "latencyMs": 45 },
    "encryption": { "status": "ok" }
  },
  "version": "abc1234"
}
```

### Log Monitoring

Watch for decryption errors indicating a problem with key rotation:

```bash
# Production logs
grep -i "decryption failed" /var/log/app.log

# Or via application logging service
# (e.g., CloudFlare Workers Tail, Vercel Edge Function Logs)
```

### Data Integrity Checks

Verify that sensitive fields are still readable:

```bash
# Query a patient with CPF and validate decryption
curl -H "Authorization: Bearer <token>" \
  https://your-domain/api/v1/patients/<id>
```

Ensure `cpf` field is populated and valid.

## Troubleshooting

### Decryption Failures

**Symptom**: Errors like "Decryption failed — unable to decrypt with any available key"

**Causes**:
- The old key is not in `ENCRYPTION_KEY_PREVIOUS` during Phase 1
- `ENCRYPTION_KEY` is not the correct new key
- Data was corrupted or partially encrypted

**Resolution**:
1. Check that `ENCRYPTION_KEY_PREVIOUS` is set correctly
2. Verify both keys are valid base64-encoded 32 bytes
3. Check application logs for the exact error message
4. If data is corrupted, you may need to restore from backups

### Key Format Issues

**Symptom**: "ENCRYPTION_KEY must be 32 bytes (256-bit), base64-encoded"

**Check**:
```bash
node -e "const k = Buffer.from(process.env.ENCRYPTION_KEY, 'base64'); console.log('Length:', k.length, 'bytes');"
```

Must be exactly 32 bytes. Regenerate if needed.

## Automation

For large-scale deployments, consider automating re-encryption:

1. **Scheduled cron job** to re-encrypt batches of records
2. **Gradual rollout** to avoid database load spikes
3. **Monitoring** to detect and retry failures

Example cron job:

```bash
# Re-encrypt 1000 records per night
0 2 * * * npx ts-node scripts/reencrypt-batch.ts --limit 1000
```

## Timeline Example

- **Day 0 (Tuesday)**: Generate new key, deploy with `ENCRYPTION_KEY_PREVIOUS`
- **Day 1–7**: Monitor logs, verify no decryption errors
- **Day 7 (Tuesday)**: Run re-encryption script (off-peak hours)
- **Day 8**: Verify all data re-encrypted, remove `ENCRYPTION_KEY_PREVIOUS`
- **Day 8 (Wednesday)**: Deploy single-key configuration
- **Day 9**: Final verification and closure

## References

- [Crypto Module Documentation](../../../src/lib/crypto.ts)
- [Patient Model](../../../prisma/schema.prisma)
- [Health Check Endpoint](../../../src/app/api/v1/health/route.ts)
