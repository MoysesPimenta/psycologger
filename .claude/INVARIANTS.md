# Psycologger: Immutable Invariants & Preservation Rules

**These rules CANNOT be broken without breaking the application. Any future AI development must preserve all of these invariants.**

---

## Table of Contents
1. Data Isolation Invariants
2. Authentication Invariants
3. Business Logic Invariants
4. Security & Encryption Invariants
5. Audit & Compliance Invariants
6. Schema Invariants
7. Code Pattern Invariants
8. Performance Invariants
9. Critical Threat Scenarios
10. Invariant Violation Detection

---

## Data Isolation Invariants

**CRITICAL**: Multi-tenancy is the security boundary. Violating these causes data leaks.

### 1. TenantId on Every Query
```
RULE: EVERY database query MUST include tenantId in WHERE clause
WHY: Prevents cross-tenant data leakage
WHERE: All Prisma queries in src/app/api/v1/*/route.ts
DANGER: SELECT * FROM patients → leaks all patients across all tenants
SAFE: SELECT * FROM patients WHERE tenantId = $1
VERIFICATION: grep -r "findMany\|findFirst\|findUnique" src/app/api --include="*.ts" | grep -v "tenantId"
```

### 2. Patient Portal Scope
```
RULE: Patient portal queries MUST scope by patientAuthId
WHY: Prevents patients seeing other patients' data
WHERE: All src/app/api/v1/portal/*/route.ts handlers
DANGER: GET /api/v1/portal/appointments returns all patients' appointments
SAFE: GET /api/v1/portal/appointments WHERE patientAuthId = auth.patientAuthId
VERIFICATION: Check middleware resolves patientAuthId from session token
```

### 3. PSYCHOLOGIST Data Scoping
```
RULE: PSYCHOLOGIST role MUST only see assigned patients (assignedUserId)
WHY: Prevents psychologists accessing other psychologists' patient data
WHERE: All patient/appointment/session queries for PSYCHOLOGIST
DANGER: Psychologist A can view Psychologist B's patients
SAFE: WHERE tenantId AND assignedUserId = userId
VERIFICATION: If role === PSYCHOLOGIST, add AND assignedUserId = userId to query
CODE EXAMPLE:
  const patients = await db.patient.findMany({
    where: {
      tenantId: ctx.tenantId,
      assignedUserId: ctx.userId  // <- REQUIRED if ctx.role === 'PSYCHOLOGIST'
    }
  });
```

### 4. ASSISTANT Clinical Access Prohibition
```
RULE: ASSISTANT role MUST NOT access clinical sessions or file content
WHY: ASSISTANT is operational only; cannot see diagnoses, treatment plans, etc.
WHERE: Sessions endpoint (src/app/api/v1/sessions/route.ts)
       Files endpoint (src/app/api/v1/sessions/*/files/route.ts)
DANGER: ASSISTANT can view GET /api/v1/sessions/{id} with clinical notes
SAFE: requirePermission('sessions:view') fails for ASSISTANT role
VERIFICATION: In rbac.ts, ASSISTANT role does NOT have sessions:view or files:downloadClinical
```

### 5. READONLY Immutability
```
RULE: READONLY role MUST NOT modify any data
WHY: Read-only users should have no write access
WHERE: All POST, PUT, DELETE, PATCH endpoints
DANGER: READONLY user can DELETE /api/v1/patients/{id}
SAFE: requirePermission('patients:edit') fails for READONLY role
VERIFICATION: In rbac.ts, READONLY role has no create/edit/delete permissions
```

---

## Authentication Invariants

**CRITICAL**: Auth is the strongest security boundary. Mixing auth systems causes privilege escalation.

### 6. Separate Auth Systems (No Cross-Contamination)
```
RULE: Staff auth (NextAuth JWT) and patient auth (PatientAuth) are COMPLETELY separate
WHY: Prevents privilege escalation (patient claiming to be staff)
WHERE: src/lib/auth.ts (NextAuth) vs src/lib/patient-auth.ts (PatientAuth)
       src/middleware.ts resolves which auth to use
DANGER: Patient session cookie accepted as staff auth
SAFE: Middleware checks cookie source and enforces auth type
CODE PATTERN:
  if (isPortal) {
    // Use PatientAuth: hashed token from database
  } else {
    // Use NextAuth: JWT from cookie
  }
```

