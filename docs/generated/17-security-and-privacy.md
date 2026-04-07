# Security and Privacy

Psycologger processes sensitive health data (Protected Health Information) for Brazilian psychologists and their patients. This document outlines security controls, privacy safeguards, and regulatory alignment.

---

## Authentication

### Staff Authentication (NextAuth v4)
- **Method**: JWT token stored in secure, httpOnly cookie
- **Session Duration**: 24 hours with automatic refresh
- **Password Requirements**: Enforced via Zod schema (minimum 10 characters, mix of uppercase/lowercase/numbers/symbols)
- **Password Hashing**: PBKDF2 with 600,000 iterations (OWASP 2023 recommendation)
- **Password Reset**: One-time link sent via email, expires in 1 hour

### Patient Authentication (Custom Implementation)
- **Method**: Magic link via email (passwordless)
- **Token**: 32-byte random string (crypto.getRandomValues)
- **Expiration**: 15 minutes per token
- **Delivery**: Resend email service with HTML escaping
- **Comparison**: Timing-safe comparison (`crypto.subtle.timingSafeEqual`) prevents brute-force attacks
- **Rate Limiting**: 3 attempts per 10 minutes per email

### Separation of Concerns
- Staff and patient authentication systems are **completely independent**
- No shared session tokens
- No privilege escalation path between staff ↔ patient
- Different database tables: `StaffAccount` vs. `PatientAuthToken`
- Different middleware: NextAuth middleware for staff, custom middleware for patient

---

## Authorization

### Role-Based Access Control (RBAC)

**Staff Roles**:
- `SUPERADMIN`: Full tenant access, staff management, billing
- `ADMIN`: Tenant management, staff invites, billing
- `PSYCHOLOGIST`: View assigned patients, manage appointments, journal entries, reports
- `BILLING`: View payments, send reminders, export financial reports
- `SUPPORT`: View audit logs, patient lookup (limited)

**Patient Access**:
- View own profile, health questionnaire, session notes (shared by psychologist)
- Submit journal entries
- View appointments and reminders
- Manage consent preferences

### Permission System

**27 Permissions** (enforced via `requirePermission()` middleware):
- `staff:read`, `staff:create`, `staff:update`, `staff:delete`
- `patient:read`, `patient:create`, `patient:update`, `patient:delete`
- `appointment:read`, `appointment:create`, `appointment:update`, `appointment:delete`
- `session:read`, `session:create`, `session:update`, `session:delete`
- `journal:read`, `journal:create`, `journal:delete` (no update, audit trail)
- `payment:read`, `payment:create`, `payment:delete`
- `audit:read`
- `consent:read`, `consent:accept`, `consent:revoke`
- `reports:read`, `reports:export`

### Scope Filtering

Every API handler implements tenant-based scope filtering:

```typescript
// Example: PSYCHOLOGIST can only see their assigned patients
const patients = await db.patient.findMany({
  where: {
    tenantId: currentTenant.id,           // Tenant scope
    assignedPsychologistId: userId,       // Staff scope
  },
});
```

Patient portal access scoped by `patientAuthId`:
```typescript
const journal = await db.journal.findFirst({
  where: {
    id: journalId,
    patientId: patientAuthId,  // Patient scope
  },
});
```

---

## Insecure Direct Object Reference (IDOR) Mitigation

**Strategy**: Every database query includes `tenantId` AND appropriate scope filter.

**Examples**:
- Fetch patient: `tenantId` + `patientId` + `assignedPsychologistId` (staff view)
- Fetch patient: `tenantId` + `patientId` (admin view)
- Fetch appointment: `tenantId` + `appointmentId` + `(attendeeId OR createdBy)`
- Fetch journal entry: `patientId` + `patientAuthId` (patient view)

**Verification**: Middleware ensures `tenantId` in session matches `tenantId` in request.

---

## Input Validation

**Framework**: Zod schema validation on all inputs (request body, query params, file uploads)

**Key Schemas**:
- `CreatePatientSchema`: Name, email, CPF, birthDate
- `CreateAppointmentSchema`: Date, time, duration, notes, psychologistId
- `CreateJournalEntrySchema`: Title, noteText (encrypted), mood, tags
- `CreatePaymentSchema`: Amount, currency, dueDate, paymentMethod

**Validation Location**: API route handlers (`src/app/api/**/route.ts`)

