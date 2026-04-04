# Middlewares

Comprehensive documentation of the single middleware system in Psycologger, which handles authentication, CSRF protection, security headers, and request context injection.

---

## Overview

**Location:** `src/middleware.ts`

**Type:** Next.js Edge Middleware

**Purpose:** Centralized request processing for:
- Staff authentication (JWT validation)
- Patient portal session validation
- CSRF token validation
- Content Security Policy (CSP) nonce injection
- Security headers injection
- Tenant context injection

**Execution Model:** Runs on Vercel Edge Network (edge-optimized, zero-latency)

---

## Route Matching

**Pattern:** `/((?!_next/static|_next/image|favicon.ico|logo.png|robots.txt).*)`

Middleware runs on **all requests** except:
- Static assets: `_next/static/*`
- Image optimization: `_next/image`
- Favicons/logos: `favicon.ico`, `logo.png`
- SEO: `robots.txt`

This ensures maximum coverage while avoiding unnecessary processing of static assets.

---

## Auth Flow

### NextAuth withAuth Wrapper

**Implementation:**
```typescript
const auth = withAuth(middleware, {
  callbacks: {
    authorized: ({ token, req }) => {
      // Token exists if user authenticated (staff session active)
      return !!token;
    },
  },
});
```

**Behavior:**
1. Validates JWT in httpOnly cookie (`next-auth.session-token`)
2. Verifies signature using NextAuth secret
3. Checks expiration timestamp
4. Returns token object if valid, null otherwise

### Protected Staff Routes

**Routes Requiring Staff Auth:**
- `/app/*` (all staff application pages)
- `/sa/*` (all superadmin pages)
- Most API routes (except `/api/auth/*`, `/api/v1/cron/*`, `/api/v1/portal/auth`)

**Redirect Logic:**
```typescript
if (!token && pathname.startsWith('/app')) {
  return NextResponse.redirect(`/login?callbackUrl=${pathname}`);
}
```

If staff session invalid/expired:
- Redirect to login
- Include `callbackUrl` query param to return after login
- Clear invalid cookie

### Portal Routes Bypass NextAuth

**Portal Routes (`/portal/*` except public pages):**
- `/portal/dashboard`
- `/portal/sessions/*`
- `/portal/journal/*`
- `/portal/payments`
- `/portal/profile`
- etc.

**Reason:** Patients use separate `psycologger-portal-token` cookie, not NextAuth JWT

**Implementation:**
```typescript
if (pathname.startsWith('/portal/') && !isPublicPortalRoute(pathname)) {
  // Skip NextAuth withAuth wrapper
  // Use custom portal session validation instead
}
```

**Custom Portal Session Validation:**
```typescript
const sessionToken = req.cookies.get('psycologger-portal-token')?.value;

if (!sessionToken) {
  // No session - redirect to login
  return NextResponse.redirect('/portal/login');
}

// Validate token hash against database
const isValid = await validatePortalSession(sessionToken);

if (!isValid) {
  // Invalid session - logout and redirect
  return NextResponse.redirect('/portal/login');
}
```

---

## CSRF Validation

### CSRF Tokens in Cookies

**Strategy:** Double-submit cookie pattern

**Staff CSRF Token:**
- **Name:** `XSRF-TOKEN`
- **Generation:** 32-byte random value on login
- **Storage:** httpOnly = false (JavaScript must read for manual header injection)
- **Scope:** Staff session only
- **Lifetime:** Same as JWT (30 days)

**Patient CSRF Token:**
- **Name:** `XSRF-TOKEN-PORTAL`
- **Generation:** 32-byte random value on login
- **Storage:** httpOnly = false
- **Scope:** Patient session only
- **Lifetime:** Same as portal session (7 days)

### Validation Logic

**CSRF Check Triggers:**
- Request method: POST, PATCH, PUT, DELETE
- Request method NOT: GET, HEAD, OPTIONS
- Exclude paths: `/api/auth/`, `/api/v1/cron/`, `/api/v1/portal/auth`
- Content-Type: application/json, application/x-www-form-urlencoded, multipart/form-data

**Validation Steps:**

1. **Extract tokens:**
   ```typescript
   const cookieToken = req.cookies.get('XSRF-TOKEN')?.value;
   const headerToken = req.headers.get('X-XSRF-TOKEN') ||
                       req.headers.get('x-csrf-token');
   ```

2. **Constant-time comparison:**
   ```typescript
   const tokensMatch = crypto.timingSafeEqual(
     Buffer.from(cookieToken),
     Buffer.from(headerToken)
   );
   ```

3. **If mismatch:**
   ```typescript
   return NextResponse.json(
     { error: 'CSRF token mismatch' },
     { status: 403 }
   );
   ```

### Client-Side Injection

**Staff:**
```typescript
// In fetch headers
fetch('/api/v1/patients', {
  method: 'POST',
  headers: {
    'X-XSRF-TOKEN': document.cookie
      .split('; ')
      .find(row => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1],
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
```

