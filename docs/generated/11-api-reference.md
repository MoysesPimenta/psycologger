# API Reference

Comprehensive reference for all 40+ endpoints across Psycologger's staff application and patient portal. All endpoints require authentication unless otherwise noted. Responses use standard HTTP status codes and JSON formatting.

## Authentication & Onboarding

### POST /api/auth/login

Staff login via email + password.

**Authorization**: None (public)

**Request Body**:
```json
{
  "email": "string (email format)",
  "password": "string (min 8 characters)"
}
```

**Response** (200 OK):
```json
{
  "sessionToken": "string (JWT)",
  "user": {
    "id": "string (uuid)",
    "email": "string",
    "name": "string",
    "role": "SUPERADMIN|TENANT_ADMIN|PSYCHOLOGIST|ASSISTANT|READONLY",
    "tenantId": "string (uuid)",
    "permissions": ["string"]
  }
}
```

**Errors**:
- 400 BAD_REQUEST: Missing email or password
- 401 UNAUTHORIZED: Invalid credentials
- 429 TOO_MANY_REQUESTS: Rate limited (5 attempts per 15 minutes)

**Notes**: Password stored as bcrypt hash. Session token expires in 30 days.

---

### POST /api/auth/signup

Staff signup for new tenant.

**Authorization**: None (public)

**Request Body**:
```json
{
  "email": "string (email format)",
  "password": "string (min 8 characters)",
  "name": "string (min 2 characters)",
  "tenantName": "string (min 3 characters)",
  "phone": "string (optional)"
}
```

**Response** (201 CREATED):
```json
{
  "user": {
    "id": "string (uuid)",
    "email": "string",
    "name": "string",
    "role": "TENANT_ADMIN",
    "tenantId": "string (uuid)"
  },
  "tenant": {
    "id": "string (uuid)",
    "name": "string"
  }
}
```

**Errors**:
- 400 BAD_REQUEST: Invalid input or email already exists
- 409 CONFLICT: Email already registered

**Notes**: Creates tenant and user in single transaction. User assigned TENANT_ADMIN role.

---

### POST /api/auth/logout

Sign out current session.

**Authorization**: Required (any role)

**Request**: No body

**Response** (200 OK):
```json
{
  "success": true
}
```

**Errors**: None

**Notes**: Invalidates JWT token. Client removes session cookie.

---

### POST /api/auth/callback

OAuth callback handler (GitHub, Google, etc.).

**Authorization**: None (public)

**Query Parameters**:
- `code`: string (OAuth provider code)
- `state`: string (CSRF token)

**Response** (302 REDIRECT): Redirects to `/app/dashboard`

**Errors**:
- 400 BAD_REQUEST: Invalid code or state mismatch
- 404 NOT_FOUND: User not found (if linking to existing provider)

---

### POST /api/auth/verify-email

Verify email address via magic link.

**Authorization**: None (public)

**Request Body**:
```json
{
  "token": "string (from email link)"
}
```

**Response** (200 OK):
```json
{
  "verified": true,
  "user": { /* user object */ }
}
```

**Errors**:
- 400 BAD_REQUEST: Invalid or expired token
- 404 NOT_FOUND: User not found

**Notes**: Token valid for 24 hours. Used during signup flow.

---

## Profile & User Management

### GET /api/settings/profile

Get current user's profile.

**Authorization**: Required (any role)

**Response** (200 OK):
```json
{
  "id": "string (uuid)",
  "email": "string",
  "name": "string",
  "phone": "string (optional)",
  "role": "string",
  "tenantId": "string",
  "timezone": "string (IANA format)",
  "createdAt": "ISO 8601 timestamp"
}
```

**Errors**: None

---

### PATCH /api/settings/profile

Update current user's profile.

**Authorization**: Required (any role)

**Request Body**:
```json
{
  "name": "string (optional)",
  "phone": "string (optional)",
  "timezone": "string (IANA format, optional)"
}
```

**Response** (200 OK): Updated user object

**Errors**:
- 400 BAD_REQUEST: Invalid timezone
- 409 CONFLICT: Email already in use (if changing email)

**Audit**: `user.profile_updated`

---

### POST /api/auth/reset-password

Request password reset via email.

**Authorization**: None (public)

**Request Body**:
```json
{
  "email": "string (email format)"
}
```

**Response** (200 OK):
```json
{
  "message": "Password reset link sent to email"
}
```

**Errors**:
- 400 BAD_REQUEST: Invalid email format

**Notes**: Email sent even if user not found (prevents user enumeration). Token valid 1 hour.

---

### PATCH /api/auth/reset-password/{token}

Complete password reset.

**Authorization**: None (public)

**Request Body**:
```json
{
  "password": "string (min 8 characters)"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "user": { /* user object */ }
}
```

**Errors**:
- 400 BAD_REQUEST: Invalid or expired token
- 404 NOT_FOUND: User not found

**Audit**: `user.password_reset`

---

## User Management (Admin)

### GET /api/settings/users

List users in tenant.

**Authorization**: Required (TENANT_ADMIN, SUPERADMIN)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `role`: string (filter by role, optional)
- `search`: string (search by name/email, optional)

**Response** (200 OK):
```json
{
  "users": [
    {
      "id": "string",
      "email": "string",
      "name": "string",
      "role": "string",
      "lastLoginAt": "ISO 8601 timestamp (nullable)",
      "createdAt": "ISO 8601 timestamp"
    }
  ],
  "total": "number",
  "skip": "number",
  "take": "number"
}
```

---

### POST /api/settings/users

Create new user in tenant.

**Authorization**: Required (TENANT_ADMIN)

**Request Body**:
```json
{
  "email": "string (email format)",
  "name": "string (min 2 characters)",
  "role": "PSYCHOLOGIST|ASSISTANT|READONLY",
  "phone": "string (optional)"
}
```

**Response** (201 CREATED):
```json
{
  "id": "string",
  "email": "string",
  "name": "string",
  "role": "string",
  "inviteToken": "string",
  "inviteExpiry": "ISO 8601 timestamp"
}
```

**Errors**:
- 400 BAD_REQUEST: Invalid input
- 409 CONFLICT: Email already exists

**Notes**: User receives email invite with magic link. Role cannot be TENANT_ADMIN or SUPERADMIN.

**Audit**: `user.created`

---

### PATCH /api/settings/users/{id}

Update user (admin).

**Authorization**: Required (TENANT_ADMIN)

**Request Body**:
```json
{
  "name": "string (optional)",
  "role": "PSYCHOLOGIST|ASSISTANT|READONLY (optional)",
  "phone": "string (optional)"
}
```

**Response** (200 OK): Updated user object

**Errors**:
- 404 NOT_FOUND: User not found
- 403 FORBIDDEN: Cannot modify TENANT_ADMIN or SUPERADMIN

**Audit**: `user.updated`, `user.role_changed` (if role changed)

---

### DELETE /api/settings/users/{id}

Deactivate user (soft delete).

**Authorization**: Required (TENANT_ADMIN)

