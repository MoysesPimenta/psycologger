# Psycologger — Stripe SaaS Billing Implementation

## Overview

Complete Stripe SaaS billing system for charging clinics (tenants) monthly subscriptions. Prices in BRL (primary) and USD. FREE tier for trials; paid tiers have 3-day grace period on payment failure.

**Date:** 2026-04-07

## Pricing Model

| Plan | Tier | Max Active Patients | Max Therapist Seats | BRL/Month | USD/Month |
|------|------|---------------------|---------------------|-----------|-----------|
| Free | FREE | 3 | 1 | 0 | 0 |
| Pro | PRO | 25 | 1 | 99 | 20 |
| Clinic | CLINIC | ∞ | 5 | 199 | 40 |

**Active patient** = Patient is `isActive: true` AND has ≥1 Appointment, ClinicalSession, Charge, or JournalEntry in the last 90 days.

## Billing State Machine

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                          FREE TIER                              │
    │  planTier = FREE → Always ACTIVE, no payment required           │
    └─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      PAID SUBSCRIPTION                          │
    │  Checkout Session created → Stripe updates tenant              │
    └─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │ subscriptionStatus=ACTIVE │
                    │   State: ACTIVE          │
                    │   Access: ✅ ALLOWED     │
                    └──────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │ Invoice payment fails       │
                    │ subscriptionStatus=past_due │
                    │ graceUntil = now + 3 days  │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ State: GRACE                │
                    │ Access: ✅ ALLOWED          │
                    │ Banner: ⚠️  shown           │
                    │ Action: Update payment     │
                    └──────────────┬──────────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │                                      │
         Payment succeeds              Grace expires
         graceUntil = null        (now > graceUntil)
                │                          │
                ▼                          ▼
         ┌──────────────┐         ┌──────────────┐
         │ State: ACTIVE│         │ State: BLOCKED│
         │ Access: ✅   │         │ Access: ❌    │
         │ Banner: ❌   │         │ Redirect to  │
         │              │         │ /billing/    │
         │              │         │ reactivate   │
         └──────────────┘         └──────────────┘
                                         │
                                 ┌───────▼────────┐
                                 │ Subscription    │
                                 │ reactivated or  │
                                 │ downgraded to   │
                                 │ FREE            │
                                 └────────────────┘
```

## Database Schema Changes

### Tenant Model Additions

```prisma
enum PlanTier {
  FREE
  PRO
  CLINIC
}

model Tenant {
  // Stripe SaaS billing
  planTier              PlanTier   @default(FREE)
  stripeCustomerId      String?    @unique
  stripeSubscriptionId  String?    @unique
  subscriptionStatus    String?    // ACTIVE, PAST_DUE, CANCELED, TRIALING, UNPAID
  currentPeriodEnd      DateTime?
  graceUntil            DateTime?  // null = no grace; set when payment fails
  billingCurrency       String     @default("BRL") // BRL or USD
  cancelAtPeriodEnd     Boolean    @default(false)
}