**File Upload Validation**:
- Magic-byte checking (file signature, not just MIME type)
- Whitelist: PDF, DOCX, XLSX, MP4, MP3, WAV
- Size limit: 25 MB
- Scanned by file type detector (`file-type` npm package)

---

## Cross-Site Request Forgery (CSRF) Protection

**Method**: Double-submit cookie pattern (industry standard, no server-side session storage)

**Implementation**:
1. Client sends CSRF token in `X-CSRF-Token` header
2. Middleware verifies token matches cookie value
3. Protected methods: POST, PATCH, PUT, DELETE
4. Exempt: GET, cron jobs (no state change), auth endpoints

**Validation Code** (in `src/middleware.ts`):
```typescript
if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies.get('csrf-token')?.value;
  if (headerToken !== cookieToken) {
    return NextResponse.json({ error: 'CSRF token mismatch' }, { status: 403 });
  }
}
```

**Token Rotation**: New token issued on login, refresh, and periodically during session.

---

## Cross-Site Scripting (XSS) Prevention

**Content Security Policy (CSP)**:
```
default-src 'self';
script-src 'self' 'nonce-{random}' 'strict-dynamic';
style-src 'self' 'nonce-{random}';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://api.resend.com;
frame-ancestors 'none';
```

**Nonce Strategy**:
- Generated per request: `crypto.randomUUID()`
- Injected into `<script>` and `<style>` tags
- Prevents inline script execution without nonce

**HTML Escaping**:
- All user input escaped in email templates
- Email rendering libraries auto-escape
- No `dangerouslySetInnerHTML` in React components

**Framework Protection**:
- Next.js auto-escapes JSX content
- No manual `innerHTML` assignments

---

## CORS

**Default**: Same-Origin (Next.js default behavior)

**Allowed External Origins**:
- None explicitly configured (all requests must originate from app domain)
- Supabase Storage: Uses signed URLs (no CORS needed)
- Resend: Backend-only (no browser CORS)

**Rationale**: Single-page app hosted on single domain; no external API consumption from browser.

---

## Secret Management

**Environment Variables**:
- Validated at startup via `src/lib/env-check.ts`
- Required secrets: `DATABASE_URL`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Never logged or exposed in error messages
- Fail-fast on missing secret (app refuses to start)

**No Hardcoded Secrets**: All secrets loaded from environment only.

**Integration Credentials**:
- Google OAuth tokens: Encrypted at rest in database (AES-256-GCM)
- Supabase service key: Env var only, never persisted
- CRON_SECRET: Env var, validated in cron route handlers

---

## Database Defense in Depth (RLS)

**Status**: Enabled on all `public` tables in both production (`tgkgcapoykcazkimiwzw`) and staging (`kwqazxlnvbcwyabbomvc`) Supabase projects as of 2026-04-07 (migration `enable_rls_on_all_public_tables`).

**Model**: All 31 application tables have `ROW LEVEL SECURITY = ENABLED` with **zero policies**. The default-deny stance applies to the `anon` and `authenticated` PostgREST roles, which means the auto-generated REST API at `https://<project>.supabase.co/rest/v1/...` returns empty result sets for any direct query against application tables — even with a valid anon key.

**How the app still works**: Prisma connects via direct database connection using the `postgres` superuser role, which has `rolbypassrls = true`. RLS does not apply to bypass-RLS roles, so all server-side queries continue to work normally. The app does **not** use `@supabase/supabase-js` anywhere — confirmed by repo grep on 2026-04-07.

**Why this exists**: Without RLS, any process that obtained the public anon key (which ships in `NEXT_PUBLIC_*` variables in apps that use the supabase-js client) could perform full CRUD against every table in `public`. Even though Psycologger itself does not expose the anon key today, defense in depth requires that the database refuse PostgREST traffic regardless of how the key is obtained or leaked.

**Operational notes**:
- Future tables added via Prisma migrations are NOT automatically RLS-enabled. Every new migration that creates a public-schema table MUST include `ALTER TABLE public."NewTable" ENABLE ROW LEVEL SECURITY;`. This should be added to the migration template.
- If the app ever introduces `@supabase/supabase-js` (for realtime, storage, or auth), RLS policies will need to be authored per table. Until then, the zero-policies default-deny is the correct posture.
- The Supabase advisor will continue to report `rls_enabled_no_policy` (INFO level) on these tables. This is expected and intentional — do not "resolve" it by adding permissive policies.

**Verification**:
```sql
-- Run in Supabase SQL editor
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
-- All rows should show rowsecurity = true
```

