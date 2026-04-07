# Product Roadmap

Psycologger's roadmap outlines product enhancements, engineering priorities, and security improvements over the next 12 months. Items are organized by timeline and aligned with business goals.

---

## Timeline Overview

```
Q2 2026 (Apr-Jun)  → Security hardening, LGPD compliance
                     |
Q3 2026 (Jul-Sep)  → UX improvements, new product features
                     |
Q4 2026 (Oct-Dec)  → Third-party integrations, enterprise features
                     |
Q1 2027 (Jan-Mar)  → Mobile expansion, advanced analytics
```

---

## Q2 2026: Security & Compliance (6-8 weeks)

**Theme**: Lock down production systems and achieve LGPD compliance.

### Security Engineering
**Target**: Reduce security debt, close vulnerabilities

#### CPF Encryption at Rest ✅ COMPLETED (2026-04-07)
- Encrypt all stored CPF values using AES-256-GCM with `enc:v1:` sentinel prefix
- CPF blind index (HMAC-SHA256) for searchable encryption
- All search/filter logic updated to use blind index
- Backfill cron job: `/api/v1/cron/encrypt-cpfs` (runs 04:45 UTC daily)
- Impact: LGPD compliance, reduces data breach risk
- Completed: 2026-04-07

#### Clinical Session Notes Encryption ✅ COMPLETED (2026-04-07)
- Encrypt `ClinicalSession.noteText` using AES-256-GCM with `enc:v1:` sentinel prefix
- Aligned with journal entry encryption pattern
- All read/write APIs updated
- Backfill cron job: `/api/v1/cron/encrypt-clinical-notes` (runs 04:30 UTC daily)
- Production hardening option: `CLINICAL_NOTES_REJECT_PLAINTEXT=1` env var
- Impact: Brings session notes to same security level as journal entries
- Completed: 2026-04-07

#### Structured Logging System
- Replace `console.log/error` with structured JSON logs
- Add request tracing (trace ID across logs)
- Add log levels (debug/info/warn/error)
- Integrate Sentry for error aggregation
- Impact: Better observability, easier debugging
- Effort: 4 days | Priority: High

#### Encrypt Integration Credentials
- Store Google OAuth tokens encrypted (currently plaintext)
- Add credential rotation UI
- Impact: Protect against database breach exposing API credentials
- Effort: 2 days | Priority: Medium

### Product Features
**Target**: Tenant switcher, basic analytics

#### Tenant Switcher UI
- Allow staff with multiple tenant assignments to switch between tenants
- Add tenant selector dropdown in sidebar
- Update session handling for multi-tenant switching
- Impact: UX improvement for multi-tenant staff
- Effort: 2 days | Priority: Medium

#### Dashboard Analytics
- Add overview dashboard: key metrics (sessions/month, revenue/month, patient growth)
- Simple charts: revenue by date, session count by psychologist
- Not advanced analytics, just quick wins
- Impact: Better visibility into business metrics
- Effort: 3 days | Priority: Medium

### LGPD Compliance
**Target**: Automated data deletion, breach procedure

#### LGPD Data Deletion Automation
- Implement soft delete for patients (deletedAt timestamp)
- Auto-hard-delete after 30 days (audit trail preserved)
- Cascade deletion: patient + related records (appointments, sessions, journal entries, payments)
- Audit log: Log all deletions with reason
- Impact: LGPD "Right to Be Forgotten" compliance
- Effort: 4 days | Priority: Critical

#### Breach Notification Procedure
- Document breach response workflow (detect → isolate → notify)
- Define notification timeline (72 hours per LGPD)
- Create incident template
- Impact: Regulatory readiness
- Effort: 1 day (documentation) | Priority: High

### Database & Infrastructure
**Target**: Improve reliability, monitoring

#### Automated Database Backups Verification
- Add health check to verify Supabase backups are running
- Add alert if backup > 24 hours old
- Document manual restore procedure
- Impact: Disaster recovery confidence
- Effort: 1 day | Priority: Medium

### Code Quality
**Target**: Remove type casts, improve testing

#### Remove `as never` Type Casts
- Refactor Prisma queries to proper types
- Use `Prisma.validator` for reusable selections
- Update 5+ API routes
- Impact: Improved type safety
- Effort: 2 days | Priority: Low

#### Rate Limiting Tests
- Add integration tests for rate limiting (Upstash + fallback)
- Test fallback behavior when Redis unavailable
- Impact: Confidence in rate limiting logic
- Effort: 1 day | Priority: Low