### 7. Patient Portal Uses Hashed Tokens (NOT JWT)
```
RULE: Patient portal sessions use SHA-256 hashed tokens (NOT JWT)
WHY: JWT is stateless and cannot be revoked; hashed tokens are revokable and auditable
WHERE: src/lib/patient-auth.ts
FORMAT:
  - Token generated: 32 random bytes
  - Stored in DB: SHA-256(token)
  - Sent to client: plaintext token in httpOnly cookie
  - Verified: hash(received_token) === stored_hash
DANGER: Using JWT allows sessions to stay valid even after patient password reset
SAFE: SHA-256 hash forces session invalidation on password change
CODE:
  // Generate
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await db.patientPortalSession.create({ hashedToken: hash, ... });

  // Verify
  const received = req.cookies.patientSession;
  const hash = crypto.createHash('sha256').update(received).digest('hex');
  const valid = await db.patientPortalSession.findUnique({ where: { hashedToken: hash } });
```

### 8. Portal Session 30-Minute Idle Timeout
```
RULE: Patient portal sessions MUST expire after 30 minutes of inactivity
WHY: Prevent unauthorized access if patient leaves browser unattended
WHERE: src/lib/patient-auth.ts (session validation)
IMPLEMENTATION:
  - Track lastActivityAt: DateTime on PatientPortalSession
  - On each request, check: now() - lastActivityAt > 30 minutes
  - If expired, delete session and return 401
VERIFICATION: Set a fake patient session, wait 30+ minutes, verify 401 response
```

### 9. CSRF Validation on All State-Changing Requests
```
RULE: CSRF validation MUST run on every POST, PUT, DELETE, PATCH request
WHY: Prevent cross-site request forgery attacks
WHERE: src/middleware.ts (validateCsrf function)
       Double-submit cookie pattern: CSRF token in cookie AND body/header
IMPLEMENTATION:
  - Client generates token: 32 random bytes
  - Send token in cookie (httpOnly: false, sameSite: strict)
  - Send token in X-CSRF-Token header or form body
  - Middleware checks: received_token === cookie_token
DANGER: Skipping CSRF check on /api/v1/payments (POST) allows malicious form submission
SAFE: CSRF token must match for state-changing requests
CODE:
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies['csrf-token'];
    if (headerToken !== cookieToken) return 403;
  }
```

### 10. Password Hashing: PBKDF2 600k Iterations
```
RULE: Patient passwords MUST use PBKDF2, SHA-256, 600k iterations
WHY: 600k iterations = ~100ms to hash, expensive for attackers
WHERE: src/lib/patient-auth.ts (hashPassword function)
DANGER: Reducing to 100k iterations speeds up login but enables faster attacks
SAFE: Never reduce iteration count; only increase over time
CODE:
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    600000,  // <- NEVER REDUCE THIS NUMBER
    32,      // 32-byte hash
    'sha256'
  );
```

---

## Business Logic Invariants

**CRITICAL**: Business logic invariants prevent financial discrepancies, double-booking, and data corruption.

### 11. Partial Payment Atomicity
```
RULE: Partial payment remainder charge creation MUST be atomic (single transaction)
WHY: Prevents orphaned payments or lost remainder amounts
WHERE: src/app/api/v1/payments/route.ts (POST /api/v1/payments)
SCENARIO:
  1. Charge: amount = 500 BRL, status = PENDING
  2. Payment: amount = 300 BRL (partial)
  3. Must atomically:
     - Create Payment record
     - Create remainder Charge (amount = 200)
     - Update original Charge status
  4. If any step fails, roll back all
DANGER: Create Payment, then crash before creating remainder → 200 BRL lost
SAFE: Use Prisma transaction:
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({ ... });
    const remainder = await tx.charge.create({ amount: 200, ... });
    await tx.charge.update({ id: chargeId, data: { status: 'PARTIALLY_PAID' } });
  });
```

### 12. Recurring Appointment Conflict Detection in Transaction
```
RULE: Recurring appointment conflict detection MUST run inside transaction
WHY: Prevent race condition where two requests create appointments in same slot
WHERE: src/app/api/v1/appointments/route.ts (POST /api/v1/appointments)
SCENARIO:
  1. Request 1: Create recurring appointment for Monday 10am-11am (weekly for 4 weeks)
  2. Request 2: Create separate appointment for Monday 10am-11am week 2
  3. Without transaction: Both succeed, creating double-booking
  4. With transaction: One is rejected as conflict
IMPLEMENTATION:
  await db.$transaction(async (tx) => {
    // Generate all recurring slots
    const slots = generateRecurringSlots(recurrence, timezone);

    // Check each slot for conflicts
    for (const slot of slots) {
      const conflict = await tx.appointment.findFirst({
        where: {
          tenantId, patientId,
          startTime: { lte: slot.end },
          endTime: { gte: slot.start }
        }
      });
      if (conflict) throw new Error('Conflict detected');
    }

    // If all slots free, create all appointments
    for (const slot of slots) {
      await tx.appointment.create({ ... });
    }
  });
VERIFICATION: Write test that simulates concurrent requests, ensure only one succeeds
```