**Response** (200 OK):
```json
{
  "success": true,
  "user": { /* user object with deletedAt timestamp */ }
}
```

**Errors**:
- 404 NOT_FOUND: User not found
- 403 FORBIDDEN: Cannot delete TENANT_ADMIN or SUPERADMIN
- 409 CONFLICT: Cannot delete last TENANT_ADMIN

**Audit**: `user.deleted`

---

## Settings

### GET /api/settings/appointment-types

List appointment types for tenant.

**Authorization**: Required (any role)

**Response** (200 OK):
```json
[
  {
    "id": "string",
    "tenantId": "string",
    "name": "string (e.g., 'Individual Session', 'Group Session')",
    "duration": "number (minutes, e.g., 50)",
    "price": "number (centavos, e.g., 15000 = R$ 150.00)",
    "color": "string (hex color for calendar)",
    "isActive": "boolean",
    "createdAt": "ISO 8601 timestamp"
  }
]
```

---

### POST /api/settings/appointment-types

Create appointment type.

**Authorization**: Required (TENANT_ADMIN)

**Request Body**:
```json
{
  "name": "string (min 1, max 100)",
  "duration": "number (min 15, max 480)",
  "price": "number (min 0, max 999999999)",
  "color": "string (optional, hex format)"
}
```

**Response** (201 CREATED): Appointment type object

**Errors**:
- 400 BAD_REQUEST: Invalid input
- 409 CONFLICT: Name already exists in tenant

**Audit**: `appointment_type.created`

---

### PATCH /api/settings/appointment-types/{id}

Update appointment type.

**Authorization**: Required (TENANT_ADMIN)

**Request Body**: Same as POST (all fields optional)

**Response** (200 OK): Updated appointment type

**Errors**:
- 404 NOT_FOUND: Appointment type not found

**Audit**: `appointment_type.updated`

---

### GET /api/settings/reminder-templates

Get reminder email templates for tenant.

**Authorization**: Required (TENANT_ADMIN)

**Response** (200 OK):
```json
{
  "appointmentReminder": {
    "id": "string",
    "type": "APPOINTMENT_REMINDER",
    "subject": "string",
    "content": "string (HTML with placeholders: {patientName}, {appointmentTime}, etc.)",
    "isDefault": "boolean"
  },
  "paymentReminder": {
    "id": "string",
    "type": "PAYMENT_REMINDER",
    "subject": "string",
    "content": "string (HTML with placeholders: {patientName}, {amount}, {dueDate})",
    "isDefault": "boolean"
  }
}
```

---

### PATCH /api/settings/reminder-templates/{type}

Update reminder template.

**Authorization**: Required (TENANT_ADMIN)

**Path Parameters**:
- `type`: APPOINTMENT_REMINDER or PAYMENT_REMINDER

**Request Body**:
```json
{
  "subject": "string (optional)",
  "content": "string (HTML, optional)"
}
```

**Response** (200 OK): Updated reminder template

**Errors**:
- 400 BAD_REQUEST: Invalid template type

**Audit**: `reminder_template.updated`

---

## Patients

### GET /api/patients

List patients in tenant.

**Authorization**: Required (any role)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `search`: string (search by name/email/phone, optional)
- `tags`: string (comma-separated tag IDs, optional)
- `assignedTo`: string (filter by psychologist ID, optional)
- `status`: ACTIVE or ARCHIVED (default ACTIVE, optional)

**Response** (200 OK):
```json
{
  "patients": [
    {
      "id": "string (uuid)",
      "name": "string",
      "email": "string (optional)",
      "phone": "string (optional)",
      "cpf": "string (masked for non-admin users)",
      "birthDate": "ISO 8601 date (optional)",
      "address": "string (optional)",
      "tags": [
        { "id": "string", "name": "string", "color": "string" }
      ],
      "assignedPsychologistId": "string (uuid, optional)",
      "status": "ACTIVE|ARCHIVED",
      "consents": {
        "TERMS_OF_USE": "ISO 8601 timestamp (nullable)",
        "PRIVACY_POLICY": "ISO 8601 timestamp (nullable)",
        "DATA_SHARING": "ISO 8601 timestamp (nullable)",
        "JOURNAL_SHARING": "ISO 8601 timestamp (nullable)"
      },
      "createdAt": "ISO 8601 timestamp",
      "updatedAt": "ISO 8601 timestamp"
    }
  ],
  "total": "number",
  "skip": "number",
  "take": "number"
}
```

---

### POST /api/patients

Create new patient.

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST)

**Request Body**:
```json
{
  "name": "string (required, min 2)",
  "email": "string (optional, email format)",
  "phone": "string (optional)",
  "cpf": "string (optional, format: 000.000.000-00)",
  "birthDate": "ISO 8601 date (optional)",
  "address": "string (optional)",
  "tags": ["string (uuid)"] (optional),
  "assignedPsychologistId": "string (uuid, optional)"
}
```

**Response** (201 CREATED): Patient object

**Errors**:
- 400 BAD_REQUEST: Invalid input
- 409 CONFLICT: Email or CPF already exists

**Audit**: `patient.created`

---

### GET /api/patients/{id}

Get single patient details.

**Authorization**: Required (PSYCHOLOGIST can view own patients, TENANT_ADMIN/SUPERADMIN can view all)

**Response** (200 OK): Full patient object with:
- All fields from list endpoint
- Last appointment date
- Upcoming appointments (next 3)
- Total sessions count
- Total charges (paid/pending/overdue)

**Errors**:
- 404 NOT_FOUND: Patient not found
- 403 FORBIDDEN: Access denied

---

### PATCH /api/patients/{id}

Update patient.

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST)

**Request Body**: Same as POST (all fields optional)

**Response** (200 OK): Updated patient object

**Errors**:
- 400 BAD_REQUEST: Invalid input
- 404 NOT_FOUND: Patient not found
- 409 CONFLICT: Email/CPF already in use

**Audit**: `patient.updated`

---

### DELETE /api/patients/{id}

Soft-delete patient (archive).

**Authorization**: Required (TENANT_ADMIN)

**Response** (200 OK): Patient object with deletedAt timestamp

**Errors**:
- 404 NOT_FOUND: Patient not found

**Audit**: `patient.archived`

**Notes**: Patient can be unarchived via PATCH with `status: ACTIVE`.

---

### POST /api/patients/{id}/consent

Record patient consent.

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST)

**Request Body**:
```json
{
  "type": "TERMS_OF_USE|PRIVACY_POLICY|DATA_SHARING|JOURNAL_SHARING",
  "given": "boolean"
}
```

**Response** (200 OK):
```json
{
  "patientId": "string",
  "type": "string",
  "given": "boolean",
  "grantedAt": "ISO 8601 timestamp",
  "revokedAt": "ISO 8601 timestamp (nullable)"
}
```

**Errors**:
- 404 NOT_FOUND: Patient not found

**Audit**: `patient.consent_given` or `patient.consent_withdrawn`

---