---

## Cryptography

### Encryption (AES-256-GCM)
**Purpose**: CPF values, journal entry text, clinical session notes, integration tokens

**Implementation**:
- Algorithm: AES-256-GCM (authenticated encryption)
- IV: Random 12-byte (96-bit) per encryption
- AAD (Additional Authenticated Data): `tenantId:patientId` (ensures decryption only in original context)
- Key derivation: Not used (keys stored in Supabase Vault, managed by Supabase)
- Sentinel: `enc:v1:` prefix on encrypted fields distinguishes encrypted from plaintext during migration

### Searchable Encryption (CPF Blind Index)
**Purpose**: Enable equality search on CPF without decryption (as of 2026-04-07)

**Implementation**:
- Algorithm: HMAC-SHA256
- Input: Normalized CPF (digits only, no formatting)
- Key: `ENCRYPTION_KEY` environment variable
- Storage: `Patient.cpfBlindIndex` indexed column for O(1) lookup
- Query: `GET /api/v1/patients?q=12345678900` detects CPF shape and searches via `WHERE cpfBlindIndex = HMAC(...)`
- Never reversible: HMAC output cannot reconstruct the CPF

**Key Rotation**:
- Old keys retained in `encryptionKey.rotationHistory`
- New encryptions use `currentKey`
- Decryption tries keys in order: current → historical
- Manual rotation via admin endpoint (future feature)

### Password Hashing (PBKDF2)
**Iterations**: 600,000 (OWASP 2023 minimum)
**Salt**: 16 bytes random
**Function**: Node.js `crypto.pbkdf2Sync()`
**No plaintext storage**: Hashes only, bcrypt not used (slower for high iteration counts)

### Session Tokens
**Generation**: `crypto.getRandomValues(32)` for patient magic links
**Comparison**: `crypto.subtle.timingSafeEqual()` prevents timing attacks

---

## Rate Limiting

**Technology**: Upstash Redis (production), in-memory Map (development)

**Algorithm**: Sliding window (request count + TTL)