---

## Q3 2026: UX & Performance (8-12 weeks)

**Theme**: Improve user experience and add core features.

### Product Features
**Target**: Reminders, SWR data fetching, appointment flow improvements

#### Appointment Reminder Cron Job
- Add cron job: Check for appointments 1 hour before, send SMS/email reminder
- Support multiple reminder methods (email, SMS via Twilio)
- Allow staff to customize reminder timing
- Impact: Reduced no-shows, improved patient engagement
- Effort: 3 days | Priority: High

#### SWR/React Query Integration
- Migrate all manual `useEffect` fetches to SWR or React Query
- Add automatic refetch on window focus
- Add mutation handlers for create/update/delete
- Benefit: Reduced code duplication, automatic caching, better UX
- Effort: 5 days | Priority: High

#### Journal Entry Improvements
- Add journal entry drafts (auto-save, no encryption until published)
- Add markdown support for notes
- Add tags/search for journal entries
- Impact: Better patient engagement, easier note management
- Effort: 4 days | Priority: Medium

#### Appointment Rescheduling Flow
- Improve rescheduling: show available slots, drag-to-reschedule calendar view
- Send notifications when rescheduled
- Block double-booking automatically
- Impact: Smoother appointment management
- Effort: 3 days | Priority: Medium

### Engineering
**Target**: Testing, feature flags, timezone handling

#### Feature Flag System
- Integrate PostHog or Unleash for feature flags
- Add admin UI to toggle flags per tenant
- Refactor conditional logic to use flags
- Benefits: Safe rollout of new features, A/B testing, gradual migration
- Effort: 5 days | Priority: High

#### React Component Tests
- Add tests for 5 critical forms (appointment, journal, patient, payment, consent)
- Use React Testing Library for component unit tests
- Target: 80% coverage of form components
- Impact: Faster feedback loop, fewer e2e test reruns
- Effort: 5 days | Priority: Medium

#### Timezone/DST Fix
- Fix recurring appointment handling across DST transitions
- Use `date-fns-tz` for timezone-aware calculations
- Test across São Paulo DST dates
- Impact: Reliability of recurring appointments
- Effort: 2 days | Priority: Low

#### Portal Auth E2E Tests
- Add Playwright tests for patient portal login/magic-link flow
- Test journal creation, appointment view, consent acceptance
- Impact: Confidence in critical patient paths
- Effort: 2 days | Priority: Medium

#### Payment Partial Flow Tests
- Add integration test for multi-payment scenarios (pay $50 of $100)
- Test remainder handling, refunds, ledger consistency
- Impact: Financial correctness confidence
- Effort: 2 days | Priority: High

### Infrastructure
**Target**: Monitoring, deployment improvements

#### Sentry Integration
- Wire Sentry into application (DSN env var exists but unused)
- Capture errors, performance metrics, releases
- Set up alerts for error spikes
- Impact: Better error visibility
- Effort: 2 days | Priority: Medium

#### Deployment Health Checks
- Add post-deploy smoke tests (health check, key API calls)
- Add deployment status dashboard
- Impact: Faster incident detection
- Effort: 1 day | Priority: Low

---

## Q4 2026: Third-Party Integrations & Enterprise (12-16 weeks)

**Theme**: Connect with external systems, add enterprise features.

### Product Features
**Target**: Calendar sync, invoice management, payment options

#### Google Calendar Sync
- Complete OAuth flow for staff Google account
- Sync Psycologger appointments → Google Calendar events
- Sync calendar events → Psycologger appointments (if created externally)
- Support: Create, update, delete, recurring events
- Handle timezone conversions
- Impact: Unified calendar, reduced double-booking
- Effort: 7 days | Priority: High

#### NFSe (Brazilian Electronic Invoice) Integration
- Partner with NFSe provider (e.g., Nota Fiscal Fácil, RPS Online)
- Auto-generate invoices for sessions
- Store PDF + XML for audit
- Show invoice status in UI
- Handle provider-specific municipal requirements
- Impact: Tax compliance, automated billing
- Effort: 8 days | Priority: High

#### SMS/WhatsApp Reminders
- Integrate Twilio for SMS + WhatsApp messages
- Send appointment reminders via SMS/WhatsApp
- Allow patients to confirm appointments via SMS reply
- Impact: Higher reminder reach, better engagement
- Effort: 4 days | Priority: Medium

#### Patient Import (CSV)
- Bulk import patients from CSV file
- Map CSV columns to patient fields
- Validation and error reporting
- Import audit trail
- Impact: Faster onboarding for new clinics
- Effort: 3 days | Priority: Medium