### POST /api/patients/{id}/portal-invite

Send patient portal invitation.

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST)

**Request Body**:
```json
{
  "email": "string (optional, defaults to patient email)"
}
```

**Response** (200 OK):
```json
{
  "inviteToken": "string",
  "inviteExpiry": "ISO 8601 timestamp",
  "magicLink": "string (full URL)"
}
```

**Errors**:
- 404 NOT_FOUND: Patient not found
- 400 BAD_REQUEST: Patient has no email

**Notes**: Email sent with magic link. Token valid 7 days.

**Audit**: `patient.portal_invite_sent`

---

### GET /api/patients/search

Full-text search patients by name, email, phone, CPF.

**Authorization**: Required (PSYCHOLOGIST can search own patients, TENANT_ADMIN/SUPERADMIN can search all)

**Query Parameters**:
- `q`: string (search term, min 2 characters)
- `limit`: number (default 10, max 50)

**Response** (200 OK):
```json
[
  {
    "id": "string",
    "name": "string",
    "email": "string (optional)",
    "phone": "string (optional)",
    "highlightedName": "string (with <mark> tags around matches)"
  }
]
```

---

## Appointments

### GET /api/appointments

List appointments for tenant (with filtering and calendar view support).

**Authorization**: Required (any role)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `psychologistId`: string (filter by psychologist, optional)
- `patientId`: string (filter by patient, optional)
- `status`: SCHEDULED|CONFIRMED|COMPLETED|CANCELED|NO_SHOW (optional)
- `startDate`: ISO 8601 date (filter by date range start, optional)
- `endDate`: ISO 8601 date (filter by date range end, optional)
- `viewType`: MONTH|WEEK|DAY|LIST (for calendar views, optional)

**Response** (200 OK):
```json
{
  "appointments": [
    {
      "id": "string (uuid)",
      "patientId": "string",
      "patientName": "string",
      "psychologistId": "string",
      "psychologistName": "string",
      "appointmentTypeId": "string",
      "appointmentTypeName": "string",
      "startTime": "ISO 8601 timestamp",
      "endTime": "ISO 8601 timestamp",
      "status": "SCHEDULED|CONFIRMED|COMPLETED|CANCELED|NO_SHOW",
      "notes": "string (optional)",
      "timezone": "string (IANA format)",
      "isRecurring": "boolean",
      "recurringGroupId": "string (uuid, if recurring)",
      "createdAt": "ISO 8601 timestamp",
      "updatedAt": "ISO 8601 timestamp"
    }
  ],
  "total": "number",
  "skip": "number",
  "take": "number"
}
```

---

### POST /api/appointments

Create appointment (single or recurring).

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST)

**Request Body**:
```json
{
  "patientId": "string (uuid, required)",
  "psychologistId": "string (uuid, required)",
  "appointmentTypeId": "string (uuid, required)",
  "startTime": "ISO 8601 timestamp (required)",
  "endTime": "ISO 8601 timestamp (required)",
  "timezone": "string (IANA format, required)",
  "notes": "string (optional)",
  "isRecurring": "boolean (default false)",
  "recurringPattern": "DAILY|WEEKLY|BIWEEKLY|MONTHLY (if recurring)",
  "recurringEndDate": "ISO 8601 date (if recurring, optional - defaults to 12 weeks)",
  "skipConflictCheck": "boolean (default false, for admin override)"
}
```

**Response** (201 CREATED): Appointment object (or array if recurring with multiple instances)

**Errors**:
- 400 BAD_REQUEST: Invalid input
- 404 NOT_FOUND: Patient, psychologist, or appointment type not found
- 409 CONFLICT: Time slot conflicts with existing appointment (if `skipConflictCheck: false`)

**Notes**: Conflict detection checked inside transaction. Confirmation and reminder emails sent automatically.

**Audit**: `appointment.created`

---

### GET /api/appointments/{id}

Get single appointment.

**Authorization**: Required (PSYCHOLOGIST can view own appointments, TENANT_ADMIN can view all)

**Response** (200 OK): Full appointment object with:
- All fields from list
- Related patient and psychologist details
- Created/updated user info
- Associated clinical session (if completed)

**Errors**:
- 404 NOT_FOUND: Appointment not found
- 403 FORBIDDEN: Access denied

---

### PATCH /api/appointments/{id}

Update appointment.

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST for own appointments)

**Request Body**:
```json
{
  "startTime": "ISO 8601 timestamp (optional)",
  "endTime": "ISO 8601 timestamp (optional)",
  "notes": "string (optional)",
  "status": "SCHEDULED|CONFIRMED|COMPLETED|CANCELED|NO_SHOW (optional)",
  "skipConflictCheck": "boolean (optional, default false)"
}
```

**Response** (200 OK): Updated appointment object

**Errors**:
- 400 BAD_REQUEST: Invalid input or invalid status transition
- 404 NOT_FOUND: Appointment not found
- 409 CONFLICT: Time slot conflicts

**Notes**: Status transitions SCHEDULED → CONFIRMED → COMPLETED. Cannot move to past date.

**Audit**: `appointment.updated`, `appointment.confirmed`, `appointment.completed`

---

### DELETE /api/appointments/{id}

Cancel appointment.

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST)

**Query Parameters**:
- `cancelFuture`: boolean (if recurring, cancel this and all future instances, default true)

**Response** (200 OK): Cancelled appointment object(s)

**Errors**:
- 404 NOT_FOUND: Appointment not found

**Notes**: If recurring and `cancelFuture: true`, all future instances cancelled atomically. Cancellation email sent to patient and psychologist.

**Audit**: `appointment.cancelled`

---

### POST /api/appointments/{id}/confirm

Confirm appointment (change status to CONFIRMED).

**Authorization**: Required (PSYCHOLOGIST can confirm own appointments)

**Response** (200 OK): Confirmation object:
```json
{
  "appointmentId": "string",
  "status": "CONFIRMED",
  "confirmedAt": "ISO 8601 timestamp",
  "confirmedBy": "string (user ID)"
}
```

**Errors**:
- 404 NOT_FOUND: Appointment not found
- 409 CONFLICT: Appointment already confirmed or completed

**Audit**: `appointment.confirmed`

---

### POST /api/appointments/check-conflicts

Check for scheduling conflicts without creating appointment.

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST)

**Request Body**:
```json
{
  "psychologistId": "string (uuid)",
  "startTime": "ISO 8601 timestamp",
  "endTime": "ISO 8601 timestamp",
  "timezone": "string (IANA format)",
  "excludeAppointmentId": "string (uuid, optional)"
}
```

**Response** (200 OK):
```json
{
  "hasConflict": "boolean",
  "conflicts": [
    {
      "id": "string",
      "patientName": "string",
      "startTime": "ISO 8601 timestamp",
      "endTime": "ISO 8601 timestamp"
    }
  ]
}
```

---

## Clinical Sessions & Notes

### GET /api/sessions

List clinical sessions.

