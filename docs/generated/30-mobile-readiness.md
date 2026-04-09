# Psycologger — Mobile Readiness Guide (2026-04-09)

## Overview

This document covers the current state of mobile client readiness for Psycologger, focusing on the new bearer token authentication system introduced in Batch 3 and what remains to be implemented.

## API Envelope

All Psycologger APIs follow a consistent JSON response envelope:

### Success (2xx)
```json
{
  "id": "string",
  "data": { /* entity or array */ },
  "metadata": { "key": "value" },
  "timestamp": "2026-04-09T...",
  "status": "ok|created|accepted"
}
```

### Error (4xx/5xx)
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "digest": "optional_sentry_digest"
  },
  "timestamp": "2026-04-09T...",
  "status": "error"
}
```

## Bearer Token Authentication (Mobile Auth)

### Overview

Mobile clients (Expo/React Native) authenticate via JWT bearer tokens instead of cookies. This strategy isolates mobile sessions from web sessions, enables fine-grained token expiration, and prepares the backend for Vercel Edge runtime constraints.

### Token Lifecycle

#### Staff Mobile Token

**Endpoint:** `POST /api/v1/auth/mobile-token`

**Requirements:**
- Active NextAuth session cookie (same as web staff login)

**Response:**
```json
{
  "token": "eyJhbGc...",
  "expiresAt": "2026-05-09T12:34:56Z",
  "tenantId": "cln...",
  "userId": "usr_..."
}
```

**Token payload:**
```typescript
{
  userId: string;
  tenantId: string;
  kind: "staff";
  iat: number;
  exp: number;
}
```

**Validity:** 30 days (2592000 seconds)

#### Patient Mobile Token

**Endpoint:** `POST /api/v1/portal/auth/mobile-token`

**Requirements:**
- Active patient portal session cookie (`psycologger-portal-token`)

**Response:**
```json
{
  "token": "eyJhbGc...",
  "expiresAt": "2026-05-09T12:34:56Z",
  "tenantId": "cln...",
  "patientAuthId": "patauth_..."
}
```

**Token payload:**
```typescript
{
  userId: string; // patientAuthId for patients
  tenantId: string;
  kind: "patient";
  iat: number;
  exp: number;
}
```

**Validity:** 30 days

### Usage

Mobile clients include tokens in the `Authorization` header:

```
Authorization: Bearer <jwt>
```

### Security

- **Algorithm:** HS256 (symmetric)
- **Secret:** `MOBILE_JWT_SECRET` (falls back to `NEXTAUTH_SECRET`)
- **Expiration:** Enforced by jose library on every verify
- **No refresh:** New tokens obtained by re-authenticating (web login → extract token)

### Feature Flag

Bearer auth is disabled by default. Enable via environment variable:

```bash
MOBILE_BEARER_ENABLED=true
```

When disabled, mobile clients must use web login flows (not recommended).

## Mobile-Ready Endpoints

### Authentication

- ✅ `POST /api/v1/auth/mobile-token` — issue staff token (requires NextAuth session)
- ✅ `POST /api/v1/portal/auth/mobile-token` — issue patient token (requires portal session)
- ✅ `POST /api/v1/portal/auth` — patient magic-link flow (available now, no bearer needed)

### Appointments (Staff)

- ✅ `GET /api/v1/appointments` — list tenant appointments
- ✅ `GET /api/v1/appointments/[id]` — fetch single appointment
- ✅ `POST /api/v1/appointments` — create appointment
- ✅ `PATCH /api/v1/appointments/[id]` — update appointment
- ✅ `POST /api/v1/appointments/[id]/cancel` — cancel appointment
- ⚠️ **Limitation:** Recurring appointment expansion may be slow over mobile (pre-compute or paginate)

### Patients (Staff)

- ✅ `GET /api/v1/patients` — list patients
- ✅ `GET /api/v1/patients/[id]` — fetch patient
- ✅ `POST /api/v1/patients` — create patient
- ✅ `PATCH /api/v1/patients/[id]` — update patient
- ⚠️ **Limitation:** Medical history is encrypted; client must use decrypted payload (no client-side decryption yet)

### Sessions (Staff)

- ✅ `GET /api/v1/sessions` — list sessions
- ✅ `POST /api/v1/sessions` — create session
- ✅ `PATCH /api/v1/sessions/[id]` — update session
- ⚠️ **Limitation:** Clinical notes are encrypted; payload contains ciphertext with `enc:v1:` prefix

### Charges (Staff)

- ✅ `GET /api/v1/charges` — list charges
- ✅ `POST /api/v1/charges` — create charge
- ✅ `PATCH /api/v1/charges/[id]` — update charge
- ✅ `POST /api/v1/charges/[id]/void` — void charge

### Patient Portal

- ✅ `GET /api/v1/portal/dashboard` — portal metrics (requires token)
- ✅ `GET /api/v1/portal/appointments` — patient's appointments
- ✅ `POST /api/v1/portal/appointments/[id]/cancel` — cancel own appointment
- ✅ `GET /api/v1/portal/journal` — patient's journal entries
- ✅ `POST /api/v1/portal/journal` — create journal entry
- ✅ `GET /api/v1/portal/charges` — patient's charges
- ✅ `GET /api/v1/portal/consents` — patient's consents
- ✅ `POST /api/v1/portal/consents` — accept consent

## What Works Today (Mobile-Compatible)

| Feature | Mobile Support | Notes |
|---------|---------------|----|
| Staff appointments | ✅ | Bearer token + NextAuth fallback |
| Patient portal | ✅ | Bearer token + cookie fallback |
| Real-time sync | ⚠️ | No WebSocket/SSE; polling required |
| File uploads | ❌ | No signed URLs yet; blocked |
| Push notifications | ❌ | No APNs/FCM integration |
| Offline sync | ❌ | No local queue / conflict resolution |

## What Still Needs Work

### High Priority

1. **Signed URLs for file uploads**
   - Patients need to upload documents (journal attachments, consent PDFs)
   - Staff need to upload session files
   - Solution: Generate presigned S3/R2 URLs in backend
   - Effort: 1-2 days
   - Files:
     - New endpoint: `POST /api/v1/files/signed-url` (staff)
     - New endpoint: `POST /api/v1/portal/files/signed-url` (patient)
     - Update: `src/lib/storage.ts` to export presigned URL helpers

2. **Push notifications (APNs + FCM)**
   - Appointment reminders
   - Chat/support messages (future)
   - Charge payment reminders
   - Solution: Abstract notification service + provider plugins
   - Effort: 3-5 days
   - Files:
     - New: `src/lib/push-notifications/index.ts` (abstraction)
     - New: `src/lib/push-notifications/apns.ts` (Apple)
     - New: `src/lib/push-notifications/fcm.ts` (Google)
     - Update: `/api/v1/cron/appointment-reminders` to emit push events

3. **Real-time sync (WebSocket or polling strategy)**
   - Appointments updated in real-time across multiple staff sessions
   - Journal entries visible to assigned therapist
   - Chat/messaging
   - Solution: Either Socket.io + Vercel compat, or recommend polling + ETags
   - Effort: 2-3 days (if polling); 5+ days (if WebSocket)
   - Recommendation: Start with polling + cache headers; upgrade to WebSocket later

### Medium Priority

4. **Offline-first local database**
   - Expo + React Query or WatermelonDB
   - Local conflict resolution for appointments
   - Effort: 2-3 days
   - Recommendation: After real-time sync is working

5. **Client-side encryption**
   - Decrypt clinical notes on mobile
   - Encrypt journal entries before upload
   - Solution: Expose encryption/decryption helpers or move to backend-only
   - Effort: 1-2 days
   - Recommendation: Keep backend-only for now; simpler security model

### Low Priority (Post-MVP)

6. **Video consultation integration**
   - Jitsi or Twilio embed
   - Effort: 2-3 days
   - Recommendation: Later, after core mobile features ship

## Recommended Stack

### Frontend (Mobile)

**React Native + Expo**

- ✅ `expo@^50` — battle-tested, SDK 50+ stable
- ✅ `react-native@^0.73` — good performance
- ✅ `react-navigation` — routing
- ✅ `@tanstack/react-query` — caching + refetch
- ✅ `zustand` — global state (simpler than Redux)
- ✅ `axios` or `fetch` — HTTP client (bearer token support built-in)

**Why Expo?**
- No native compilation step for development
- EAS Build for CI/CD (optional, but modern)
- Built-in support for push notifications (EAS Push or native integration)
- Pre-configured for Android/iOS security best practices

### Storage (Mobile)

**SQLite (built-in to Expo)**

- For offline-first later
- `expo-sqlite` — built-in, no native dependencies

**Encrypted preferences**
- `@react-native-community/hooks` — secure storage for tokens
- Never store tokens in plain SharedPreferences/UserDefaults

## Endpoint Inventory (Full List for Mobile)

### Auth
- `POST /api/v1/auth/mobile-token` ✅
- `POST /api/v1/portal/auth/mobile-token` ✅

### Staff Routes (require bearer OR NextAuth)
- `GET /api/v1/me` ✅
- `GET /api/v1/appointments` ✅
- `GET /api/v1/appointments/[id]` ✅
- `POST /api/v1/appointments` ✅
- `PATCH /api/v1/appointments/[id]` ✅
- `POST /api/v1/appointments/[id]/cancel` ✅
- `GET /api/v1/patients` ✅
- `GET /api/v1/patients/[id]` ✅
- `POST /api/v1/patients` ✅
- `PATCH /api/v1/patients/[id]` ✅
- `GET /api/v1/sessions` ✅
- `POST /api/v1/sessions` ✅
- `PATCH /api/v1/sessions/[id]` ✅
- `GET /api/v1/charges` ✅
- `POST /api/v1/charges` ✅
- `PATCH /api/v1/charges/[id]` ✅
- `POST /api/v1/charges/[id]/void` ✅

### Patient Portal Routes (require bearer OR portal session)
- `GET /api/v1/portal/dashboard` ✅
- `GET /api/v1/portal/appointments` ✅
- `POST /api/v1/portal/appointments/[id]/cancel` ✅
- `GET /api/v1/portal/journal` ✅
- `POST /api/v1/portal/journal` ✅
- `GET /api/v1/portal/charges` ✅
- `GET /api/v1/portal/consents` ✅
- `POST /api/v1/portal/consents` ✅
- `PATCH /api/v1/portal/profile` ✅

## Testing Mobile Endpoints

### Option 1: cURL with Bearer Token

```bash
# Get staff token (requires web session cookie)
curl -X POST http://localhost:3000/api/v1/auth/mobile-token \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json"

# Use token
curl -X GET http://localhost:3000/api/v1/appointments \
  -H "Authorization: Bearer eyJhbGc..."
```

### Option 2: Postman / REST Client

Set environment variable `token` from mobile token endpoint response, then:

```
Authorization: Bearer {{token}}
```

### Option 3: Expo Simulator + Mobile Client

Write minimal test app in Expo, point at localhost.

## Next Steps

1. **Enable feature flag** in production environment: `MOBILE_BEARER_ENABLED=true`
2. **Write Expo prototype** with one screen (appointments list)
3. **Implement signed URLs** for file uploads
4. **Add push notification provider** (APNs + FCM)
5. **Build real-time sync** strategy (polling vs WebSocket)

---

**Last updated:** 2026-04-09
**Status:** Bearer token foundation ready; clients blocked on file upload and push notifications
