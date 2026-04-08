# Psycologger — Complete Permission Matrix

## Staff Role Permissions

| Permission | SUPERADMIN | TENANT_ADMIN | PSYCHOLOGIST | ASSISTANT | READONLY | Notes |
|------------|-----------|--------------|--------------|-----------|----------|-------|
| **PATIENT MANAGEMENT** |
| patients:create | ✅ | ✅ | ❌ | 🔶 | ❌ | ASSISTANT can create if delegated by PSYCHOLOGIST |
| patients:read | ✅ | ✅ | 🔶 | 🔶 | ✅ | PSYCHOLOGIST/ASSISTANT see only assigned patients |
| patients:readAll | ✅ | 🔶 | ❌ | ❌ | ✅ | TENANT_ADMIN only if tenant.adminCanViewClinical=true |
| patients:update | ✅ | ✅ | 🔶 | 🔶 | ❌ | PSYCHOLOGIST/ASSISTANT update only assigned patients |
| patients:delete | ✅ | ❌ | ❌ | ❌ | ❌ | Soft-delete only; hard-delete requires SUPERADMIN |
| patients:export | ✅ | 🔶 | ❌ | ❌ | ❌ | TENANT_ADMIN only if tenant.adminCanViewClinical=true |
| **APPOINTMENT MANAGEMENT** |
| appointments:create | ✅ | ✅ | ✅ | ✅ | ❌ | PSYCHOLOGIST/ASSISTANT for assigned patients |
| appointments:read | ✅ | ✅ | ✅ | ✅ | ✅ | PSYCHOLOGIST/ASSISTANT see only assigned patients |
| appointments:readAll | ✅ | ✅ | ❌ | ❌ | ✅ | PSYCHOLOGIST/ASSISTANT cannot see other psychologists' appointments |
| appointments:update | ✅ | ✅ | ✅ | ✅ | ❌ | PSYCHOLOGIST/ASSISTANT update only assigned patients |
| appointments:delete | ✅ | ✅ | ✅ | ❌ | ❌ | ASSISTANT cannot delete (prevents schedule disruption) |
| appointments:reschedule | ✅ | ✅ | ✅ | ✅ | ❌ | PSYCHOLOGIST/ASSISTANT for assigned patients |
| appointments:viewRecurrence | ✅ | ✅ | ✅ | ✅ | ✅ | PSYCHOLOGIST/ASSISTANT see only assigned series |
| **CLINICAL SESSION MANAGEMENT** |
| sessions:create | ✅ | 🔶 | ✅ | ❌ | ❌ | TENANT_ADMIN only if tenant.adminCanViewClinical=true |
| sessions:read | ✅ | 🔶 | ✅ | ❌ | ✅ | TENANT_ADMIN only if tenant.adminCanViewClinical=true; PSYCHOLOGIST sees only own |
| sessions:readAll | ✅ | 🔶 | ❌ | ❌ | ✅ | TENANT_ADMIN only if tenant.adminCanViewClinical=true |
| sessions:update | ✅ | 🔶 | ✅ | ❌ | ❌ | TENANT_ADMIN only if tenant.adminCanViewClinical=true; PSYCHOLOGIST edits own |
| sessions:delete | ✅ | ❌ | ✅ | ❌ | ❌ | PSYCHOLOGIST soft-deletes own; SUPERADMIN hard-delete |
| sessions:viewNotes | ✅ | 🔶 | ✅ | ❌ | ❌ | TENANT_ADMIN only if tenant.adminCanViewClinical=true |
| **CHARGE & PAYMENT MANAGEMENT** |
| charges:create | ✅ | ✅ | ✅ | ❌ | ❌ | PSYCHOLOGIST creates for own patients |
| charges:read | ✅ | ✅ | ✅ | 🔶 | ✅ | ASSISTANT can view (no edit) for assigned patients |
| charges:readAll | ✅ | ✅ | ❌ | ❌ | ✅ | PSYCHOLOGIST sees only own charges |
| charges:update | ✅ | ✅ | ✅ | ❌ | ❌ | PSYCHOLOGIST updates own charges |
| charges:delete | ✅ | ❌ | ✅ | ❌ | ❌ | PSYCHOLOGIST soft-deletes own; SUPERADMIN hard-delete |
| charges:approvePartialPayment | ✅ | ✅ | ✅ | ❌ | ❌ | PSYCHOLOGIST approves own remainder charges |
| payments:create | ✅ | ✅ | ✅ | 🔶 | ❌ | ASSISTANT can record if delegated |
| payments:read | ✅ | ✅ | ✅ | ✅ | ✅ | ASSISTANT views only assigned patients |
| **FILES & DOCUMENTS** |
| files:upload | ✅ | ✅ | ✅ | 🔶 | ❌ | ASSISTANT can upload if delegated; magic byte validation required |
| files:read | ✅ | 🔶 | ✅ | 🔶 | ✅ | TENANT_ADMIN only if tenant.adminCanViewClinical=true; others see own uploads |
| files:download | ✅ | 🔶 | ✅ | ✅ | ❌ | TENANT_ADMIN only if tenant.adminCanViewClinical=true; others download own |
| files:downloadClinical | ✅ | 🔶 | ✅ | ❌ | ❌ | TENANT_ADMIN only if tenant.adminCanViewClinical=true |
| files:delete | ✅ | ✅ | ✅ | ❌ | ❌ | PSYCHOLOGIST deletes own; TENANT_ADMIN deletes all |
| files:viewMetadata | ✅ | ✅ | ✅ | ✅ | ✅ | All staff can view file metadata |
| **STAFF & TENANT MANAGEMENT** |
| staff:create | ✅ | ✅ | ❌ | ❌ | ❌ | Invite only |
| staff:read | ✅ | ✅ | ❌ | ❌ | ❌ | |
| staff:readAll | ✅ | ✅ | ❌ | ❌ | ❌ | |
| staff:update | ✅ | ✅ | ❌ | ❌ | ❌ | Cannot elevate own role |
| staff:deactivate | ✅ | ✅ | ❌ | ❌ | ❌ | Soft-deactivate only |
| staff:delete | ✅ | ❌ | ❌ | ❌ | ❌ | Hard-delete SUPERADMIN only |
| tenant:read | ✅ | ✅ | ❌ | ❌ | ❌ | |
| tenant:update | ✅ | ✅ | ❌ | ❌ | ❌ | TENANT_ADMIN cannot change billing |
| tenant:updateSettings | ✅ | ✅ | ❌ | ❌ | ❌ | Feature flags: adminCanViewClinical, portalJournalEnabled, portalRescheduleEnabled |
| tenant:delete | ✅ | ❌ | ❌ | ❌ | ❌ | SUPERADMIN only; cascades to all data |
| **AUDIT & COMPLIANCE** |
| auditLogs:read | ✅ | ✅ | 🔶 | ❌ | ❌ | PSYCHOLOGIST views own actions only |
| auditLogs:readAll | ✅ | ✅ | ❌ | ❌ | ❌ | |
| auditLogs:export | ✅ | ✅ | ❌ | ❌ | ❌ | CSV export with PHI redaction |
| **ENCRYPTION & SECURITY** |
| encryption:rotateKey | ✅ | ❌ | ❌ | ❌ | ❌ | SUPERADMIN only |
| encryption:viewKeyStatus | ✅ | 🔶 | ❌ | ❌ | ❌ | TENANT_ADMIN views own tenant keys only |

