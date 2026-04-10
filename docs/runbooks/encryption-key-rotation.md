# Runbook — Encryption Key Rotation

**Owner:** Security / DevOps · **Last rotated:** _(fill in date)_ · **Cadence:** annually or on key compromise

---

## Overview / Visão Geral

Psycologger uses **AES-256-GCM** for encrypting sensitive patient data at rest. The encryption system supports seamless key rotation via versioning, allowing old data to remain accessible during the transition period.

**O que é criptografado (Encrypted data):**
- Patient CPF (Brazilian tax ID / Identificação Pessoal)
- Clinical session notes (Anotações de sessões clínicas)
- Journal entries (Entradas de diário)
- Journal note annotations (Anotações em entradas de diário)
- Integration credentials (Credenciais de integrações)
- Support messages (Mensagens de suporte ao paciente)

---

## Where the Key Is Stored / Onde a Chave é Armazenada

**Environment Variable:** `ENCRYPTION_KEY`
- **Format:** Base64-encoded 32-byte (256-bit) AES-256 key
- **Length check:** Must be exactly 32 bytes when decoded
- **Location in Vercel:** Settings → Environment Variables → Production/Preview
- **Backup location:** Keep a copy in 1Password vault (sealed envelope) or HSM

**Previous Key (during rotation):** `ENCRYPTION_KEY_PREVIOUS`
- **Purpose:** Temporarily holds the old key during Phase 1
- **Scope:** Allows decryption of old data while new data is encrypted with new key
- **Removal timeline:** Delete after all data is re-encrypted (Step 3–4)

---

## How to Generate a New Key / Como Gerar uma Nova Chave

### Using OpenSSL (Recommended)
```bash
openssl rand -base64 32
```

Example output:
```
xK9gZ2L4pQ1vM8nB3cD5eF7hJ9oR4tU6wX2yA8pL5qN7rS9sT1uV3wX5yZ7aB9cD
```

### Using Node.js
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Verification:** Make sure the output is exactly 44 characters (base64 representation of 32 bytes).

---

## Key Rotation Procedure — Step by Step

### Phase 1: Dual Key Support (New Key Active)

**Prerequisites:**
- [ ] Access to Vercel environment variables (or your deployment system)
- [ ] Database read-only access for verification
- [ ] Team notified (security, on-call engineer)
- [ ] Maintenance window scheduled if needed
- [ ] Current key backed up securely

#### Step 1: Generate New Encryption Key

Run one of the commands above and save the output to a temporary location (do NOT commit to Git).

Example:
```
NEW_KEY=xK9gZ2L4pQ1vM8nB3cD5eF7hJ9oR4tU6wX2yA8pL5qN7rS9sT1uV3wX5yZ7aB9cD
```

#### Step 2: Backup Current Key

Before making any changes, verify and save the current key:

```bash
# On Vercel dashboard or via CLI
vercel env pull  # This will show current ENCRYPTION_KEY (masked)

# Or retrieve from 1Password (check where it's already stored)
```

#### Step 3: Deploy with Both Keys (Phase 1)

Set **two** environment variables in Vercel:

1. `ENCRYPTION_KEY` = NEW_KEY (the new key from Step 1)
2. `ENCRYPTION_KEY_PREVIOUS` = CURRENT_KEY (the old key — backup from Step 2)

Deploy this change to production:
```bash
vercel deploy --prod
# or git push to main (if using automatic deploy)
```

#### Step 4: Verify Phase 1 Deployment

Check the health endpoint immediately:
```bash
curl -s https://psycologger-api.vercel.app/api/v1/health | jq .
```

Expected response (encryption should be `ok`):
```json
{
  "status": "healthy",
  "timestamp": "2026-04-10T14:30:00Z",
  "checks": {
    "database": { "status": "ok", "latencyMs": 45 },
    "encryption": { "status": "ok" }
  },
  "version": "abc1234"
}
```

#### Step 5: Monitor for 24 Hours

Watch logs for decryption failures — look for patterns like:
- `"Decryption failed — unable to decrypt with any available key"`
- Any errors in `decrypt()` or `decryptJson()` calls

**If using Sentry/logging service:**
```bash
# Check for error spikes in the past hour
grep -i "decryption failed" /var/log/app.log
```

