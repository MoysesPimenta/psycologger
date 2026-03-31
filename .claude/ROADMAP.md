# Psycologger — Roadmap & Implementation Plan

**Last updated:** 2026-03-31
**Status:** Active development — Claude is the primary implementer

---

## Legend

- **P0** — Critical / Blocking (do immediately)
- **P1** — High priority (next sprint)
- **P2** — Medium priority (planned)
- **P3** — Nice to have (backlog)
- ✅ = Done | 🔨 = In progress | ⬜ = Not started

---

## PHASE 0 — Audit Fixes (COMPLETED 2026-03-31)

All items from the comprehensive audit have been fixed:

- ✅ **Tenant isolation breach** in sessions API (patient + appointment validation)
- ✅ **CSV injection** in reports and audit exports (csvSafe helper)
- ✅ **Race condition** in payments (balance check moved inside transaction)
- ✅ **Missing pages**: /sa/login, /sa/tenants, /sa/tenants/[id], /sa/users, /sa/impersonate, /terms, /privacy
- ✅ **Broken redirect**: /app → /app/today in session access denial
- ✅ **Cron timezone**: UTC date handling for payment reminders
- ✅ **Role label inconsistency**: SUPERADMIN + ASSISTANT aligned between email.ts and utils.ts
- ✅ **Dead code**: removed unused getServerSession import in invites API
- ✅ **Payment reminders**: on creation, 24h before due, overdue notifications
- ✅ **Patient edit page**: /app/patients/[id]/edit with full form

---

## PHASE 1 — Core Functionality Gaps (P0-P1)

### 1.1 Appointment Reminder Cron ⬜ P0

**Why:** Appointment reminders (CONFIRMATION, REMINDER_24H, REMINDER_1H) exist as email functions and templates, but there's NO cron job to actually send them. They're only triggered manually on appointment creation.

**Files to create/modify:**
- `src/app/api/v1/cron/appointment-reminders/route.ts` — new cron route
- `vercel.json` — add cron schedule (every 15 min for 1H, daily for 24H)

**Implementation:**
1. Query appointments 24h from now where no REMINDER_24H log exists
2. Query appointments 1h from now where no REMINDER_1H log exists
3. Send emails using existing `sendAppointmentReminder()`
4. Log to ReminderLog table
5. Add `@@index([tenantId, status, sentAt])` to ReminderLog for performance

---

### 1.2 Google Calendar Sync ⬜ P1

**Why:** Model exists (GoogleCalendarToken), integration settings UI exists, but sync is not wired up.

**Files to create/modify:**
- `src/lib/google-calendar.ts` — OAuth flow, event CRUD
- `src/app/api/v1/integrations/google-calendar/route.ts` — OAuth callback
- `src/app/api/v1/cron/google-calendar-sync/route.ts` — periodic 2-way sync
- Modify `src/app/api/v1/appointments/route.ts` — sync on create/update/delete

**Implementation:**
1. OAuth2 flow (consent screen → token exchange → store encrypted)
2. On appointment create/update → push to Google Calendar
3. Cron job every 10 min to pull new GCal events
4. Handle conflicts (GCal event modified vs. Psycologger modified)
5. Store `googleCalendarEventId` on Appointment

---

### 1.3 File Upload & Download ⬜ P1

**Why:** FileObject model exists, UI shows files tab, but actual upload/download is not functional.

**Files to create/modify:**
- `src/app/api/v1/patients/[id]/files/route.ts` — POST upload (exists partially)
- `src/app/api/v1/patients/[id]/files/[fileId]/download/route.ts` — GET signed URL
- `src/lib/storage.ts` — already has Supabase config, need upload/download helpers
- Modify `src/components/patients/patient-detail-client.tsx` — wire up upload form + download button

**Implementation:**
1. POST multipart form → stream to Supabase Storage
2. GET download → generate signed URL, redirect
3. File size limit (10MB default)
4. MIME type validation
5. Clinical vs. non-clinical file access based on RBAC

---

### 1.4 SuperAdmin Impersonation ⬜ P1

**Why:** Page exists as placeholder. Essential for support/debugging.

**Files to create/modify:**
- `src/app/sa/impersonate/page.tsx` — replace placeholder with functional UI
- `src/app/api/v1/sa/impersonate/route.ts` — generate impersonation session
- `src/middleware.ts` — detect impersonation header, inject into context
- `src/lib/tenant.ts` — respect impersonation override

**Implementation:**
1. SA selects user email → backend creates a short-lived token
2. Token sets a cookie `psycologger-impersonate` with target userId
3. Middleware detects cookie, overrides session user
4. All actions during impersonation logged with `impersonatedBy` field
5. Banner shown in app UI during impersonation
6. Auto-expire after 1 hour

---

## PHASE 2 — Feature Completeness (P1-P2)

### 2.1 Recurring Appointments ⬜ P1

**Why:** Recurrence model exists but UI doesn't support creating/managing them.

**Files to modify:**
- `src/components/appointments/new-appointment-client.tsx` — add recurrence UI (already has some state for this)
- `src/app/api/v1/appointments/route.ts` — bulk create from RRULE
- `src/app/api/v1/appointments/[id]/route.ts` — handle "edit this one" vs "edit all"

**Implementation:**
1. UI: weekly/biweekly/monthly selector, end date/count
2. Generate RRULE string (RFC 5545)
3. On create: generate N appointment instances sharing recurrenceId
4. On edit: modal asking "this one", "this and future", "all"
5. On cancel: same cascade options

---

### 2.2 Dashboard Analytics ⬜ P1

**Why:** /app/today shows appointments but no business metrics. Reports page has data but no visualizations.

**Files to create/modify:**
- `src/components/reports/reports-client.tsx` — add charts (recharts)
- Consider new `src/app/app/dashboard/page.tsx` — or enhance /app/today