### 13. Journal Entry Must Be Encrypted Before Storage
```
RULE: Journal entry noteText MUST be encrypted before storage (AES-256-GCM)
WHY: Journal entries are sensitive personal reflections; plaintext endangers privacy
WHERE: src/app/api/v1/portal/journal/route.ts (POST)
IMPLEMENTATION:
  const encrypted = encrypt(noteText, patientEncryptionKey);  // AES-256-GCM
  await db.journalEntry.create({
    noteText: encrypted,  // <- MUST be encrypted
    ...
  });
DANGER: Storing plaintext allows data breach to expose intimate patient thoughts
SAFE: Always encrypt before INSERT, decrypt only when showing to authorized user
VERIFICATION: Query database directly: SELECT noteText FROM journal_entries LIMIT 1
              Result should be random-looking bytes, not readable text
```

### 14. Crisis Keyword Detection on Create AND Update
```
RULE: Crisis keyword detection MUST run on journal create AND update
WHY: Patient might add concerning text in an update; must be detected immediately
WHERE: src/app/api/v1/portal/journal/route.ts (both POST and PUT)
KEYWORDS: 18 Portuguese keywords (suicídio, me matar, não aguento, etc.)
IMPLEMENTATION:
  const crisisKeywords = ['suicídio', 'me matar', 'morte', ...];
  const matches = crisisKeywords.filter(kw => noteText.toLowerCase().includes(kw));

  if (matches.length > 0) {
    // Mark as detected
    crisisKeywordDetected = true;
    crisisKeywordMatches = matches;
    // Notify psychologist
    await notifyPsychologist(patientId, 'Crisis keywords detected in journal entry');
  }
DANGER: Only checking on create misses edits that add crisis content
SAFE: Check on both POST and PUT
VERIFICATION: Create journal entry without keywords, then update to add "suicídio"
              Should trigger alert
```

### 15. Soft-Delete 30-Day Retention
```
RULE: Soft-deleted records MUST be retained for 30 days before hard delete
WHY: Allows recovery of accidentally deleted clinical data; complies with audit trail
WHERE: ClinicalSession.deletedAt, FileObject.deletedAt
IMPLEMENTATION:
  // Soft delete
  await db.clinicalSession.update({
    where: { id },
    data: { deletedAt: now(), deletedBy: userId }
  });

  // In queries, ALWAYS exclude soft-deleted:
  where: { tenantId, deletedAt: null }

  // Hard delete (runs nightly)
  const cutoff = now() - 30 days;
  await db.clinicalSession.deleteMany({
    where: { deletedAt: { lt: cutoff } }
  });
DANGER: Hard deleting immediately loses audit trail
SAFE: Keep for 30 days, always filter out in normal queries
VERIFICATION: Delete a session, check deletedAt is set, verify not in GET list
              After 30 days, verify hard deleted from database
```

### 16. Charges with Payments Must Not Be Deleted
```
RULE: Charge with existing Payment MUST NOT be deletable
WHY: Prevents double-refunding or losing transaction history
WHERE: src/app/api/v1/charges/route.ts (DELETE endpoint)
IMPLEMENTATION:
  const payment = await db.payment.findFirst({
    where: { chargeId }
  });
  if (payment) {
    throw new Error('Cannot delete charge with existing payments');
  }
DANGER: Deleting a charge that was paid allows creating a new charge for same service
SAFE: Only allow deletion if no payments exist
VERIFICATION: Create charge, create payment, try DELETE → should fail
              Delete payment, try DELETE charge → should succeed
```

---

## Security & Encryption Invariants

**CRITICAL**: Encryption is defense-in-depth. Breaking these compromises sensitive data.

### 17. Encryption Key Format (32 Bytes, Base64)
```
RULE: ENCRYPTION_KEY MUST be 32 bytes (256 bits), base64-encoded
WHY: 32 bytes = 256 bits for AES-256 (256-bit keys = strongest encryption)
WHERE: .env.local, environment variables
FORMAT:
  ENCRYPTION_KEY = base64(32 random bytes)
  Example: "abcd1234+/==... (44 characters in base64)"
VERIFICATION:
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('Invalid key length');
DANGER: 16-byte key (AES-128) is weaker; 64-byte key is overkill
SAFE: Exactly 32 bytes (256 bits)
```

