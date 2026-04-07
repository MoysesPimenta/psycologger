# Authentication & RBAC

Comprehensive documentation of authentication strategies, session management, and role-based access control in Psycologger.

---

## Staff Authentication

### NextAuth v4 Configuration

Staff authentication uses **NextAuth v4** with email-based magic-link provider and JWT strategy.

**Key Features:**
- **Provider:** Custom Email Provider (magic-link via Resend)
- **Session Strategy:** JWT (Edge-compatible)
- **Adapter:** Prisma (stores sessions and verification tokens)
- **Session Duration:** 30-day maxAge, sliding window with callback updates
- **Callbacks:** Custom session and JWT callbacks load tenant context and permissions

**Configuration Location:** `src/auth.ts`

**Magic Link Flow:**
1. User enters email at `/login`
2. NextAuth generates verification token (32-byte entropy)
3. Email sent via Resend with magic link: `{APP_URL}/api/auth/callback/email?token={TOKEN}&email={EMAIL}`
4. Token valid for 24 hours (configurable)
5. User clicks link, token validated, JWT issued
6. Subsequent requests include JWT in httpOnly cookie

### JWT Strategy Details

**JWT Structure:**
```
{
  sub: string                    // User ID
  email: string                  // User email
  name: string                   // User full name
  picture?: string               // User avatar URL
  iat: number                    // Issued at
  exp: number                    // Expiration (30 days)
  jti: string                    // JWT ID (optional, for revocation)
  isSuperAdmin: boolean          // Platform admin flag
  tenantId?: string              // Associated clinic tenant
  lastLoginAt: Date              // Last successful login
}
```

**Callback Processing (`jwt()`):**
1. On first login: Add `isSuperAdmin`, `tenantId`, and `lastLoginAt`
2. On subsequent requests: Update `lastLoginAt` if older than 24 hours
3. User context merged from database on each request

**Session Callback (`session()`):**
1. Load JWT into session object
2. Inject tenant permissions from database
3. Filter permissions based on user role
4. Return enriched session to client

### Prisma Adapter Integration

**Tables Used:**
- `User` - Staff account records
- `Account` - OAuth/provider credentials (not used for staff)
- `Session` - Server-side session storage (optional with JWT)
- `VerificationToken` - Magic-link tokens for email provider

**Benefits:**
- Automatic token cleanup (expired tokens auto-deleted)
- Session audit trail in database
- Ability to revoke sessions server-side
- Backward compatibility with database-backed sessions if needed

### LastLoginAt Tracking

**Purpose:** Monitor staff activity, audit login attempts, detect inactive accounts

**Implementation:**
1. Tracked in User.lastLoginAt field
2. Updated in JWT callback only if older than 24 hours (reduces DB writes)
3. Updated in Audit log on each login
4. Used for:
   - Inactive account warnings (> 90 days)
   - Login attempt tracking
   - Automatic session termination for security
   - Compliance reporting

---

## Patient Portal Authentication

### Separate Authentication System

Patient portal uses **independent authentication** from staff to isolate sensitive clinical data and enable different security policies.

**Why Separate:**
- Patients are external users (not clinic staff)
- Different session lifetime requirements (shorter timeout)
- Different password policies (PBKDF2 hardening)
- Separate audit trail
- Patients cannot access staff system

### Password Storage: PBKDF2

**Algorithm:** PBKDF2-SHA256
**Iterations:** 600,000 (OWASP recommendation as of 2024)
**Salt:** 32 bytes (cryptographically random per user)
**Output:** 32 bytes
**Hash Storage:** PatientAuth.passwordHash

**Implementation Location:** `src/lib/crypto/patient-auth.ts`

**Key Derivation Function:**
```
PBKDF2(password, salt, iterations=600000, hashAlgo=SHA256, keyLength=32)
```

**Benefits Over Bcrypt/Scrypt:**
- Hardware-resistant iteration count
- Supported natively by Node.js crypto
- Deterministic for easy verification
- No external dependencies

**Password Validation Flow:**
1. User enters password at `/portal/login`
2. Retrieve PatientAuth record with email
3. Extract stored salt and hash
4. Derive new hash from input password with same salt
5. Constant-time comparison: `crypto.timingSafeEqual(computedHash, storedHash)`

### Session Tokens: SHA-256 Hash