**Authorization**: Required (any role)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `psychologistId`: string (filter by psychologist, optional)
- `patientId`: string (filter by patient, optional)
- `template`: FREE|SOAP|BIRP (filter by template type, optional)
- `tags`: string (comma-separated tag IDs, optional)
- `status`: DRAFT|COMPLETED (optional)

**Response** (200 OK):
```json
{
  "sessions": [
    {
      "id": "string (uuid)",
      "appointmentId": "string (uuid, optional)",
      "psychologistId": "string",
      "psychologistName": "string",
      "patientId": "string",
      "patientName": "string",
      "template": "FREE|SOAP|BIRP",
      "noteText": "string (truncated to 200 chars, redacted for READONLY)",
      "tags": [{ "id": "string", "name": "string" }],
      "status": "DRAFT|COMPLETED",
      "revisionsCount": "number",
      "attachmentsCount": "number",
      "createdAt": "ISO 8601 timestamp",
      "updatedAt": "ISO 8601 timestamp",
      "deletedAt": "ISO 8601 timestamp (nullable)"
    }
  ],
  "total": "number"
}
```

---

### POST /api/sessions

Create clinical session.

**Authorization**: Required (PSYCHOLOGIST, ASSISTANT)

**Request Body**:
```json
{
  "appointmentId": "string (uuid, optional)",
  "patientId": "string (uuid, required)",
  "template": "FREE|SOAP|BIRP (required)",
  "noteText": "string (required if not DRAFT, max 10000 chars)",
  "tags": ["string (uuid)"] (optional),
  "status": "DRAFT|COMPLETED (default DRAFT)",
  "formData": {
    "subjective": "string (optional, for SOAP)",
    "objective": "string (optional, for SOAP)",
    "assessment": "string (optional, for SOAP)",
    "plan": "string (optional, for SOAP)",
    "behavior": "string (optional, for BIRP)",
    "internal": "string (optional, for BIRP)",
    "response": "string (optional, for BIRP)",
    "plan": "string (optional, for BIRP)"
  } (optional)
}
```

**Response** (201 CREATED): Session object

**Errors**:
- 400 BAD_REQUEST: Invalid input or missing required fields
- 404 NOT_FOUND: Patient or appointment not found

**Audit**: `session.created`

**Notes**: If created from appointment, appointment status set to COMPLETED.

---

### GET /api/sessions/{id}

Get single session with full revision history.

**Authorization**: Required (PSYCHOLOGIST can view own, READONLY can view only non-redacted)

**Response** (200 OK):
```json
{
  "id": "string",
  "appointmentId": "string (optional)",
  "patientId": "string",
  "psychologistId": "string",
  "template": "string",
  "noteText": "string (full text, encrypted in transit)",
  "tags": [{ "id": "string", "name": "string" }],
  "attachments": [
    {
      "id": "string",
      "fileName": "string",
      "fileSize": "number (bytes)",
      "mimeType": "string",
      "uploadedAt": "ISO 8601 timestamp",
      "signedUrl": "string (1-hour expiry)"
    }
  ],
  "revisions": [
    {
      "id": "string",
      "content": "string",
      "createdBy": "string (user name)",
      "createdAt": "ISO 8601 timestamp"
    }
  ],
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp",
  "deletedAt": "ISO 8601 timestamp (nullable)"
}
```

**Errors**:
- 404 NOT_FOUND: Session not found
- 403 FORBIDDEN: Access denied (READONLY cannot view clinical notes)

---

### PATCH /api/sessions/{id}

Update session (creates new revision).

**Authorization**: Required (PSYCHOLOGIST can update own)

**Request Body**:
```json
{
  "noteText": "string (optional)",
  "tags": ["string (uuid)"] (optional),
  "status": "DRAFT|COMPLETED (optional)",
  "formData": {} (optional)
}
```

**Response** (200 OK): Updated session object with new revision

**Errors**:
- 404 NOT_FOUND: Session not found
- 403 FORBIDDEN: Cannot modify after 30 days (edit grace period)

**Audit**: `session.updated`, `session.revision_created`

---

### DELETE /api/sessions/{id}

Soft-delete session (30-day recovery window).

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST for own)

**Response** (200 OK): Session object with deletedAt timestamp

**Errors**:
- 404 NOT_FOUND: Session not found

**Audit**: `session.deleted`

**Notes**: Permanent deletion occurs 30 days after soft delete.

---

### GET /api/sessions/{id}/revisions

Get revision history for session.

**Authorization**: Required (PSYCHOLOGIST can view own, TENANT_ADMIN can view all)

**Response** (200 OK):
```json
[
  {
    "id": "string (uuid)",
    "content": "string",
    "createdBy": {
      "id": "string",
      "name": "string"
    },
    "createdAt": "ISO 8601 timestamp"
  }
]
```

---

### GET /api/sessions/{id}/revisions/{revisionId}/diff

Get diff between two revisions.

**Authorization**: Required (PSYCHOLOGIST can view own)

**Query Parameters**:
- `compareWith`: string (uuid of revision to compare with, defaults to previous)

**Response** (200 OK):
```json
{
  "old": "string (previous revision text)",
  "new": "string (current revision text)",
  "diff": [
    {
      "type": "add|remove|context",
      "content": "string (line or chunk)"
    }
  ]
}
```

---

### POST /api/sessions/{id}/files

Upload file attachment to session.

**Authorization**: Required (PSYCHOLOGIST can upload to own, ASSISTANT under supervision)

**Request**: multipart/form-data
- `file`: File (required, max 25 MB)
- `isClinical`: boolean (optional, default true)

**Response** (201 CREATED):
```json
{
  "id": "string (uuid)",
  "fileName": "string",
  "fileSize": "number (bytes)",
  "mimeType": "string",
  "uploadedAt": "ISO 8601 timestamp",
  "signedUrl": "string (1-hour expiry)"
}
```

**Errors**:
- 400 BAD_REQUEST: File too large or invalid MIME type
- 404 NOT_FOUND: Session not found

**Audit**: `file.uploaded`

---

### GET /api/sessions/{id}/files/{fileId}

Download session file (via signed URL).

**Authorization**: Required (PSYCHOLOGIST can download own, TENANT_ADMIN can download all)

**Response** (200 OK): File content with appropriate Content-Type header

**Errors**:
- 404 NOT_FOUND: File not found
- 403 FORBIDDEN: Access denied

**Audit**: `file.downloaded`

---

### DELETE /api/sessions/{id}/files/{fileId}

Delete session file.

**Authorization**: Required (PSYCHOLOGIST can delete own uploads)

**Response** (200 OK):
```json
{
  "success": true,
  "deletedAt": "ISO 8601 timestamp"
}
```

**Errors**:
- 404 NOT_FOUND: File not found

**Audit**: `file.deleted`

---

### GET /api/sessions/templates

Get available session note templates (read-only).

**Authorization**: Required (any role)