### 18. Encryption Key Rotation Support
```
RULE: ENCRYPTION_KEY_PREVIOUS MUST exist for key rotation
WHY: Allows reading data encrypted with old key while writing with new key
WHERE: src/lib/crypto.ts
IMPLEMENTATION:
  // Encrypt with current key
  const encrypted = encrypt(plaintext, process.env.ENCRYPTION_KEY);

  // Decrypt tries current key first, then previous keys
  function decrypt(ciphertext) {
    try {
      return decrypt(ciphertext, process.env.ENCRYPTION_KEY);
    } catch {
      return decrypt(ciphertext, process.env.ENCRYPTION_KEY_PREVIOUS);
    }
  }
DANGER: Deleting old key before re-encrypting old data makes it unreadable
SAFE: Keep old keys available until all old data is re-encrypted
```

### 19. Encrypted Payload Versioning
```
RULE: Encrypted payloads MUST include version byte for backward compatibility
WHY: Allows changing encryption algorithm without breaking old data
WHERE: src/lib/crypto.ts (encrypt/decrypt functions)
FORMAT:
  [version: 1 byte][iv: 16 bytes][ciphertext: variable][authTag: 16 bytes]
  Version 1: AES-256-GCM
  Version 2+: (reserved for future algorithms)
IMPLEMENTATION:
  function encrypt(plaintext, key) {
    const version = Buffer.alloc(1);
    version.writeUInt8(1, 0);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([version, iv, ciphertext, authTag]);
  }
DANGER: Removing version byte breaks ability to support multiple algorithms
SAFE: Always include version, check it on decrypt, handle all versions
```

### 20. File Upload Magic Byte Validation
```
RULE: File uploads MUST validate magic bytes (not just Content-Type header)
WHY: Content-Type header can be spoofed; magic bytes are file signatures
WHERE: src/app/api/v1/sessions/[id]/files/route.ts
IMPLEMENTATION:
  // Check Content-Type header (easily spoofed)
  const headerType = req.headers['content-type'];

  // Check magic bytes (hard to spoof)
  const magicBytes = await readFirstBytes(file, 4);
  if (magicBytes === '89504E47') return 'image/png';  // PNG
  if (magicBytes === 'FFD8FF') return 'image/jpeg';   // JPEG
  if (magicBytes === '25504446') return 'application/pdf';  // PDF
  // etc.

  // Only trust magic byte result
  const actualType = detectByMagicBytes(magicBytes);
  if (actualType !== expectedType) {
    throw new Error('File type mismatch');
  }
DANGER: Uploading .exe as .pdf (Content-Type spoofing)
SAFE: Validate magic bytes independently
VERIFICATION: Try uploading PNG file with Content-Type: application/pdf
              Should reject based on magic bytes
```

### 21. Rate Limiting on Auth Endpoints
```
RULE: Rate limiting MUST be applied to auth endpoints
WHY: Prevent brute-force password attacks
WHERE: src/app/api/v1/portal/auth/route.ts
       Rate limit: 5 attempts per IP per 15 minutes
IMPLEMENTATION:
  const limiter = createRateLimiter({
    key: clientIp,
    limit: 5,
    window: 15 * 60 * 1000  // 15 minutes
  });

  if (!await limiter.check()) {
    return new Response('Too many attempts', { status: 429 });
  }
DANGER: No rate limiting allows 1M password guesses per hour
SAFE: Limit auth attempts to prevent brute force
VERIFICATION: Make 6 auth requests from same IP → 6th should get 429
```

---

## Audit & Compliance Invariants

**CRITICAL**: Audit logs are the source of truth for compliance and forensics.

### 22. Every State-Changing Operation Must Be Audited
```
RULE: EVERY state-changing operation (POST, PUT, DELETE, PATCH) MUST create AuditLog
WHY: Compliance requirement (LGPD); forensics for data breaches; patient trust
WHERE: All src/app/api/v1/*/route.ts handlers
IMPLEMENTATION:
  // After every state change, create audit log
  await createAuditLog({
    action: 'appointment:create',
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    entityId: appointment.id,
    entityType: 'Appointment',
    changes: {
      from: {},
      to: { startTime, endTime, patientId, status: 'SCHEDULED' }
    }
  });
DANGER: Creating appointment without audit log means no record of who created it
SAFE: Always call createAuditLog() after state change
VERIFICATION: Create appointment, query AuditLog table, verify entry exists
```

