# Psycologger API Documentation

## Overview

Psycologger is a clinical practice management system with a comprehensive REST API for managing patients, appointments, clinical sessions, financial operations, and administrative functions.

**Base URL:** `https://api.psycologger.com/api/v1`

**API Version:** v1

**Environment:** Production & Development

---

## Authentication

Psycologger uses **NextAuth.js magic link authentication** via session cookies. All API requests must include valid authentication.

### Magic Link Flow

1. User requests a sign-in link via email
2. NextAuth generates a secure token and sends it via email
3. User clicks the link, which creates/updates their session
4. Subsequent API requests automatically include the session cookie in the `Cookie` header

### Session Management

- Authentication is cookie-based (NextAuth session)
- All API routes check for a valid session via `getAuthContext(req)`
- Invalid or missing sessions return `401 UNAUTHORIZED`
- Super Admin impersonation is available via `sa:impersonate` permission

### Multi-Tenant Architecture

- Each request is scoped to the authenticated user's tenant
- Psychologists see only their assigned patients (unless `sharedPatientPool` is enabled)
- Admin and Super Admin roles may access across their scope
- All responses are automatically filtered by tenant ID

---

## Response Format

### Success Response (2xx)

```json
{
  "data": { /* resource or array of resources */ },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "hasMore": true
  }
}
```

- **data:** The requested resource(s). Arrays use pagination.
- **meta:** Pagination metadata (present for list endpoints).

### Error Response (4xx / 5xx)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { /* Zod flatten output */ }
  }
}
```

### Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid session |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 400 | Request body validation failed |
| `BAD_REQUEST` | 400 | Logic validation failed (e.g., discount > amount) |
| `CONFLICT` | 409 | Operation conflicts (e.g., appointment time slot occupied) |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Pagination

List endpoints support cursor-based pagination via query parameters:

- **page:** Page number (default: 1)
- **pageSize:** Items per page, max 100 (default: 20)

Example: `GET /api/v1/patients?page=2&pageSize=50`

Responses include:
- `meta.page`: Current page number
- `meta.pageSize`: Items returned
- `meta.total`: Total count of all resources
- `meta.hasMore`: Whether more pages exist

---

## Rate Limiting

- **Onboarding (signup):** 5 requests per IP per hour
- Other endpoints: Currently unlimited in-memory; production uses Upstash

Rate limit responses:
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Muitas tentativas. Tente novamente em 1 hora.",
    "details": null
  }
}
```

---

## Permissions & Roles

Psycologger uses Role-Based Access Control (RBAC):

| Role | Scope | Key Capabilities |
|------|-------|------------------|
| **SUPERADMIN** | Global | Manage all tenants, impersonate users, view audit logs across system |
| **TENANT_ADMIN** | Organization | Manage members, configure settings, view all patients (unless restricted) |
| **PSYCHOLOGIST** | Personal | Create sessions/appointments, manage assigned patients, view own charges |
| **ASSISTANT** | Patient support | Manage appointments, view patients, handle administrative tasks; no clinical access |
| **READONLY** | Observer | View patients, appointments, charges, reports (no write) |

Special permission overrides via membership:
- `canViewAllPatients`: Override tenant's `sharedPatientPool` setting
- `canViewClinicalNotes`: Allow TENANT_ADMIN or ASSISTANT to access clinical sessions
- `canManageFinancials`: Future financial workflow control

---

## Domain: Patients

### List Patients

```http
GET /api/v1/patients
```