**Protected Endpoints**:
| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/auth/signup` | 5 attempts | 15 min |
| `POST /api/auth/patient/magic-link` | 3 attempts | 10 min |
| `POST /api/auth/patient/verify` | 5 attempts | 15 min |
| `POST /api/appointments` | 20 requests | 1 hour |
| `POST /api/patients` | 10 requests | 1 hour |
| `POST /api/payments/charge` | 10 requests | 1 hour |

**Key**: `ip:endpoint` (or `email:endpoint` for auth)

**Failure Handling**: If Redis unavailable, in-memory fallback used. If both fail, request allowed (fail-open, security trade-off for availability).

---

## Session Security

### Duration
- Staff: 24 hours with auto-refresh
- Patient: 15 minutes per magic link (no persistent session)
- Idle timeout: 30 minutes (automatic logout)

### Cookie Attributes
- `httpOnly`: True (JavaScript cannot access)
- `Secure`: True (HTTPS only)
- `SameSite`: Strict (no cross-site submission)
- `Path`: `/` (all routes)
- `MaxAge`: 86400 seconds (24 hours, staff)

### Logout
- Staff: Session token revoked in NextAuth
- Patient: Token deleted from database
- Both: Client cookie cleared

---

## Sensitive Data Protection

### Personally Identifiable Information (PII)

**Stored Plaintext** (data at rest unencrypted):
- Email addresses
- Names
- Phone numbers
- Birthdates

**Encrypted at Rest** (AES-256-GCM):
- CPF values stored as `enc:v1:<base64-encrypted>` (as of 2026-04-07)
- Journal entry text
- Clinical session notes (`noteText` field with `enc:v1:` prefix and rejection of plaintext via `CLINICAL_NOTES_REJECT_PLAINTEXT=1` env var)

**In Transit**:
- All endpoints use HTTPS (enforced by Vercel)
- No HTTP allowed
- TLS 1.3 minimum

### Protected Health Information (PHI) / Health Records

**Journal Entries**:
- Encrypted at rest
- Accessible only to patient + assigned psychologist
- Audit logged (access + IP + user agent)

**Clinical Session Notes**:
- Stored plaintext ← SECURITY GAP
- Access logged
- Only visible to assigned psychologist + patient

**Appointment History**:
- Plaintext storage (dates, times, duration)
- Not sensitive as health records

### Audit Log Redaction

**21 Sensitive Keys** redacted in audit logs:
```
password, passwordHash, encryptionKey, secretKey,
token, accessToken, refreshToken, apiKey,
cpf, ssn, npi, creditCard, bankAccount,
authSecret, jwtsecret, apiSecret, privateKey,
stripeKey, paymentMethod, accountNumber, clientSecret
```

**Example**:
```json
{
  "action": "staff:create",
  "ipAddress": "192.168.1.1",
  "userId": "staff_123",
  "changes": {
    "email": "john@example.com",
    "password": "[REDACTED]",
    "cpf": "[REDACTED]"
  }
}
```

**CSV Export**: Capped at 50,000 rows, 90-day date range to prevent exfiltration.

---

## Consent & Data Sharing

### Consent Records
**Model**: `ConsentRecord` tracks acceptance/revocation

**Types**:
- Terms of Service
- Privacy Policy
- Clinical notes sharing with family member
- Journal sharing with psychologist
- Research participation (future)

**Fields**:
- `type`: Enum of consent types
- `accepted`: Boolean (revocation sets to false)
- `acceptedAt`: Timestamp
- `ipAddress`: For audit
- `userAgent`: Browser/device info

**Patient Flow**:
1. Invited to portal
2. Presented with consent form (pre-login)
3. Can accept/decline each type independently
4. Can revoke consent anytime in settings
5. Audit trail preserved (no deletion)

---

## Audit Logging

**All Actions Logged** (49 action types):

| Category | Actions |
|----------|---------|
| Staff | create, update, delete, password-reset, login, logout |
| Patient | create, update, delete, invite, login, logout |
| Appointment | create, update, delete, cancel, reschedule |
| Journal | create, read, delete |
| Session | create, update, delete, note-update |
| Payment | create, charge, refund, reminder-sent |
| Consent | accept, revoke |
| Audit | export |

**Logged Metadata**:
- IP address
- User agent
- Timestamp (ISO 8601)
- Acting user ID
- Target resource ID
- Changes (before/after for updates)

**Storage**: PostgreSQL `auditLog` table (immutable append-only)

**Retention**: 2 years (configurable, auto-delete via cron)

**Export**: CSV via admin panel
- Limited to 50K rows per export
- Restricted to 90-day range
- Requires `audit:read` permission
- Logged as separate audit event

---

## Data Residency & Localization

**Database Location**: São Paulo, Brazil (Supabase region: `sa-east-1`)

**CDN**: Vercel São Paulo (gru1) for minimal latency

**Regulatory**: LGPD requires data residency in Brazil or equivalent protection.

---

## LGPD (Lei Geral de Proteção de Dados) Alignment

**Status**: Partial compliance; gaps identified.

### Implemented
- Consent tracking (terms, privacy, data sharing)
- Data subject access rights (export via `GET /api/audit/export`)
- Purpose limitation (encryption, scope filtering)
- Data minimization (audit log redaction)
- Security measures (encryption, rate limiting, audit logs)

### Not Yet Implemented
- Automated data deletion (RTBF - Right to Be Forgotten)
- Data Processing Agreement templates
- Breach notification procedure
- DPO (Data Protection Officer) designation
- Regular compliance audits
- Third-party data processor contracts (Vercel, Supabase, Resend)

### Roadmap for Full Compliance
1. **Q2 2026**: Implement automated data deletion (patient + related records)
2. **Q3 2026**: Create DPO role, document processing agreements
3. **Q3 2026**: Define breach notification workflow
4. **Q4 2026**: Third-party compliance audit (external assessor)

---

## HIPAA Considerations

**Applicability**: No (HIPAA is US-specific; Psycologger serves Brazilian psychologists)

**Note**: Analogous Brazilian standard is LGPD + CFP (Conselho Federal de Psicologia) guidelines.

**Implemented Equivalents**:
- Encryption at rest (HIPAA: Encryption and decryption)
- Audit logging (HIPAA: Audit controls)
- Access controls (HIPAA: Access management)
- Integrity verification (HIPAA: Mechanism to verify data)

---

## File Upload Security

**Validation Steps**:
1. MIME type check (whitelisted types only)
2. Magic-byte scanning (file signature detection)
3. File size check (max 25 MB)
4. Virus scanning (future: integration with ClamAV or VirusTotal)

**Whitelisted Types**:
- Documents: PDF, DOCX, XLSX
- Media: MP4, MP3, WAV

**Storage**:
- Supabase Storage bucket: `session-files`
- Files stored with random UUID filename (path traversal prevention)
- Access: Signed URLs (1-hour expiration)

**Deletion**: Automatic on patient or appointment deletion.

---

## API Security

### Authentication
- NextAuth JWT for staff endpoints
- Magic link token for patient endpoints
- Cron jobs: Bearer token validation (`CRON_SECRET`)

### Validation
- Zod schema on all request bodies
- Query parameter validation
- File upload validation (magic bytes)

### Rate Limiting
- IP-based for signup, auth
- User ID-based for resource creation
- Upstash Redis + in-memory fallback

### Error Handling
- Generic error messages to client (no stack traces)
- Detailed errors logged server-side (no PHI in logs)
- 500 errors trigger Sentry if configured

---

## Browser Security

### CSP Headers
```
default-src 'self';
script-src 'self' 'nonce-{random}' 'strict-dynamic';
style-src 'self' 'nonce-{random}';
img-src 'self' data: https:;
font-src 'self' data:;
```

### Other Security Headers
- `X-Content-Type-Options: nosniff` (prevent MIME sniffing)
- `X-Frame-Options: DENY` (prevent clickjacking)
- `X-XSS-Protection: 1; mode=block` (legacy XSS filter)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: microphone=(), camera=()`

