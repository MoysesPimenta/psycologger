# Psycologger QA Audit Report

**Date:** April 4, 2026
**Auditor:** Claude (automated code-level audit)
**Scope:** Full codebase — 43 API routes, 38 client components, middleware, auth, security, Prisma schema

---

## Executive Summary

The audit found **1 production-breaking bug** (already fixed), **6 critical issues**, **8 high-severity issues**, and **~30 medium/low issues** across the codebase. The app's architecture is solid — strong RBAC, proper tenant isolation in most queries, encryption at rest, audit logging, and CSRF protection. The issues below are the gaps.

---

## FIXED — Login Page Blank (Production-Breaking)

**File:** `src/middleware.ts`
**Commit:** `5a9c92c`

The CSP header included a per-request nonce in `script-src`. Per CSP3 spec, when a nonce is present, `'unsafe-inline'` is ignored by modern browsers. Since Next.js 14 injects inline hydration scripts (`self.__next_f.push`) WITHOUT nonce attributes, those scripts were blocked — causing **every fresh page load to render blank**. The app appeared to work for logged-in users because client-side navigation doesn't need new inline scripts.

**Fix:** Removed the nonce and `'strict-dynamic'`, kept `'unsafe-inline'` which is the standard approach for Next.js apps.

---

## CRITICAL Issues

### 1. Missing Tenant Isolation in Journal Trends Query
**File:** `src/app/api/v1/journal-inbox/trends/route.ts` (lines 43-56)
**Impact:** A therapist could query mood/anxiety trends for any patient in the system by knowing their patient ID, bypassing the assignment check. The query filters by `patientId` and `therapistId` but doesn't verify the patient is assigned to that therapist.

### 2. Race Condition in Portal Session Activity Tracking
**File:** `src/lib/patient-auth.ts` (lines 195-198)
**Impact:** `lastActivityAt` is updated with `.catch(() => {})` fire-and-forget. If the DB update fails silently (connection issue, transient error), the idle timeout logic breaks — sessions won't expire when they should.

### 3. Key Rotation Decrypt Fallback Incomplete
**File:** `src/lib/crypto.ts` (lines 134-137)
**Impact:** When current-key decryption fails on a versioned payload, the code doesn't try the previous key with legacy format. Data encrypted with the old key before versioned format was introduced becomes unreadable after key rotation.

### 4. CSRF Not Applied to In-Component Charge Creation
**File:** `src/components/appointments/appointment-detail-client.tsx` (line ~1143)
**Impact:** POST to `/api/v1/charges` from the appointment detail page uses plain `fetch()` instead of `fetchWithCsrf()`. This means creating a charge from the appointment detail view will get a 403 CSRF error.

### 5. Portal Auth Components Missing fetchWithCsrf
**Files:** `portal-activate-client.tsx`, `portal-login-client.tsx`, `portal-magic-login-client.tsx`
**Note:** These POST to `/api/v1/portal/auth` which is **exempt from CSRF validation** in the middleware, so this is not currently breaking. However, if the exemption is ever removed, these will break. Should be fixed for consistency.

### 6. Int Overflow Risk on Financial Fields
**File:** `prisma/schema.prisma` (lines 376, 428, 661, 696)
**Impact:** `amountCents`, `defaultFeeOverrideCents`, `defaultPriceCents` are `Int` (32-bit signed, max ~R$21M). While the Zod validation caps at 100M cents (R$1M), the schema itself allows overflow at the DB level if data is inserted outside the API.

---

## HIGH Issues

### 7. Privilege Escalation on Charge Creation
**File:** `src/app/api/v1/charges/route.ts` (POST handler)
**Impact:** PSYCHOLOGIST role can see only their own charges (GET is filtered), but the POST endpoint doesn't validate that `providerUserId` matches the current user. A therapist could create charges assigned to other providers.

### 8. Missing patientId UUID Validation in Trends
**File:** `src/app/api/v1/journal-inbox/trends/route.ts` (lines 19-21)
**Impact:** `patientId` from query params is never validated as a UUID before being used in the Prisma query. Invalid input could cause unexpected behavior.

### 9. Missing Rate Limiting on Therapist Notes
**File:** `src/app/api/v1/journal-inbox/[id]/notes/route.ts`
**Impact:** Patient journal creation is rate-limited (30/hour), but therapist notes have no rate limit. A buggy client could create thousands of notes.

### 10. ASSISTANT Role Ignores Tenant-Level Clinical Notes Setting
**File:** `src/lib/rbac.ts` (lines 172-174)
**Impact:** TENANT_ADMIN respects both membership-level AND tenant-level `adminCanViewClinical` setting, but ASSISTANT only checks the membership-level override. Inconsistent behavior.

