# Development Setup and Operations

This document covers local development setup, database management, deployment, monitoring, and troubleshooting for Psycologger.

---

## Prerequisites

### System Requirements
- **Node.js**: 20.x or higher (check: `node --version`)
- **npm**: 10.x or higher (check: `npm --version`)
- **PostgreSQL**: 16.x (local or Docker)
- **Git**: 2.30+
- **Docker** (optional, for containerized PostgreSQL)
- **RAM**: 4 GB minimum (8 GB recommended)
- **Disk**: 5 GB free space (including node_modules)

### OS Support
- macOS 12+
- Linux (Ubuntu 20.04+, Fedora, etc.)
- Windows (WSL2 with Ubuntu)

---

## Installation

### 1. Clone Repository
```bash
git clone https://github.com/your-org/psycologger.git
cd psycologger
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/psycologger
DIRECT_DATABASE_URL=postgresql://user:password@localhost:6543/psycologger

# Supabase
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# NextAuth
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=http://localhost:3000

# Resend
RESEND_API_KEY=test  # Use 'test' for development

# Upstash Redis (optional for dev)
REDIS_URL=redis://localhost:6379

# Vercel (required in production)
CRON_SECRET=your-cron-secret

# Sentry (optional)
SENTRY_DSN=

# Google Calendar (stub integration)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

### 4. Database Setup

#### Option A: PostgreSQL Locally (macOS with Homebrew)
```bash
brew install postgresql@16
brew services start postgresql@16

# Create database
createdb psycologger

# Verify connection
psql -d psycologger -c "SELECT version();"
```

#### Option B: PostgreSQL via Docker (All Platforms)
```bash
docker-compose up -d postgres mailhog
```

The `docker-compose.yml` includes:
- PostgreSQL 16 on port 5432
- MailHog (mock SMTP) on port 1025 and UI on 8025

#### Option C: Remote Database (Supabase)
Skip local setup and use Supabase directly:
```bash
DATABASE_URL=postgresql://[user]:[password]@[project].supabase.co:5432/postgres
DIRECT_DATABASE_URL=postgresql://[user]:[password]@[project].supabase.co:6543/postgres
```

### 5. Run Database Migrations
```bash
npx prisma migrate dev
```

This:
- Applies pending migrations
- Generates Prisma Client
- Runs seed script (creates superadmin + demo data)

**First-time output**:
```
? Enter a name for the new migration: init
...
✓ Created migration: ./prisma/migrations/[timestamp]_init
✓ Generated Prisma Client to ./node_modules/.prisma/client in XXms

Running seed from ./prisma/seed.ts ...
Successfully seeded database with:
  - 1 Superadmin (email: admin@psycologger.com, password: Admin@12345)
  - 1 Demo Tenant
  - 1 Demo Psychologist
  - 3 Demo Patients
  - 10 Demo Appointments
```

---

## Running the Application

### Development Server
```bash
npm run dev
```

Visit: `http://localhost:3000`

**Features**:
- Hot reload on file changes
- Localhost: No HTTPS required
- Console logs for debugging
- Prisma Studio available at `http://localhost:5555`

### Build for Production
```bash
npm run build
```

This:
1. Runs `prisma generate` (updates Prisma Client)
2. Runs `next build` (bundles app)
3. Generates static pages

**Output**: `.next/` directory (ready for deployment)

### Start Production Build
```bash
npm run start
```

Requires `.env.local` with production values.

---

## Docker Development

### Using Docker Compose
```bash
docker-compose up -d
```

Services:
- `postgres`: PostgreSQL 16, port 5432
- `app`: Next.js app, port 3000 (if included in compose)
- `mailhog`: Mock SMTP + UI, port 1025 and 8025

### View Logs
```bash
docker-compose logs -f app
docker-compose logs -f postgres
```

### Stop Services
```bash
docker-compose down
```

Remove volumes (data):
```bash
docker-compose down -v
```

---

## Database Management

### Prisma Studio (Visual Database Browser)
```bash
npx prisma studio
```

Opens `http://localhost:5555` with GUI for:
- Browse tables
- Add/edit/delete records
- Execute raw SQL queries

### Database Migrations

#### Create New Migration
```bash
npx prisma migrate dev --name add_new_table
```

Enter migration name (e.g., `add_new_table`). Prisma will:
1. Prompt for SQL changes
2. Create migration file in `prisma/migrations/`
3. Apply migration
4. Regenerate Prisma Client

