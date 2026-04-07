# Integrations

Psycologger integrates with multiple external services for database, storage, email, rate limiting, hosting, and clinical workflows. This document outlines each integration, its role, and implementation status.

## Supabase PostgreSQL

**Primary database for all clinical and business data.**

### Configuration
- **Connection**: Managed by Supabase
- **Runtime**: Transaction pooler endpoint (`_txpool` suffix) for serverless functions
- **Migrations**: Direct connection pool for `prisma migrate deploy` in production
- **Region**: São Paulo, Brazil (gru1) for data residency

### Features
- Managed backups (automated daily retention)
- Point-in-time recovery
- Row-level security (RLS) policies available but not currently used (authorization enforced in application layer)
- Data at rest encryption (Supabase managed)

### Usage
- All tenant data, staff, patients, appointments, sessions, journal entries, payments, audit logs
- Prisma ORM with auto-generated client from `schema.prisma`
- Environment variables: `DATABASE_URL`, `DIRECT_DATABASE_URL` (for migrations)

### Monitoring
- Supabase dashboard: Database size, connection count, backup status
- Logs: PostgreSQL server logs visible in Supabase dashboard

---

## Supabase Storage

**File upload service for clinical session recordings, documents, and exports.**

### Configuration
- **Bucket**: `session-files` (single bucket, all content types)
- **Authentication**: Service role key (server-side only)
- **Environment variable**: `SUPABASE_SERVICE_ROLE_KEY`

### Download Mechanism
- Signed URLs generated server-side with 1-hour expiration
- Client receives pre-signed URL, downloads directly from Supabase CDN
- Prevents token leakage to client-side code

### File Type Support
- MIME whitelist: PDF, DOCX, XLSX, MP4, MP3, WAV
- Magic-byte validation enforced on upload
- 25 MB max file size

### Usage Example
```javascript
const file = await fetch(presignedUrl); // Client-side
```

---

## Resend

**Transactional email delivery service.**

### Configuration
- **Provider**: Resend.com
- **API Key**: `RESEND_API_KEY` environment variable
- **Development Fallback**: Console output (no API call)
- **Error Handling**: Logs HTTP status codes, does not retry failed sends

### Email Templates

| Template | Purpose | Variables |
|----------|---------|-----------|
| `invite-staff` | Staff onboarding invite | inviteUrl, senderName |
| `invite-patient` | Patient portal invite | inviteUrl, psychologistName |
| `welcome-staff` | Welcome after signup | staffName |
| `welcome-patient` | Welcome after patient signup | patientName, psychologistName |
| `password-reset` | Staff password reset link | resetUrl, staffName |
| `magic-link-patient` | Patient portal auth link | loginUrl, expiresIn |
| `journal-reminder` | Prompt patient to journal | psychologistName, journalPrompt |
| `session-reminder` | Upcoming appointment reminder | appointmentDate, psychologistName |
| `payment-reminder` | Outstanding invoice reminder | invoiceAmount, dueDate, paymentUrl |
| `consent-request` | Request consent acceptance | consentUrl, consentTypes |
| `monthly-report` | Clinical insights digest | tenantName, metricsJson |

### Pricing
- Free tier: 3,000 emails/month
- Charged per email above tier
- No rate limiting enforced by Resend; application applies rate limiting at endpoint level

### Development
- `RESEND_API_KEY=test` routes to console
- Template references use template IDs, not hardcoded HTML
- All templates use HTML escaping to prevent XSS

---

## Upstash Redis

**Rate limiting for public endpoints (signup, portal auth, payment reminders).**

### Configuration
- **Production**: Upstash Redis hosted cluster
- **Development**: In-memory `Map` fallback (no external dependency)
- **Environment variable**: `REDIS_URL` (production only)

### Rate Limiting Algorithm
- Sliding window implementation
- Tracks requests by IP + endpoint signature
- Clears old entries automatically via TTL

### Protected Endpoints
- `POST /api/auth/signup`: 5 attempts / 15 minutes per IP
- `POST /api/auth/patient/magic-link`: 3 attempts / 10 minutes per email
- `POST /api/auth/patient/verify`: 5 attempts / 15 minutes per token
- `POST /api/appointments`: 20 per 1 hour (per staff ID)
- `POST /api/patients`: 10 per 1 hour (per tenant)
- `POST /api/payments/charge`: 10 per 1 hour (per tenant)

### Fallback Behavior
- If Redis unavailable: In-memory fallback used automatically
- Development: Always in-memory (faster iteration)
- Error handling: Logs failure, allows request if rate limiter crashes (fail-open)

---

## Vercel

**Platform as a Service for hosting, serverless functions, and cron jobs.**

### Hosting & Functions
- **Node.js 20.x runtime** (auto-detected from `package.json`)
- **Environment**: Deployed from main branch automatically
- **Region**: São Paulo (gru1) for low latency to Brazilian clients
- **Logs**: Accessible via Vercel dashboard, searchable by request ID