**Response** (200 OK):
```json
[
  {
    "id": "free",
    "name": "Free Note",
    "description": "Unstructured narrative note",
    "template": "null (free-form)"
  },
  {
    "id": "soap",
    "name": "SOAP",
    "description": "Subjective / Objective / Assessment / Plan",
    "template": {
      "subjective": "string (placeholder)",
      "objective": "string (placeholder)",
      "assessment": "string (placeholder)",
      "plan": "string (placeholder)"
    }
  },
  {
    "id": "birp",
    "name": "BIRP",
    "description": "Behavior / Internal / Response / Plan",
    "template": {
      "behavior": "string (placeholder)",
      "internal": "string (placeholder)",
      "response": "string (placeholder)",
      "plan": "string (placeholder)"
    }
  }
]
```

---

## Charges & Payments

### GET /api/charges

List charges for tenant or patient.

**Authorization**: Required (PSYCHOLOGIST can view own patient's charges, TENANT_ADMIN can view all)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `patientId`: string (filter by patient, optional)
- `status`: PENDING|OVERDUE|PAID (optional)
- `sortBy`: amount|dueDate|createdAt (default createdAt)
- `sortOrder`: asc|desc (default desc)

**Response** (200 OK):
```json
{
  "charges": [
    {
      "id": "string (uuid)",
      "patientId": "string",
      "patientName": "string",
      "psychologistId": "string",
      "psychologistName": "string",
      "appointmentId": "string (uuid, optional)",
      "sessionId": "string (uuid, optional)",
      "amount": "number (centavos)",
      "amountFormatted": "string (e.g., 'R$ 150,00')",
      "description": "string",
      "status": "PENDING|OVERDUE|PAID",
      "paymentMethod": "string (optional)",
      "dueDate": "ISO 8601 date",
      "paidDate": "ISO 8601 date (nullable)",
      "daysOverdue": "number (0 if not overdue)",
      "createdAt": "ISO 8601 timestamp"
    }
  ],
  "total": "number",
  "totalAmount": "number (centavos)",
  "pending": "number (count)",
  "overdue": "number (count)",
  "paid": "number (count)"
}
```

---

### POST /api/charges

Create charge.

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST)

**Request Body**:
```json
{
  "patientId": "string (uuid, required)",
  "psychologistId": "string (uuid, required)",
  "amount": "number (centavos, required, min 100)",
  "description": "string (required)",
  "appointmentId": "string (uuid, optional)",
  "sessionId": "string (uuid, optional)",
  "dueDate": "ISO 8601 date (optional, defaults to 7 days from now)",
  "paymentMethod": "PIX|CASH|CARD|TRANSFER|INSURANCE|OTHER (optional)"
}
```

**Response** (201 CREATED): Charge object

**Errors**:
- 400 BAD_REQUEST: Invalid input
- 404 NOT_FOUND: Patient or psychologist not found
- 409 CONFLICT: Duplicate charge for same appointment/session

**Audit**: `charge.created`

---

### GET /api/charges/{id}

Get single charge with payment history.

**Authorization**: Required (PSYCHOLOGIST can view own patient's charge, TENANT_ADMIN can view all)

**Response** (200 OK): Charge object with:
```json
{
  "id": "string",
  "...: "...",
  "payments": [
    {
      "id": "string",
      "amount": "number (centavos)",
      "method": "string",
      "paidAt": "ISO 8601 timestamp",
      "receiptUrl": "string (optional)"
    }
  ]
}
```

**Errors**:
- 404 NOT_FOUND: Charge not found
- 403 FORBIDDEN: Access denied

---

### PATCH /api/charges/{id}

Update charge.

**Authorization**: Required (TENANT_ADMIN)

**Request Body**:
```json
{
  "amount": "number (centavos, optional)",
  "description": "string (optional)",
  "dueDate": "ISO 8601 date (optional)",
  "status": "PENDING|OVERDUE|PAID (optional)"
}
```

**Response** (200 OK): Updated charge object

**Errors**:
- 404 NOT_FOUND: Charge not found
- 409 CONFLICT: Cannot change status if already paid

**Audit**: `charge.updated`

---

### DELETE /api/charges/{id}

Delete charge (only if unpaid and no payments recorded).

**Authorization**: Required (TENANT_ADMIN)

**Response** (200 OK):
```json
{
  "success": true,
  "deletedAt": "ISO 8601 timestamp"
}
```

**Errors**:
- 404 NOT_FOUND: Charge not found
- 409 CONFLICT: Cannot delete charge with payments recorded

**Audit**: `charge.deleted`

---

### POST /api/charges/{id}/payment

Record payment for charge (handles partial payments and remainder logic).

**Authorization**: Required (TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT)

**Request Body**:
```json
{
  "amount": "number (centavos, required, max charge amount)",
  "method": "PIX|CASH|CARD|TRANSFER|INSURANCE|OTHER (required)",
  "receiptUrl": "string (optional, for proof of payment)"
}
```

**Response** (201 CREATED):
```json
{
  "payment": {
    "id": "string",
    "chargeId": "string",
    "amount": "number (centavos)",
    "method": "string",
    "paidAt": "ISO 8601 timestamp"
  },
  "charge": {
    "id": "string",
    "status": "PAID",
    "paidDate": "ISO 8601 timestamp"
  },
  "remainder": {
    "id": "string (uuid, if partial payment)",
    "amount": "number (centavos)",
    "description": "Saldo Restante",
    "dueDate": "ISO 8601 date"
  } (nullable)
}
```

**Errors**:
- 400 BAD_REQUEST: Payment amount exceeds charge
- 404 NOT_FOUND: Charge not found
- 409 CONFLICT: Charge already paid

**Notes**: Atomic transaction: original charge status updated, new remainder charge created if partial payment.

**Audit**: `payment.recorded`

---

### GET /api/payments

List all payments (for reporting).

**Authorization**: Required (TENANT_ADMIN)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `patientId`: string (optional)
- `method`: string (optional)
- `startDate`: ISO 8601 date (optional)
- `endDate`: ISO 8601 date (optional)

**Response** (200 OK):
```json
{
  "payments": [
    {
      "id": "string",
      "chargeId": "string",
      "patientId": "string",
      "patientName": "string",
      "amount": "number (centavos)",
      "method": "string",
      "paidAt": "ISO 8601 timestamp",
      "receiptUrl": "string (optional)"
    }
  ],
  "total": "number (count)",
  "totalAmount": "number (centavos)"
}
```

---

## Reports & Analytics

### GET /api/financial/reports

Get financial summary report.

**Authorization**: Required (TENANT_ADMIN)

**Query Parameters**:
- `startDate`: ISO 8601 date (optional, defaults to 30 days ago)
- `endDate`: ISO 8601 date (optional, defaults to today)
- `groupBy`: DAY|WEEK|MONTH (optional, default MONTH)

**Response** (200 OK):
```json
{
  "period": {
    "startDate": "ISO 8601 date",
    "endDate": "ISO 8601 date"
  },
  "summary": {
    "totalCharges": "number (centavos)",
    "totalPaid": "number (centavos)",
    "totalPending": "number (centavos)",
    "totalOverdue": "number (centavos)",
    "collectionRate": "number (0.0-1.0)"
  },
  "byMethod": {
    "PIX": "number (centavos)",
    "CASH": "number (centavos)",
    "CARD": "number (centavos)",
    "TRANSFER": "number (centavos)",
    "INSURANCE": "number (centavos)",
    "OTHER": "number (centavos)"
  },
  "byPsychologist": [
    {
      "id": "string",
      "name": "string",
      "chargesCount": "number",
      "totalCharged": "number (centavos)",
      "totalCollected": "number (centavos)"
    }
  ],
  "timeline": [
    {
      "date": "ISO 8601 date",
      "charged": "number (centavos)",
      "collected": "number (centavos)",
      "pending": "number (centavos)"
    }
  ]
}
```

---

### GET /api/financial/export

Export financial data as CSV.

**Authorization**: Required (TENANT_ADMIN)

**Query Parameters**:
- `startDate`: ISO 8601 date (required)
- `endDate`: ISO 8601 date (required)
- `type`: charges|payments (optional, default charges)

**Response** (200 OK): CSV file download

**Errors**:
- 400 BAD_REQUEST: Date range exceeds 90 days

**Notes**: Max 50,000 rows per export.

**Audit**: `financial.export`

---

## Audit & Compliance

### GET /api/audit

List audit logs with filtering.

**Authorization**: Required (TENANT_ADMIN, SUPERADMIN)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `action`: string (filter by action, optional)
- `resource`: string (filter by resource type, optional)
- `userId`: string (filter by user, optional)
- `startDate`: ISO 8601 date (optional, defaults to 30 days ago)
- `endDate`: ISO 8601 date (optional, defaults to today)
- `search`: string (full-text search in changes, optional)

**Response** (200 OK):
```json
{
  "logs": [
    {
      "id": "string (uuid)",
      "timestamp": "ISO 8601 timestamp",
      "action": "string (e.g., 'patient.created')",
      "resource": "string (e.g., 'patient')",
      "resourceId": "string (uuid, optional)",
      "user": {
        "id": "string",
        "name": "string",
        "email": "string"
      },
      "changes": {
        "before": {} (redacted),
        "after": {} (redacted)
      },
      "ipAddress": "string",
      "userAgent": "string",
      "metadata": {}
    }
  ],
  "total": "number"
}
```

---

### POST /api/audit/export

Export audit logs as CSV.

**Authorization**: Required (TENANT_ADMIN)

**Query Parameters**:
- `startDate`: ISO 8601 date (required)
- `endDate`: ISO 8601 date (required)
- `action`: string (optional)
- `resource`: string (optional)

**Response** (200 OK): CSV file download

**Errors**:
- 400 BAD_REQUEST: Date range exceeds 90 days or results exceed 50,000 rows

**Audit**: `audit.export`

---

## Cron Jobs

### GET /api/cron/payment-reminders

Scheduled daily (9 AM). Sends payment reminder emails for overdue charges.

**Authorization**: Requires `Authorization: Bearer {CRON_SECRET}` header

**Response** (200 OK):
```json
{
  "success": true,
  "processed": "number (count of charges)",
  "emailsSent": "number (count)"
}
```

**Notes**: Triggered automatically by Vercel Cron. No manual invocation needed.

---

### GET /api/cron/appointment-reminders

Scheduled daily (8 AM). Sends appointment reminder emails 24 hours before.

**Authorization**: Requires `Authorization: Bearer {CRON_SECRET}` header

**Response** (200 OK):
```json
{
  "success": true,
  "processed": "number (count of appointments)",
  "emailsSent": "number (count)"
}
```

---

## Journal Inbox (Staff Only)

### GET /api/v1/journal-inbox/patients

Returns patient summary with aggregated counts for the journal inbox sidebar.

**Authorization**: Required (PSYCHOLOGIST, TENANT_ADMIN)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20)