### 23. PHI Must Be Redacted in Audit Summaries
```
RULE: PHI fields MUST be redacted in audit summaries (21 sensitive keys)
WHY: Audit logs may be accessed by support staff; PHI shouldn't be visible
WHERE: src/lib/audit.ts (redactPHI function)
SENSITIVE KEYS (21):
  cpf, password, passwordHash, hashedToken,
  sessionNotes, noteText, diagnosis, treatment,
  creditCard, bankAccount, ssn, securityCode,
  medicalHistory, prescriptions, dosage,
  therapyNotes, clinicalNotes, psychologistNotes,
  confidentialInfo, secretKey, apiKey
IMPLEMENTATION:
  function redactPHI(data) {
    const sensitiveKeys = ['cpf', 'noteText', 'password', ...];
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) =>
        sensitiveKeys.includes(key) ? [key, '***REDACTED***'] : [key, value]
      )
    );
  }
DANGER: Audit showing clinical notes in summary: "Doctor updated noteText to: deep depression..."
SAFE: Audit shows: "Doctor updated clinical session (REDACTED)"
VERIFICATION: Create session with notes, query AuditLog, verify noteText is redacted
```

### 24. Audit Logs Are Immutable
```
RULE: Audit logs MUST NOT be deleted or modified (only soft-deleted with retention)
WHY: Prevents attackers from covering their tracks
WHERE: AuditLog model in prisma/schema.prisma
IMPLEMENTATION:
  // No DELETE endpoint for audit logs
  // Only soft-delete with 90-day retention
  const cutoff = now() - 90 days;
  await db.auditLog.updateMany({
    where: { createdAt: { lt: cutoff } },
    data: { deletedAt: now() }
  });
DANGER: Admin deletes audit log of unauthorized data access
SAFE: Audit logs are permanent and readonly
VERIFICATION: Try DELETE /api/v1/audit/{id} → should return 403 or not exist
```

---

## Schema Invariants

**CRITICAL**: Schema design is the foundation. Violating these causes architectural problems.

### 25. Tenant Is the Root Entity
```
RULE: Tenant is the root entity; ALL data belongs to exactly one Tenant
WHY: Multi-tenancy boundary; every table must have tenantId foreign key
WHERE: prisma/schema.prisma
SCHEMA:
  model Tenant {
    id: String @id
    name: String
    ...
    users: Membership[]
    patients: Patient[]
    appointments: Appointment[]
    // ... all data flows from Tenant
  }
DANGER: Table without tenantId can't be isolated per tenant
SAFE: Every table includes tenantId @unique @fk Tenant.id
VERIFICATION: For each table, verify it has tenantId field and Tenant relation
```

### 26. User ↔ Tenant Many-to-Many via Membership
```
RULE: User connects to Tenant ONLY via Membership (many-to-many)
WHY: One user can belong to multiple tenants with different roles
WHERE: prisma/schema.prisma
SCHEMA:
  model User {
    id: String @id
    email: String
    memberships: Membership[]  // <- connection point
  }

  model Membership {
    id: String @id
    userId: String @fk
    tenantId: String @fk
    role: Role  // per-tenant role
    status: MembershipStatus
  }
DANGER: User directly linked to Tenant (one-to-many) → user can't belong to multiple tenants
SAFE: User ↔ Membership ↔ Tenant (many-to-many)
VERIFICATION: Create user, add to 2 tenants with different roles, verify works
```

### 27. Patient Assigned to User (Optional, Not Required)
```
RULE: Patient can optionally be assigned to User (psychologist)
WHY: Allows psychologists to own patients; not all patients need assignment
WHERE: prisma/schema.prisma
SCHEMA:
  model Patient {
    id: String @id
    tenantId: String @fk Tenant.id
    assignedUserId: String @fk User.id (optional)
    ...
  }
DANGER: Patient MUST have assignedUserId → can't have unassigned patients
SAFE: assignedUserId is optional (null allowed)
USAGE:
  - If assignedUserId is null: all tenant staff can see patient
  - If assignedUserId = userA: only userA and TENANT_ADMIN can see
VERIFICATION: Create patient without assigning, verify visible to all staff
             Assign to user, verify only that user can see (if PSYCHOLOGIST role)
```

### 28. Appointment Links Patient + User + AppointmentType
```
RULE: Appointment MUST link Patient + User (provider) + AppointmentType
WHY: Appointment is the connection between patient and provider
WHERE: prisma/schema.prisma
SCHEMA:
  model Appointment {
    id: String @id
    tenantId: String @fk
    patientId: String @fk
    userId: String @fk (provider)
    appointmentTypeId: String @fk
    startTime: DateTime
    endTime: DateTime
    recurrenceId: String (optional, for recurring)
  }
INVARIANTS:
  - userId must be a User with PSYCHOLOGIST role (or higher) in same tenant
  - patientId must be a Patient in same tenant
  - appointmentTypeId must be an AppointmentType in same tenant
  - startTime < endTime (validated in code)
  - No overlapping appointments for same patient in same slot
```