### Cron Jobs
- **Payment Reminder Job**: Daily at 9:00 AM São Paulo time (`0 9 * * *`)
  - Triggers: `POST /api/cron/payment-reminders`
  - Sends reminder emails for invoices due within 7 days
  - Protected by Bearer token (`CRON_SECRET`)

### Deployment
- **Build**: `npm run build` (Prisma generate + Next.js build)
- **Environment Variables**: Managed in Vercel dashboard (not in code or `.env` files)
- **Database Migrations**: Run via `npx prisma migrate deploy` before function execution

### Monitoring
- Vercel Insights: Response time, status codes, error rate
- Function logs: Real-time logs in dashboard
- Alerts: Can configure via Vercel dashboard or third-party integrations

---

## Google Calendar (DEFERRED)

**Intended for appointment sync with provider's personal calendar. Deferred to a later deployment.**

### Current Status
- **Model**: `GoogleCalendarToken` stores provider's Google OAuth token
- **Environment Variables**:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_REDIRECT_URI`
- **Implementation**: DEFERRED (not scheduled for this release)
  - OAuth flow scaffolding exists
  - No sync logic for appointment → calendar event
  - No handling of calendar event modifications

### Future Implementation Notes
- Will require Google Calendar API client library (e.g., `google-auth-library-nodejs`)
- Bidirectional sync needed: appointment creation → add event, event deletion → cancel appointment
- Handle timezone conversions (appointments stored in user timezone, calendar in provider timezone)
- Token refresh logic required (Google OAuth tokens expire)

---

## NFSe (Nota Fiscal de Serviço Eletrônica) (DEFERRED)

**Brazilian electronic invoice integration for tax compliance. Deferred to a later deployment.**

### Current Status
- **Model**: `NfseInvoice` stores invoice metadata
- **Fields**:
  - `status`: draft | pending | issued | error
  - `externalId`: NFSe provider's unique ID
  - `pdfUrl`: Signed URL to generated PDF
  - `xmlContent`: Full XML for auditability
- **Implementation**: DEFERRED (not scheduled for this release)
  - No provider integration (e.g., Prefeitura municipal systems, third-party platforms like RPS Online)
  - No XML generation logic
  - No error handling or retry logic

### Future Implementation Notes
- Brazil-specific: Each municipality has different NFSe provider
- Will require CNPJ + municipal registration
- Must handle concurrent requests (batching recommended)
- Audit trail needed for tax authorities (XML storage critical)
- Consider: Outsourcing to third-party NFSe service provider (e.g., Nota Fiscal Fácil)

---

#---

**Last verified against code:** 2026-04-07
- vercel.json includes `encrypt-clinical-notes` (04:30) and `encrypt-cpfs` (04:45) cron jobs
- Google Calendar integration explicitly deferred
- NFSe integration explicitly deferred
- No PlugNotas or GCal integrations in code

---

# Sentry (OPTIONAL)

**Error monitoring and performance tracking (not currently active).**

### Configuration
- **Environment Variable**: `SENTRY_DSN` (if set, should initialize Sentry client)
- **Status**: Supported but not wired into application code
- **Use Case**: Centralized error tracking, performance monitoring, release tracking

### How to Enable
1. Create Sentry project at sentry.io
2. Copy DSN
3. Set `SENTRY_DSN` in Vercel environment variables
4. Initialize in `app.ts` or middleware (requires code changes)
5. Optional: Set `SENTRY_ENVIRONMENT=production`

### Recommended Implementation
```javascript
// In middleware or app initialization
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    tracesSampleRate: 0.1, // 10% of transactions
  });
}
```

### Benefits
- Automatic error capture across Next.js routes
- Performance monitoring (Web Vitals, database query times)
- Release tracking (deploy markers)
- Alert rules (e.g., spike in 500 errors)

---

## Summary Table

| Service | Purpose | Status | Critical |
|---------|---------|--------|----------|
| Supabase PostgreSQL | Data storage | Active | Yes |
| Supabase Storage | File uploads | Active | Yes |
| Resend | Transactional email | Active | Yes |
| Upstash Redis | Rate limiting | Active | Yes |
| Vercel | Hosting | Active | Yes |
| Google Calendar | Appointment sync | Stub | No |
| NFSe | Tax invoicing | Stub | No |
| Sentry | Error monitoring | Optional | No |

---

## Environment Variables Reference

```bash
# Supabase
DATABASE_URL=postgresql://user:pass@project-ref.supabase.co:5432/postgres
DIRECT_DATABASE_URL=postgresql://user:pass@project-ref.supabase.co:6543/postgres
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Resend
RESEND_API_KEY=re_...

# Upstash
REDIS_URL=redis://default:password@upstash-endpoint.upstash.io:...

# Vercel
CRON_SECRET=your-secret-here

# Google Calendar (future)
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxx

# Sentry (optional)
SENTRY_DSN=https://key@sentry.io/project-id
SENTRY_ENVIRONMENT=production
```