## Patient Portal Permissions

### What Patients Can Do (Portal-Specific Access)

| Action | Allowed | Notes |
|--------|---------|-------|
| **View Own Data** |
| View own appointments | ✅ | Shows upcoming and past; displays psychologist name, date, time, status |
| View appointment details | ✅ | Includes location, notes if shared by psychologist |
| View own charges | ✅ | Shows amount, due date, payment status, balance |
| View payment history | ✅ | All payments applied to own charges |
| View own journal entries | ✅ | If portalJournalEnabled=true; encrypted on server |
| **Manage Own Data** |
| Create journal entry | ✅ | If portalJournalEnabled=true; automatically encrypted |
| Edit journal entry | ✅ | Own entries only; before psychologist views (optional) |
| Delete journal entry | ✅ | Own entries only |
| Cancel appointment | ✅ (with conditions) | If portalRescheduleEnabled=true and >= 24h before appointment |
| Reschedule appointment | ✅ (with conditions) | If portalRescheduleEnabled=true; from available slots |
| **Consent & Privacy** |
| View own consents | ✅ | Shows consent type, date given, expiry |
| Grant portal access consent | ✅ | Required to enable portal account |
| Revoke consent | ✅ | Can revoke specific consent types if allowed |
| Download own data (LGPD) | 🔶 | If LGPD data export enabled by tenant |
| Request data deletion | ✅ | Triggers LGPD data subject access request (DSAR) |
| **Notifications & Preferences** |
| View notification preferences | ✅ | Email reminders, appointment reminders, journal prompts |
| Update notification settings | ✅ | Toggle email categories |
| View notification history | ✅ | See reminders sent (if feature enabled) |
| **What Patients CANNOT Do** |
| Access other patient data | ❌ | Portal is single-patient scoped |
| View clinical notes (unless shared) | ❌ | Psychologist controls note visibility |
| Create/edit appointments | ❌ | Can only cancel/reschedule |
| Make payments directly | ❌ | Charges are view-only; payment via email/bank |
| Manage account (other users) | ❌ | Each patient has own portal login |
| Access staff features | ❌ | No staff role elevation |
| View other patients' charges | ❌ | Portal is single-patient scoped |