---

## Third-Party Risk Assessment

| Service | Risk Level | Mitigation |
|---------|-----------|-----------|
| Supabase (DB) | Medium | Managed service, SLA 99.5%, auto backups |
| Vercel (hosting) | Low | SOC 2 compliant, DDoS protection, auto-scaling |
| Resend (email) | Medium | API key rotated quarterly, dev/prod separation |
| Upstash (Redis) | Low | In-memory fallback if unavailable |

---

## Compliance Checklist

- [x] HTTPS enforced
- [x] Passwords hashed (PBKDF2 600k iterations)
- [x] Session tokens secure (httpOnly, Secure, SameSite=Strict)
- [x] CSRF protection (double-submit cookie)
- [x] XSS prevention (CSP nonces, HTML escaping)
- [x] Input validation (Zod schemas)
- [x] IDOR prevention (tenantId + scope filtering)
- [x] Rate limiting (Upstash Redis)
- [x] Encryption at rest (AES-256-GCM for PHI)
- [x] Audit logging (49 actions, 2-year retention)
- [x] Consent tracking (LGPD)
- [ ] Breach notification procedure
- [ ] DPO designation
- [ ] Data deletion automation (RTBF)
- [ ] Third-party contracts

---

## Incident Response

**Breach Suspected**:
1. Stop serving affected traffic (disable feature if possible)
2. Log incident with full context
3. Notify Supabase + Vercel support
4. Examine audit logs for unauthorized access
5. Notify affected users within 72 hours (LGPD requirement)
6. Document findings in incident report

**Report Contents**:
- Date/time of discovery
- Type of breach (unauthorized access, data leak, etc.)
- Number of records affected
- Remediation taken
- Root cause analysis

---

## Security Testing

**Covered**:
- RBAC exhaustive unit tests (`tests/unit/security-rbac-exhaustive.ts`)
- Auth isolation (`tests/unit/security-auth.ts`)
- PHI protection (`tests/unit/security-phi-protection.ts`)
- Input validation (`tests/unit/security-input-validation.ts`)
- Tenant isolation (`tests/unit/security-tenant-isolation.ts`)
- CSRF validation (`tests/unit/csrf.ts`)

**Not Yet Covered**:
- Penetration testing (recommended: annual)
- Load testing under DDoS (Vercel DDoS protection assumed)
- Visual regression for UI security (no unauthorized script injection)

---

## Security Contacts

- **Product Security**: Report via GitHub Security Advisory or email
- **Incident Response**: See incident response workflow above
- **DPO**: (Designation pending)

---

**Last verified against code:** 2026-04-07
- CPF encryption implemented via `encryptCpf()` with `enc:v1:` prefix and AES-256-GCM
- CPF blind index (HMAC-SHA256) implemented for searchable queries
- Clinical notes encrypted with `enc:v1:` prefix; plaintext rejection available via `CLINICAL_NOTES_REJECT_PLAINTEXT=1`
- Patient magic tokens hashed via SHA256 before storage (not plaintext)
- CSRF protection narrowed to explicit allowlist: magic-link-request, magic-link-verify, activate