**Patient:**
```typescript
// In fetch headers
fetch('/api/v1/portal/journal', {
  method: 'POST',
  headers: {
    'X-XSRF-TOKEN': document.cookie
      .split('; ')
      .find(row => row.startsWith('XSRF-TOKEN-PORTAL='))
      ?.split('=')[1],
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
```

### Excluded Paths

**Why excluded:**
- `/api/auth/*` - NextAuth has internal CSRF protection
- `/api/v1/cron/*` - Triggered by Vercel cron (stateless, uses Bearer token)
- `/api/v1/portal/auth` - Multi-purpose endpoint for initial auth (no session yet)

---

## CSP Nonce Injection

### Content Security Policy (CSP) Header

**Purpose:** Prevent inline script execution and XSS attacks

**CSP Header Generated Per Request:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-ABC123...'; style-src 'self' 'nonce-ABC123...'; img-src *; font-src *; ...
```

**Nonce Generation:**
```typescript
const nonce = crypto.randomBytes(16).toString('base64');
// Output: 24 base64 characters per request
```

**Security Properties:**
- **Per-request generation:** Different nonce for every response
- **Unique:** Only server knows nonce
- **In header:** CSP header includes nonce
- **Client usage:** Inline scripts tagged with `<script nonce="ABC123...">`

### Inline Script Allowance

**Example: Layout.tsx**
```typescript
// In middleware, compute nonce
const nonce = crypto.randomBytes(16).toString('base64');

// Pass to component
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <script nonce={nonce}>
          // Inline initialization code allowed only if nonce matches
        </script>
        {children}
      </body>
    </html>
  );
}
```

### Fallback for Older Browsers

**Browsers Not Supporting Nonce (IE11, older Safari):**
- CSP falls back to `unsafe-inline` (less secure)
- Nonce ignored if not understood
- Alternative: Use external scripts only (no inline)

**CSP Header with Fallback:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-ABC123...' 'unsafe-inline'; style-src 'self' 'nonce-ABC123...' 'unsafe-inline'; ...
```

---

## Security Headers

### HSTS (HTTP Strict Transport Security)

**Header:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**Effect:**
- Browsers force HTTPS for all future requests
- Duration: 1 year (31,536,000 seconds)
- Subdomains: All subdomains of psycologger.com also HTTPS-only
- Preload: Included in HSTS preload list for fresh installs

**Security Benefit:** Prevents man-in-the-middle downgrades to HTTP

### X-Frame-Options

**Header:**
```
X-Frame-Options: DENY
```

**Effect:** App cannot be embedded in iframes

**Security Benefit:** Prevents clickjacking attacks where attacker embeds app in invisible iframe to steal credentials or trigger unwanted actions

### X-Content-Type-Options

**Header:**
```
X-Content-Type-Options: nosniff
```

**Effect:** Browsers must respect Content-Type header (no MIME sniffing)

**Security Benefit:** Prevents attackers from uploading files (e.g., HTML as image) and having browsers execute them as scripts

### Referrer-Policy

**Header:**
```
Referrer-Policy: strict-no-referrer
```

**Effect:**
- Browser does not send `Referer` header to any destination
- Even internal links don't leak referrer information

**Security Benefit:**
- Prevents third-party sites from learning internal URLs
- Protects patient privacy (URLs might contain patient IDs)

**Alternative Policies:**
- `strict-no-referrer`: No referrer ever (most private)
- `same-origin`: Referrer only to same domain
- `no-referrer-when-downgrade`: Referrer only for same protocol

### Permissions-Policy

**Header:**
```
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

**Effect:** Disables specific browser APIs for this app

**Disabled APIs:**
- `geolocation` - App doesn't need location access
- `microphone` - Clinic staff don't record audio
- `camera` - No video conferencing in app
- `payment` - Payment handled by Stripe (external)
- `usb` - No hardware access needed
- `magnetometer`, `gyroscope` - Mobile sensors unused

**Security Benefit:** Limits damage if JavaScript is compromised (XSS attack cannot access camera)

---

## Portal Auth Flow in Middleware

### Session Cookie Check

**Step 1: Extract Token**
```typescript
const sessionToken = req.cookies.get('psycologger-portal-token')?.value;

if (!sessionToken) {
  // No session cookie
  const isPublicRoute = ['/portal/login', '/portal/activate', '/portal/magic-login'].some(
    route => pathname.startsWith(route)
  );

  if (isPublicRoute) {
    // Allow public routes without session
    return NextResponse.next();
  }

  // Redirect to login
  return NextResponse.redirect('/portal/login');
}
```

**Step 2: Hash Token**
```typescript
const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
```

**Step 3: Lookup Session**
```typescript
const session = await db.patientPortalSession.findUnique({
  where: { tokenHash },
  include: { patient: true },
});

if (!session) {
  // Token not in database (invalid/revoked)
  return NextResponse.redirect('/portal/login');
}
```

**Step 4: Check Expiry**
```typescript
const now = new Date();

// Idle timeout: 30 minutes
if (session.lastActivityAt < new Date(now.getTime() - 30 * 60 * 1000)) {
  await db.patientPortalSession.delete({ where: { id: session.id } });
  return NextResponse.redirect('/portal/login');
}