## Conditional Permissions Explained

### TENANT_ADMIN with `adminCanViewClinical` Flag

When `Tenant.adminCanViewClinical = true`, TENANT_ADMIN gains clinical access:
- ✅ Can create/read/update/delete `SessionRecord` (clinical notes)
- ✅ Can read all `PatientProfile` medical history
- ✅ Can download clinical files
- ✅ Can read appointment notes
- Can **audit psychologist compliance** but does not participate in clinical care

When `Tenant.adminCanViewClinical = false` (default):
- ❌ Cannot create/read clinical notes
- ❌ Cannot read medical history
- ❌ Can only manage staff, billing, and infrastructure

### PSYCHOLOGIST & ASSISTANT Scope

Both roles are **scoped to assigned patients**:
- `PSYCHOLOGIST` can see only patients assigned to them (relation: `psychologists` array in `PatientProfile`)
- `ASSISTANT` can see only patients assigned to their supervising `PSYCHOLOGIST`
- Cannot view other psychologists' patients, sessions, or charges
- Exception: TENANT_ADMIN with `adminCanViewClinical=true` can override this

### ASSISTANT Delegation Pattern

Some ASSISTANT permissions are delegated by PSYCHOLOGIST:
- ✅ patients:create — ASSISTANT creates new patient under supervision
- ✅ appointments:create/update — ASSISTANT schedules on behalf of PSYCHOLOGIST
- ✅ files:upload — ASSISTANT uploads session notes on behalf of PSYCHOLOGIST
- ✅ payments:create — ASSISTANT records payment on behalf of PSYCHOLOGIST

Delegation is implicit (role-based) not explicit (per-record). All ASSISTANT work appears in audit logs under ASSISTANT's user ID.

### Portal Feature Flags

Patient portal permissions depend on tenant settings:

| Feature | Flag | Impact |
|---------|------|--------|
| Journal access | `portalJournalEnabled` | Patients can create/view/edit encrypted journal entries |
| Appointment cancellation | `portalRescheduleEnabled` | Patients can cancel/reschedule with 24h notice |
| Data export | `portalDataExportEnabled` (future) | Patients can download own data in CSV/JSON |

## Permission Enforcement Points

### Every API Route Must Check