**Token Generation:**
1. Create random token: `crypto.randomBytes(32)` (256 bits)
2. Compute hash: `SHA256(token)`
3. Store tokenHash in PatientPortalSession.tokenHash
4. Return token to client in httpOnly cookie

**Token Verification:**
1. Client sends httpOnly cookie with token
2. Server receives cookie (auth middleware)
3. Compute hash: `SHA256(receivedToken)`
4. Lookup session by tokenHash
5. Verify session is not expired
6. Grant access if valid

**Why Hash Tokens:**
- Protects against session database compromise (attacker sees hashes, not valid tokens)
- Tokens in cookies are vulnerable to theft (but hashed in DB)
- Even if DB leaked, tokens cannot be replayed without computing preimage

### Magic Links for Patient Activation

**Activation Token Flow:**
1. Staff sends patient portal invitation via `/api/v1/patients/[id]/portal-invite`
2. System generates activation token: `crypto.randomBytes(32)` (32 bytes)
3. Email sent with link: `{APP_URL}/portal/activate/[ACTIVATION_TOKEN]`
4. Patient clicks link, navigates to `/portal/activate/[ACTIVATION_TOKEN]`
5. Activation handler validates token and creates PatientAuth record
6. Patient sets password, account activated
7. Patient can now login with email + password

**Token Expiration:** 7 days

**Security Measures:**
- Tokens single-use (invalidated after activation)
- Tokens not logged in plain text (only hashed reference)
- Activation requires password creation at time of click

### Magic Link Login for Patients

**Alternative Authentication Method:**
1. Patient enters email at `/portal/login`
2. System checks if patient exists (PatientAuth.activatedAt is not null)
3. Generates magic-login token: `crypto.randomBytes(32)`
4. Stores token in magic-login table with 15-min expiry
5. Email sent: `{APP_URL}/portal/magic-login/[MAGIC_TOKEN]`
6. Patient clicks link
7. Token validated, session created automatically
8. Patient redirected to `/portal/dashboard`

**Benefits:**
- No password required for convenience
- Equivalent security to activation tokens
- Optional (patient can use password)

**Restrictions:**
- Can only be used once
- Expires in 15 minutes
- Requires verified email in PatientAuth

### Session Timeout & Expiry

**Idle Timeout:** 30 minutes
- Last activity tracked per request
- Automatic session cleanup if idle exceeds timeout
- Middleware checks `lastActivityAt` on every request
- If stale, session deleted and user redirected to login

**Absolute Expiry:** 7 days
- Regardless of activity, session expires after 7 days
- Forces re-authentication (password or magic-link)
- Prevents indefinite access

**Session Termination:**
- Explicit logout (POST `/api/v1/portal/auth` with logout action)
- Idle timeout exceeded
- Absolute expiry reached
- Server-side revocation (if patient account disabled)

**Implementation Location:** `src/lib/auth/portal-session.ts`

### Login Attempt Rate Limiting

**Protections:**
- **Max Attempts:** 5 failed login attempts
- **Lockout Duration:** 15 minutes
- **Reset On Success:** Failed attempt counter reset
- **Tracking:** By email + IP address (dual key)

**Implementation:**
1. On failed password attempt: increment LoginAttempt.failedAttempts
2. Check if failedAttempts >= 5
3. If true, check if lockoutUntil > now()
4. If locked out, return 429 Too Many Requests
5. On success: clear LoginAttempt record

**Purpose:**
- Prevent brute-force password attacks
- Protect weak passwords from enumeration
- Alert patient to account compromise if repeated failed attempts

---

## Session Management

### Staff Sessions (JWT)

**Storage:** In-memory via httpOnly cookie (no server storage required with JWT)
**Validation:** Cryptographic signature verification
**Attributes Stored in JWT:**
- User ID
- Email
- Tenant ID
- isSuperAdmin flag
- Issued/expiration timestamps
- Last login timestamp

**Cookie Attributes:**
- **Name:** `next-auth.session-token` (NextAuth default)
- **HttpOnly:** true (JavaScript cannot access)
- **Secure:** true (only over HTTPS in production)
- **SameSite:** Strict (CSRF protection)
- **MaxAge:** 30 days (2,592,000 seconds)
- **Domain:** Set to app domain only

**Validation on Every Request:**
1. Middleware extracts cookie
2. Verifies JWT signature using NextAuth secret
3. Checks expiration timestamp
4. Loads user context from database if needed
5. Injects into request context for route handlers

