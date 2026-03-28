# Psycologger — Electronic Medical Record & Practice Management for Psychologists

A production-ready, multi-tenant SaaS application for Brazilian psychologists to manage patients, scheduling, clinical notes, and financials.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Local Development Setup](#local-development-setup)
3. [Environment Variables](#environment-variables)
4. [Database Setup](#database-setup)
5. [Running Tests](#running-tests)
6. [Deploying to Production](#deploying-to-production)
7. [Operational Runbook](#operational-runbook)
8. [Security Checklist](#security-checklist)
9. [API Reference](#api-reference)

---

## Architecture Overview

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  psycologger.com│   │app.psycologger  │   │  SuperAdmin     │
│  (landing/marketing)│   │.com (Next.js)   │   │  /sa/*          │
└─────────────────┘   └────────┬────────┘   └────────┬────────┘
                               │                      │
                     ┌─────────▼──────────────────────▼───────┐
                     │         Next.js 14 (App Router)         │
                     │  API Routes /api/v1/*  │  Server Comps  │
                     └─────────────────────────────────────────┘
                                       │
                     ┌─────────────────▼───────────────────────┐
                     │              Prisma ORM                  │
                     └─────────────────────────────────────────┘
                                       │
                     ┌─────────────────▼───────────────────────┐
                     │         PostgreSQL (Supabase)            │
                     └─────────────────────────────────────────┘
```

**Tech stack:**
- **Frontend/Backend**: Next.js 14, TypeScript, Tailwind CSS, Radix UI
- **Auth**: NextAuth.js (magic link via Resend email)
- **Database**: PostgreSQL via Prisma ORM
- **Hosting**: Vercel + Supabase
- **Email**: Resend
- **Encryption**: libsodium (integration credentials at rest)

---

## Local Development Setup

### Prerequisites

- Node.js 22+
- npm 10+
- Docker + Docker Compose (for local Postgres)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/psycologger.git
cd psycologger

# 2. Install dependencies
npm install

# 3. Copy env template
cp .env.example .env.local
# Edit .env.local and fill in required values (see Environment Variables)

# 4. Start local services (Postgres + Mailhog)
docker-compose up -d postgres mailhog

# 5. Generate Prisma client
npm run db:generate

# 6. Run migrations
npm run db:migrate

# 7. Seed demo data
npm run db:seed

# 8. Start development server
npm run dev
```

Visit:
- App: http://localhost:3000
- Email testing (Mailhog): http://localhost:8025
- Prisma Studio: `npm run db:studio` → http://localhost:5555

**Demo credentials** (after seeding):
- SuperAdmin: `admin@psycologger.com`
- Psychologist: `ana@demo.com`
- TenantAdmin: `admin@demo.com`

> Magic link emails appear in Mailhog when running locally. Visit http://localhost:8025 to see them.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✅ | ≥32 char random string. Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | Full app URL, e.g. `https://app.psycologger.com` |
| `RESEND_API_KEY` | ✅ prod | Resend API key for sending emails |
| `EMAIL_FROM` | ✅ prod | Sender address, e.g. `Psycologger <noreply@psycologger.com>` |
| `ENCRYPTION_KEY` | ✅ prod | 32-byte base64 key. Generate: see crypto.ts `generateKey()` |
| `S3_ENDPOINT` | Optional | Cloudflare R2 or S3 endpoint for file uploads |
| `S3_BUCKET` | Optional | S3/R2 bucket name |
| `S3_ACCESS_KEY` | Optional | S3/R2 access key |
| `S3_SECRET_KEY` | Optional | S3/R2 secret key |
| `GOOGLE_CLIENT_ID` | Optional | Google Calendar OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google Calendar OAuth client secret |
| `SENTRY_DSN` | Optional | Sentry error tracking DSN |

**Generating ENCRYPTION_KEY:**
```bash
node -e "
const crypto = require('crypto');
console.log(crypto.randomBytes(32).toString('base64'));
"
```

---

## Database Setup

### Migrations

```bash
# Development — creates migration files + applies them
npm run db:migrate

# Production / CI — applies existing migrations only (no file creation)
npm run db:migrate:deploy

# Generate Prisma client after schema changes
npm run db:generate
```

### Backup Strategy

**Supabase** (recommended for production):
1. Enable Point-in-Time Recovery (PITR) in Supabase Dashboard → Settings → Backups
2. Enable daily snapshots (available on Pro plan)
3. Test restore procedure monthly

**Manual backup:**
```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

**Retention policy:**
- Daily backups: retain 30 days
- Monthly snapshots: retain 12 months
- Configuration: set in Supabase dashboard or your managed Postgres provider

### Export tenant data

Admins can export all their tenant's data from:
`/app/settings/export` → Downloads a CSV bundle.

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only (fast — no DB required)
npm run test:unit

# Integration tests (requires DB)
npm run test:integration

# E2E with Playwright
npm run test:e2e

# CI mode (generates coverage report)
npm run test:ci
```

### Test structure

```
tests/
├── unit/
│   ├── rbac.test.ts              # RBAC permission matrix
│   ├── financial.test.ts         # Charge calculations
│   ├── conflict-detection.test.ts # Appointment overlap logic
│   └── audit-redaction.test.ts   # PHI redaction in audit logs
├── integration/
│   └── tenant-isolation.test.ts  # Cross-tenant data isolation
└── e2e/
    └── (Playwright tests — see playwright.config.ts)
```

---

## Deploying to Production

### Vercel + Supabase (recommended)

**1. Create Supabase project:**
- Go to https://supabase.com → New project
- Copy connection string from Settings → Database → URI

**2. Deploy to Vercel:**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add DATABASE_URL
vercel env add NEXTAUTH_SECRET
vercel env add NEXTAUTH_URL
vercel env add RESEND_API_KEY
vercel env add EMAIL_FROM
vercel env add ENCRYPTION_KEY
```

**3. Run migrations on deploy:**

Add to `package.json` scripts or Vercel build command:
```json
"build": "prisma generate && prisma migrate deploy && next build"
```

**4. Custom domains:**
- Marketing: `psycologger.com` → point to Vercel
- App: `app.psycologger.com` → point to Vercel (set `NEXTAUTH_URL=https://app.psycologger.com`)

**5. First deployment steps:**
```bash
# After deploy, run seed to create SuperAdmin
SEED_ENV=production npx tsx prisma/seed.ts
```

---

## Operational Runbook

### Adding a SuperAdmin

```sql
-- Via Prisma Studio or direct SQL
UPDATE "User" SET "isSuperAdmin" = true WHERE email = 'admin@yourdomain.com';
```

### Resetting a user's session

```sql
DELETE FROM "Session" WHERE "userId" = 'user-uuid-here';
```

### Tenant suspension

1. SuperAdmin Console → `/sa/tenants/[id]`
2. Suspend all memberships
3. Or via SQL: `UPDATE "Membership" SET status = 'SUSPENDED' WHERE "tenantId" = 'uuid'`

### Monitoring

- **Errors**: Sentry dashboard (configure `SENTRY_DSN`)
- **Uptime**: Vercel Analytics or set up UptimeRobot for `https://app.psycologger.com`
- **Performance**: Vercel Speed Insights

### Handling a data breach

1. Immediately rotate `NEXTAUTH_SECRET` and `ENCRYPTION_KEY` (all sessions invalidated)
2. Pull audit logs: `GET /api/v1/audit?export=true`
3. Notify affected tenants per LGPD Art. 48 (72-hour window to ANPD)
4. Engage legal counsel

---

## Security Checklist

- [x] HTTPS enforced via Vercel (automatic)
- [x] Secure, HttpOnly session cookies (NextAuth default)
- [x] CSRF protection (NextAuth handles)
- [x] Tenant isolation at DB query level (`tenantId` on every query)
- [x] RBAC on every API route
- [x] PHI redaction in audit logs
- [x] Integration credentials encrypted (libsodium secretbox)
- [x] Signed URLs for file downloads (implement in files API)
- [x] Rate limiting on auth endpoints
- [x] Security headers via `next.config.ts`
- [x] Content Security Policy
- [x] No secrets logged or exposed in API responses
- [ ] WAF (recommended: Cloudflare proxy in front of Vercel)
- [ ] Penetration testing (recommended before public launch)

---

## API Reference

Base URL: `https://app.psycologger.com/api/v1`

All endpoints require authentication (session cookie). Responses follow:

```json
// Success
{ "data": {...}, "meta": { "page": 1, "total": 42 } }

// Error
{ "error": { "code": "FORBIDDEN", "message": "..." } }
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/onboarding` | Create user + tenant (public signup) |
| `GET` | `/patients` | List patients (paginated, filtered) |
| `POST` | `/patients` | Create patient |
| `GET` | `/patients/:id` | Get patient detail |
| `PATCH` | `/patients/:id` | Update patient |
| `DELETE` | `/patients/:id` | Archive patient |
| `GET` | `/appointments` | List appointments |
| `POST` | `/appointments` | Create appointment |
| `GET` | `/appointments/:id` | Get appointment |
| `PATCH` | `/appointments/:id` | Update/cancel/no-show |
| `GET` | `/sessions` | List clinical sessions |
| `POST` | `/sessions` | Create session note |
| `GET` | `/sessions/:id` | Get session (full note) |
| `PATCH` | `/sessions/:id` | Update session note |
| `GET` | `/charges` | List charges |
| `POST` | `/charges` | Create charge |
| `POST` | `/payments` | Add payment to charge |
| `GET` | `/reports` | Monthly report (or ?export=true for CSV) |
| `GET` | `/users` | List tenant members |
| `POST` | `/users` | Invite user |
| `GET` | `/audit` | Audit log (or ?export=true for CSV) |
| `GET` | `/settings` | Get tenant settings |
| `PATCH` | `/settings` | Update tenant settings |
| `GET` | `/invites/:token` | Validate invite token |
| `POST` | `/invites/:token` | Accept invite |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes, add tests
4. Run `npm run typecheck && npm test`
5. Open a pull request

---

*Psycologger — Built for Brazilian psychologists. LGPD-compliant by design.*