```typescript
// 1. Is user authenticated?
const user = await getCurrentUser();
if (!user) return 401;

// 2. Is user allowed this action?
await ensurePermission(user, 'resource:action');
// e.g. 'sessions:create', 'charges:read', 'staff:delete'

// 3. Is the resource in the user's tenant?
const resource = await prisma.resource.findUnique({
  where: { id: req.params.id, tenantId: user.tenantId }
});
if (!resource) return 404; // Treat as not found even if deleted

// 4. For scoped roles, is the resource assigned to this user?
if (user.role === 'PSYCHOLOGIST') {
  const isAssigned = await isPatientAssigned(resource.patientId, user.id);
  if (!isAssigned) return 403;
}
```

### Portal Routes Must Verify Consent

```typescript
// Patient portal: /api/patient/[action]
const patient = await getCurrentPatient(); // PatientAuth
if (!patient) return 401;

const consent = await prisma.patientConsent.findFirst({
  where: {
    patientId: patient.id,
    type: 'PORTAL_ACCESS',
    expiresAt: { gt: new Date() }
  }
});
if (!consent) return 403; // Access denied until consent given
```

## Summary by User Type

### SUPERADMIN
- **Scope:** All tenants, all data
- **Can:** Everything
- **Cannot:** Nothing (except cannot elevate own role)
- **Primary role:** Platform operation, troubleshooting, disaster recovery

### TENANT_ADMIN
- **Scope:** Single tenant
- **Can:** All staff management, tenant settings, billing, optionally clinical audit
- **Cannot:** Create other tenants, hard-delete data, change billing structure
- **Primary role:** Tenant operator, compliance, hiring

### PSYCHOLOGIST
- **Scope:** Own assigned patients
- **Can:** Full clinical care (appointments, sessions, charges, prescriptions)
- **Cannot:** View other psychologists' data, manage staff, tenant settings
- **Primary role:** Clinical care delivery

### ASSISTANT
- **Scope:** Own assigned patients (through supervising PSYCHOLOGIST)
- **Can:** Schedule appointments, manage basic patient info, record payments
- **Cannot:** Create/view clinical notes, manage staff, approve charges without PSYCHOLOGIST
- **Primary role:** Administrative support, scheduling

### READONLY
- **Scope:** Single tenant
- **Can:** View all data (no modifications)
- **Cannot:** Create/edit/delete anything
- **Primary role:** Auditing, business intelligence, compliance review

### PATIENT (Portal)
- **Scope:** Self only (own appointments, charges, journal)
- **Can:** View own data, cancel/reschedule appointments (if enabled), manage consents, update notification settings
- **Cannot:** Access other patient data, view clinical notes (unless shared), modify charges
- **Primary role:** Self-management, appointment coordination

## April 2026 update — SuperAdmin ops permissions

All routes below require `requireSuperAdmin()` (re-read from DB, never from
JWT). Each writes an AuditLog entry with actor userId, ipAddress, userAgent,
and reason.

| Route | Method | Audit action | Effect |
| --- | --- | --- | --- |
| `/api/v1/sa/tenants/[id]/suspend` | POST | `SA_TENANT_SUSPEND` | ACTIVE memberships → SUSPENDED |
| `/api/v1/sa/tenants/[id]/reactivate` | POST | `SA_TENANT_REACTIVATE` | reverses suspend |
| `/api/v1/sa/tenants/[id]/plan-override` | POST | `SA_PLAN_OVERRIDE` | sets `planTier`+`planSince`, does NOT touch Stripe |
| `/api/v1/sa/tenants/[id]/notes` | GET/POST | `SA_INTERNAL_NOTE` | append-only notes stored as audit entries |

Plan-limit enforcement (`assertCanAddPatient`/`assertCanAddTherapist`) is now
invoked by: `POST /api/v1/patients`, `PATCH /api/v1/patients/[id]` on
reactivation, `POST /api/v1/users` (PSYCHOLOGIST/ASSISTANT invites), and
`POST /api/v1/invites/[token]` (invite accept, re-check in case of plan
downgrade). Violations return HTTP 402 `QUOTA_EXCEEDED`.