**Response** (200 OK):
```json
{
  "patients": [
    {
      "patientId": "string (uuid)",
      "fullName": "string",
      "preferredName": "string (optional)",
      "unreadCount": "number",
      "flaggedCount": "number",
      "discussCount": "number",
      "totalShared": "number",
      "lastEntryAt": "ISO 8601 timestamp (nullable)",
      "latestMoodScore": "number (1-5, nullable)"
    }
  ],
  "total": "number"
}
```

**Notes**: Uses raw SQL with PostgreSQL FILTER clauses for efficient aggregation.

**Audit**: `journal-inbox.patients.list`

---

### GET /api/v1/journal-inbox/trends

Returns time-series score data for a patient.

**Authorization**: Required (PSYCHOLOGIST, TENANT_ADMIN)

**Query Parameters**:
- `patientId`: string (uuid, required)
- `days`: number (7|30|90|365, optional, default 30)

**Response** (200 OK):
```json
{
  "patientId": "string (uuid)",
  "timeframe": "string (7|30|90|365)",
  "data": [
    {
      "date": "ISO 8601 date",
      "score": "number (1-5)",
      "count": "number (entries on that date)"
    }
  ]
}
```

**Notes**: No decryption needed — scores are plain integers. Safety cap: 500 data points.

**Audit**: `journal-inbox.trends.read`

---

### POST /api/v1/journal-inbox/[id]/notes

Create a therapist private note on a journal entry.

**Authorization**: Required (PSYCHOLOGIST)

**URL Parameters**:
- `id`: string (uuid, journal entry ID)

**Request Body**:
```json
{
  "noteText": "string (required, min 1 character)"
}
```

**Response** (201 CREATED):
```json
{
  "id": "string (uuid)",
  "journalEntryId": "string (uuid)",
  "authorId": "string (uuid)",
  "authorName": "string",
  "noteText": "string (plaintext)",
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp"
}
```

**Errors**:
- 404 NOT_FOUND: Journal entry not found
- 400 BAD_REQUEST: Empty noteText

**Notes**: Encrypted at rest. Returns plaintext version. Only author can delete.

**Audit**: `journal-inbox.notes.created`

---

### GET /api/v1/journal-inbox/[id]/notes

List therapist notes for a journal entry.

**Authorization**: Required (PSYCHOLOGIST)

**URL Parameters**:
- `id`: string (uuid, journal entry ID)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 50)

**Response** (200 OK):
```json
{
  "journalEntryId": "string (uuid)",
  "notes": [
    {
      "id": "string (uuid)",
      "authorId": "string (uuid)",
      "authorName": "string",
      "noteText": "string (decrypted)",
      "createdAt": "ISO 8601 timestamp",
      "updatedAt": "ISO 8601 timestamp"
    }
  ],
  "total": "number"
}
```

**Errors**:
- 404 NOT_FOUND: Journal entry not found

**Notes**: Returns decrypted notes with author info.

**Audit**: `journal-inbox.notes.listed`

---

### DELETE /api/v1/journal-inbox/notes/[noteId]

Soft-delete a therapist note.

**Authorization**: Required (PSYCHOLOGIST)

**URL Parameters**:
- `noteId`: string (uuid)