model StripeWebhookEvent {
  id          String   @id // Stripe event ID
  type        String   // e.g., "customer.subscription.created"
  processedAt DateTime @default(now())

  @@index([processedAt])
}
```

**Migration file:** `prisma/migrations/20260407_stripe_billing/migration.sql`

Run: `npx prisma migrate deploy` (or `npx prisma migrate dev --name stripe_billing` in dev)

## API Routes

### POST /api/v1/billing/checkout

Create a Stripe checkout session.

**Auth:** TENANT_ADMIN or SUPERADMIN

**Request Body:**
```json
{
  "tier": "PRO" | "CLINIC",
  "currency": "BRL" | "USD"
}
```

**Response:**
```json
{
  "data": {
    "url": "https://checkout.stripe.com/pay/..."
  }
}
```

**Flow:**
1. Create or retrieve Stripe Customer (persisted on Tenant)
2. Create Checkout Session with `client_reference_id = tenantId`
3. User completes payment → Stripe webhook updates Tenant
4. Redirect to `/app/billing/success` or `/app/billing/cancel`

### POST /api/v1/billing/portal

Create a Stripe billing portal session for subscription management.

**Auth:** TENANT_ADMIN or SUPERADMIN

**Request Body:** `{}`

**Response:**
```json
{
  "data": {
    "url": "https://billing.stripe.com/..."
  }
}
```

## Webhook Events

### POST /api/v1/webhooks/stripe

**Runtime:** `nodejs` (required for Stripe signature verification)

**Dynamic:** `force-dynamic`

**Headers Required:**
- `stripe-signature` (verified via `stripe.webhooks.constructEvent`)

**Idempotency:** Event ID stored in `StripeWebhookEvent`. Duplicate IDs return 200 immediately.

#### Handled Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create/update subscription, set `planTier`, `stripeSubscriptionId`, `subscriptionStatus=ACTIVE`, clear `graceUntil` |
| `customer.subscription.created` | Update Tenant with subscription details (tier from price ID) |
| `customer.subscription.updated` | Update plan tier, status, period end |
| `customer.subscription.deleted` | Downgrade to FREE, clear subscription fields |
| `invoice.payment_failed` | If first failure: set `graceUntil = now + 3 days`, `subscriptionStatus = past_due` |
| `invoice.payment_succeeded` | Clear `graceUntil`, set `subscriptionStatus = ACTIVE` |

**All state transitions audit-logged with action `BILLING_STATE_CHANGED`.**

## UI Pages

### /app/billing (Billing Dashboard)

Server component showing:
- Current plan name, limits, price
- Billing state badge (FREE, ACTIVE, GRACE, BLOCKED)
- Period end date
- "Manage Subscription" button (if active)
- "Upgrade" buttons (if FREE or PRO)
- Plan comparison table

**Access:** Available always (includes reactivate button)

### /app/billing/reactivate (Reactivation Page)

Full-screen CTA shown when state = BLOCKED.

**Features:**
- Grace period countdown (if applicable)
- Pro/Clinic upgrade buttons
- Link to /app/billing

**Special:** NOT guarded by subscription check (always accessible)

### /app/billing/success

Confirmation after successful checkout.

### /app/billing/cancel

Shown if user cancels checkout.

## Layout Guards

### /app/layout.tsx

**Checks:**
- Call `requireActiveSubscription(tenantId, isSuperAdmin)` before rendering
- If state = BLOCKED and not SUPERADMIN: redirect to `/app/billing/reactivate`
- If state = GRACE: show BillingBanner with countdown
- SUPERADMIN bypasses all checks

**Component:** `<BillingBanner state="GRACE" graceDaysLeft={3} />`

**Patient portal /portal/* routes are NEVER guarded** (always accessible).

## SuperAdmin Console

### /sa/tenants/[id]/billing

**Features:**
- View current plan, status, subscription IDs
- View Stripe customer/subscription IDs
- **Force Tier Override:** Set `planTier` directly (bypasses Stripe)
- Extend grace period (future)
- Comp charges (future)

**Audit:** Every override logged with action `BILLING_STATE_CHANGED`

## Quota Enforcement

### Patient Creation

Endpoint: `POST /api/v1/patients`

**Check (before create):** Call `assertCanAddPatient(tenantId)`
- Throws `QuotaExceededError` (402) if at plan limit
- Message: "Limite de pacientes atingido: {current}/{max}"

### Therapist Invite

Endpoint: `POST /api/v1/invites` (staff invite)

**Check (before create):** Call `assertCanAddTherapist(tenantId)`
- Throws `QuotaExceededError` (402) if at plan limit
- Only counts PSYCHOLOGIST + ASSISTANT roles with ACTIVE status

## Environment Variables

Add to `.env.local` (dev) and Vercel project settings (prod):

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_live_... (or sk_test_... for testing)
STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe Dashboard → Webhooks)

# Stripe Price IDs (from Stripe Dashboard → Products → Prices)
STRIPE_PRICE_PRO_BRL=price_... (99 BRL/month)
STRIPE_PRICE_PRO_USD=price_... (20 USD/month)
STRIPE_PRICE_CLINIC_BRL=price_... (199 BRL/month)
STRIPE_PRICE_CLINIC_USD=price_... (40 USD/month)

# App URLs
NEXT_PUBLIC_APP_URL=https://psycologger.com (for success/cancel redirects)
```

## Stripe Dashboard Setup Checklist

### 1. Create Products & Prices

**For each plan (PRO, CLINIC):**

- [ ] Dashboard → Products → Create
- [ ] **Product Name:** "Psycologger Pro" or "Psycologger Clinic"
- [ ] **Pricing Model:** Recurring
- [ ] Create Price:
  - [ ] **Currency:** BRL
  - [ ] **Recurring:** Monthly
  - [ ] **Amount:** 99.00 BRL (Pro) or 199.00 BRL (Clinic)
  - [ ] Copy Price ID → Add to env var `STRIPE_PRICE_PRO_BRL` etc.
  - [ ] **Repeat for USD** (20 USD or 40 USD)

### 2. Create Webhook Endpoint

- [ ] Dashboard → Developers → Webhooks
- [ ] Click **Add Endpoint**
- [ ] **URL:** `https://psycologger.com/api/v1/webhooks/stripe`
- [ ] **Events to receive:**
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.created`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.payment_failed`
  - [ ] `invoice.payment_succeeded`
- [ ] Copy **Signing Secret** → Add to env var `STRIPE_WEBHOOK_SECRET`

### 3. Configure Customer Portal

- [ ] Dashboard → Settings → Billing Portal
- [ ] **Enable Billing Portal**
- [ ] **Allowed Features:**
  - [ ] Update Payment Method
  - [ ] Update Billing Address
  - [ ] View Invoices
  - [ ] Download Invoices
  - [ ] Cancel Subscriptions (optional — set per your policy)

### 4. Test Mode

- [ ] Use **Test API Keys** (sk_test_...)
- [ ] Test Card: `4242 4242 4242 4242`, any future expiry, any CVC
- [ ] Test failed payment: `4000 0000 0000 0002` (declines)

## Testing Workflow

### End-to-End: Checkout & Subscription

