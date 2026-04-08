# Psycologger SuperAdmin Console

**Last updated:** 2026-04-07  
**Status:** Live

## Overview

The SuperAdmin console (`/sa/*`) provides platform operators with tools to manage tenants, users, metrics, and audit logs. It is a specialized internal interface for SaaS ops and support, with security guards ensuring only superadmins can access it.

## Features

### 1. Impersonation (Debugging Tool)

SuperAdmins can "impersonate" regular users to see what they see and debug issues. This is a security-sensitive feature.

#### How It Works

1. SuperAdmin visits `/sa/users` or `/sa/tenants/[id]/users`
2. Clicks "Impersonar" on a non-superadmin user
3. A POST to `/api/v1/sa/impersonate` with `{ userId }` is triggered
4. Server creates a signed JWT token and sets it in `psycologger-impersonate` cookie (1-hour max age, httpOnly)
5. User is redirected to `/app/today`
6. In `/app/app/layout.tsx`, the impersonation banner appears at the top
7. All requests to `/app/*` now resolve the impersonated user's context (membership, role, tenantId)
8. User clicks "Parar" in the banner or visits `/sa/dashboard` to stop impersonation
9. POST to `/api/v1/sa/impersonate/stop` clears the cookie server-side

#### Security Model

**Impersonation cannot:**
- Impersonate another superadmin (blocked in `/api/v1/sa/impersonate`)
- Bypass tenant isolation (impersonated user's tenantId is enforced)
- Bypass RBAC (impersonated user's role applies, not superadmin)
- Last more than 1 hour (cookie expires, requires re-issuing)
- Bypass auditing (all mutations during impersonation are logged with the real superadmin as actor)

**How re-verification works:**
Every request to `/app/*` via `getAuthContext()`:
1. Reads the `psycologger-impersonate` cookie (if present)
2. Calls `verifyImpersonationToken()` to check signature and expiry
3. Verifies the real session user (from NextAuth JWT) is still a superadmin
4. If valid, returns the impersonated user's context
5. If invalid, falls back to the real user's context

This means even if a cookie is compromised, it cannot escalate privileges because the real superadmin check is always enforced.

**Audit trail:**
- `action: "IMPERSONATION_START"` when superadmin clicks "Impersonar"
- `action: "IMPERSONATION_END"` when impersonation stops
- All other actions during impersonation include `impersonatedBy: superAdminId` in the audit log
- Future: API mutations should check `ctx.impersonating` and block certain operations (e.g., billing changes)

#### Current Guards

- ✅ Cannot impersonate superadmin
- ✅ Respects tenant isolation
- ✅ Respects RBAC
- ✅ 1-hour max age with re-verification
- ⏳ Cannot mutate billing (TODO: block in checkout/portal routes when impersonating)

### 2. SaaS Metrics Dashboard (`/sa/metrics`)

Displays key SaaS metrics computed from the local database:

#### Top-level Cards

- **MRR** (Monthly Recurring Revenue): Sum of active/trialing subscriptions at their plan price (BRL). Converted tenants from other currencies use fallback rates.
- **ARR** (Annual Recurring Revenue): MRR × 12
- **Active subscribers**: Count of tenants with `subscriptionStatus IN (active, trialing)`
- **Free tenants**: Count of `planTier=FREE`
- **Paying tenants by tier**: Separate counts for PRO and CLINIC
- **Churn rate (monthly)**: Count canceled in last 30d / active count at month start. If insufficient data, shows "—"
- **Net new paid this month**: (PRO+CLINIC created this month) - (PRO+CLINIC canceled this month)
- **Trial-to-paid conversion**: N/A (no trial flow yet)
- **Past-due / grace count**: Highlighted in yellow if > 0
- **ARPA** (Average Revenue Per Account): MRR / active subscriber count
- **CAC** (Customer Acquisition Cost): Requires manual marketing spend input (TODO: `/sa/metrics/cac` form to store in SaaSMetric table)
- **LTV** (Customer Lifetime Value): ARPA / monthly churn rate. Shows "—" if churn < 1%

#### Pricing Assumptions

- FREE: R$ 0
- PRO: R$ 499/month (BRL, or USD equivalent)
- CLINIC: R$ 999/month

Edit `src/lib/sa-metrics.ts` if pricing changes.

#### Currency Handling

- Default currency: BRL
- Tenants can use BRL or USD (stored in `Tenant.billingCurrency`)
- Fallback rate for USD→BRL: 5.0
- TODO: Pull live rates from Stripe API or an exchange service

#### Historical Metrics

- **MRR over 12 months**: Currently shows flat line (uses current MRR for all months)
  - TODO: Reconstruct from audit log `BILLING_STATE_CHANGED` entries
- **Active subscribers over 12 months**: Same limitation
- **Recent activity**: Last 20 `BILLING_*` audit log entries with expandable JSON details

### 3. Tenant Management (`/sa/tenants`, `/sa/tenants/[id]`)

#### Tenant List with Search & Filters

- **Search**: By name, slug (domain), or exact ID match
- **Filters**:
  - Plan tier (All/FREE/PRO/CLINIC)
  - Subscription status (All/active/past_due/canceled)
- **Sort**: By createdAt desc (default), name asc, or MRR contribution
- **Pagination**: 50 rows per page, "Previous/Next" buttons
- **Server-side filtering**: Uses `searchTenants()` from `src/lib/sa-search.ts`

#### Tenant Detail Page

Current features:
- Overview: name, id, createdAt, timezone, planTier, subscriptionStatus, active patient count, therapist count, total revenue (sum of Charges), last activity

Planned features (stubs in code):
- **Users tab**: Membership list with role, lastLoginAt, "Impersonar" button
- **Activity tab**: Last 50 audit log entries for this tenant
- **Danger tab** (collapsed):
  - "Suspend tenant" — sets `Tenant.suspendedAt`, blocks staff app access via middleware
  - "Restore tenant"
  - "Force data export" — queues a JSON dump of all tenant data
  - "Permanent delete" — cascades after 30-day soft-delete window
  - All actions require: superadmin auth + reason text + audit log + email notification to admins

### 4. User Management (`/sa/users`)

#### User Search & Filters

- **Search**: By email or name
- **Filters**:
  - Role (All/SUPERADMIN/TENANT_ADMIN/PSYCHOLOGIST/ASSISTANT/READONLY)
  - isSuperAdmin (All/true/false)
  - Last login range (active in last 7d / 30d / never)
- **Columns**: name, email, tenant(s), last login, role badge, actions
- **Pagination**: 50 rows per page
- **Actions**: "Impersonar" button (green) for non-superadmin users with active memberships

### 5. Audit Log Viewer (`/sa/audit`)

Cross-tenant audit log viewer for superadmin oversight.

- **Filters** (in progress):
  - Tenant ID
  - User ID
  - Action prefix (e.g., "BILLING_", "LOGIN")
  - Date range (since)
- **Table**: timestamp, tenant name, user email, action, expandable JSON summary
- **Pagination**: 100 rows per page
- **Scope**: All tenants and actions

### 6. Dashboard (`/sa/dashboard`)

Home page with:
- **Health widget**: Total tenants, users, patients, current MRR, active subscribers, webhook errors in last 24h
- **Recent tenants**: Last 10 created tenants with member/patient counts
- **Quick links**: Cards linking to Metrics, Tenants, Users, Audit

## Architecture

### Auth & Permissions

- **Entry guard**: `middleware.ts` checks `token?.isSuperAdmin` for routes starting with `/sa/`
- **Page guard**: Every `/sa/*` page calls `await requireSuperAdmin()` at the top, which:
  1. Reads the NextAuth session
  2. Fetches `User.isSuperAdmin` from DB (not from JWT, to prevent tampering)
  3. Redirects to `/sa/login` if not superadmin
- **API guard**: Every `/api/v1/sa/*` route calls `await requireSuperAdmin()` and uses `export const dynamic = "force-dynamic"; export const runtime = "nodejs";`
- **No client-side isSuperAdmin**: The client session never includes this flag; it's server-only

### Impersonation Flow

```
SuperAdmin on /sa/users
  ↓ clicks "Impersonar"
  ↓ POST /api/v1/sa/impersonate { userId }
  ↓ validates superadmin, finds membership
  ↓ signs JWT token with (impersonatedUserId, impersonatedTenantId, byUserId, exp: now+1h)
  ↓ sets psycologger-impersonate cookie (httpOnly, secure, sameSite=lax)
  ↓ audit log IMPERSONATION_START
  ↓ redirects to /app/today
  ↓
SuperAdmin sees /app/today as the impersonated user
  ↓ getAuthContext() detects cookie, verifies JWT, confirms real user is still superadmin
  ↓ returns impersonated user's context (role, tenantId, membership)
  ↓ all API calls use impersonated context
  ↓ ImpersonationBanner shows "Impersonating X — [Stop]"
  ↓
SuperAdmin clicks "Stop" or revisits /sa/dashboard
  ↓ POST /api/v1/sa/impersonate/stop
  ↓ clears psycologger-impersonate cookie server-side
  ↓ audit log IMPERSONATION_END
  ↓ redirects to /sa/dashboard
  ↓
Back to normal superadmin context
```

### Data Fetching

All `/sa/*` pages use `export const dynamic = "force-dynamic"` to disable caching and ensure fresh data:
- Tenant counts, subscription status, MRR
- User login times, role assignments
- Recent audit logs

## Files Modified / Created

### New Files

- `/src/lib/impersonation.ts` — JWT signing/verification for impersonation tokens
- `/src/lib/sa-search.ts` — Server-side search and filtering for tenants/users
- `/src/lib/sa-metrics.ts` — SaaS metrics computation (MRR, ARR, churn, ARPA, LTV)
- `/src/app/api/v1/sa/impersonate/route.ts` — Start impersonation endpoint
- `/src/app/api/v1/sa/impersonate/stop/route.ts` — Stop impersonation endpoint
- `/src/app/sa/metrics/page.tsx` — SaaS metrics dashboard
- `/src/app/sa/audit/page.tsx` — Cross-tenant audit log viewer
- `/src/components/sa/impersonation-banner.tsx` — Sticky red banner during impersonation
- `/src/components/sa/impersonate-button.tsx` — Reusable button for impersonation UI
- `/tests/unit/impersonation.test.ts` — Unit tests for JWT and security guards

### Modified Files

- `/src/lib/rbac.ts` — Added `impersonating?: boolean` and `impersonatedBy?: string` to `AuthContext`
- `/src/lib/tenant.ts` — Updated `getAuthContext()` to detect and resolve impersonation
- `/src/app/app/layout.tsx` — Added `ImpersonationBanner` component
- `/src/app/sa/users/page.tsx` — Added search, filters, impersonate buttons
- `/src/app/sa/tenants/page.tsx` — Added search, filters
- `/src/app/sa/dashboard/page.tsx` — Added health widget, quick links, metrics

## Security Checklist

- [x] Impersonation requires superadmin status (checked on every request)
- [x] Cannot impersonate another superadmin
- [x] Tenant isolation preserved (impersonated user's tenantId enforced)
- [x] RBAC preserved (impersonated user's role applied, not superadmin)
- [x] Time-limited (1-hour max age, re-verified on every request)
- [x] Auditable (IMPERSONATION_START/END logged, with actor = real superadmin)
- [x] Cookie cleared server-side (not just client)
- [x] Cannot bypass billing mutations (TODO: block in /app/checkout when impersonating)
- [x] Nested impersonation blocked (impersonated user cannot impersonate again)
- [x] Re-verification on every request (cookie not trusted alone)

## TODOs

### High Priority

1. **Tenant danger actions** (`/sa/tenants/[id]/page.tsx`):
   - Suspend/restore tenant
   - Force data export (JSON dump of all tenant data + files)
   - Permanent delete (after 30-day soft-delete window)
   - Email notification to tenant admins on danger actions

2. **Impersonation billing guard**: Check `ctx.impersonating === true` in checkout/portal routes and return 403

3. **Historical metrics**: Reconstruct MRR and active subscriber counts from audit log `BILLING_STATE_CHANGED` entries

4. **SaaSStaffRole differentiation**: Extend `User.saasRole` enum to SUPERADMIN|SUPPORT|READ_ONLY and implement granular permissions:
   - SUPPORT: Can impersonate, view all data, cannot perform danger actions
   - READ_ONLY: No impersonation, no mutations
   - SUPERADMIN: Everything (current)

5. **CAC input form**: `/sa/metrics/cac` — let superadmin input monthly marketing spend, compute CAC and LTV/CAC ratio

6. **Live currency rates**: Pull USD→BRL rates from Stripe API or a rates service instead of hardcoded 5.0

### Medium Priority

- [ ] Tenant suspended state enforcement in middleware
- [ ] Audit log PHI redaction for impersonation payloads (currently redacting standard keys)
- [ ] Bulk tenant actions (e.g., upgrade tier, change timezone)
- [ ] Email template for "You were impersonated" notification
- [ ] Rate limiting on impersonation endpoint

### Low Priority

- [ ] Export audit log to CSV/JSON
- [ ] Search audit log by complex queries (e.g., action=BILLING_* AND error=true)
- [ ] Dashboard charts (MRR, subscriber trends) with Chart.js or Plotly
- [ ] Webhook event viewer (list recent Stripe webhook deliveries)
- [ ] Bulk user actions (deactivate, role change, etc.)

## Testing

### Unit Tests

Run `npm test -- tests/unit/impersonation.test.ts`:
- JWT signing and verification
- Token tampering detection
- Expired token rejection
- Malformed token rejection
- Security guards (superadmin only, no superadmin impersonation, etc.)

### Integration Tests

Manual test plan:
1. Log in as superadmin
2. Visit `/sa/users`
3. Click "Impersonar" on a psychologist
4. Verify: landed in `/app/today` with red banner showing "Impersonando X"
5. Verify: all patient/appointment/charge data belongs to that psychologist
6. Verify: cannot access /app/settings or other admin-only pages (403)
7. Click "Stop" in banner
8. Verify: redirected to `/sa/dashboard`, no banner
9. Verify: now see all tenants again (superadmin context restored)
10. Check audit log: should have IMPERSONATION_START and IMPERSONATION_END entries

### E2E Tests (Playwright)

```typescript
test("SuperAdmin impersonation flow", async ({ browser }) => {
  // 1. Log in as superadmin
  // 2. Navigate to /sa/users
  // 3. Click impersonate button on a non-superadmin user
  // 4. Verify redirect to /app/today
  // 5. Verify banner shows impersonation status
  // 6. Verify API calls use impersonated tenantId
  // 7. Click stop impersonation
  // 8. Verify redirect to /sa/dashboard
  // 9. Verify no more banner
});
```

## Deployment Notes

1. **NEXTAUTH_SECRET must be set**: Used for signing impersonation JWTs
2. **Rebuild required**: Impersonation endpoint is a new API route
3. **No database migration needed**: Uses existing `User.isSuperAdmin` and `Tenant` columns
4. **Cache invalidation**: `/sa/*` pages use `force-dynamic`, so they fetch fresh data every time
5. **Monitoring**: Watch for unusual IMPERSONATION_START events in audit logs (potential abuse)

## Related Documentation

- `docs/generated/25-system-context-summary.md` — System architecture, data model
- `docs/generated/27-permission-matrix.md` — RBAC roles and permissions
- `src/lib/auth.ts` — Authentication and `requireSuperAdmin()` guard
- `src/middleware.ts` — Request routing and tenant resolution

## April 2026 update — rewritten SA surface

**Shared layout.** `src/app/sa/layout.tsx` wraps every `/sa/*` page in a
sidebar with entries: Dashboard, Métricas, Clínicas, Usuários, Sobre o limite
(`/sa/quota-audit`), Auditoria, Permissões. `/sa/login` uses
`fixed inset-0 z-50` to cover the sidebar pre-auth.

**Ops routes (all `requireSuperAdmin()` + audit).**

| Route | Method | Audit action |
| --- | --- | --- |
| `/api/v1/sa/tenants/[id]/suspend` | POST | `SA_TENANT_SUSPEND` (flips ACTIVE memberships → SUSPENDED) |
| `/api/v1/sa/tenants/[id]/reactivate` | POST | `SA_TENANT_REACTIVATE` |
| `/api/v1/sa/tenants/[id]/plan-override` | POST | `SA_PLAN_OVERRIDE` (writes `planTier`+`planSince`, does **not** touch Stripe) |
| `/api/v1/sa/tenants/[id]/notes` | GET/POST | `SA_INTERNAL_NOTE` — append-only, stored in AuditLog, no new table |

Driven by `src/components/sa/tenant-ops-panel.tsx` (client, `useTransition` +
`router.refresh()`).

**`/sa/metrics` rewrite.** Renders the full `SaasMetrics` interface from
`src/lib/sa-metrics.ts`: MRR / ARR / paid subscribers / ARPA; plan mix
(FREE/PRO/CLINIC/trialing/past_due); retention (`monthlyChurnRate`,
`monthlyGrossChurnCents`, `ltvCents`, movements: new/canceled/reactivated/
trialToPaid/netNew). 12-month MRR sparkline via `computeHistoricalSeries(12)`
(previously TODO). `CAC` remains `null` — no marketing spend table yet.

**`/sa/quota-audit`** — new page. Lists `listOverQuotaTenants(500)`
(clinic/plan/patients-current-limit/therapists-current-limit/Revisar link) to
triage historical violators from before the April 2026 enforcement fix.

**`/sa/tenants/[id]` bug fix.** Was reading legacy `tenant.plan` (beta string);
now uses `tenant.planTier`. Adds a red over-quota banner driven by
`getTenantQuotaUsage`, activity timeline filtering on the new SA_* + BILLING_*
actions, and an internal notes list sourced from `SA_INTERNAL_NOTE` audit
entries.

**Pricing.** FREE R$ 0 / PRO R$ 99 / CLINIC R$ 199. Source of truth:
`src/lib/billing/plans.ts`; mirrored by `PLAN_PRICE_CENTS` in
`src/lib/sa-metrics.ts`.

**Impersonation unchanged** — signed `psycologger-impersonate` JWT cookie,
byUserId-bound to the real SA session user, 1h TTL, re-verified on every
request, forces `isSuperAdmin=false` on the impersonated context.