### 11. Missing Error States in Settings Components
**Files:** `clinic-settings-client.tsx`, `integrations-client.tsx`, `users-settings-client.tsx`, `reminders-client.tsx`
**Impact:** Data fetch failures are silently swallowed (console.warn only). Users see a blank or stale settings page with no error indication.

### 12. Orphaned Clinical Sessions on Appointment Delete
**File:** `prisma/schema.prisma` (line 568)
**Impact:** `ClinicalSession.appointmentId` has `onDelete: SetNull`. Soft-deleting an appointment leaves clinical sessions with null `appointmentId`, creating orphaned records.

### 13. Missing router.refresh() After Patient Creation
**File:** `src/components/patients/new-patient-client.tsx` (line 65)
**Impact:** After creating a patient and navigating to the patient list, the list may show stale data until the user manually refreshes.

### 14. Null Pointer Risk in Portal Dashboard
**File:** `src/app/api/v1/portal/dashboard/route.ts` (lines 91-98)
**Impact:** `nextAppointment?.startsAt` could be null. If an appointment exists but `startsAt` is null, calling `.getTime()` will throw a 500.

---

## MEDIUM Issues

### 15. Widespread `as any` Casting on Prisma Client
**Files:** Multiple (portal-invite, portal/auth, sessions/[id], etc.)
**Impact:** Loss of type safety. Schema changes could silently break queries without TypeScript catching them.

### 16. Missing Pagination Bounds in CSV Export
**File:** `src/app/api/v1/reports/route.ts` (lines 164-183)
**Impact:** Charge CSV export doesn't cap rows like other exports do, allowing unbounded memory usage.

### 17. Inconsistent Error Message Languages
**Files:** Multiple API routes
**Impact:** Some errors are in Portuguese ("Você não tem permissão"), others in English ("Not found"). Inconsistent UX.

### 18. SQL Injection Pattern Risk
**File:** `src/app/api/v1/journal-inbox/patients/route.ts` (lines 15-32)
**Impact:** Uses `$queryRaw` with template literals. While current values come from trusted context, the pattern is risky if ever refactored.

### 19. Missing Error Handling in Portal Privacy Component
**File:** `src/components/portal/portal-privacy-client.tsx` (line 49)
**Impact:** No error check after `fetchWithCsrf()` calls. Failures are silently ignored.

### 20. No Rate Limiting on Core CRUD Endpoints
**Files:** `appointments/route.ts`, `charges/route.ts`, `sessions/route.ts`
**Impact:** Authenticated users can create unlimited appointments, charges, or sessions. DoS vector.

---

## LOW Issues

- Invite token enumeration via different error codes for "invalid" vs "expired" tokens
- `CRON_SECRET` validation is length-based only (16 chars), no entropy check
- Missing CRON_SECRET returns 401 (auth error) instead of 500 (config error)
- Hardcoded substring truncation (100 chars) on dashboard note previews
- Unnecessary `as never` type assertions in sessions route
- `Suspense fallback={null}` on login page means no loading indicator while hydrating
- `portal-profile-client.tsx` logout uses plain `fetch()` instead of `fetchWithCsrf()` (exempt route, but inconsistent)

---

## Positive Findings

The audit also confirmed many things are done well:

- Strong RBAC with consistent `requirePermission()` checks across all routes
- Proper tenant isolation via `tenantId` scoping on virtually all queries
- Zod validation on all request bodies
- CSRF double-submit cookie pattern properly implemented and enforced
- AES-256-GCM encryption at rest for journal entries
- Audit logging on all sensitive operations
- Soft-delete patterns for data safety
- Secure PBKDF2 password hashing
- Rate limiting on sensitive endpoints (invites, magic links, signup)
- Portal idle timeout with session revocation

---

## Recommended Fix Priority

**P0 (fix now):**
1. ~~Login page blank~~ — DONE (commit `5a9c92c`)
2. Charge creation CSRF (#4) — quick fix, same pattern as the 23 components already fixed
3. Tenant isolation in trends (#1) — add patient assignment check
4. Privilege escalation on charges (#7) — validate providerUserId matches current user for PSYCHOLOGIST role

**P1 (fix this sprint):**
5. Key rotation decrypt fallback (#3)
6. Portal session activity tracking (#2)
7. Missing error states in settings (#11)
8. PatientId UUID validation (#8)
9. Rate limiting on notes (#9)

**P2 (backlog):**
10. All medium/low issues
11. Replace `as any` casts with proper Prisma typing
12. Standardize error message language