**Response** (200 OK):
```json
{
  "id": "string (uuid)",
  "deletedAt": "ISO 8601 timestamp"
}
```

**Errors**:
- 404 NOT_FOUND: Note not found
- 403 FORBIDDEN: Not the note author

**Notes**: Only the note author can delete. Uses soft-delete via `deletedAt` field.

**Audit**: `journal-inbox.notes.deleted`

---

## Patient Portal

### POST /api/portal/auth/magic-link

Request magic link for patient portal access.

**Authorization**: None (public)

**Request Body**:
```json
{
  "email": "string (email format)"
}
```

**Response** (200 OK):
```json
{
  "message": "Magic link sent to email",
  "expiresIn": "number (seconds, 24 hours)"
}
```

**Errors**:
- 400 BAD_REQUEST: Invalid email format

**Notes**: Email sent even if patient not found (prevents user enumeration).

---

### POST /api/portal/auth/verify

Verify magic link and establish session.

**Authorization**: None (public)

**Request Body**:
```json
{
  "token": "string (from email link)"
}
```

**Response** (200 OK):
```json
{
  "sessionToken": "string (JWT, 30-day expiry)",
  "patient": {
    "id": "string",
    "name": "string",
    "email": "string"
  }
}
```

**Errors**:
- 400 BAD_REQUEST: Invalid or expired token
- 404 NOT_FOUND: Patient not found

**Audit**: `portal.login`

---

### GET /api/portal/dashboard

Get patient portal dashboard data.

**Authorization**: Required (patient portal JWT)

**Response** (200 OK):
```json
{
  "patient": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string (optional)"
  },
  "nextAppointment": {
    "id": "string",
    "date": "ISO 8601 timestamp",
    "psychologistName": "string",
    "psychologistPhone": "string (optional)"
  } (nullable),
  "pendingCharges": [
    {
      "id": "string",
      "amount": "string (e.g., 'R$ 150,00')",
      "dueDate": "ISO 8601 date",
      "daysOverdue": "number"
    }
  ],
  "recentJournalEntries": [
    {
      "id": "string",
      "date": "ISO 8601 date",
      "mood": "number (1-10)",
      "summary": "string (first 100 chars)"
    }
  ],
  "unreadNotificationsCount": "number"
}
```

---

### GET /api/portal/appointments

Get patient's appointments (past and upcoming).

**Authorization**: Required (patient portal JWT)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `status`: UPCOMING|PAST (optional)

**Response** (200 OK):
```json
[
  {
    "id": "string",
    "date": "ISO 8601 timestamp",
    "psychologistName": "string",
    "psychologistPhone": "string (optional)",
    "notes": "string (optional)",
    "status": "SCHEDULED|CONFIRMED|COMPLETED|CANCELED|NO_SHOW",
    "joinLink": "string (video link, if applicable)"
  }
]
```

---

### GET /api/portal/charges

Get patient's charges (billing history).

**Authorization**: Required (patient portal JWT)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `status`: PENDING|OVERDUE|PAID (optional)

**Response** (200 OK):
```json
[
  {
    "id": "string",
    "amount": "string (e.g., 'R$ 150,00')",
    "status": "PENDING|OVERDUE|PAID",
    "dueDate": "ISO 8601 date",
    "paidDate": "ISO 8601 date (nullable)",
    "daysOverdue": "number"
  }
]
```

---

### POST /api/portal/journal

Create journal entry.

**Authorization**: Required (patient portal JWT)

**Request Body**:
```json
{
  "date": "ISO 8601 date (optional, defaults to today)",
  "mood": "number (1-10, optional)",
  "anxiety": "number (1-10, optional)",
  "energy": "number (1-10, optional)",
  "sleep": "number (1-10, optional)",
  "emotionTags": ["string"] (optional),
  "noteText": "string (optional, max 5000 chars)",
  "visibility": "PRIVATE|SHARED|DRAFT (default DRAFT)"
}
```

**Response** (201 CREATED):
```json
{
  "id": "string",
  "date": "ISO 8601 date",
  "mood": "number",
  "anxiety": "number",
  "energy": "number",
  "sleep": "number",
  "emotionTags": ["string"],
  "noteText": "string (encrypted in transit)",
  "visibility": "string",
  "crisisDetected": "boolean",
  "createdAt": "ISO 8601 timestamp"
}
```

**Errors**:
- 400 BAD_REQUEST: Invalid input

**Notes**: Crisis detection runs on noteText (Portuguese keywords). If detected, alert sent to psychologist.

**Audit**: `journal_entry.created`

---

### GET /api/portal/journal

List patient's journal entries.

**Authorization**: Required (patient portal JWT)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `visibility`: PRIVATE|SHARED|DRAFT (optional)
- `startDate`: ISO 8601 date (optional)
- `endDate`: ISO 8601 date (optional)

**Response** (200 OK):
```json
[
  {
    "id": "string",
    "date": "ISO 8601 date",
    "mood": "number (1-10)",
    "anxiety": "number (1-10)",
    "energy": "number (1-10)",
    "sleep": "number (1-10)",
    "emotionTags": ["string"],
    "visibility": "string",
    "summary": "string (first 200 chars)",
    "updatedAt": "ISO 8601 timestamp"
  }
]
```

---

### PATCH /api/portal/journal/{id}

Update journal entry.

**Authorization**: Required (patient portal JWT, patient must be author)

**Request Body**: Same as POST (all fields optional)

**Response** (200 OK): Updated journal entry

**Errors**:
- 404 NOT_FOUND: Entry not found
- 403 FORBIDDEN: Not author of entry

**Audit**: `journal_entry.updated`

---

### DELETE /api/portal/journal/{id}

Delete journal entry (soft delete).

**Authorization**: Required (patient portal JWT, patient must be author)

**Response** (200 OK): Entry with deletedAt timestamp

**Audit**: `journal_entry.deleted`

---

### GET /api/portal/notifications

List patient's notifications.

**Authorization**: Required (patient portal JWT)

**Query Parameters**:
- `skip`: number (default 0)
- `take`: number (default 20, max 100)
- `read`: boolean (optional, filter by read status)
- `type`: string (optional, filter by type: appointment, payment, session_shared, system)

**Response** (200 OK):
```json
[
  {
    "id": "string",
    "type": "string",
    "title": "string",
    "message": "string",
    "read": "boolean",
    "createdAt": "ISO 8601 timestamp",
    "expiresAt": "ISO 8601 timestamp (nullable)"
  }
]
```

---

### PATCH /api/portal/notifications/{id}/read

Mark notification as read (optimistic update).

**Authorization**: Required (patient portal JWT)

**Response** (200 OK):
```json
{
  "id": "string",
  "read": true,
  "readAt": "ISO 8601 timestamp"
}
```

**Errors**:
- 404 NOT_FOUND: Notification not found

**Audit**: `notification.marked_read`

---

### PATCH /api/portal/notifications/read-all

Mark all notifications as read.

**Authorization**: Required (patient portal JWT)