**Permission:** `patients:list`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Per-page count (max 100, default: 20) |
| `q` | string | Search by full name, preferred name, email, or phone |
| `tag` | string | Filter by tag (exact match, case-sensitive) |
| `active` | "true"\|"false"\|"all" | Filter active status (default: "true") |

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "fullName": "João Silva",
      "preferredName": "João",
      "email": "joao@example.com",
      "phone": "+55 11 98765-4321",
      "dob": "1990-01-15T00:00:00Z",
      "notes": "Referral from Dr. Silva",
      "tags": ["depression", "anxiety"],
      "isActive": true,
      "consentGiven": true,
      "consentGivenAt": "2026-01-01T10:00:00Z",
      "assignedUserId": "provider-uuid",
      "assignedUser": {
        "id": "provider-uuid",
        "name": "Dr. Ana Costa"
      },
      "defaultAppointmentTypeId": "type-uuid",
      "defaultFeeOverrideCents": 15000,
      "createdAt": "2026-01-01T10:00:00Z",
      "updatedAt": "2026-01-01T10:00:00Z",
      "archivedAt": null,
      "archivedBy": null,
      "_count": {
        "appointments": 5,
        "charges": 3
      }
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "hasMore": true
  }
}
```

**Notes:**
- PSYCHOLOGIST and ASSISTANT roles only see assigned patients (unless `sharedPatientPool` enabled)
- Active filter: `?active=true` excludes archived; `?active=all` includes both

---

### Create Patient

```http
POST /api/v1/patients
```

**Permission:** `patients:create`

**Request Body:**

```json
{
  "fullName": "Maria da Silva",
  "preferredName": "Maria",
  "email": "maria@example.com",
  "phone": "+55 11 99876-5432",
  "dob": "1985-06-20",
  "notes": "New patient referral",
  "tags": ["bipolar", "insomnia"],
  "assignedUserId": "provider-uuid",
  "defaultAppointmentTypeId": "type-uuid",
  "defaultFeeOverrideCents": 20000
}
```

**Field Rules:**
- `fullName`: 2–100 chars (required)
- `preferredName`: 0–50 chars (optional)
- `email`: Valid email format (optional, empty string = null)
- `phone`: 0–20 chars (optional)
- `dob`: ISO date string "YYYY-MM-DD" (optional)
- `notes`: 0–500 chars (optional)
- `tags`: Array of strings (optional, default: [])
- `assignedUserId`: UUID of provider; defaults to current user if not provided (optional)
- `defaultFeeOverrideCents`: Non-negative integer, max R$1,000,000 (optional)

**Response:** `201 Created`

```json
{
  "data": {
    "id": "new-uuid",
    "fullName": "Maria da Silva",
    "preferredName": "Maria",
    "email": "maria@example.com",
    "phone": "+55 11 99876-5432",
    "dob": "1985-06-20T00:00:00Z",
    "notes": "New patient referral",
    "tags": ["bipolar", "insomnia"],
    "isActive": true,
    "consentGiven": false,
    "consentGivenAt": null,
    "assignedUserId": "provider-uuid",
    "defaultAppointmentTypeId": "type-uuid",
    "defaultFeeOverrideCents": 20000,
    "createdAt": "2026-03-30T12:00:00Z",
    "updatedAt": "2026-03-30T12:00:00Z",
    "archivedAt": null,
    "archivedBy": null
  }
}
```

---

### Get Patient

```http
GET /api/v1/patients/:id
```

**Permission:** `patients:list`

**Response:** `200 OK`

Returns full patient record including `contacts` array.

---

### Update Patient

```http
PATCH /api/v1/patients/:id
```

**Permission:** `patients:edit`

**Request Body (all optional):**

```json
{
  "fullName": "Maria Silva",
  "preferredName": "Mari",
  "email": "mari@example.com",
  "phone": "+55 11 99999-9999",
  "dob": "1985-06-20",
  "notes": "Updated notes",
  "tags": ["anxiety"],
  "assignedUserId": "new-provider-uuid",
  "consentGiven": true,
  "isActive": true,
  "defaultAppointmentTypeId": "type-uuid",
  "defaultFeeOverrideCents": 18000
}
```

**Special Behavior:**
- Setting `isActive: false` archives the patient (sets `archivedAt`, `archivedBy`)
- Setting `consentGiven: true` updates `consentGivenAt` to now
- Email and phone can be set to `null`

**Response:** `200 OK` (returns updated patient)

---

### Archive Patient

```http
DELETE /api/v1/patients/:id
```

**Permission:** `patients:archive`

**Behavior:** Soft-deletes the patient (sets `isActive: false`, records archival metadata)

**Response:** `204 No Content`

---

### Restore/Manage Patient Files

**File Soft-Delete:**
```http
DELETE /api/v1/patients/:id/files/:fileId
```

**Permission:** `files:delete`

Marks a file as deleted; hard deletion scheduled 30 days later.

**File Restore:**
```http
PATCH /api/v1/patients/:id/files/:fileId
```

**Permission:** `files:delete`

Restores a soft-deleted file.

---

## Domain: Appointments

### List Appointments

```http
GET /api/v1/appointments
```

**Permission:** `appointments:view`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `from` | ISO datetime | Start of range; filters on `startsAt` |
| `to` | ISO datetime | End of range; filters on `startsAt` |
| `providerId` | UUID | Provider user ID (defaults to current user) |
| `patientId` | UUID | Filter by patient |
| `status` | enum | `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELED`, `NO_SHOW`, `ALL` (default excludes CANCELED) |
| `page` | number | Pagination (default: 1) |
| `pageSize` | number | Per page (default: 20, max: 100) |

**Response:**

```json
{
  "data": [
    {
      "id": "appt-uuid",
      "patientId": "patient-uuid",
      "providerUserId": "provider-uuid",
      "appointmentTypeId": "type-uuid",
      "startsAt": "2026-04-15T14:00:00Z",
      "endsAt": "2026-04-15T14:50:00Z",
      "location": "Consultório A",
      "videoLink": "https://meet.google.com/xyz",
      "status": "CONFIRMED",
      "adminNotes": "Patient mentioned recent stress",
      "recurrenceId": null,
      "clinicalSessionId": null,
      "createdAt": "2026-03-30T10:00:00Z",
      "updatedAt": "2026-03-30T10:00:00Z",
      "patient": {
        "id": "patient-uuid",
        "fullName": "Maria Silva",
        "preferredName": "Mari"
      },
      "provider": {
        "id": "provider-uuid",
        "name": "Dr. Ana Costa"
      },
      "appointmentType": {
        "id": "type-uuid",
        "name": "Regular Session",
        "color": "#3b82f6",
        "defaultDurationMin": 50
      },
      "clinicalSession": null,
      "charges": [
        {
          "id": "charge-uuid",
          "status": "PENDING",
          "amountCents": 15000
        }
      ],
      "reminderLogs": []
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 45, "hasMore": false }
}
```

**Notes:**
- Appointments are ordered by `startsAt` ascending
- Default excludes `CANCELED` status; pass `status=ALL` to include
- Conflict detection prevents overlapping appointments for the same provider

---

### Create Appointment (Single or Recurring)

```http
POST /api/v1/appointments
```

**Permission:** `appointments:create`

**Request Body:**

```json
{
  "patientId": "patient-uuid",
  "providerUserId": "provider-uuid",
  "appointmentTypeId": "type-uuid",
  "startsAt": "2026-04-15T14:00:00Z",
  "endsAt": "2026-04-15T14:50:00Z",
  "location": "Consultório A",
  "videoLink": "https://meet.google.com/xyz",
  "adminNotes": "Follow-up session",
  "notifyPatient": true,
  "notifyMethods": ["EMAIL"],
  "recurrenceRrule": "FREQ=WEEKLY;INTERVAL=1",
  "recurrenceOccurrences": 4,
  "recurrenceTime": "14:00"
}
```

**Field Rules:**
- `patientId`: UUID (required)
- `providerUserId`: UUID (required)
- `appointmentTypeId`: UUID (required)
- `startsAt`, `endsAt`: ISO datetime (required)
- `location`: 0–200 chars (optional)
- `videoLink`: Valid URL or empty string (optional)
- `adminNotes`: 0–1000 chars (optional)
- `notifyPatient`: Boolean (optional)
- `notifyMethods`: Array of ["EMAIL", "WHATSAPP", "SMS"] (optional)
- `recurrenceRrule`: RFC 5545 rule like "FREQ=WEEKLY;INTERVAL=1" (optional)
- `recurrenceOccurrences`: 1–104 (optional; required if recurrenceRrule set)
- `recurrenceTime`: "HH:mm" time override for recurring slots (optional)

**Conflict Detection:**
- If any slot conflicts with existing non-canceled appointments, creation fails with status 409

**Recurring Behavior:**
- If `recurrenceRrule` and `recurrenceOccurrences > 1`:
  - Creates one `Recurrence` record
  - Creates N `Appointment` records linked to that recurrence
  - Soft-skips conflicting slots (doesn't abort entire transaction)
- Returns first appointment created + `totalCreated` count

**Response:** `201 Created`

```json
{
  "data": {
    "id": "appt-uuid",
    "patientId": "patient-uuid",
    "providerUserId": "provider-uuid",
    "appointmentTypeId": "type-uuid",
    "startsAt": "2026-04-15T14:00:00Z",
    "endsAt": "2026-04-15T14:50:00Z",
    "location": "Consultório A",
    "videoLink": "https://meet.google.com/xyz",
    "status": "SCHEDULED",
    "adminNotes": "Follow-up session",
    "recurrenceId": "recurrence-uuid",
    "totalCreated": 4
  }
}
```

**Email Notification:**
- If `notifyPatient: true` and `notifyMethods` includes "EMAIL":
  - Sends appointment confirmation to patient's email (non-blocking if fails)
  - Errors logged but don't fail the appointment creation

---

### Get Appointment

```http
GET /api/v1/appointments/:id
```

**Permission:** `appointments:view`

**Response:** `200 OK`

Includes full patient, provider, appointment type, linked clinical session (if exists), charges with payments, and recent reminder logs (last 5).

---

### Update Appointment

```http
PATCH /api/v1/appointments/:id
```

**Permission:** `appointments:edit`

**Request Body (all optional):**

```json
{
  "status": "COMPLETED",
  "startsAt": "2026-04-15T15:00:00Z",
  "endsAt": "2026-04-15T15:50:00Z",
  "location": "Consultório B",
  "videoLink": "https://meet.google.com/abc",
  "adminNotes": "Patient seemed better",
  "appointmentTypeId": "new-type-uuid",
  "cancelScope": "THIS_AND_FUTURE"
}
```

**Field Rules:**
- `status`: "SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW" (optional)
- `startsAt`, `endsAt`: ISO datetime (optional)
- `cancelScope`: "THIS" (default) or "THIS_AND_FUTURE" (used with status: "CANCELED")
- `videoLink`: URL or empty string (null it) (optional)

**Rescheduling:**
- If `startsAt` or `endsAt` changes:
  - Checks for conflicts with other provider appointments
  - Fails with 409 if conflict found

**Recurring Cancellation:**
- If `status: "CANCELED"` + `cancelScope: "THIS_AND_FUTURE"` + appointment is recurring:
  - Cancels this appointment + all future occurrences in the series
  - Default `cancelScope` is "THIS" (current appointment only)

**Linking to Session:**
- Creating a clinical session with `appointmentId` auto-sets appointment status to "COMPLETED"

**Response:** `200 OK` (returns updated appointment)

---

## Domain: Appointment Types

### List Appointment Types

```http
GET /api/v1/appointment-types
```

**Permission:** `tenant:view`

**Response:**

```json
{
  "data": [
    {
      "id": "type-uuid",
      "tenantId": "tenant-uuid",
      "name": "Regular Session",
      "sessionType": "IN_PERSON",
      "defaultDurationMin": 50,
      "defaultPriceCents": 15000,
      "color": "#3b82f6",
      "isActive": true,
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ]
}
```

**Ordering:** Active types first, then by name ascending.

---

### Create Appointment Type

```http
POST /api/v1/appointment-types
```

**Permission:** `tenant:edit`

**Request Body:**

```json
{
  "name": "Intensive Session",
  "sessionType": "IN_PERSON",
  "defaultDurationMin": 90,
  "defaultPriceCents": 25000,
  "color": "#ef4444"
}
```

**Field Rules:**
- `name`: 1–100 chars (required)
- `sessionType`: "IN_PERSON" | "ONLINE" | "EVALUATION" | "GROUP" (default: "IN_PERSON")
- `defaultDurationMin`: 5–480 (default: 50)
- `defaultPriceCents`: 0–unlimited (default: 0)
- `color`: 6-digit hex code, e.g., "#3b82f6" (default: "#3b82f6")

**Response:** `201 Created`

---

### Update Appointment Type

```http
PATCH /api/v1/appointment-types/:id
```

**Permission:** `tenant:edit`

**Request Body:** Same fields as create (all optional)

**Response:** `200 OK`

---

### Delete Appointment Type

```http
DELETE /api/v1/appointment-types/:id
```

**Permission:** `tenant:edit`

**Behavior:** Soft-delete (sets `isActive: false`). Existing appointments still reference the type.

**Response:** `200 OK` with `{ deleted: true }`

---

## Domain: Clinical Sessions

### List Sessions

```http
GET /api/v1/sessions
```

**Permission:** `sessions:view`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `patientId` | UUID | Filter by patient |
| `page` | number | Pagination (default: 1) |
| `pageSize` | number | Per page (default: 20, max: 100) |

**Response:**

```json
{
  "data": [
    {
      "id": "session-uuid",
      "patientId": "patient-uuid",
      "providerUserId": "provider-uuid",
      "appointmentId": null,
      "templateKey": "SOAP",
      "tags": ["follow-up", "progress"],
      "sessionDate": "2026-04-15T14:00:00Z",
      "createdAt": "2026-04-15T15:00:00Z",
      "updatedAt": "2026-04-15T15:00:00Z",
      "patient": {
        "id": "patient-uuid",
        "fullName": "Maria Silva"
      },
      "provider": {
        "id": "provider-uuid",
        "name": "Dr. Ana Costa"
      }
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 8, "hasMore": false }
}
```

**Notes:**
- Note text excluded from list for performance
- PSYCHOLOGIST scope: returns only own sessions (unless assigned patient viewing is all)
- Ordered by `sessionDate` descending

---

### Create Session

```http
POST /api/v1/sessions
```

**Permission:** `sessions:create`

**Request Body:**

```json
{
  "patientId": "patient-uuid",
  "appointmentId": "appt-uuid",
  "templateKey": "SOAP",
  "noteText": "Patient reported improved sleep patterns...",
  "tags": ["follow-up", "progress"],
  "sessionDate": "2026-04-15T14:00:00Z"
}
```

**Field Rules:**
- `patientId`: UUID (required)
- `appointmentId`: UUID (optional)
- `templateKey`: "FREE" | "SOAP" | "BIRP" (default: "FREE")
- `noteText`: 1–50,000 chars (required)
- `tags`: Array of strings (optional, default: [])
- `sessionDate`: ISO datetime (required)

**Behavior:**
- Creates a `ClinicalSession` record
- Automatically stores initial revision in `SessionRevision`
- If `appointmentId` provided:
  - Links appointment to session
  - Auto-updates appointment status to "COMPLETED"
- `providerUserId` set to current authenticated user

**Response:** `201 Created`

```json
{
  "data": {
    "id": "new-session-uuid",
    "patientId": "patient-uuid",
    "providerUserId": "provider-uuid",
    "appointmentId": "appt-uuid",
    "templateKey": "SOAP",
    "noteText": "...",
    "tags": ["follow-up", "progress"],
    "sessionDate": "2026-04-15T14:00:00Z",
    "createdAt": "2026-04-15T15:00:00Z",
    "updatedAt": "2026-04-15T15:00:00Z"
  }
}
```

---

### Get Session

```http
GET /api/v1/sessions/:id
```

**Permission:** `sessions:view`

**Response:** `200 OK`

Includes:
- Full session with note text
- Patient and provider details
- Linked appointment (if exists)
- Last 10 revisions
- Attached files

---

### Update Session

```http
PATCH /api/v1/sessions/:id
```

**Permission:** `sessions:edit`

**Request Body (all optional):**

```json
{
  "noteText": "Updated clinical notes...",
  "templateKey": "BIRP",
  "tags": ["follow-up"],
  "restore": false
}
```

**Behavior:**
- If `noteText` changes:
  - Automatically creates a new `SessionRevision` record
  - Tracks editor and timestamp
- If `restore: true`:
  - Un-soft-deletes a session (clears `deletedAt`, `deletedBy`)

**Response:** `200 OK`

---

### Delete Session

```http
DELETE /api/v1/sessions/:id
```

**Permission:** `sessions:edit`

**Behavior:** Soft-delete (sets `deletedAt`, `deletedBy`). Hard-deleted by cleanup job after 30 days.

**Response:** `204 No Content`

---

### Upload File to Session

```http
POST /api/v1/sessions/:id/files
```

**Permission:** `files:uploadClinical`

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file`: File object

**Constraints:**
- Max size: 25 MB
- Allowed MIME types: PDF, JPEG, PNG, WebP, GIF, HEIC, DOCX, DOC

**Response:** `201 Created`

```json
{
  "data": {
    "id": "file-uuid",
    "fileName": "patient-assessment.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 245000,
    "storageKey": "tenant-uuid/session-uuid/uuid-patient-assessment.pdf",
    "createdAt": "2026-04-15T15:00:00Z",
    "uploader": {
      "id": "user-uuid",
      "name": "Dr. Ana Costa"
    },
    "downloadUrl": "https://storage.supabase.co/..."
  }
}
```

**Storage:** Files stored in Supabase Storage with signed download URLs (1 hour expiry).

---

### List Session Files

```http
GET /api/v1/sessions/:id/files
```

**Permission:** `sessions:view`

**Response:** `200 OK`

Returns array of file objects with fresh signed download URLs.

---

### Get File Download URL

```http
GET /api/v1/sessions/:id/files/:fileId
```

**Permission:** `files:downloadClinical`

**Response:** Returns file metadata with refreshed signed download URL.

---

### Delete Session File

```http
DELETE /api/v1/sessions/:id/files/:fileId
```

**Permission:** `files:delete`

**Behavior:** Hard-deletes from DB and Supabase Storage (non-blocking if storage delete fails).

**Response:** `200 OK` with `{ deleted: true }`

---

## Domain: Financial (Charges & Payments)

### List Charges

```http
GET /api/v1/charges
```

**Permission:** `charges:view`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `status` | enum | "PENDING", "PAID", "OVERDUE", "VOID", "REFUNDED" |
| `patientId` | UUID | Filter by patient |
| `from` | ISO date | Due date range start (YYYY-MM-DD) |
| `to` | ISO date | Due date range end (YYYY-MM-DD) |
| `page` | number | Pagination (default: 1) |
| `pageSize` | number | Per page (default: 20, max: 100) |

**Special Filter Behavior:**
- `status=OVERDUE`:
  - Returns charges with status "OVERDUE"
  - Also includes status "PENDING" with `dueDate < today` (accounts for cron job lag)
  - This ensures UI shows all past-due charges even before automatic status flip

**PSYCHOLOGIST Scope:**
- Only sees charges for appointments/sessions they provide

**Response:**

```json
{
  "data": [
    {
      "id": "charge-uuid",
      "tenantId": "tenant-uuid",
      "patientId": "patient-uuid",
      "appointmentId": null,
      "sessionId": null,
      "providerUserId": "provider-uuid",
      "amountCents": 15000,
      "discountCents": 0,
      "paidAmountCents": 0,
      "currency": "BRL",
      "description": null,
      "notes": "Patient requested installment",
      "dueDate": "2026-05-15T00:00:00Z",
      "status": "PENDING",
      "createdAt": "2026-04-15T10:00:00Z",
      "updatedAt": "2026-04-15T10:00:00Z",
      "patient": {
        "id": "patient-uuid",
        "fullName": "Maria Silva"
      },
      "provider": {
        "id": "provider-uuid",
        "name": "Dr. Ana Costa"
      },
      "payments": [
        {
          "id": "payment-uuid",
          "amountCents": 5000,
          "method": "PIX",
          "paidAt": "2026-04-20T10:00:00Z"
        }
      ]
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 12, "hasMore": false }
}
```

**Computed Fields:**
- `paidAmountCents`: Sum of all linked payments

---

### Create Charge

```http
POST /api/v1/charges
```

**Permission:** `charges:create`

**Request Body:**

```json
{
  "patientId": "patient-uuid",
  "appointmentId": "appt-uuid",
  "sessionId": null,
  "amountCents": 15000,
  "discountCents": 0,
  "currency": "BRL",
  "dueDate": "2026-05-15",
  "description": "Regular session",
  "notes": "Patient on monthly plan"
}
```

**Field Rules:**
- `patientId`: UUID (required)
- `appointmentId`, `sessionId`: UUID (both optional)
- `amountCents`: Positive integer, max R$1,000,000 (required)
- `discountCents`: 0–R$1,000,000 (default: 0)
- `currency`: 3-letter code (default: "BRL")
- `dueDate`: ISO date "YYYY-MM-DD" (required)
- `description`: 0–200 chars (optional)
- `notes`: 0–500 chars (optional)

**Initial Status:** "PENDING"

**Response:** `201 Created`

---

### Update Charge

```http
PATCH /api/v1/charges/:id
```

**Permission:** `charges:edit`

**Request Body (all optional):**

```json
{
  "amountCents": 16000,
  "discountCents": 1000,
  "description": "Adjusted fee",
  "dueDate": "2026-05-20",
  "status": "PAID"
}
```

**Field Rules:**
- `status`: Only "PAID" accepted; other status changes are automatic (cron for OVERDUE)
- Discount cannot exceed amount (validation error if violated)
- Can only mark PAID if charge has recorded payments

**Response:** `200 OK`

---

### Delete Charge

```http
DELETE /api/v1/charges/:id
```

**Permission:** `charges:void`

**Constraints:**
- Only deletable if status is "PENDING" and NO payments exist
- If payments exist, operation fails with 400 error

**Response:** `204 No Content`

---

### Create Payment

```http
POST /api/v1/payments
```

**Permission:** `payments:create`

**Request Body:**

```json
{
  "chargeId": "charge-uuid",
  "amountCents": 5000,
  "method": "PIX",
  "paidAt": "2026-04-20T10:00:00Z",
  "reference": "PIX key: abc123",
  "notes": "Partial payment, patient requested extension",
  "remainderDueDate": "2026-05-20"
}
```

**Field Rules:**
- `chargeId`: UUID (required)
- `amountCents`: Positive integer (required)
- `method`: "PIX" | "CASH" | "CARD" | "TRANSFER" | "INSURANCE" | "OTHER" (required)
- `paidAt`: ISO datetime (optional; defaults to now)
- `reference`: 0–100 chars (optional)
- `notes`: 0–500 chars (optional)
- `remainderDueDate`: ISO date string (optional; defaults to original charge's dueDate)

**Partial Payment Handling (Automatic):**

When payment does NOT cover full remaining balance:

1. Creates a new charge for the remainder:
   - Amount: netAmount - totalPaid
   - Description: "Saldo restante"
   - Due date: `remainderDueDate` or original charge's due date
   - Status: "PENDING"

2. Marks original charge as "PAID" (obligation transferred)

3. All in a single DB transaction (atomic, impossible to skip)

**Full Payment:**
- If payment covers remaining balance: marks charge as "PAID"

**Validation:**
- Charge must not already be "PAID", "VOID", or "REFUNDED"
- Payment amount cannot exceed remaining balance (error if violated)

**Response:** `201 Created`

```json
{
  "data": {
    "payment": {
      "id": "payment-uuid",
      "tenantId": "tenant-uuid",
      "chargeId": "charge-uuid",
      "amountCents": 5000,
      "method": "PIX",
      "paidAt": "2026-04-20T10:00:00Z",
      "reference": "PIX key: abc123",
      "notes": "Partial payment...",
      "createdById": "user-uuid",
      "createdAt": "2026-04-20T10:00:00Z"
    },
    "remainderCharge": {
      "id": "new-charge-uuid",
      "tenantId": "tenant-uuid",
      "patientId": "patient-uuid",
      "amountCents": 10000,
      "description": "Saldo restante",
      "dueDate": "2026-05-20T00:00:00Z",
      "status": "PENDING",
      "createdAt": "2026-04-20T10:00:00Z"
    }
  }
}
```

---

## Domain: Users & Memberships

### List Tenant Members

```http
GET /api/v1/users
```

**Permission:** `users:view`

**Response:**

```json
{
  "data": [
    {
      "id": "membership-uuid",
      "tenantId": "tenant-uuid",
      "userId": "user-uuid",
      "role": "PSYCHOLOGIST",
      "status": "ACTIVE",
      "canViewAllPatients": null,
      "canViewClinicalNotes": null,
      "canManageFinancials": null,
      "createdAt": "2026-01-01T10:00:00Z",
      "updatedAt": "2026-01-01T10:00:00Z",
      "user": {
        "id": "user-uuid",
        "name": "Dr. Ana Costa",
        "email": "ana@example.com",
        "lastLoginAt": "2026-03-30T09:00:00Z",
        "imageUrl": "https://..."
      }
    }
  ]
}
```

---

### Invite User

```http
POST /api/v1/users
```

**Permission:** `users:invite`

**Request Body:**

```json
{
  "email": "novo@example.com",
  "role": "PSYCHOLOGIST"
}
```

**Field Rules:**
- `email`: Valid email, lowercase (required)
- `role`: "TENANT_ADMIN" | "PSYCHOLOGIST" | "ASSISTANT" | "READONLY" (required)

**Behavior:**
- Checks if user already a member (fails if so)
- Creates `Invite` record with 7-day expiry
- Sends email with invite link: `{NEXTAUTH_URL}/invite/{token}`
- Returns invite details (no secrets)

**Response:** `201 Created`

```json
{
  "data": {
    "id": "invite-uuid",
    "email": "novo@example.com",
    "role": "PSYCHOLOGIST",
    "expiresAt": "2026-04-06T12:00:00Z"
  }
}
```

---

### Validate Invite Token

```http
GET /api/v1/invites/:token
```

**No authentication required** (public endpoint)

**Response:** `200 OK`

```json
{
  "data": {
    "email": "novo@example.com",
    "role": "PSYCHOLOGIST",
    "tenant": {
      "name": "Psicologia Silva",
      "slug": "psicologia-silva"
    }
  }
}
```

**Error Cases:**
- Token not found: `404 NOT_FOUND`
- Already accepted: `409 CONFLICT`
- Expired: `410 GONE`

---

### Accept Invite

```http
POST /api/v1/invites/:token
```

**No authentication required** (public endpoint)

**Request Body:**

```json
{
  "name": "Nova Profissional"
}
```

**Field Rules:**
- `name`: 2–100 chars (required)

**Behavior:**
- Creates or updates user (by email)
- Creates or updates membership
- Marks invite as accepted
- User can now log in via magic link

**Response:** `201 Created`

```json
{
  "data": {
    "userId": "user-uuid",
    "tenantId": "tenant-uuid"
  }
}
```

---

## Domain: Profile & Settings

### Get User Profile

```http
GET /api/v1/profile
```

**Authentication:** Required (session cookie)

**Response:** `200 OK`

```json
{
  "data": {
    "id": "user-uuid",
    "name": "Dr. Ana Costa",
    "email": "ana@example.com",
    "phone": "+55 11 98765-4321",
    "imageUrl": "https://...",
    "createdAt": "2026-01-01T10:00:00Z"
  }
}
```

---

### Update User Profile

```http
PATCH /api/v1/profile
```

**Request Body (all optional):**

```json
{
  "name": "Dra. Ana Silva Costa",
  "phone": "+55 11 99999-9999"
}
```

**Field Rules:**
- `name`: 2–100 chars (optional)
- `phone`: 0–30 chars, nullable (optional)

**Response:** `200 OK`

---

### Get Tenant Settings

```http
GET /api/v1/settings
```

**Permission:** `tenant:view`

**Response:** `200 OK`

```json
{
  "data": {
    "id": "tenant-uuid",
    "name": "Psicologia Silva",
    "slug": "psicologia-silva",
    "timezone": "America/Sao_Paulo",
    "locale": "pt-BR",
    "sharedPatientPool": false,
    "adminCanViewClinical": false,
    "calendarShowPatient": "FIRST_NAME",
    "defaultAppointmentDurationMin": 50,
    "workingHoursStart": "08:00",
    "workingHoursEnd": "18:00",
    "workingDays": "MON,TUE,WED,THU,FRI",
    "phone": "+55 11 3333-3333",
    "website": "https://psicologiasilva.com",
    "addressLine": "Rua das Flores, 123",
    "addressCity": "São Paulo",
    "addressState": "SP",
    "addressZip": "01310-100",
    "plan": "professional",
    "planSince": "2026-01-01T10:00:00Z",
    "createdAt": "2026-01-01T10:00:00Z"
  }
}
```

**Field Meanings:**
- `sharedPatientPool`: If false, PSYCHOLOGIST sees only assigned patients
- `adminCanViewClinical`: If false, TENANT_ADMIN cannot view clinical notes (unless overridden in membership)
- `calendarShowPatient`: Control patient PII visibility on calendar ("NONE", "FIRST_NAME", "FULL_NAME")
- `defaultAppointmentDurationMin`: Fallback duration for appointments
- `workingHours*`: Operating hours (informational; not enforced)
- `plan`: Subscription tier

---

### Update Tenant Settings

```http
PATCH /api/v1/settings
```

**Permission:** `tenant:edit`

**Request Body (all optional):**

```json
{
  "name": "Psicologia Silva Novo",
  "timezone": "America/Sao_Paulo",
  "sharedPatientPool": true,
  "adminCanViewClinical": true,
  "calendarShowPatient": "FULL_NAME",
  "defaultAppointmentDurationMin": 60,
  "workingHoursStart": "09:00",
  "workingHoursEnd": "17:00",
  "workingDays": "MON,TUE,WED,THU,FRI,SAT",
  "phone": "+55 11 3333-3333",
  "website": "https://psicologiasilva.com",
  "addressLine": "Rua das Flores, 123",
  "addressCity": "São Paulo",
  "addressState": "SP",
  "addressZip": "01310-100"
}
```

**Response:** `200 OK` (returns updated tenant settings)

---

## Domain: Onboarding

### Complete Onboarding

```http
POST /api/v1/onboarding
```

**Authentication:** Required (user logged in via magic link, no tenant yet)

**Request Body:**

```json
{
  "name": "Dr. João Silva",
  "email": "joao@example.com",
  "clinicName": "Clínica João Silva"
}
```

**Field Rules:**
- `name`: 0–100 chars (optional; may be empty for magic-link users)
- `email`: Valid email, lowercase (required)
- `clinicName`: 2–100 chars (required)

**Behavior:**

Three scenarios:

1. **Brand-new user:** Creates user + tenant + membership in one transaction
2. **Magic-link user (no membership):** User exists but has no tenant; creates tenant + membership
3. **User already has membership:** Returns success (idempotent)

**Rate Limit:** 5 per IP per hour (429 if exceeded)

**Response:** `201 Created`

```json
{
  "data": {
    "message": "Conta criada com sucesso."
  }
}
```

---

## Domain: Audit

### Get Audit Log

```http
GET /api/v1/audit
```

**Permission:** `audit:view`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `action` | string | Filter by audit action (e.g., "APPOINTMENT_CREATE") |
| `userId` | UUID | Filter by user; PSY/ASST see only own |
| `entity` | string | Filter by entity type (e.g., "Charge") |
| `from` | ISO datetime | Start timestamp |
| `to` | ISO datetime | End timestamp |
| `export` | "true" | CSV export mode |
| `page` | number | Pagination (default: 1) |
| `pageSize` | number | Per page (default: 20, max: 100) |

**Scope:**
- PSYCHOLOGIST and ASSISTANT: See only their own actions
- TENANT_ADMIN and SUPERADMIN: See all tenant actions

**CSV Export:**
```
GET /api/v1/audit?export=true&from=...&to=...
```

- Requires `audit:export` permission
- Capped at 50,000 rows
- Headers: Data/Hora, Usuário, Email, Ação, Entidade, ID Entidade, IP

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "log-uuid",
      "tenantId": "tenant-uuid",
      "userId": "user-uuid",
      "action": "APPOINTMENT_CREATE",
      "entity": "Appointment",
      "entityId": "appt-uuid",
      "summary": {
        "patientId": "patient-uuid",
        "providerUserId": "provider-uuid",
        "totalCreated": 1
      },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2026-04-15T10:00:00Z",
      "user": {
        "name": "Dr. Ana Costa",
        "email": "ana@example.com"
      }
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 450, "hasMore": true }
}
```

**Common Actions:**
- `APPOINTMENT_CREATE`, `APPOINTMENT_UPDATE`, `APPOINTMENT_CANCEL`, `APPOINTMENT_NO_SHOW`, `APPOINTMENT_COMPLETE`
- `SESSION_CREATE`, `SESSION_UPDATE`, `SESSION_DELETE`, `SESSION_RESTORE`
- `CHARGE_CREATE`, `CHARGE_UPDATE`, `CHARGE_DELETE`
- `PAYMENT_CREATE`
- `PATIENT_CREATE`, `PATIENT_UPDATE`, `PATIENT_ARCHIVE`, `PATIENT_RESTORE`
- `USER_INVITE`, `USER_INVITE_ACCEPT`
- `FILE_UPLOAD`, `FILE_DELETE`, `FILE_RESTORE`
- `TENANT_SETTINGS_UPDATE`
- `REMINDER_TEMPLATE_SAVE`

---

## Domain: Reports

### Get Monthly Report

```http
GET /api/v1/reports?type=monthly&year=2026&month=3
```

**Permission:** `reports:view`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `type` | enum | "monthly", "dashboard", "cashflow", "previsibility", "patients", "appointments", "charges" |
| `year` | number | Year (default: current) |
| `month` | number | Month 1–12 (default: current) |
| `months` | number | For cashflow: how many past months (default: 6) |
| `export` | "true" | CSV export (for monthly only) |

**Monthly Report Response:**

```json
{
  "data": {
    "period": {
      "year": 2026,
      "month": 3,
      "from": "2026-03-01T00:00:00Z",
      "to": "2026-03-31T23:59:59Z"
    },
    "summary": {
      "totalCharged": 150000,
      "totalReceived_competencia": 100000,
      "totalPending": 50000,
      "totalOverdue": 20000,
      "totalCaixa": 95000,
      "completedAppointments": 12,
      "chargesCount": 10,
      "newPatients": 2
    },
    "apptStats": {
      "total": 15,
      "completed": 12,
      "canceled": 1,
      "noShow": 1,
      "scheduled": 1
    },
    "byProvider": [
      {
        "name": "Dr. Ana Costa",
        "received": 95000,
        "sessions": 12,
        "pending": 5000
      }
    ],
    "byMethod": {
      "PIX": 50000,
      "CASH": 45000
    }
  }
}
```

**Accounting Rules:**
- **Competência (Accrual):** Charges due in the period
  - Excludes "Saldo restante" splits (remainder charges) to avoid double-counting
  - Counts paid charges' payments if status = PAID
- **Caixa (Cash):** Payments received in the period (regardless of charge due date)
- **Pending:** Charges in PENDING or OVERDUE status (net of payments)

---

### Get Cashflow Report

```http
GET /api/v1/reports?type=cashflow&year=2026&month=3&months=6
```

**Response:**

```json
{
  "data": {
    "cashflow": [
      {
        "month": "Oct/25",
        "year": 2025,
        "monthNum": 10,
        "competencia": 120000,
        "caixa": 90000,
        "sessions": 8
      },
      {
        "month": "Nov/25",
        "year": 2025,
        "monthNum": 11,
        "competencia": 130000,
        "caixa": 110000,
        "sessions": 9
      },
      {
        "month": "Mar/26",
        "year": 2026,
        "monthNum": 3,
        "competencia": 150000,
        "caixa": 95000,
        "sessions": 12
      }
    ]
  }
}
```

---

### Get Previsibility (Upcoming Revenue)

```http
GET /api/v1/reports?type=previsibility
```

**Response:**

```json
{
  "data": {
    "upcoming": [
      {
        "month": "April 2026",
        "monthShort": "Apr/26",
        "expected": 165000,
        "count": 11
      },
      {
        "month": "May 2026",
        "monthShort": "May/26",
        "expected": 155000,
        "count": 10
      }
    ],
    "overdue": {
      "total": 45000,
      "count": 3
    }
  }
}
```

---

### Export CSV Reports

```http
GET /api/v1/reports?type=patients&export=true
GET /api/v1/reports?type=appointments&export=true
GET /api/v1/reports?type=charges&export=true
```

**Response:** CSV file with headers, comma-separated, Portuguese labels.

---

## Domain: Integrations

### List Integrations

```http
GET /api/v1/integrations
```

**Permission:** `tenant:view`

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "integration-uuid",
      "type": "GOOGLE_CALENDAR",
      "status": "CONNECTED",
      "providerName": "Google Workspace",
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-03-30T09:00:00Z"
    }
  ]
}
```

**Notes:**
- Encrypted credentials never exposed in responses
- `status` indicates connection health
- Used to determine available integrations on tenant dashboard

---

## Domain: Reminder Templates

### List Reminder Templates

```http
GET /api/v1/reminder-templates
```

**Permission:** `tenant:view`

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "template-uuid",
      "tenantId": "tenant-uuid",
      "type": "CONFIRMATION",
      "subject": "Consulta marcada!",
      "body": "Olá {patientName},\n\nSua consulta está confirmada para {appointmentDate} às {appointmentTime}...",
      "isActive": true,
      "createdAt": "2026-01-01T10:00:00Z",
      "updatedAt": "2026-01-01T10:00:00Z"
    }
  ]
}
```

**Template Types:**
- `CONFIRMATION`: Sent immediately when appointment created (if `notifyPatient: true`)
- `REMINDER_24H`: Sent 24 hours before appointment
- `REMINDER_1H`: Sent 1 hour before appointment

---

### Save Reminder Template

```http
POST /api/v1/reminder-templates
```

**Permission:** `tenant:edit`

**Request Body:**

```json
{
  "type": "CONFIRMATION",
  "subject": "Consulta marcada!",
  "body": "Olá {patientName},\n\nSua consulta está confirmada para {appointmentDate} às {appointmentTime} com {providerName}.",
  "isActive": true
}
```

**Field Rules:**
- `type`: "CONFIRMATION" | "REMINDER_24H" | "REMINDER_1H" (required)
- `subject`: 1–200 chars (required)
- `body`: 1–5000 chars (required)
- `isActive`: Boolean (default: true)

**Behavior:**
- Each tenant has at most one template per type
- POST creates or updates (upsert by type)

**Response:** `201 Created` (or 200 if updated)

---

## Common Query Patterns

### Get All Active Patients

```http
GET /api/v1/patients?active=true&pageSize=100
```

### Get Appointments for a Date Range

```http
GET /api/v1/appointments?from=2026-04-01T00:00:00Z&to=2026-04-30T23:59:59Z&pageSize=50
```

### Get Overdue Charges

```http
GET /api/v1/charges?status=OVERDUE&pageSize=20
```

### Export Monthly Report as CSV

```http
GET /api/v1/reports?type=monthly&year=2026&month=3&export=true
```

### Get Patient's Session History

```http
GET /api/v1/sessions?patientId=PATIENT_UUID&pageSize=50
```

### Create Recurring Weekly Appointment

```
POST /api/v1/appointments
{
  "patientId": "...",
  "providerUserId": "...",
  "appointmentTypeId": "...",
  "startsAt": "2026-04-15T14:00:00Z",
  "endsAt": "2026-04-15T14:50:00Z",
  "recurrenceRrule": "FREQ=WEEKLY;INTERVAL=1",
  "recurrenceOccurrences": 12,
  "notifyPatient": true,
  "notifyMethods": ["EMAIL"]
}
```

---

## Error Handling

All errors follow the standard shape:

```json
{
  "error": {
    "code": "CODE",
    "message": "Human-readable message in Portuguese",
    "details": null
  }
}
```

**Common Scenarios:**

| Scenario | Status | Code | Message |
|----------|--------|------|---------|
| No session cookie | 401 | UNAUTHORIZED | "Authentication required" |
| Insufficient role | 403 | FORBIDDEN | "Role does not have permission: ..." |
| Patient not found | 404 | NOT_FOUND | "Patient not found" |
| Invalid JSON | 400 | VALIDATION_ERROR | "Invalid input" (with Zod details) |
| Appointment slot taken | 409 | CONFLICT | "O profissional já possui uma consulta neste horário" |
| Discount > amount | 400 | BAD_REQUEST | "Discount cannot exceed the charge amount" |
| Quota exceeded | 429 | RATE_LIMITED | "Muitas tentativas. Tente novamente em 1 hora." |

---

## Audit Trail

All write operations (`POST`, `PATCH`, `DELETE`) are logged to the audit table with:

- Action: Semantic action name (e.g., "APPOINTMENT_CREATE")
- Entity: Resource type (e.g., "Appointment")
- Entity ID: UUID of created/modified resource
- Summary: Relevant fields (e.g., patientId, amountCents)
- IP Address & User Agent
- Timestamp

Access via:
```http
GET /api/v1/audit?action=APPOINTMENT_CREATE&from=2026-01-01T00:00:00Z
```

---

## Changelog

### Upcoming

- [ ] Webhook support for appointment reminders
- [ ] Bulk patient import API
- [ ] Advanced filtering on clinical sessions

### v1.0 (Current)

- Complete REST API for all core entities
- NextAuth magic link authentication
- Multi-tenant RBAC
- Audit logging
- Financial management (charges, payments, partial payments)
- Clinical session management with revisions
- File attachment support (Supabase Storage)
- Reports and analytics
- Appointment recurrence support
