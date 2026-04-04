# Configuration and Environment Variables

Psycologger's configuration is managed entirely through environment variables, with startup validation ensuring required variables are present and correctly formatted.

## Required Environment Variables

### DATABASE_URL
- **Purpose**: PostgreSQL connection string for application transactions
- **Value**: Supabase connection pooler URL with pgbouncer
- **Format**: `postgresql://[user]:[password]@[host]:[port]/[database]?schema=[schema]&...`
- **Example**: `postgresql://postgres:abc123@db.abc123def.supabase.co:6543/postgres?schema=public`
- **Where to Get**:
  1. Log into Supabase dashboard
  2. Navigate to Project Settings > Database
  3. Copy "Connection String" (Transaction Pooler mode, not Session Pooler)
  4. Select appropriate user (postgres by default)
- **Important**: Must use **Transaction Pooler** (pgbouncer on port 6543), not Session Pooler
  - Session Pooler doesn't support long-lived connections needed by Prisma
- **Used By**: Prisma ORM for all database queries in API routes and server components
- **If Missing**: App crashes at startup with "Database connection failed"
- **Validation**: `src/lib/env-check.ts` verifies URL contains postgresql:// and @

### DIRECT_URL
- **Purpose**: Direct PostgreSQL connection for database migrations only (bypass pgbouncer)
- **Value**: Supabase direct connection string
- **Format**: `postgresql://[user]:[password]@[host]:[port]/[database]?schema=[schema]`
- **Example**: `postgresql://postgres:abc123@db.abc123def.supabase.co:5432/postgres?schema=public`
- **Where to Get**:
  1. Same as DATABASE_URL, but select "Connection String" in **Session Pooler** mode
  2. Or use the direct connection: host.supabase.co (port 5432)
- **Used By**: Prisma migrations only (`prisma migrate deploy`)
- **If Missing**: Database migrations fail; app can run but schema won't be up to date
- **Why Separate**: pgbouncer (pooler) doesn't support DDL operations (CREATE TABLE, ALTER, etc.)
- **Validation**: `env-check.ts` verifies URL is present

### NEXTAUTH_SECRET
- **Purpose**: Signing key for JWT tokens issued by NextAuth
- **Value**: Cryptographic secret (random string)
- **Format**: Base64-encoded or raw string, minimum 32 characters
- **Example**: `abcdef1234567890abcdef1234567890abcdef12`
- **Generate**:
  ```bash
  openssl rand -base64 32
  # or
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- **Used By**: NextAuth JWT signing/verification
- **Token Expiration**: 30 days (configured in `auth.ts`)
- **If Missing**: App crashes with "NEXTAUTH_SECRET not configured"
- **Validation**: `env-check.ts` requires minimum 16 characters
- **Security**: Must be kept secret; never commit to version control

### NEXTAUTH_URL
- **Purpose**: Canonical application URL (needed for OAuth providers and redirects)
- **Value**: Full URL of app including protocol
- **Examples**:
  - Production: `https://app.psycologger.com.br`
  - Development: `http://localhost:3000`
  - Staging: `https://staging.psycologger.vercel.app`
- **Used By**: NextAuth OAuth callbacks, login redirects
- **Important**: Must match domain where app is deployed
- **If Missing**: In production, OAuth and redirects may fail with "redirect_uri_mismatch"
- **Validation**: `env-check.ts` verifies URL contains http:// or https://

### RESEND_API_KEY
- **Purpose**: Authentication key for Resend email service
- **Value**: Resend API token
- **Format**: Must start with `re_` prefix
- **Example**: `re_abc123def456ghi789jkl012mno345`
- **Where to Get**:
  1. Sign up or log into https://resend.com
  2. Go to API Keys section
  3. Create new API key
  4. Copy the key (starts with re_)
- **Used By**: Sending all transactional emails (appointment confirmations, reminders, charges, etc.)
- **If Missing**: Email sending fails silently (non-fatal); users don't receive notifications
- **Validation**: `env-check.ts` requires string starting with `re_`
- **Security**: Never expose in logs or error messages

### EMAIL_FROM
- **Purpose**: "From" address in all transactional emails
- **Value**: Email address or formatted string
- **Examples**:
  - `noreply@psycologger.com.br`
  - `Psycologger <noreply@psycologger.com.br>`
  - `Support Team <support@psycologger.com.br>`
- **Default**: `Psycologger <noreply@psycologger.com.br>`
- **Used By**: All email templates (appointment, reminder, charge, invitation)
- **Domain Requirement**: Domain must be verified in Resend for emails to be deliverable
- **If Missing**: Falls back to default; if default domain not verified, emails fail
- **Validation**: `env-check.ts` requires non-empty string