**Response** (200 OK):
```json
{
  "updated": "number (count)"
}
```

**Audit**: `notification.marked_all_read`

---

### GET /api/portal/consents

Get patient's current consent status.

**Authorization**: Required (patient portal JWT)

**Response** (200 OK):
```json
{
  "TERMS_OF_USE": {
    "given": "boolean",
    "grantedAt": "ISO 8601 timestamp (nullable)",
    "revokedAt": "ISO 8601 timestamp (nullable)"
  },
  "PRIVACY_POLICY": {},
  "DATA_SHARING": {},
  "JOURNAL_SHARING": {}
}
```

---

### POST /api/portal/consents/{type}/grant

Grant consent for specific type.

**Authorization**: Required (patient portal JWT)

**Path Parameters**:
- `type`: TERMS_OF_USE|PRIVACY_POLICY|DATA_SHARING|JOURNAL_SHARING

**Response** (200 OK):
```json
{
  "type": "string",
  "given": true,
  "grantedAt": "ISO 8601 timestamp"
}
```

**Audit**: `consent.granted`

---

### POST /api/portal/consents/{type}/revoke

Revoke consent.

**Authorization**: Required (patient portal JWT)

**Path Parameters**:
- `type`: TERMS_OF_USE|PRIVACY_POLICY|DATA_SHARING|JOURNAL_SHARING

**Response** (200 OK):
```json
{
  "type": "string",
  "given": false,
  "revokedAt": "ISO 8601 timestamp"
}
```

**Audit**: `consent.revoked`

---

### GET /api/portal/profile

Get patient's portal profile.

**Authorization**: Required (patient portal JWT)

**Response** (200 OK):
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "phone": "string (optional)",
  "birthDate": "ISO 8601 date (optional)",
  "address": "string (optional)",
  "timezone": "string (IANA format)",
  "preferences": {
    "emailNotifications": {
      "appointments": "boolean",
      "payments": "boolean"
    }
  }
}
```

---

### PATCH /api/portal/profile

Update patient's portal profile.

**Authorization**: Required (patient portal JWT)

**Request Body**:
```json
{
  "name": "string (optional)",
  "phone": "string (optional)",
  "birthDate": "ISO 8601 date (optional)",
  "address": "string (optional)",
  "timezone": "string (optional)",
  "preferences": {
    "emailNotifications": {
      "appointments": "boolean (optional)",
      "payments": "boolean (optional)"
    }
  } (optional)
}
```

**Response** (200 OK): Updated profile

**Audit**: `portal.profile_updated`

---

## Health & Monitoring

### GET /api/health

Health check endpoint (for monitoring and deployment verification).

**Authorization**: None (public)

**Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "ISO 8601 timestamp",
  "database": "connected|disconnected",
  "version": "string (app version)"
}
```

---

## Error Codes Reference

### Standard HTTP Status Codes

- **200 OK**: Successful GET, PATCH, DELETE
- **201 CREATED**: Successful POST
- **204 NO_CONTENT**: Successful DELETE (sometimes used)
- **400 BAD_REQUEST**: Invalid input, validation error
- **401 UNAUTHORIZED**: Missing or invalid authentication
- **403 FORBIDDEN**: Authenticated but lacks permission
- **404 NOT_FOUND**: Resource not found
- **409 CONFLICT**: Conflict (duplicate, scheduling conflict, already exists)
- **422 UNPROCESSABLE_ENTITY**: Semantic error (e.g., invalid status transition)
- **429 TOO_MANY_REQUESTS**: Rate limited
- **500 INTERNAL_SERVER_ERROR**: Unexpected server error
- **503 SERVICE_UNAVAILABLE**: Service temporarily down

### API-Specific Error Codes

- **VALIDATION_ERROR**: Zod schema validation failed
- **AUTHENTICATION_REQUIRED**: No valid session/JWT
- **PERMISSION_DENIED**: Role/permission mismatch
- **RESOURCE_NOT_FOUND**: Record doesn't exist
- **CONFLICT**: Scheduling conflict, duplicate entry
- **INVALID_STATE_TRANSITION**: Cannot move between statuses
- **RATE_LIMITED**: Exceeded rate limit
- **DATABASE_ERROR**: Unexpected database operation failure
- **ENCRYPTION_ERROR**: Encryption/decryption failed
- **FILE_TOO_LARGE**: File exceeds 25 MB limit
- **INVALID_MIME_TYPE**: Magic-byte validation failed
- **INTERNAL_SERVER_ERROR**: Unexpected error

### Example Error Response

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Appointment conflicts with existing booking",
    "details": {
      "conflictingAppointmentId": "uuid",
      "requestedTime": "ISO 8601 timestamp"
    }
  }
}
```

---

## Rate Limiting

All API endpoints (except public auth endpoints) are rate limited using sliding window algorithm:

- **Default**: 60 requests per minute per user
- **Auth endpoints**: 5 attempts per 15 minutes
- **Download endpoints**: 30 requests per hour per user

Rate limit status returned in response headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1234567890 (Unix timestamp)
Retry-After: 30 (seconds until retry)
```

---

## Authentication & Authorization

### JWT Bearer Token

All requests (except public endpoints) require JWT in Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Token includes:
- `sub`: User ID
- `email`: User email
- `role`: User role (SUPERADMIN, TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY)
- `tenantId`: Tenant ID
- `permissions`: Array of permission codes
- `exp`: Expiration time (30 days from login)
- `iat`: Issued at time

### Portal JWT

Patient portal uses separate JWT:
- Same structure as staff JWT
- Missing: role, permissions (all portal users have same permissions)
- Includes: `patientId` instead of `userId`
- Expiration: 30 days

---

## Common Request/Response Patterns

### Pagination

All list endpoints support pagination:

```
GET /api/patients?skip=0&take=20
```

Response includes pagination metadata:

```json
{
  "data": [...],
  "total": 100,
  "skip": 0,
  "take": 20,
  "pages": 5,
  "currentPage": 1
}
```

### Filtering

Multiple filter formats supported:

```
GET /api/appointments?status=SCHEDULED&psychologistId=uuid&startDate=2026-01-01
GET /api/charges?patientId=uuid&status=PENDING,OVERDUE
GET /api/audit?action=patient.created&startDate=2025-12-01&endDate=2026-01-01
```

### Sorting

```
GET /api/charges?sortBy=dueDate&sortOrder=asc
GET /api/patients?sortBy=name&sortOrder=asc
```

### Search

Full-text search on searchable endpoints:

```
GET /api/patients/search?q=João&limit=10
GET /api/audit?search=session.created
```

---

## Webhook Events (Future)

Currently not implemented. Planned webhooks for future releases:

- `appointment.created`, `appointment.confirmed`, `appointment.completed`, `appointment.cancelled`
- `charge.created`, `charge.paid`, `charge.overdue`
- `session.created`, `session.updated`
- `patient.journal.entry_created`
- `patient.created`, `patient.updated`

Webhook signature verification will use HMAC-SHA256.