**At this stage:**
- ✅ All **new encryptions** use the new key
- ✅ All **old data** (encrypted with old key) still decrypts via `ENCRYPTION_KEY_PREVIOUS`
- ✅ Both keys are available
- ⚠️ Do NOT remove `ENCRYPTION_KEY_PREVIOUS` yet

---

### Phase 2: Re-encrypt Existing Data (Optional but Recommended)

Once Phase 1 is stable (24 hours with no errors), consolidate all data under the new key.

#### Step 6: Run Re-encryption Migration

The codebase includes utilities in `src/lib/crypto.ts`:
- `needsReEncryption(encryptedBase64)` — checks if a value needs re-encryption
- `reEncrypt(encryptedBase64)` — decrypts and re-encrypts with current key

Create a migration script `scripts/reencrypt-all-data.ts`:

```typescript
import { db } from "@/lib/db";
import { decrypt, encrypt, needsReEncryption } from "@/lib/crypto";

async function reencryptField(
  tableName: string,
  fieldName: string,
  filter?: Record<string, any>
) {
  console.log(`[${tableName}] Starting re-encryption of ${fieldName}...`);
  
  // Example for Patient.cpf
  if (tableName === "Patient" && fieldName === "cpf") {
    const patients = await db.patient.findMany({
      where: { cpf: { not: null }, ...filter },
      select: { id: true, cpf: true },
    });

    let count = 0;
    for (const patient of patients) {
      if (patient.cpf && (await needsReEncryption(patient.cpf))) {
        const plaintext = await decrypt(patient.cpf);
        const reencrypted = await encrypt(plaintext);
        
        await db.patient.update({
          where: { id: patient.id },
          data: { cpf: reencrypted },
        });
        
        count++;
        if (count % 100 === 0) {
          console.log(`[${tableName}] Re-encrypted ${count} records...`);
        }
      }
    }
    console.log(`[${tableName}] ✓ Re-encrypted ${count} ${fieldName} fields`);
  }
}

async function main() {
  console.log("Starting key re-encryption migration...\n");

  // Re-encrypt all sensitive fields
  await reencryptField("Patient", "cpf");
  await reencryptField("Patient", "notes");
  
  // ClinicalSession.noteText
  const sessions = await db.clinicalSession.findMany({
    where: { noteText: { not: null } },
    select: { id: true, noteText: true },
  });
  let sessionCount = 0;
  for (const session of sessions) {
    if (await needsReEncryption(session.noteText!)) {
      const plaintext = await decrypt(session.noteText!);
      const reencrypted = await encrypt(plaintext);
      await db.clinicalSession.update({
        where: { id: session.id },
        data: { noteText: reencrypted },
      });
      sessionCount++;
    }
  }
  console.log(`[ClinicalSession] ✓ Re-encrypted ${sessionCount} noteText fields`);

  // JournalEntry + JournalNote.noteText
  const journalNotes = await db.journalNote.findMany({
    where: { noteText: { not: null } },
    select: { id: true, noteText: true },
  });
  let noteCount = 0;
  for (const note of journalNotes) {
    if (await needsReEncryption(note.noteText!)) {
      const plaintext = await decrypt(note.noteText!);
      const reencrypted = await encrypt(plaintext);
      await db.journalNote.update({
        where: { id: note.id },
        data: { noteText: reencrypted },
      });
      noteCount++;
    }
  }
  console.log(`[JournalNote] ✓ Re-encrypted ${noteCount} noteText fields`);

  // SupportMessage.bodyEncrypted
  const supportMessages = await db.supportMessage.findMany({
    where: { bodyEncrypted: { not: null } },
    select: { id: true, bodyEncrypted: true },
  });
  let messageCount = 0;
  for (const msg of supportMessages) {
    if (msg.bodyEncrypted && (await needsReEncryption(msg.bodyEncrypted))) {
      const plaintext = await decrypt(msg.bodyEncrypted);
      const reencrypted = await encrypt(plaintext);
      await db.supportMessage.update({
        where: { id: msg.id },
        data: { bodyEncrypted: reencrypted },
      });
      messageCount++;
    }
  }
  console.log(`[SupportMessage] ✓ Re-encrypted ${messageCount} messages`);

  // IntegrationCredential.encryptedJson
  const credentials = await db.integrationCredential.findMany({
    where: { encryptedJson: { not: null } },
    select: { id: true, encryptedJson: true },
  });
  let credCount = 0;
  for (const cred of credentials) {
    if (await needsReEncryption(cred.encryptedJson)) {
      const plaintext = await decrypt(cred.encryptedJson);
      const reencrypted = await encrypt(plaintext);
      await db.integrationCredential.update({
        where: { id: cred.id },
        data: { encryptedJson: reencrypted },
      });
      credCount++;
    }
  }
  console.log(`[IntegrationCredential] ✓ Re-encrypted ${credCount} credentials`);

  // OAuthToken.encryptedTokenJson
  const oauthTokens = await db.oAuthToken.findMany({
    where: { encryptedTokenJson: { not: null } },
    select: { id: true, encryptedTokenJson: true },
  });
  let tokenCount = 0;
  for (const token of oauthTokens) {
    if (await needsReEncryption(token.encryptedTokenJson)) {
      const plaintext = await decrypt(token.encryptedTokenJson);
      const reencrypted = await encrypt(plaintext);
      await db.oAuthToken.update({
        where: { id: token.id },
        data: { encryptedTokenJson: reencrypted },
      });
      tokenCount++;
    }
  }
  console.log(`[OAuthToken] ✓ Re-encrypted ${tokenCount} OAuth tokens`);

  console.log("\n✓ Key re-encryption complete!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

#### Step 7: Run Re-encryption (Off-peak Hours)

Schedule during low-traffic window (e.g., 2 AM):

```bash
# Dry-run (count records only)
NODE_ENV=production npx ts-node scripts/reencrypt-all-data.ts --dry-run