### ENCRYPTION_KEY
- **Purpose**: Encryption key for sensitive data at rest (PII, API tokens stored in DB)
- **Value**: AES-256 encryption key (32 bytes, base64-encoded)
- **Format**: Base64-encoded 32-byte string
- **Example**: `dGhpcyBpcyBhIDMyIGJ5dGUgc2VjcmV0IGtleSBmb3IgQUVTLTI1Ng==`
- **Generate**:
  ```bash
  openssl rand -base64 32
  ```
  - Produces exactly 44 characters (32 bytes * 4/3)
- **Used By**:
  - Encrypting sensitive fields: patient phone, SSN/CPF, bank account details (if stored)
  - API tokens for integrations (Google Calendar, external APIs)
  - Rotating keys (via ENCRYPTION_KEY_PREVIOUS)
- **Rotation**: If key compromised:
  1. Generate new key → set as ENCRYPTION_KEY
  2. Keep old key → set as ENCRYPTION_KEY_PREVIOUS
  3. App automatically decrypts old data with PREVIOUS key, re-encrypts with new key
  4. After all data migrated, remove PREVIOUS key
- **If Missing**: App crashes at startup with "Encryption key not configured"
- **Validation**: `env-check.ts` decodes base64 and verifies exactly 32 bytes length
- **Security**: Must be kept secret; never commit to version control

### ENCRYPTION_KEY_PREVIOUS (Optional)
- **Purpose**: Previous encryption key for rotation during key compromise
- **Value**: Old AES-256 key (same format as ENCRYPTION_KEY)
- **Usage**: Only set during key rotation period
- **How It Works**:
  1. Old data encrypted with ENCRYPTION_KEY_PREVIOUS
  2. Try decrypt with ENCRYPTION_KEY first (for new data)
  3. Fall back to ENCRYPTION_KEY_PREVIOUS (for old data)
  4. Re-encrypt with ENCRYPTION_KEY on next write
- **Duration**: Keep for 1-2 weeks, then remove after all data migrated
- **If Missing**: Key rotation fails; old encrypted data unreadable
- **Validation**: If set, must be valid 32-byte base64 string

### CRON_SECRET
- **Purpose**: Bearer token to authenticate cron job requests
- **Value**: Secret string (random)
- **Format**: Minimum 16 characters
- **Example**: `my_secret_cron_token_12345678`
- **Generate**:
  ```bash
  openssl rand -hex 16
  ```
- **Used By**: Cron endpoints (`/api/v1/cron/*`) verify this token in Authorization header
- **How It Works**:
  1. Vercel Cron sends: `Authorization: Bearer {CRON_SECRET}`
  2. API route checks header matches CRON_SECRET
  3. If mismatch, returns 401 Unauthorized
- **If Missing**: Cron jobs fail; app starts without error but scheduled tasks don't run
- **Validation**: `env-check.ts` requires minimum 16 characters
- **Security**: Keep secret; if exposed, anyone can trigger cron endpoints

## Optional Environment Variables

### S3_ENDPOINT
- **Purpose**: S3-compatible storage endpoint (for file uploads)
- **Value**: URL of S3-compatible service
- **Examples**:
  - Cloudflare R2: `https://abc123def456.r2.cloudflarestorage.com`
  - AWS S3: `https://s3.amazonaws.com`
  - MinIO: `http://minio.internal:9000`
- **Used By**: Uploading session attachments, patient documents
- **If Missing**: File uploads disabled; feature gracefully degrades
- **Required Companion Variables**: S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY (all must be set together)
- **Validation**: If set, must be valid URL

### S3_BUCKET
- **Purpose**: S3 bucket name for storing files
- **Value**: Bucket name (lowercase, alphanumeric + hyphens)
- **Example**: `psycologger-files` or `clinic-documents`
- **Used By**: All S3 operations (upload, download, delete)

### S3_ACCESS_KEY
- **Purpose**: AWS/S3-compatible access key ID
- **Value**: Access key from S3 provider
- **Example**: `AKIAIOSFODNN7EXAMPLE`
- **Where to Get**: AWS IAM or S3 provider dashboard
- **Security**: Never log or expose; use in env vars only

### S3_SECRET_KEY
- **Purpose**: AWS/S3-compatible secret access key
- **Value**: Secret key from S3 provider
- **Format**: Long random string
- **Security**: Most sensitive variable; never log or expose

### S3_REGION
- **Purpose**: AWS region for S3 bucket
- **Value**: Region code
- **Examples**: `us-east-1`, `eu-west-1`, `sa-east-1` (São Paulo for Brazil)
- **Used By**: S3 client initialization
- **Ignored**: For Cloudflare R2 (region not applicable)