// Absolute expiry: 7 days
if (session.expiresAt < now) {
  await db.patientPortalSession.delete({ where: { id: session.id } });
  return NextResponse.redirect('/portal/login');
}
```

**Step 5: Update Activity**
```typescript
await db.patientPortalSession.update({
  where: { id: session.id },
  data: { lastActivityAt: new Date() },
});
```

**Step 6: Inject Context**
```typescript
// Pass to route handlers via request context
const requestHeaders = new Headers(req.headers);
requestHeaders.set('X-Patient-ID', session.patientId);
requestHeaders.set('X-Portal-Session-ID', session.id);

return NextResponse.next({
  request: { headers: requestHeaders },
});
```

### Redirect Logic (API vs Pages)

**For API requests (to /api/v1/portal/*):**
```typescript
if (isApiRoute && !session) {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}
```

**For page requests (to /portal/*):**
```typescript
if (isPageRoute && !session) {
  return NextResponse.redirect('/portal/login');
}
```

---

## Tenant Header Injection

### Tenant Cookie Reading

**Step 1: Extract Tenant ID**
```typescript
const tenantCookie = req.cookies.get('psycologger-tenant')?.value;

if (!tenantCookie) {
  // Staff likely not logged in - let auth handler deal with it
  return NextResponse.next();
}

const tenantId = Buffer.from(tenantCookie, 'base64').toString();
```

**Step 2: Validate Tenant**
```typescript
// Optional: Verify tenant exists in database (caching recommended)
const tenant = await db.tenant.findUnique({
  where: { id: tenantId },
});

if (!tenant) {
  // Tenant doesn't exist - remove cookie
  const response = NextResponse.next();
  response.cookies.set('psycologger-tenant', '', { maxAge: 0 });
  return response;
}
```

**Step 3: Inject Header**
```typescript
const requestHeaders = new Headers(req.headers);
requestHeaders.set('X-Tenant-ID', tenantId);

return NextResponse.next({
  request: { headers: requestHeaders },
});
```

### Why Tenant Header

**Purpose:** Scope database queries to tenant

**Route Handler Example:**
```typescript
export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('X-Tenant-ID');

  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant' }, { status: 400 });
  }

  // Query only this tenant's patients
  const patients = await db.patient.findMany({
    where: { tenantId },
  });

  return NextResponse.json(patients);
}
```

**Benefits:**
- Single source of truth for tenant context
- Prevents accidental data leakage between tenants
- Easier testing (mock header to simulate different tenants)

---

## Middleware Execution Order

**Sequence for incoming request:**

1. **Route matching:** Check if path matches middleware pattern
2. **NextAuth withAuth:** Validate staff JWT (if applicable)
3. **Portal session validation:** Check portal session cookie (if applicable)
4. **CSRF validation:** Check CSRF token if state-changing request
5. **CSP nonce injection:** Generate and inject CSP header
6. **Security headers:** Add HSTS, X-Frame-Options, etc.
7. **Tenant injection:** Inject X-Tenant-ID header from cookie
8. **Pass to route:** Continue to API route or page handler

**Abort conditions (request stopped):**
- Staff auth missing for protected route
- Portal session invalid for patient route
- CSRF token mismatch on POST/PATCH/DELETE
- (Errors returned with appropriate HTTP status)

---

## Performance Considerations

### Edge Execution

**Vercel Edge Network:**
- Middleware runs at edge, not in serverless function
- Zero-latency auth check
- No cold-start overhead
- Geographic proximity to users

**Latency Impact:**
- JWT signature verification: ~1ms
- Portal session hash lookup: ~2-5ms (database round-trip)
- CSRF validation: <1ms
- Total: ~10ms per request (acceptable for 100% coverage)

### Caching

**Tenant Verification (Optional):**
```typescript
const tenantCache = new Map<string, Tenant>();

function getTenant(tenantId: string) {
  if (tenantCache.has(tenantId)) {
    return tenantCache.get(tenantId);
  }

  // Fetch and cache for 5 minutes
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  tenantCache.set(tenantId, tenant);
  setTimeout(() => tenantCache.delete(tenantId), 5 * 60 * 1000);

  return tenant;
}
```

---

## Configuration

**Environment Variables:**

```bash
# NextAuth
NEXTAUTH_URL=https://psycologger.com
NEXTAUTH_SECRET=<32+ byte secret key>

# Middleware CSRF
CSRF_SECRET=<32+ byte secret key>

# Portal session timeouts
PORTAL_IDLE_TIMEOUT_MINUTES=30
PORTAL_ABSOLUTE_TIMEOUT_DAYS=7

# Vercel cron auth
CRON_SECRET=<Bearer token for cron>
```

---

## Summary

| Feature | Implementation | Security Level |
|---------|----------------|-----------------|
| **Staff Auth** | NextAuth JWT | ★★★★★ |
| **Portal Auth** | Custom token hash | ★★★★★ |
| **CSRF** | Double-submit cookie | ★★★★★ |
| **CSP** | Nonce-based inline scripts | ★★★★★ |
| **Headers** | HSTS, X-Frame, etc. | ★★★★★ |
| **Tenant Injection** | Cookie → header | ★★★★ |