#### Apply Existing Migrations
```bash
# Development
npx prisma migrate dev

# Production (CI/CD)
npx prisma migrate deploy
```

#### Reset Database (Development Only)
```bash
npx prisma migrate reset
```

Caution: **Deletes all data!** Confirms before proceeding.

#### View Migration History
```bash
npx prisma migrate status
```

Output:
```
Pending migrations:
  [timestamp]_add_column_x

Migrations applied:
  [timestamp]_init
  [timestamp]_add_new_table
```

### Direct SQL Queries
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM staff_accounts;"
```

### Database Backup (Supabase)

Supabase auto-backups daily. Manual backup:

```bash
# Export dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Import dump
psql $DATABASE_URL < backup_20260404.sql
```

### Seed Database
```bash
npm run db:seed
```

Creates demo data (runs `prisma/seed.ts`):
- 1 Superadmin account
- 1 Demo Tenant
- 5 Demo Staff
- 20 Demo Patients
- 50 Demo Appointments
- 100 Demo Journal Entries

---

## Testing

### Run Unit Tests
```bash
npm run test:unit
```

### Run Integration Tests (requires PostgreSQL)
```bash
npm run test:integration
```

### Run E2E Tests (requires running app)
```bash
# Terminal 1
npm run dev

# Terminal 2
npm run test:e2e
```

### Run All Tests with Coverage
```bash
npm run test:ci
```

Generates coverage report in `coverage/` directory.

---

## Linting and Type Checking

### ESLint
```bash
npm run lint
```

Auto-fix issues:
```bash
npm run lint -- --fix
```

### TypeScript
```bash
npm run typecheck
```

---

## Deployment

### Prerequisites
- Vercel account (free tier available)
- GitHub repository (public or private)
- Supabase project
- Environment variables configured in Vercel dashboard

### Automatic Deployment (GitHub → Vercel)

**Setup**:
1. Connect GitHub repository to Vercel project
2. Set environment variables in Vercel dashboard: Settings → Environment Variables
3. Push to `main` branch

**Process**:
1. GitHub detects push to main
2. Vercel auto-builds: `npm run build`
3. Deployment to gru1 (São Paulo)
4. Environment variables injected at build time

**Monitoring**:
- Vercel dashboard: Project → Deployments
- Real-time logs during build/deployment
- Failed deployment triggers email alert

### Manual Deployment

If Vercel auto-deploy is disabled:

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Database Migrations in Production

**Important**: Run migrations BEFORE app deployment.

```bash
# Method 1: Via Vercel CLI (one-off function)
vercel env pull  # Download prod env vars
npx prisma migrate deploy

# Method 2: Via Supabase Dashboard
# 1. Go to SQL Editor
# 2. Copy migration file from prisma/migrations/[timestamp]_name/migration.sql
# 3. Run SQL manually
```

**Verify Migration**:
```bash
npx prisma migrate status
```

### Rollback (Emergency)

If migration fails and production is down:

```bash
# Revert to previous deployment
vercel rollback

# Or redeploy previous commit
git revert HEAD
git push origin main
```

---

## Environment Variables Reference

### Required (All Environments)
```bash
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=random-secret-here
NEXTAUTH_URL=http://localhost:3000  # or https://app.psycologger.com.br
```

### Development
```bash
RESEND_API_KEY=test
REDIS_URL=  # Optional (in-memory fallback)
```

### Production
```bash
RESEND_API_KEY=re_xxxxx
REDIS_URL=redis://...
DIRECT_DATABASE_URL=postgresql://...  # For migrations
CRON_SECRET=your-secret
NEXTAUTH_URL=https://app.psycologger.com.br
```

### Optional
```bash
SENTRY_DSN=  # Error monitoring
SENTRY_ENVIRONMENT=production
GOOGLE_OAUTH_CLIENT_ID=  # Stub integration
GOOGLE_OAUTH_CLIENT_SECRET=
```

---

## Monitoring

### Vercel Dashboard
1. Go to `vercel.com`
2. Select project
3. **Deployments**: View build logs and real-time deployment status
4. **Logs**: Search request logs by status code, URL, duration
5. **Monitoring**: View analytics (P50/P95/P99 response times, 4xx/5xx error rate)
6. **Function Logs**: See serverless function output and errors

### Application Health Check
```bash
curl https://app.psycologger.com.br/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-04T12:34:56.789Z"
}
```

### Database Monitoring (Supabase)
1. Go to Supabase Dashboard
2. Select project
3. **Database** tab:
   - Connection count (should be < 10 in prod)
   - Database size
   - Backup status and retention

### Error Monitoring (Sentry - Optional)
1. Go to `sentry.io`
2. Select project
3. **Issues**: List recent errors with stack traces
4. **Releases**: Map errors to deployment
5. **Alerts**: Set thresholds (e.g., 10+ errors in 5 min)

### Logs
```bash
# Vercel CLI: Real-time logs
vercel logs