### GOOGLE_CLIENT_ID
- **Purpose**: OAuth 2.0 client ID for Google Calendar integration
- **Value**: Client ID from Google Cloud Console
- **Example**: `123456789-abcdefghijklmnopqr.apps.googleusercontent.com`
- **Where to Get**:
  1. Go to https://console.cloud.google.com
  2. Create or select project
  3. Enable Google Calendar API
  4. Create OAuth 2.0 credentials (Web Application)
  5. Add authorized redirect URI: `https://app.psycologger.com.br/api/auth/callback/google`
  6. Copy Client ID
- **Used By**: Google Calendar sync (stub in current version)
- **If Missing**: Google Calendar integration unavailable
- **Required Companion**: GOOGLE_CLIENT_SECRET (both must be set together)

### GOOGLE_CLIENT_SECRET
- **Purpose**: OAuth 2.0 client secret for Google
- **Value**: Secret from Google Cloud Console
- **Format**: Random alphanumeric string
- **Security**: Never expose; use env vars only
- **Used By**: Authenticating Google Calendar requests

### UPSTASH_REDIS_REST_URL
- **Purpose**: Redis connection for rate limiting (production only)
- **Value**: Upstash REST URL
- **Example**: `https://abc123def456-ghijk-lmno-pqrs-tuvwxyz.upstash.io`
- **Where to Get**: https://console.upstash.com
- **Used By**: Rate limiting middleware for API endpoints
- **If Missing**: Rate limiting disabled (optional, defaults to disabled)
- **Required Companion**: UPSTASH_REDIS_REST_TOKEN

### UPSTASH_REDIS_REST_TOKEN
- **Purpose**: Authentication token for Upstash Redis
- **Value**: Token from Upstash console
- **Format**: Bearer token string

### SENTRY_DSN
- **Purpose**: Sentry error monitoring endpoint
- **Value**: Sentry DSN URL
- **Example**: `https://abc123def456@sentry.io/123456`
- **Where to Get**: https://sentry.io (create project, copy DSN)
- **Used By**: Error tracking and monitoring (via PortalErrorBoundary and server logging)
- **If Missing**: Error monitoring disabled; app logs errors locally only
- **Optional**: Not required for basic operation

### NODE_ENV
- **Purpose**: Deployment environment
- **Value**: `development`, `production`, or `test`
- **Default**: `production` (if not set)
- **Used By**:
  - Conditional logging (verbose in development, minimal in production)
  - Vercel environment detection
  - Prisma client instantiation
- **Examples**:
  - Local: `development`
  - Vercel deployment: `production` (set automatically)
  - Testing: `test`

## Environment Validation (src/lib/env-check.ts)

### Validation at Startup
The app validates required env vars on every boot via `env-check.ts`:

```typescript
// Required variables checked:
- ENCRYPTION_KEY: Decodes base64, must be exactly 32 bytes
- CRON_SECRET: Must be at least 16 characters
- RESEND_API_KEY: Must start with "re_"
- DATABASE_URL: Must contain "postgresql://"
- NEXTAUTH_SECRET: Must be at least 16 characters

// Validation errors logged with:
- Variable name
- What's wrong (e.g., "is missing", "invalid format")
- How to fix it
```

### Failure Behavior
- **If required var missing/invalid**: App crashes immediately with error message
- **If optional var missing**: Feature gracefully degrades (logged as warning)
- **Validation Timing**: On app start (server.ts or relevant entry point)

### Error Example
```
ERROR: Environment variable validation failed
  - ENCRYPTION_KEY: Invalid format (must be 32 bytes base64-encoded)
  - CRON_SECRET: Too short (minimum 16 characters, got 10)
Please fix these issues and restart the app.
```

## Configuration by Environment

### Development (localhost)
```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/psycologger
DIRECT_URL=postgresql://postgres:password@localhost:5432/psycologger
NEXTAUTH_SECRET=dev-secret-at-least-32-chars-long
NEXTAUTH_URL=http://localhost:3000
RESEND_API_KEY=re_test_xxxx (or real key)
EMAIL_FROM=Psycologger <noreply@localhost>
ENCRYPTION_KEY=<32-byte base64>
CRON_SECRET=dev-cron-secret
# Optional: add S3, Google, Sentry keys
```

### Staging/Preview
```env
NODE_ENV=production
DATABASE_URL=<Supabase staging db URL>
DIRECT_URL=<Supabase staging direct URL>
NEXTAUTH_SECRET=<generated 32+ char secret>
NEXTAUTH_URL=https://staging.psycologger.vercel.app
RESEND_API_KEY=re_<real key>
EMAIL_FROM=Psycologger <noreply@psycologger.com.br>
ENCRYPTION_KEY=<32-byte base64>
CRON_SECRET=<generated 16+ char secret>
S3_ENDPOINT=https://<r2>.r2.cloudflarestorage.com
S3_BUCKET=staging-files
S3_ACCESS_KEY=<key>
S3_SECRET_KEY=<key>
S3_REGION=auto
UPSTASH_REDIS_REST_URL=<URL>
UPSTASH_REDIS_REST_TOKEN=<token>
SENTRY_DSN=<DSN>
```