1. **Create tenant in FREE tier** (default)
2. **Click "Upgrade to Pro"** → `/api/v1/billing/checkout` POST
3. **Redirected to Stripe checkout** with test card
4. **Enter test card `4242 4242 4242 4242`**
5. **Webhook received:** `checkout.session.completed` → Tenant updated
6. **Redirect to `/app/billing/success`**
7. **Verify tenant:** `planTier=PRO`, `stripeSubscriptionId`, `subscriptionStatus=ACTIVE`

### Test Payment Failure (Grace Period)

1. **Use failed test card:** `4000 0000 0000 0002`
2. **Next billing cycle (in production) or manual webhook simulation (local testing):**
   - Stripe sends `invoice.payment_failed`
3. **Webhook handler:** Sets `graceUntil = now + 3 days`
4. **Billing state:** GRACE → Banner shown, access allowed
5. **After 3 days:** State → BLOCKED → Redirect to reactivate

### Test Downgrade

1. **Delete subscription in Stripe Dashboard** (or call API)
2. **Webhook:** `customer.subscription.deleted`
3. **Tenant downgraded:** `planTier=FREE`, subscription fields cleared
4. **Access:** Restored (FREE always ACTIVE)

## Audit Trail

All billing state changes logged in `AuditLog`:

```json
{
  "action": "BILLING_STATE_CHANGED",
  "entity": "Tenant",
  "entityId": "...",
  "summary": {
    "event": "checkout_completed" | "invoice_payment_failed" | "subscription_deleted",
    "tier": "PRO" | "CLINIC",
    "status": "active" | "past_due",
    "graceUntilDays": 3
  }
}
```

## File Map

| File | Purpose |
|------|---------|
| `src/lib/billing/plans.ts` | Plan definitions, price IDs, tier lookups |
| `src/lib/billing/limits.ts` | Quota checks (active patients, therapist seats) |
| `src/lib/billing/subscription-status.ts` | Billing state machine, access guards |
| `src/app/api/v1/billing/checkout/route.ts` | Checkout session creation |
| `src/app/api/v1/billing/portal/route.ts` | Billing portal session |
| `src/app/api/v1/webhooks/stripe/route.ts` | Webhook handler (idempotent) |
| `src/app/app/billing/page.tsx` | Dashboard |
| `src/app/app/billing/reactivate/page.tsx` | Reactivation CTA |
| `src/app/app/billing/success/page.tsx` | Success page |
| `src/app/app/billing/cancel/page.tsx` | Cancel page |
| `src/app/app/layout.tsx` | Subscription guard + banner mount |
| `src/app/sa/tenants/[id]/billing/page.tsx` | SuperAdmin console |
| `src/components/billing/billing-banner.tsx` | Grace period warning banner |
| `prisma/migrations/20260407_stripe_billing/` | Schema migration |

## Security & Best Practices

1. **Multi-tenant isolation:** All webhook handlers filter by tenant from event data
2. **Idempotency:** Webhook event IDs stored in DB; duplicates return 200 without reprocessing
3. **Patient portal never blocked:** `/portal/*` routes never guarded by subscription
4. **RBAC enforcement:** Only TENANT_ADMIN + SUPERADMIN can initiate checkouts
5. **Raw webhook body:** `await req.text()` before signature verification (not `req.json()`)
6. **Force-dynamic routes:** Both webhook and API routes use `export const dynamic = "force-dynamic"`
7. **Audit trail:** Every state change logged for compliance
8. **Grace period:** 3 days before hard block; allows data access during payment issues
9. **SUPERADMIN bypass:** Platform operators always have access, even if blocked

## Known Limitations & Future Work

- Grace period extension (SuperAdmin override) not yet implemented
- Charge compensation/credits not yet implemented
- Proration on mid-cycle upgrades not yet tested (relies on Stripe default)
- Invoice customization (e.g., clinic name on invoices) pending
- Dunning emails (Stripe Billing email templates) need configuration
- Usage-based billing (overage charges) not yet implemented

## Troubleshooting

### Webhook not firing?
1. Check Stripe Dashboard → Developers → Webhook Logs
2. Verify `STRIPE_WEBHOOK_SECRET` env var is correct (check endpoint signing secret)
3. Verify endpoint URL is public and accessible (test with curl)
4. Check app logs for 500 errors

### Tenant not updating after checkout?
1. Verify `client_reference_id = tenantId` in checkout session
2. Check `STRIPE_PRICE_*` env vars are correct price IDs
3. Run webhook handler manually: fetch event from Stripe API, POST raw event to `/api/v1/webhooks/stripe`

### Grace period not triggering?
1. Verify `STRIPE_WEBHOOK_SECRET` (webhook not being verified)
2. Simulate `invoice.payment_failed` event in Stripe Dashboard → Webhooks → Send test event
3. Check tenant `graceUntil` field was set in DB

### Quota check failing on patient create?
1. Verify active patient count logic (checks appointments/sessions/charges/journals in last 90 days)
2. Run SQL: `SELECT COUNT(*) FROM "Patient" WHERE "tenantId" = '...' AND "isActive" = true AND ...`
3. Check plan limits: `src/lib/billing/plans.ts`

---

**Last Updated:** 2026-04-07
**Status:** Ready for production after Stripe account setup