### 29. Charge Links to Appointment OR ClinicalSession (OR Neither)
```
RULE: Charge CAN link to Appointment OR ClinicalSession OR neither (all optional)
WHY: Charges are flexible; can bill standalone (e.g., material cost)
WHERE: prisma/schema.prisma
SCHEMA:
  model Charge {
    id: String @id
    tenantId: String @fk
    patientId: String @fk (REQUIRED)
    appointmentId: String (optional @fk)
    clinicalSessionId: String (optional @fk)
    amount: Decimal
    status: ChargeStatus
  }
VALID COMBINATIONS:
  - patientId + appointmentId (charge for appointment)
  - patientId + clinicalSessionId (charge for session)
  - patientId only (standalone charge, e.g., phone consultation without appointment)
INVALID:
  - Neither appointmentId nor clinicalSessionId required (can be both null)
DANGER: Charge without patientId → billing no one
SAFE: patientId is ALWAYS required; appointments/sessions are optional
```

### 30. Payment Belongs to Charge (Many Payments per Charge)
```
RULE: Payment belongs to Charge (many-to-one); one Charge can have many Payments
WHY: Supports partial payments; patient can pay in installments
WHERE: prisma/schema.prisma
SCHEMA:
  model Charge {
    id: String @id
    amount: Decimal  (total owed)
    payments: Payment[]  (multiple payments against this charge)
  }

  model Payment {
    id: String @id
    chargeId: String @fk
    amount: Decimal  (payment amount, <= charge.amount)
    status: PaymentStatus
  }
INVARIANTS:
  - sum(payment.amount for all payments) <= charge.amount
  - charge.status = PENDING until sum(payments) == amount (fully paid)
  - charge.status = PARTIALLY_PAID if 0 < sum(payments) < amount
  - charge.status = PAID if sum(payments) == amount
DANGER: Payment.amount > Charge.amount → overpayment
SAFE: Validate payment.amount <= remaining_charge_amount
VERIFICATION: Create charge 500, pay 300, pay 300 (overpayment) → should reject
```

---

## Code Pattern Invariants

**CRITICAL**: Code patterns ensure consistency and prevent security bugs.

### 31. API Handler Pattern: Auth → Permission → Validation → Logic → Audit → Response
```
RULE: All API handlers MUST follow this pattern
WHERE: Every src/app/api/v1/*/route.ts file
TEMPLATE:
  export async function POST(req: Request) {
    // 1. GET AUTH CONTEXT
    const ctx = await getAuthContext(req);
    if (!ctx) return unauthorized();

    // 2. CHECK PERMISSION
    requirePermission(ctx, 'permission:name');

    // 3. PARSE & VALIDATE INPUT
    const input = RequestSchema.parse(await req.json());

    // 4. BUSINESS LOGIC
    const result = await db.model.create({
      data: {
        tenantId: ctx.tenantId,  // <- ALWAYS include tenantId
        ...input
      }
    });

    // 5. AUDIT LOG
    await createAuditLog({
      action: 'model:create',
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entityId: result.id,
      changes: { to: result }
    });

    // 6. RESPONSE
    return handleApiError(() => ({
      success: true,
      data: result
    }));
  }
VERIFICATION: Review each route handler, ensure all 6 steps present in order
```

### 32. All Errors Through handleApiError()
```
RULE: ALL errors MUST go through handleApiError() for consistent JSON format
WHY: Ensures consistent error response format; prevents leaking stack traces in production
WHERE: src/lib/api.ts
USAGE:
  return handleApiError(() => {
    throw new Error('User not found');
  });

  // Returns:
  // {
  //   "success": false,
  //   "error": {
  //     "code": "NOT_FOUND",
  //     "message": "User not found",
  //     "statusCode": 404
  //   }
  // }
DANGER: Returning raw Error object leaks stack trace to client
SAFE: Wrap in handleApiError for consistent format
```

### 33. Email Sends Are Fire-and-Forget (Non-Fatal)
```
RULE: Email sends MUST be non-fatal; errors logged but don't fail request
WHY: Email service may be temporarily down; don't block user operations
WHERE: All email sending calls
IMPLEMENTATION:
  try {
    await sendEmail({ to, subject, html });
  } catch (error) {
    // Log error but continue
    console.error('Failed to send email:', error);
    // Don't throw; request continues
  }
DANGER: sendEmail fails → entire appointment creation fails
SAFE: sendEmail fails → appointment created, email will retry later
VERIFICATION: Mock email service to throw error, verify request still succeeds
```