### Production
```env
NODE_ENV=production
DATABASE_URL=<Supabase production db URL with pgbouncer>
DIRECT_URL=<Supabase production direct connection>
NEXTAUTH_SECRET=<strong generated secret, 32+ chars>
NEXTAUTH_URL=https://app.psycologger.com.br
RESEND_API_KEY=re_<production key>
EMAIL_FROM=Psycologger <support@psycologger.com.br>
ENCRYPTION_KEY=<32-byte base64, production key>
ENCRYPTION_KEY_PREVIOUS=<old key if rotating>
CRON_SECRET=<strong generated secret, 16+ chars>
S3_ENDPOINT=https://<r2>.r2.cloudflarestorage.com
S3_BUCKET=production-files
S3_ACCESS_KEY=<production key>
S3_SECRET_KEY=<production key>
S3_REGION=auto
GOOGLE_CLIENT_ID=<production ID>
GOOGLE_CLIENT_SECRET=<production secret>
UPSTASH_REDIS_REST_URL=<production URL>
UPSTASH_REDIS_REST_TOKEN=<production token>
SENTRY_DSN=<production DSN>
```

## Vercel Deployment Configuration

### Environment Variables in Vercel
1. Go to Project Settings > Environment Variables
2. Add each variable with scope:
   - **Preview** (staging deployments)
   - **Production** (main branch)
   - **Development** (local .env.local)
3. Use same names as above (NEXTAUTH_SECRET, etc.)

### .env.local (Local Development)
```
# Copy from .env.example and fill in local values
NODE_ENV=development
DATABASE_URL=<local or Supabase dev DB>
...
```

### Secrets Management Best Practices
- **Never commit .env to git**: Add to .gitignore
- **Use .env.example**: Template file with variable names, no values
- **Rotate keys regularly**: Especially in production
- **Audit access**: Who can view secrets in Vercel
- **Use Supabase vault** (future): For additional security

## Troubleshooting

### "Database connection failed"
- Check DATABASE_URL is set and valid
- Verify Supabase project is running
- Test connection: `psql $DATABASE_URL`
- Ensure firewall allows connection (Supabase IP whitelist)

### "Encryption key is invalid"
- Ensure ENCRYPTION_KEY is base64-encoded
- Check length: `echo -n "key" | base64 | wc -c` should be 44 chars
- Regenerate: `openssl rand -base64 32`

### "Email not sending"
- Verify RESEND_API_KEY starts with `re_`
- Check API key is not revoked in Resend console
- Verify EMAIL_FROM domain is authorized in Resend
- Check spam folder (emails may be filtered)

### "Cron jobs not running"
- Verify CRON_SECRET is set and at least 16 chars
- Check Vercel Cron log in Vercel dashboard
- Ensure `/api/v1/cron/*` endpoints are callable
- Test manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://app.psycologger.com.br/api/v1/cron/payment-reminders`

### "Google Calendar not working"
- Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set
- Check OAuth redirect URI matches in Google Cloud Console
- Ensure Google Calendar API is enabled in Cloud Console
- Test OAuth flow in browser dev tools

## Security Considerations

### Secret Rotation
- **Quarterly**: Rotate NEXTAUTH_SECRET (all JWTs invalidated)
- **Bi-annually**: Rotate CRON_SECRET, database passwords
- **On Breach**: Immediately rotate RESEND_API_KEY, S3 keys, encryption keys
- **Key Rotation Process**:
  1. Set new key as primary (ENCRYPTION_KEY or similar)
  2. Keep old key accessible for decryption (ENCRYPTION_KEY_PREVIOUS)
  3. Run migration to re-encrypt all data with new key
  4. Remove old key after migration complete

### Least Privilege Access
- **Database user**: Create read-only user for API queries (separate from migration user)
- **Resend API key**: Use team/account-level key, not personal key
- **S3 credentials**: Create IAM user with minimal permissions (only required bucket operations)

### Logging & Monitoring
- **Never log**: ENCRYPTION_KEY, NEXTAUTH_SECRET, RESEND_API_KEY, S3_SECRET_KEY
- **Log safely**: Connection errors, auth failures, missing optional vars
- **Use Sentry**: For error tracking without exposing secrets
- **Audit trail**: Env var changes tracked in Vercel/hosting provider

## Environment Variable Priority

1. **Process environment** (explicitly set, highest priority)
2. **.env.local** (local development)
3. **.env** (shared defaults)
4. **Vercel environment settings** (production)
5. **Defaults in code** (lowest priority, e.g., NODE_ENV defaults to "production")