#### Advanced Reports & Exports
- Add clinical progress reports (symptom tracking, goal achievement)
- Export to PDF with professional formatting
- Timeline/Gantt charts for sessions
- Revenue reports (breakdown by psychologist, service type)
- Impact: Better insights and client communication
- Effort: 5 days | Priority: Medium

### Security & Compliance
**Target**: Enterprise readiness

#### SSO/SAML Support
- Add SAML 2.0 support for enterprise sign-on
- Support major providers (Azure AD, Okta, Google Workspace)
- Impact: Enterprise sales requirement, better security for large orgs
- Effort: 6 days | Priority: Medium

#### LGPD Compliance Audit
- Hire external auditor for LGPD compliance
- Document findings and remediation
- Implement any gaps identified
- Impact: Regulatory confidence
- Effort: Internal coordination, external cost
- Effort: 2 weeks (external) | Priority: High

#### Data Processing Agreement Templates
- Create DPA templates for LGPD (psychologist as controller, Psycologger as processor)
- Make DPO role official, document responsibilities
- Impact: Enterprise contract requirement
- Effort: 2 days (with legal review) | Priority: Medium

### Engineering
**Target**: Code quality, performance

#### Visual Regression Tests
- Set up Percy or Chromatic for visual regression detection
- Create baseline screenshots (50+ pages)
- Run on every PR
- Impact: Catch unintended UI changes
- Effort: 4 days | Priority: Low

#### Load Testing
- Conduct load test (100 concurrent users)
- Identify bottlenecks (database, API, Redis)
- Optimize critical paths
- Impact: Confidence in scalability
- Effort: 3 days | Priority: Low

#### i18n Framework Setup
- Integrate `next-intl` for Portuguese localization
- Extract 200+ strings to translation files
- Support pt-BR and future pt-PT
- Add language switcher UI
- Impact: Foundation for multi-language support (future)
- Effort: 5 days | Priority: Low (only if multilingual needed)

### Product
**Target**: Advanced features

#### Analytics Dashboard
- Expand Q2 dashboard to multi-page analytics
- Patient retention rate
- Psychologist utilization rate
- Revenue per psychologist
- Average session duration trends
- Impact: Data-driven business decisions
- Effort: 4 days | Priority: Medium

#### Waitlist & Availability
- Add waitlist feature (patients auto-notified when slots available)
- Staff availability calendar (block time off, set working hours)
- Auto-matching for available slots
- Impact: Better appointment management, faster booking
- Effort: 4 days | Priority: Medium

---

## Q1 2027: Mobile & Expansion (16-20 weeks)

**Theme**: Mobile experience, advanced features, growth

### Product Features
**Target**: Mobile app, PWA, telehealth

#### Progressive Web App (PWA)
- Add service worker for offline access
- Add home screen install for mobile
- Push notifications for appointments
- Impact: Mobile-friendly experience without native app
- Effort: 5 days | Priority: Medium

#### Native Mobile App (iOS/Android)
- React Native or Flutter for iOS/Android
- Mirror key features: appointments, journal, payments
- Offline support
- Impact: Better mobile engagement, app store presence
- Effort: 15 days (initial MVP) | Priority: Medium

#### Telehealth Video Calls
- Integrate Twilio Video or Daily.co for video sessions
- Record sessions (optional, with consent)
- Quality scaling (adapt to bandwidth)
- Impact: Remote consultation capability
- Effort: 6 days | Priority: Medium

#### Patient Family Access
- Allow patients to share select information with family members
- Family members get read-only access to health insights
- Consent per family member, per data type
- Impact: Improved support network, family engagement
- Effort: 3 days | Priority: Low

### Multi-Clinic Expansion
**Target**: Support multiple clinics

#### Multi-Clinic Support
- Tenants can span multiple physical locations
- Staff assigned to specific locations
- Analytics per clinic
- Shared billing or split billing per clinic
- Impact: Support clinic networks, franchises
- Effort: 8 days | Priority: Medium

#### Appointment Booking Public Portal
- Public-facing booking page (no login required)
- Calendar view of available appointment slots
- Patient self-service booking
- Email confirmation
- Impact: Reduce back-and-forth booking, higher conversion
- Effort: 4 days | Priority: Medium

### Advanced Features
**Target**: Automation, insights