### 34. File Operations Are Non-Fatal
```
RULE: File uploads/downloads/deletes MUST be non-fatal
WHY: Storage service may timeout; don't block clinical operations
WHERE: src/lib/storage.ts, file upload endpoints
IMPLEMENTATION:
  try {
    await uploadFile(file, path);
  } catch (error) {
    console.error('Failed to upload file:', error);
    // Continue without file; log for manual intervention
    await createAuditLog({
      action: 'file:upload_failed',
      error: error.message
    });
  }
DANGER: File upload fails → session creation fails
SAFE: File upload fails → session created, file will be uploaded manually
```

### 35. Timezone Math Uses date-fns-tz
```
RULE: ALL date/time operations that matter (appointments, reminders) MUST use date-fns-tz
WHY: Prevents timezone bugs (e.g., appointment at wrong time in another timezone)
WHERE: src/app/api/v1/appointments/route.ts, src/app/api/cron/*/route.ts
USAGE:
  import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

  // User in São Paulo wants 10am appointment
  const userTime = new Date('2026-04-15 10:00:00');  // local time
  const utcTime = zonedTimeToUtc(userTime, 'America/Sao_Paulo');  // convert to UTC

  // Store in DB as UTC
  await db.appointment.create({
    startTime: utcTime,  // UTC stored in DB
    timezone: 'America/Sao_Paulo'  // remember user's timezone
  });

  // When showing to user, convert back
  const displayTime = utcToZonedTime(dbTime, 'America/Sao_Paulo');
DANGER: Using Date directly ignores timezone → appointment at wrong time
SAFE: Always use date-fns-tz for appointments
VERIFICATION: Create appointment at 10am São Paulo time, verify displayed as 10am (not 7am or other)
```

### 36. Pagination Always Includes Validation
```
RULE: Pagination MUST always validate take/skip parameters
WHY: Prevent resource exhaustion (client requesting all 1M records)
WHERE: All list endpoints
IMPLEMENTATION:
  const skip = Math.max(0, parseInt(req.query.skip) || 0);
  const take = Math.min(100, Math.max(1, parseInt(req.query.take) || 20));

  const results = await db.model.findMany({
    where: { tenantId },
    take,
    skip
  });
LIMITS:
  - take: 1-100 (default 20)
  - skip: 0-maximum_records
DANGER: take=999999 → fetch entire table
SAFE: take capped at 100 maximum
```

---

## Performance Invariants

### 37. No N+1 Queries
```
RULE: Queries MUST NOT have N+1 problem
WHY: 1 query + N follow-up queries = slow performance
EXAMPLE OF N+1:
  const appointments = await db.appointment.findMany({ where: { tenantId } });
  for (const app of appointments) {
    const patient = await db.patient.findUnique({ where: { id: app.patientId } });
    // ^ This runs N times, very slow!
  }
SAFE: Use include/select:
  const appointments = await db.appointment.findMany({
    where: { tenantId },
    include: { patient: true }  // <- Single query with join
  });
VERIFICATION: Enable Prisma query logs, look for multiple queries in loop
```

### 38. No Unbounded Queries
```
RULE: No SELECT * without LIMIT (take)
WHY: Selecting all 1M records crashes server
WHERE: All findMany() queries
SAFE:
  const patients = await db.patient.findMany({
    where: { tenantId },
    take: 100  // <- LIMIT required
  });
VERIFICATION: grep -r "findMany" src/app/api --include="*.ts" | grep -v "take:"
```

---

## Critical Threat Scenarios

### Scenario 1: Cross-Tenant Data Leak
```
THREAT: Attacker from Tenant A accesses Tenant B's patients
ROOT CAUSE: Missing tenantId filter in query
PREVENTION:
  - Every WHERE clause includes tenantId
  - Middleware enforces tenantId resolution
  - Code review for new queries
DETECTION:
  - Query logs show tenant accessing wrong data
  - Audit log shows unauthorized access
RECOVERY:
  - Identify which data was accessed
  - Notify affected customers
  - Log LGPD breach event
```

### Scenario 2: Privilege Escalation (Patient → Staff)
```
THREAT: Patient session token accepted as NextAuth token
ROOT CAUSE: Auth systems mixed up in middleware
PREVENTION:
  - Separate cookie names (auth-staff vs auth-patient)
  - Middleware checks auth source
  - No cross-system token acceptance
DETECTION:
  - Patient token found in NextAuth user ID lookup
  - Middleware raises auth error
RECOVERY:
  - Revoke patient session immediately
  - Investigate access logs
```