**Token Refresh:**
- JWT does not refresh automatically
- Slides window on activity: if iat + 15 days < now(), new token issued
- Sliding window keeps active sessions alive while pruning stale ones

### Patient Portal Sessions

**Storage:** PatientPortalSession table + httpOnly cookie
**Validation:** Token hash lookup + timestamp check
**Database Attributes:**
- sessionId (UUID)
- patientId (foreign key)
- tokenHash (SHA256 of session token)
- createdAt (session creation time)
- lastActivityAt (last request timestamp)
- expiresAt (absolute expiry time)
- ipAddress (optional, for security audit)
- userAgent (optional, for device tracking)

**Cookie Attributes:**
- **Name:** `psycologger-portal-token`
- **HttpOnly:** true (JavaScript cannot access)
- **Secure:** true (only over HTTPS in production)
- **SameSite:** Strict (CSRF protection)
- **MaxAge:** null (session cookie, cleared on browser close)
- **Domain:** Set to app domain only

**Validation on Every Request:**
1. Middleware reads `psycologger-portal-token` cookie
2. Computes SHA256 hash of token value
3. Queries PatientPortalSession by tokenHash
4. Verifies session not expired (lastActivityAt > now - 30 min AND expiresAt > now)
5. Updates lastActivityAt
6. Injects patient ID into request context

**Session Cleanup:**
- Automatic deletion of sessions where expiresAt < now() (daily cron job)
- Automatic deletion of sessions where lastActivityAt > 30 min
- Manual revocation on logout

### Dual-Cookie Strategy for Tenant Injection

**Staff Cookie (Tenant Context):**
- **Name:** `psycologger-tenant`
- **Contents:** Base64-encoded tenant ID
- **Purpose:** Allows frontend to inject X-Tenant-ID header for correct data scoping
- **Set By:** Middleware on login
- **Domain:** Same as app

**Patient Cookie (Portal Token):**
- **Name:** `psycologger-portal-token`
- **Contents:** Session token (opaque, 32 bytes)
- **Purpose:** Portal session validation
- **Set By:** POST `/api/v1/portal/auth` (activate/verify magic-link)

---

## Cookie Strategy

### SameSite Strict Policy

**Behavior:**
- Cookies **not sent** with cross-site requests
- Cookies **only sent** in same-site, same-origin contexts
- Protects against CSRF attacks where attacker tricks user into submitting forms

**Trade-offs:**
- Some integrations may not work (e.g., OAuth callbacks from other domains)
- Requires explicit token-based auth for API calls from third-party sites
- Top-level navigations from other sites do not include cookies (user must login again)

**Justification for Strict:**
- Psycologger is first-party app (no legitimate cross-site requests)
- Clinical data sensitivity requires maximum CSRF protection
- Patient portal isolation requires strict boundaries

### HttpOnly Flag

**Behavior:**
- JavaScript (window.document.cookie) cannot read or write cookie
- Only sent in HTTP requests to server
- Protects against XSS attacks stealing tokens via JavaScript

**Trade-offs:**
- Frontend cannot inspect session status from JavaScript
- Requires server-side session check endpoint (GET `/api/v1/profile`)

**Implementation:**
- Always set HttpOnly=true for all auth cookies
- Staff session validation: Middleware on every request
- Patient session validation: Middleware on every request

### Secure Flag

**Behavior (Production Only):**
- Cookie only sent over HTTPS (not HTTP)
- Protects against man-in-the-middle attacks

**Development Mode:**
- Secure=false allows localhost:3000 (HTTP) for testing
- Secure=true enforced in staging/production

**Implementation:**
- Check `NODE_ENV === 'production'`
- Also check `VERCEL_ENV === 'production'` for Vercel deployments
- Set Secure=true if either condition true

---

## RBAC: Role-Based Access Control

### Five Roles with Hierarchical Permissions

**Role Hierarchy (Most to Least Privileged):**
1. **SUPERADMIN** (Platform)
2. **TENANT_ADMIN** (Clinic)
3. **PSYCHOLOGIST** (Clinical staff)
4. **ASSISTANT** (Support staff)
5. **READONLY** (Read-only viewer)

### 27 Total Permissions

**Permission Categories:**

**Patient Management (5 perms):**
- `patients:list` - View patient list
- `patients:create` - Register new patient
- `patients:view` - View patient details
- `patients:edit` - Update patient info
- `patients:delete` - Remove patient (soft-delete)