**Implementation:**
1. Monthly revenue line chart (last 6 months)
2. Appointment status pie chart
3. Top patients by revenue
4. Payment method breakdown bar chart
5. Provider comparison table
6. Use recharts (already available as dependency)

---

### 2.3 Notifications Center ⬜ P2

**Why:** Users have no way to see system notifications in-app.

**Files to create:**
- `prisma/schema.prisma` — Notification model
- `src/app/api/v1/notifications/route.ts` — GET/PATCH (mark read)
- `src/components/shell/notifications-bell.tsx` — bell icon in sidebar
- `src/components/shell/notifications-panel.tsx` — dropdown panel

**Implementation:**
1. Notification model: type, title, body, link, read, createdAt
2. Auto-create on: new appointment, payment received, charge overdue
3. Bell icon with unread count badge
4. Panel with list, mark-as-read, mark-all-read
5. Polling every 60s or use Server-Sent Events

---

### 2.4 Patient Portal ⬜ P2

**Why:** Patients currently have no self-service access.

**Files to create:**
- `src/app/portal/` — entire new section
- `src/app/api/v1/portal/` — patient-facing APIs
- `prisma/schema.prisma` — PatientAccessToken model

**Implementation:**
1. Magic link sent to patient email
2. View upcoming appointments
3. View and pay pending charges (PIX QR code)
4. Download receipts
5. Update contact info
6. Isolated from main app (no clinical data access)

---

### 2.5 NFSe Integration ⬜ P2

**Why:** Model exists (NfseInvoice, IntegrationCredential) but no actual integration.

**Files to create:**
- `src/lib/nfse.ts` — provider adapter (eNotas/Focus NFe)
- `src/app/api/v1/nfse/route.ts` — issue/cancel invoices
- UI in financial section to trigger invoice generation

**Implementation:**
1. Configure provider credentials (encrypted)
2. Auto-generate NFSe on payment confirmation
3. Store PDF/XML URLs
4. Handle errors and retries
5. Display status in charges list

---

## PHASE 3 — Polish & Scale (P2-P3)

### 3.1 Waitlist & Availability ⬜ P2

- Patient waitlist for cancellation slots
- Provider availability management (block hours, vacations)
- Auto-suggest slots when scheduling

### 3.2 SMS/WhatsApp Reminders ⬜ P2

- Integration with Twilio or WhatsApp Business API
- Template-based messaging (already in ReminderTemplate)
- Patient opt-in/out preferences

### 3.3 Multi-language Support ⬜ P3

- i18n framework (next-intl)
- Extract all Portuguese strings
- Add English, Spanish translations

### 3.4 Advanced Reports ⬜ P3

- Custom date range reports
- Comparison period (this month vs. last month)
- Export to PDF
- Scheduled email reports (weekly/monthly digest)

### 3.5 Mobile App / PWA ⬜ P3

- PWA manifest + service worker
- Responsive improvements for small screens
- Push notifications

### 3.6 Teletherapy Integration ⬜ P3

- Built-in video calling (Daily.co or similar)
- Auto-generate video link on online appointment
- In-session notes panel

---

## PHASE 4 — Enterprise (P3)

### 4.1 Multi-clinic Management ⬜

- Users belonging to multiple tenants with role per tenant
- Tenant switcher in sidebar
- Cross-tenant reports for franchise owners

### 4.2 API Rate Limiting & Throttling ⬜

- Per-tenant, per-user rate limits
- Redis-backed sliding window
- Graceful 429 responses

### 4.3 Webhook System ⬜

- Outbound webhooks for: appointment created, payment received, etc.
- Webhook management UI
- Retry with exponential backoff
- Signature verification

### 4.4 Data Export & Portability ⬜

- Full tenant data export (LGPD compliance)
- Structured JSON/CSV bundle
- Patient-specific data export for portability requests

---

## Remaining Audit Items (Non-blocking, P2-P3)

These were identified during the audit but are improvements, not bugs:

- ⬜ Add proper TypeScript interfaces to patient-detail-client.tsx (remove `any` types)
- ⬜ Replace 19 instances of manual currency formatting with `formatCurrency()` utility
- ⬜ Add `aria-label` to all icon-only buttons across components
- ⬜ Add error feedback to silent catches in patient-detail-client.tsx
- ⬜ Add NfseInvoice → Patient relation in Prisma schema
- ⬜ Add Recurrence → User and Tenant relations in Prisma schema
- ⬜ Add SessionRevision → User relation for editedById
- ⬜ Add ReminderLog → Tenant relation
- ⬜ Add .env.example file documenting all required environment variables
- ⬜ Add `@@index([tenantId, status, sentAt])` to ReminderLog
- ⬜ Validate appointment status parameter via Zod in appointments GET

---

## Implementation Notes for Claude

### When implementing any item above:

1. Read `.claude/CONTEXT.md` first — it's the single source of truth
2. Follow existing patterns (server component + client component split)
3. Use `as never` for Prisma enum casts (stale client in dev, regenerated on deploy)
4. Use `(db as any)` for new models until Prisma client is regenerated
5. Always add tenant isolation (`tenantId: ctx.tenantId`)
6. Always add RBAC check (`requirePermission(ctx, ...)`)
7. Always add audit logging for mutations
8. Always update `.claude/CONTEXT.md` after changes
9. Always commit with descriptive message
10. Test with `npx tsc --noEmit` before committing

### Environment variables needed for new features:

- `CRON_SECRET` — for cron endpoint authentication
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for Calendar sync
- `TWILIO_SID` / `TWILIO_AUTH_TOKEN` — for SMS/WhatsApp
- `NFSE_PROVIDER_API_KEY` — for NFSe integration