#### Symptom Tracking
- Add structured symptom tracking questionnaire (e.g., PHQ-9, GAD-7)
- Track over time, show trends
- Alert psychologist if scores worsen significantly
- Impact: Better clinical outcomes, measurement-based care
- Effort: 4 days | Priority: Low

#### Webhooks & API
- Add outgoing webhooks for key events (appointment created, payment received)
- Publish API documentation
- Support third-party integrations
- Impact: Open ecosystem, integration capability
- Effort: 4 days | Priority: Low

#### Recurring Billing (Stripe)
- Add subscription/recurring billing (not just one-off payments)
- Monthly billing for ongoing treatment
- Auto-charge with retries
- Impact: Predictable revenue, improved cash flow
- Effort: 6 days | Priority: High

---

## Timeline Summary

| Period | Key Deliverables |
|--------|------------------|
| **Q2 2026** | CPF encryption, clinical notes encryption, LGPD compliance, structured logging |
| **Q3 2026** | Appointment reminders, SWR/React Query, feature flags, component tests |
| **Q4 2026** | Google Calendar sync, NFSe integration, SMS reminders, LGPD audit |
| **Q1 2027** | PWA, mobile app, telehealth, multi-clinic support |

---

## Prioritization Matrix

**High Priority** (Must ship):
- CPF encryption (security)
- Clinical notes encryption (security)
- LGPD compliance (regulatory)
- Appointment reminders (product)
- Google Calendar (product)
- NFSe integration (product)
- Feature flags (operations)
- SWR/React Query (UX)

**Medium Priority** (Should ship):
- Structured logging (operations)
- Component tests (quality)
- SMS reminders (product)
- Advanced reports (product)
- SSO support (enterprise)
- Multi-clinic (expansion)
- Telehealth (product)

**Low Priority** (Nice to have):
- i18n framework (future)
- Visual regression tests (quality)
- Dark mode (UX)
- Webhooks (integration)
- PWA (mobile)

---

## Success Metrics

### Security
- Zero security vulnerabilities in production (target)
- 100% LGPD compliance audit pass
- Encryption coverage: 100% of PII/PHI at rest

### Product
- Patient engagement: 80%+ journal completion rate
- Appointment show-up rate: 85%+ (vs. reminders baseline)
- User retention: 90% month-over-month

### Operations
- API uptime: 99.9%
- Error rate: < 0.1%
- Page load time: < 2 seconds (P95)

### Growth
- Tenant count: 100 (baseline) → 500 by Q1 2027
- Revenue: $X/month (baseline) → $5X by Q1 2027
- Patient count: 5,000 → 25,000

---

## Dependencies & Risks

### External Dependencies
- **Vercel**: Hosting platform. Mitigation: No lock-in, can migrate to AWS/GCP
- **Supabase**: Database. Mitigation: Direct PostgreSQL access, can migrate
- **Resend**: Email. Mitigation: SendGrid/Mailgun fallback available
- **Upstash**: Redis. Mitigation: Self-hosted Redis fallback

### Internal Risks
- **Single Developer**: Bottleneck for feature delivery. Mitigation: Hire contractors for parallel work
- **Scope Creep**: Features added mid-sprint. Mitigation: Strict sprint boundaries
- **Data Migration**: Encrypting existing data risky. Mitigation: Thorough testing, gradual rollout

### External Risks
- **Brazilian Regulatory Changes**: LGPD still evolving. Mitigation: Monitor CFP (psychology board) guidance
- **API Rate Limits**: Google Calendar, NFSe provider outages. Mitigation: Graceful degradation, retry logic

---

## Review & Adjustment

**Monthly**: Review progress, adjust priorities
**Quarterly**: Major roadmap refinement based on feedback
**Annually**: Long-term strategic planning

---

## Team Capacity

**Current**: 1 solo developer (you)

**Estimate for Roadmap Completion**:
- Q2 2026: Possible (security + LGPD items are critical)
- Q3 2026: Requires external help (4-6 items in parallel)
- Q4 2026: Requires external help (integrations are complex)
- Q1 2027: Requires team scaling (mobile + multiple fronts)

**Recommendation**: Budget for 1-2 additional developers starting Q3 2026.

---

## Getting Help

- **Prioritization Questions**: Stakeholder feedback needed (which features matter most?)
- **Capacity Planning**: Define timeline realism vs. quality trade-offs
- **Hiring**: Contractors for specific features (calendar sync, mobile, etc.)

---

## Version History

| Date | Changes |
|------|---------|
| 2026-04-04 | Initial roadmap creation |
| 2026-04-07 | CPF encryption & clinical notes encryption marked COMPLETED |