**Appointments (4 perms):**
- `appointments:list` - View appointments
- `appointments:create` - Schedule appointment
- `appointments:edit` - Modify appointment
- `appointments:cancel` - Cancel appointment

**Sessions & Clinical (4 perms):**
- `sessions:list` - View session list
- `sessions:view` - Read session notes (conditional)
- `sessions:create` - Create session record
- `sessions:edit` - Update session notes
- `files:downloadClinical` - Download clinical files (conditional)

**Financial (4 perms):**
- `charges:list` - View charges
- `charges:create` - Create invoice
- `charges:edit` - Update charge
- `charges:delete` - Remove charge (soft-delete)

**Settings & Administration (6 perms):**
- `settings:view` - View clinic settings
- `settings:editClinic` - Modify clinic config
- `settings:editOwnProfile` - Update own profile
- `users:list` - View staff list
- `users:create` - Send staff invitation
- `users:edit` - Modify staff role/info
- `users:delete` - Deactivate staff

**Reporting & Audit (2 perms):**
- `reports:view` - Generate reports
- `audit:view` - Read audit log

**Advanced (2 perms):**
- `journal-inbox:manage` - Review patient journals
- `integrations:manage` - Configure integrations
- `reminders:manage` - Setup payment reminders
- `export:manage` - Data export

### Role Permission Matrix

| Permission | SUPERADMIN | TENANT_ADMIN | PSYCHOLOGIST | ASSISTANT | READONLY |
|-----------|:----------:|:------------:|:------------:|:---------:|:--------:|
| patients:list | ✓ | ✓ | ✓ (own) | ✓ (own) | ✓ |
| patients:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| patients:view | ✓ | ✓ | ✓ (own) | ✓ (own) | ✓ |
| patients:edit | ✓ | ✓ | ✓ (own) | ✓ (own) | ✗ |
| patients:delete | ✓ | ✓ | ✓ (own) | ✗ | ✗ |
| appointments:list | ✓ | ✓ | ✓ | ✓ | ✓ |
| appointments:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| appointments:edit | ✓ | ✓ | ✓ | ✓ | ✗ |
| appointments:cancel | ✓ | ✓ | ✓ | ✗ | ✗ |
| sessions:list | ✓ | ✓ | ✓ | ✗ | ✗ |
| sessions:view | ✓ | ✓ (if enabled) | ✓ | ✗ | ✗ |
| sessions:create | ✓ | ✓ | ✓ | ✗ | ✗ |
| sessions:edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| files:downloadClinical | ✓ | ✓ (if enabled) | ✓ | ✗ | ✗ |
| charges:list | ✓ | ✓ | ✓ | ✓ | ✓ |
| charges:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| charges:edit | ✓ | ✓ | ✓ | ✓ | ✗ |
| charges:delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| settings:view | ✓ | ✓ | ✗ | ✗ | ✗ |
| settings:editClinic | ✓ | ✓ | ✗ | ✗ | ✗ |
| settings:editOwnProfile | ✓ | ✓ | ✓ | ✓ | ✓ |
| users:list | ✓ | ✓ | ✗ | ✗ | ✗ |
| users:create | ✓ | ✓ | ✗ | ✗ | ✗ |
| users:edit | ✓ | ✓ | ✗ | ✗ | ✗ |
| users:delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| reports:view | ✓ | ✓ | ✓ | ✗ | ✗ |
| audit:view | ✓ | ✓ | ✗ | ✗ | ✗ |
| journal-inbox:manage | ✓ | ✓ | ✓ | ✗ | ✗ |
| integrations:manage | ✓ | ✓ | ✗ | ✗ | ✗ |
| reminders:manage | ✓ | ✓ | ✗ | ✗ | ✗ |
| export:manage | ✓ | ✓ | ✗ | ✗ | ✗ |

### Conditional Permissions

**Session Access (sessions:view, files:downloadClinical):**

Controlled by tenant setting: `Tenant.settings.adminCanViewClinical`

- If `true`: TENANT_ADMIN can view all psychologist session notes and clinical files
- If `false`: TENANT_ADMIN cannot access clinical content (PSYCHOLOGIST-only access)
- Default: `false` (privacy-preserving)

**PSYCHOLOGIST Data Scoping:**

Within PSYCHOLOGIST role, access is scoped to:
- Patients assigned to that psychologist
- Appointments for those patients only
- Sessions created by that psychologist
- Charges for assigned patients