# Supabase: PostgreSQL logs
# Via dashboard: Logs section or run:
# SELECT * FROM postgres_logs WHERE timestamp > now() - interval '1 hour';
```

---

## Performance Tuning

### Database
- Ensure indexes exist: `npx prisma db execute prisma/indexes.sql` (if file exists)
- Monitor slow queries: Supabase dashboard → Database → Analyze (pg_stat_statements)

### Redis
- Monitor connection count: Upstash dashboard
- Cache hit ratio: If < 80%, tune TTL or keys

### Next.js
- Enable ISR (Incremental Static Regeneration) for heavy pages
- Use `next/image` for optimized image delivery
- Check bundle size: `npx next-bundle-analyzer` (if configured)

---

## Troubleshooting

### Issue: "Prisma Client not found"
**Solution**:
```bash
npx prisma generate
npm install
```

### Issue: Database Connection Timeout
**Solution**:
1. Verify `DATABASE_URL` is set: `echo $DATABASE_URL`
2. Test connection: `psql $DATABASE_URL -c "SELECT 1;"`
3. Check firewall (if remote DB): Supabase Dashboard → Project Settings → Database
4. Increase connection timeout: Add `?connection_limit=1&socket_timeout=5` to URL

### Issue: "NEXTAUTH_SECRET is invalid"
**Solution**:
```bash
# Generate new secret
openssl rand -base64 32

# Set in .env.local
NEXTAUTH_SECRET=generated-value-here
```

### Issue: Docker Container Won't Start
**Solution**:
```bash
# Check logs
docker-compose logs postgres

# Remove and recreate
docker-compose down -v
docker-compose up -d
```

### Issue: Email Not Sending (Resend)
**Development**:
- Check `.env.local`: `RESEND_API_KEY=test`
- Emails logged to console, not actually sent

**Production**:
- Check Resend dashboard: https://resend.com
- Verify API key is not expired
- Check sender domain is verified

### Issue: Rate Limiting Too Strict (Dev)
**Solution**: Disable in development:
```typescript
// src/lib/rate-limit.ts
if (process.env.NODE_ENV === 'development') {
  return { success: true }; // No rate limiting in dev
}
```

### Issue: Type Error After Migration
**Solution**:
```bash
# Regenerate Prisma types
npx prisma generate

# Clear Next.js cache
rm -rf .next

# Restart dev server
npm run dev
```

### Issue: Port 3000 Already in Use
**Solution**:
```bash
# Use different port
PORT=3001 npm run dev

# Or kill process using port 3000
lsof -ti:3000 | xargs kill -9
```

---

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run start` | Start prod server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |
| `npm run test:unit` | Unit tests |
| `npm run test:integration` | Integration tests |
| `npm run test:e2e` | E2E tests |
| `npm run test:ci` | All tests + coverage |
| `npx prisma migrate dev` | Create + apply migration |
| `npx prisma migrate deploy` | Apply migrations (prod) |
| `npx prisma studio` | Open database GUI |
| `npx prisma db seed` | Seed database |
| `npm run db:reset` | Reset database (dev only) |

---

## Deployment Checklist

Before deploying to production:

- [ ] All tests pass: `npm run test:ci`
- [ ] No TypeScript errors: `npm run typecheck`
- [ ] No linting errors: `npm run lint`
- [ ] Database migrations tested locally: `npx prisma migrate dev`
- [ ] Environment variables set in Vercel dashboard
- [ ] Supabase backups enabled
- [ ] Monitoring configured (Sentry optional)
- [ ] Health check endpoint working
- [ ] SSL certificate valid (Vercel auto-handles)
- [ ] CORS configured correctly (if needed)
- [ ] Rate limits appropriate for expected load
- [ ] Email templates tested (Resend)

---

## Helpful Resources

- **Next.js Docs**: https://nextjs.org/docs
- **Prisma Docs**: https://www.prisma.io/docs
- **Supabase Docs**: https://supabase.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **GitHub Issues**: Report bugs via GitHub Issues
- **Community**: Prisma Slack, Next.js Discord