### Scenario 3: Financial Data Corruption (Lost Partial Payment)
```
THREAT: Payment created but remainder charge not created
ROOT CAUSE: Non-atomic payment + remainder charge creation
PREVENTION:
  - Prisma transaction for both operations
  - Test atomicity with transaction rollback simulation
DETECTION:
  - sum(payments) < charge.amount but charge.status = PAID
  - Audit log shows payment but no remainder charge
RECOVERY:
  - Create missing remainder charge
  - Notify patient of discrepancy
```

### Scenario 4: Double-Booked Appointments
```
THREAT: Two appointments in same time slot
ROOT CAUSE: Conflict detection outside transaction
PREVENTION:
  - Check conflicts inside transaction
  - Test with concurrent requests
DETECTION:
  - Query finds 2 appointments with overlapping times for same patient
  - Audit shows 2 create operations within milliseconds
RECOVERY:
  - Delete one appointment
  - Notify patient of cancellation
```

### Scenario 5: Encryption Key Compromise
```
THREAT: ENCRYPTION_KEY exposed in git history
ROOT CAUSE: Accidentally committed to repo
PREVENTION:
  - .env.local in .gitignore
  - Pre-commit hook checks for key patterns
  - Secrets scanning in CI
DETECTION:
  - Git history shows ENCRYPTION_KEY value
  - Honeypot secrets alert
RECOVERY:
  1. Rotate encryption key immediately
  2. Set ENCRYPTION_KEY_PREVIOUS to old key
  3. Re-encrypt all data with new key (background job)
  4. After 30 days, delete ENCRYPTION_KEY_PREVIOUS
  5. Audit all access logs during compromise window
```

---

## Invariant Violation Detection

### Automated Tests to Catch Violations

```bash
# Test 1: TenantId on every query
npm run test:unit -- tenantId.test.ts
# Should fail if any query is missing tenantId filter

# Test 2: PSYCHOLOGIST data scoping
npm run test:unit -- psychologist-scoping.test.ts
# Should fail if PSYCHOLOGIST can see other psychologists' patients

# Test 3: ASSISTANT clinical access
npm run test:unit -- assistant-access.test.ts
# Should fail if ASSISTANT can access sessions/files

# Test 4: Partial payment atomicity
npm run test:integration -- partial-payment.test.ts
# Should fail if remainder charge not created

# Test 5: Recurring appointment conflicts
npm run test:integration -- recurring-conflicts.test.ts
# Should fail if double-booking occurs

# Test 6: Journal encryption
npm run test:unit -- journal-encryption.test.ts
# Should fail if noteText is plaintext

# Test 7: Crisis keyword detection
npm run test:unit -- crisis-keywords.test.ts
# Should fail if keywords not detected

# Test 8: Soft delete retention
npm run test:integration -- soft-delete.test.ts
# Should fail if record deleted before 30 days
```

### Manual Inspection Checklist

- [ ] Check all route handlers follow auth→permission→validation→logic→audit→response pattern
- [ ] Grep for SQL/Prisma queries, verify tenantId in WHERE clause
- [ ] Audit all PSYCHOLOGIST role checks, verify assignedUserId filtering
- [ ] Verify ASSISTANT role cannot access sessions endpoint
- [ ] Verify READONLY role has no create/edit/delete permissions
- [ ] Check payment creation, verify remainder charge in transaction
- [ ] Check appointment creation, verify conflict detection in transaction
- [ ] Query database directly, verify encrypted fields are ciphertext (not plaintext)
- [ ] Check crisis keyword lists, verify all 18 keywords present
- [ ] Verify soft-deleted records excluded from normal queries
- [ ] Verify all migrations include tenantId on new tables

---

## Summary

These 38 invariants form the foundation of Psycologger's security, reliability, and compliance. Breaking any of these causes:
- **Data Isolation** (1-5): Cross-tenant leaks, privilege escalation
- **Authentication** (6-10): Session hijacking, account takeover
- **Business Logic** (11-16): Financial discrepancies, double-booking, data loss
- **Encryption** (17-21): PHI exposure, key compromise
- **Audit** (22-24): Compliance violations, forensic gaps
- **Schema** (25-30): Architectural instability
- **Code Patterns** (31-36): Inconsistent error handling, security gaps
- **Performance** (37-38): DoS vulnerabilities

**Every code change must preserve all invariants. When in doubt, ask: "Which invariant could this change break?"**