Implementation: SQL WHERE clause filters on `psychologistId = currentUserId`

**ASSISTANT Data Scoping:**

Within ASSISTANT role, access is scoped to:
- Assigned patients (if assignment implemented)
- Cannot view session notes (no `sessions:view` permission)
- Cannot create charges (no `charges:create` permission)
- Can view appointment list (read-only)

### Permission Enforcement Architecture

**Location:** `src/lib/auth/permissions.ts`

**Functions:**

**`hasPermission(session, permission: string): boolean`**
- Checks if current user session has permission
- Reads from JWT or database
- Returns true/false

**`hasPermissionWithReason(session, permission: string): {allowed: boolean, reason: string}`**
- Extended version for audit logging
- Returns reason if denied (e.g., "PSYCHOLOGIST cannot delete charges")

**`filterByPermission(session, items: T[], permission: string): T[]`**
- Filters array by permission (used for query filtering)
- Example: `filterByPermission(session, patients, "patients:view")`

**`requirePermission(session, permission: string): void`**
- Throws error if permission denied
- Used in API route handlers

**Route Handler Pattern:**

```typescript
// GET /api/v1/sessions - list sessions
export async function GET(req: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);

  if (!session) return unauthorized();

  // Check permission
  requirePermission(session, 'sessions:list');

  // Query with tenant + psychologist scoping
  const sessions = await db.session.findMany({
    where: {
      tenantId: session.tenantId,
      psychologistId: session.role === 'PSYCHOLOGIST'
        ? session.user.id
        : undefined,
    },
  });

  return json(sessions);
}
```

### Invite Flow

**High-Entropy Token Generation:**

```typescript
const token = crypto.randomBytes(32).toString('hex');
// Output: 64 hex characters (32 bytes)
```

**Upsert Behavior:**

When sending invitation to existing email:
1. Query User by email
2. If exists: update invitationToken and invitationTokenExpiresAt
3. If not exists: create new User with token
4. Result: One record per email address (no duplicates)

**Non-Fatal Email:**

If Resend email service fails:
1. Invitation token created in database
2. Email sending error logged
3. API returns 201 (success) with token
4. User can manually share link or retry email
5. Token remains valid even if email never sent

**Token Validation:**

```typescript
const user = await db.user.findUnique({
  where: { email },
});

if (!user?.invitationToken || !user?.invitationTokenExpiresAt) {
  throw new Error('No pending invitation');
}

if (user.invitationTokenExpiresAt < new Date()) {
  throw new Error('Invitation expired');
}

if (user.invitationToken !== submittedToken) {
  throw new Error('Invalid token');
}

// Valid - user can set password and activate account
```

**Expiration:** 7 days

---

## Security Headers for Auth

All responses include security headers set by middleware:

**Strict-Transport-Security (HSTS):**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**X-Frame-Options:**
```
X-Frame-Options: DENY
```
Prevents clickjacking attacks where attacker embeds app in invisible iframe.

**X-Content-Type-Options:**
```
X-Content-Type-Options: nosniff
```
Prevents MIME-type sniffing attacks.

**Referrer-Policy:**
```
Referrer-Policy: strict-no-referrer
```
Prevents leaking referrer URL to third-party sites.

**Permissions-Policy:**
```
Permissions-Policy: geolocation=(), microphone=(), camera=()
```
Disables unused browser APIs (clinic staff don't need camera/mic).

---

## Summary Table

| Aspect | Staff | Patient |
|--------|-------|---------|
| **Auth Method** | Magic-link email | Magic-link or Password |
| **Storage** | JWT + httpOnly cookie | Token hash + httpOnly cookie |
| **Hashing** | NextAuth + Prisma | PBKDF2-SHA256 (600k iter) |
| **Session Duration** | 30 days | 7 days absolute + 30 min idle |
| **CSRF Protection** | Double-submit cookie | Double-submit cookie |
| **Rate Limiting** | Per IP | 5 attempts / 15 min per email |
| **Scope** | Tenant + Tenant Admin hierarchy | Patient individual |
| **Roles** | 5 roles | None (patient context only) |
| **Permissions** | 27 total | N/A |

---

**Last verified against code:** 2026-04-07
- Activation tokens and magic link tokens now hashed via SHA256 before storage (not plaintext)
- NextAuth events enriched with tenantId/IP/UA via nextHeaders()
- Patient magic tokens stored as tokenHash in PatientPortalSession