# Actual migration
NODE_ENV=production npx ts-node scripts/reencrypt-all-data.ts
```

**Expected output:**
```
Starting key re-encryption migration...

[Patient] ✓ Re-encrypted 128 cpf fields
[Patient] ✓ Re-encrypted 64 notes fields
[ClinicalSession] ✓ Re-encrypted 342 noteText fields
[JournalNote] ✓ Re-encrypted 2156 noteText fields
[SupportMessage] ✓ Re-encrypted 89 messages
[IntegrationCredential] ✓ Re-encrypted 12 credentials
[OAuthToken] ✓ Re-encrypted 8 OAuth tokens

✓ Key re-encryption complete!
```

#### Step 8: Verify All Data Is Re-encrypted

Query for any remaining old-format data:

```bash
# Check if any CPF values still need re-encryption
NODE_ENV=production node -e "
const { db } = require('@/lib/db');
const { needsReEncryption } = require('@/lib/crypto');

(async () => {
  const patients = await db.patient.findMany({
    where: { cpf: { not: null } },
    select: { id: true, cpf: true },
  });
  
  let needing = 0;
  for (const p of patients) {
    if (await needsReEncryption(p.cpf)) needing++;
  }
  
  console.log(\`Total patients with CPF: \${patients.length}\`);
  console.log(\`Still need re-encryption: \${needing}\`);
  console.log(\`Re-encrypted: \${patients.length - needing}\`);
})();
"
```

All counts should show `Still need re-encryption: 0`.

---

### Phase 3: Remove Old Key (Single Key Mode)

Once all data is confirmed re-encrypted, remove the old key.

#### Step 9: Remove `ENCRYPTION_KEY_PREVIOUS` from Production

In Vercel:
1. Go to Settings → Environment Variables
2. Delete the `ENCRYPTION_KEY_PREVIOUS` variable
3. Confirm deletion (production environment only)

#### Step 10: Deploy Single-Key Configuration

Deploy this change:
```bash
vercel deploy --prod
```

#### Step 11: Verify Single-Key Mode

Health check should still pass:
```bash
curl -s https://psycologger-api.vercel.app/api/v1/health | jq .checks.encryption
```

Check logs for any errors — there should be none.

---

## What Data Is Encrypted / O Que É Criptografado

| Table | Field | Type | Comments |
|-------|-------|------|----------|
| `Patient` | `cpf` | String (encrypted) | Brazilian tax ID — sensitive PII |
| `Patient` | `notes` | String (encrypted) | Non-clinical header notes |
| `ClinicalSession` | `noteText` | Text (encrypted) | Session notes — clinical data |
| `JournalEntry` | (implicit via JournalNote) | — | Journal entries are text through notes |
| `JournalNote` | `noteText` | Text (encrypted) | Patient/therapist annotations — AES-256-GCM |
| `SupportMessage` | `bodyEncrypted` | String (encrypted) | Support ticket messages — AES-256-GCM |
| `IntegrationCredential` | `encryptedJson` | Text (encrypted) | OAuth credentials, API keys — JSON serialized |
| `OAuthToken` | `encryptedTokenJson` | Text (encrypted) | Google Calendar, Slack tokens — JSON serialized |

**Search index:** Patient.cpfBlindIndex (deterministic HMAC-SHA256, NOT reversible)

---

## Disaster Recovery / Recuperação em Caso de Desastre

### Scenario 1: Key Lost or Compromised

**Impact:** All encrypted data becomes unrecoverable if the key is truly lost.

**Prevention:**
1. **Store the key securely in at least TWO locations:**
   - 1Password (with restricted access, sealed envelope)
   - HSM (Hardware Security Module) if available
2. **Never commit to Git** — even in .env files
3. **Rotate annually** or after team member departure
4. **Log all key changes** in a secure audit trail

**If the key is lost and you have a backup:**
1. Retrieve the backup from 1Password or HSM
2. Set `ENCRYPTION_KEY` to the recovered value
3. Deploy and verify via health check
4. Check logs for any decryption failures

**If the key is truly lost with no backup:**
- ⚠️ **All encrypted data is permanently unrecoverable**
- Patient CPF, clinical notes, journals, support messages are gone
- Patients must be notified of the incident (regulatory requirement in Brazil — LGPD)
- Restore from backups if available (pre-rotation)

---

### Scenario 2: Phase 1 Rollback (Decryption Failures)

If you see errors like:
```
Decryption failed — unable to decrypt with any available key
```

**Immediate action:**
1. Check that `ENCRYPTION_KEY_PREVIOUS` is set correctly
2. Verify both keys are valid base64-encoded 32-byte values:
   ```bash
   node -e "
   const k1 = Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
   const k2 = Buffer.from(process.env.ENCRYPTION_KEY_PREVIOUS, 'base64');
   console.log('Current key length:', k1.length);
   console.log('Previous key length:', k2.length);
   "
   ```
3. Check application logs (Sentry, Vercel logs) for the exact error
4. Do NOT remove `ENCRYPTION_KEY_PREVIOUS` until errors are resolved

**If decryption failures persist:**
1. Keep both keys in place
2. Escalate to the security team
3. Do NOT attempt Phase 2 or 3 until resolved
4. Consider restoring from backup

---

### Scenario 3: Partial Re-encryption Failed

If the re-encryption script crashed halfway through:

1. **Restart the script** — it will skip records already re-encrypted (safe idempotent operation)
2. **Check for errors** in the output log
3. **Verify counts** match total patient/journal numbers
4. **Do NOT proceed to Phase 3** until 100% of data is re-encrypted

---

## Verification Checklist / Lista de Verificação

### Pre-Rotation
- [ ] Current `ENCRYPTION_KEY` backed up securely (1Password + HSM if available)
- [ ] Team notified
- [ ] Monitoring/alerts configured
- [ ] Database backups recent (< 24 hours)

### Phase 1 (Dual Key)
- [ ] New key generated with `openssl rand -base64 32`
- [ ] New key is exactly 44 base64 characters (32 bytes)
- [ ] `ENCRYPTION_KEY` updated in Vercel (new key)
- [ ] `ENCRYPTION_KEY_PREVIOUS` updated in Vercel (old key)
- [ ] Deployment successful
- [ ] Health check passes (`/api/v1/health`)
- [ ] No decryption errors in logs (24-hour monitoring window)

### Phase 2 (Re-encryption)
- [ ] Re-encryption script prepared
- [ ] Dry-run successful (record counts match)
- [ ] Off-peak time window selected (low traffic)
- [ ] Re-encryption script executed successfully
- [ ] All encrypted fields re-encrypted (verify counts)
- [ ] Sample data spot-checks pass (decrypt manually, verify integrity)
- [ ] No errors in application logs post-migration

### Phase 3 (Single Key)
- [ ] `ENCRYPTION_KEY_PREVIOUS` removed from environment
- [ ] Deployment successful
- [ ] Health check passes
- [ ] No errors in logs (24-hour final monitoring)
- [ ] Old `ENCRYPTION_KEY` securely stored as historical backup
- [ ] Rotation documented in change log

---

## Monitoring and Validation / Monitoramento

### Health Check Endpoint

```bash
curl -s https://psycologger-api.vercel.app/api/v1/health | jq .
```

Encryption status should always show `"ok"`. Any other status indicates an issue.

### Log Patterns to Watch

**During Phase 1 (both keys present):**
- Errors about decryption should NOT appear
- Info logs showing both keys available are normal

**During Phase 2 (re-encryption):**
- Info: `[crypto] Re-encrypted X records`
- Warning: `[crypto] ENCRYPTION_KEY_PREVIOUS is set but invalid` → fix immediately
- Errors: None should occur

**During Phase 3 (single key):**
- Warning logs about `ENCRYPTION_KEY_PREVIOUS` can be ignored (it's not set)
- Errors: None should appear
- Old data should still decrypt seamlessly

### Manual Data Verification

Pick a few records and verify decryption:

```bash
# Via API
curl -H "Authorization: Bearer <admin_token>" \
  https://psycologger-api.vercel.app/api/v1/patients/<id> \
  | jq '.cpf'

# Should return a valid CPF like "12345678900" (decrypted and unmasked)
# NOT encrypted base64
```

---

## Rollback Procedure / Procedimento de Reversão

If rotation fails catastrophically:

1. **Revert environment variables:**
   ```
   ENCRYPTION_KEY = original key
   ENCRYPTION_KEY_PREVIOUS = (delete)
   ```

2. **Deploy immediately:**
   ```bash
   vercel deploy --prod
   ```

3. **Verify:**
   ```bash
   curl -s https://psycologger-api.vercel.app/api/v1/health | jq .
   ```

4. **Monitor logs** for 24 hours

**Note:** If you deployed a new key and data was encrypted with it, reverting without keeping the new key as `ENCRYPTION_KEY_PREVIOUS` will make that new data unrecoverable. Always keep rotation keys available until you're confident the migration succeeded.

---

## Timeline Example / Cronograma de Exemplo

```
Day 0 (Tuesday 10:00 AM):
  - Generate new key
  - Deploy Phase 1 (both keys)
  - Verify health check
  - Begin 24-hour monitoring

Day 1–7 (Wednesday–Tuesday):
  - Monitor logs continuously
  - Verify no decryption errors
  - Confirm Phase 1 stable

Day 7 (Tuesday 10:00 PM):
  - Run re-encryption script (off-peak)
  - Monitor output
  - Verify all records re-encrypted

Day 8 (Wednesday 8:00 AM):
  - Verify re-encryption complete
  - Remove ENCRYPTION_KEY_PREVIOUS
  - Deploy Phase 3 (single key)

Day 8 (Wednesday 10:00 AM):
  - Final health check
  - Spot-check decryption of old records
  - Document completion

Day 9 (Thursday):
  - Final log review (no errors)
  - Archive old key securely
  - Close rotation ticket
```

---

## References / Referências

- **Crypto implementation:** `src/lib/crypto.ts`
  - `encrypt()` / `decrypt()` — string encryption
  - `encryptJson()` / `decryptJson()` — JSON encryption
  - `needsReEncryption()` — check if value needs re-encryption
  - `reEncrypt()` — seamless re-encryption
  
- **Database schema:** `prisma/schema.prisma`
  - Patient, ClinicalSession, JournalEntry, JournalNote models
  - Encrypted field annotations
  
- **Health check endpoint:** `src/app/api/v1/health/route.ts`
  - Returns encryption status
  
- **Backup & restore:** `docs/runbooks/BACKUP_RESTORE.md`
  - Instructions for restoring encrypted data from backups

---

**Last updated:** 2026-04-10 · **Reviewed by:** _(fill in name)_
