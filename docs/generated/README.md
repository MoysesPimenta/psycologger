# Generated Documentation for Psycologger

This directory contains canonical documentation generated from the Psycologger codebase. It serves two purposes:
1. **Canonical Source of Truth:** Core engineering documentation extracted from code, schema, and config
2. **AI Memory Pack:** Condensed reference material designed for AI agents to understand system architecture and constraints

**Generated:** 2026-04-04
**Regenerate when:** Major features added, data model changed, auth/security patterns modified, deployment infra updated

---

## Document Tiers

### Core Engineering Docs (00-21)
Detailed technical documentation covering design, architecture, API patterns, and implementation details. These documents are the primary reference for engineers building features and maintaining the system.

**Coverage:** Architecture decisions, route patterns, data models, security implementation, deployment pipeline

### AI Memory Pack (22-26)
Condensed reference material optimized for AI agents to quickly understand system constraints, build context, and avoid mistakes. Designed to fit in AI context windows while preserving all critical information.

**Coverage:** System overview, role-based access control, API patterns, known gaps, ambiguities requiring clarification

### Reference & Tools (27+)
Permission matrices, reference tables, and machine-readable documentation for quick lookup and tooling.

**Coverage:** Permission matrix, environment variables, file registry

---

## All Documents (28 Total)

| # | File | Audience | Purpose |
|---|------|----------|---------|
| **CORE ENGINEERING DOCS (00-21)** |
| 00 | [ARCHITECTURE.md](00-ARCHITECTURE.md) | Engineers, architects | System design, multi-tenancy, auth flows, data isolation |
| 01 | [API-PATTERNS.md](01-API-PATTERNS.md) | Developers | Standard request/response patterns, error handling, pagination |
| 02 | [RBAC.md](02-RBAC.md) | Security, developers | Role definitions, permission model, enforcement patterns |
| 03 | [DATA-MODEL.md](03-DATA-MODEL.md) | Backend developers | Prisma schema overview, entity relationships, constraints |
| 04 | [ENCRYPTION.md](04-ENCRYPTION.md) | Security engineers | AES-256-GCM implementation, key rotation, encrypted fields |
| 05 | [AUDIT-LOGGING.md](05-AUDIT-LOGGING.md) | Security, ops | Audit trail design, action taxonomy, PHI redaction rules |
| 06 | [APPOINTMENTS.md](06-APPOINTMENTS.md) | Developers | Scheduling logic, recurrence rules, timezone handling, calendar sync |
| 07 | [CLINICAL-SESSIONS.md](07-CLINICAL-SESSIONS.md) | Clinicians, developers | Session templates (SOAP/BIRP/FREE), documentation patterns |
| 08 | [CHARGES-PAYMENTS.md](08-CHARGES-PAYMENTS.md) | Finance, developers | Charging model, partial payments, remainder management, NFSe |
| 09 | [PATIENT-PORTAL.md](09-PATIENT-PORTAL.md) | Product, developers | Portal features, journal encryption, consent workflow, notifications |
| 10 | [FILES-STORAGE.md](10-FILES-STORAGE.md) | Developers | S3/R2 integration, magic byte validation, encrypted metadata |
| 11 | [EMAIL-REMINDERS.md](11-EMAIL-REMINDERS.md) | Developers | Resend integration, cron triggers, retry logic, template system |
| 12 | [NEXTAUTH-SETUP.md](12-NEXTAUTH-SETUP.md) | Developers | JWT configuration, session handling, callback patterns |
| 13 | [PATIENT-AUTH.md](13-PATIENT-AUTH.md) | Developers | Magic link flow, PBKDF2 hashing, portal session management |
| 14 | [MIDDLEWARE.md](14-MIDDLEWARE.md) | Developers | Request pipeline, tenant context, CSP nonces, rate limiting |
| 15 | [DATABASE-SCHEMA.md](15-DATABASE-SCHEMA.md) | Developers | Prisma schema printout, relations, indexes, soft-delete patterns |
| 16 | [DEPLOYEMENT-VERCEL.md](16-DEPLOYMENT-VERCEL.md) | DevOps, developers | Vercel setup, cron configuration, environment variables |
| 17 | [SECURITY-HARDENING.md](17-SECURITY-HARDENING.md) | Security | CSRF defense, CSP policy, rate limiting, TLS, input validation |
| 18 | [TESTING-STRATEGY.md](18-TESTING-STRATEGY.md) | QA, developers | Test coverage targets, critical paths, e2e test scope |
| 19 | [ERROR-HANDLING.md](19-ERROR-HANDLING.md) | Developers | Error taxonomy, user-facing messages, logging patterns |
| 20 | [PERFORMANCE-OPTIMIZATION.md](20-PERFORMANCE-OPTIMIZATION.md) | Developers | Query optimization, caching, image loading, bundle size |
| 21 | [GLOSSARY.md](21-GLOSSARY.md) | All | Term definitions, acronyms, Portuguese/English translations |
| **AI MEMORY PACK (22-26)** |
| 22 | [00-ai-quick-start.md](22-00-ai-quick-start.md) | AI agents | 5-minute system overview, key files, common tasks |
| 23 | [10-ai-rolebase-access.md](23-10-ai-rolebase-access.md) | AI agents | Permission model, scope rules, delegation patterns |
| 24 | [20-ai-api-recipe.md](24-20-ai-api-recipe.md) | AI agents | Standard API handler template, common patterns, gotchas |
| 25 | [25-system-context-summary.md](25-system-context-summary.md) | AI agents | Condensed architecture, business rules, security invariants, gaps |
| 26 | [26-known-unknowns.md](26-known-unknowns.md) | AI agents, operators | Ambiguities, missing evidence, items needing manual verification |
| **REFERENCE & TOOLS (27+)** |
| 27 | [27-permission-matrix.md](27-permission-matrix.md) | All | Complete permission lookup table, portal access, enforcement points |
| 28 | [DEPLOY_ENV_VARS.md](../DEPLOY_ENV_VARS.md) | DevOps | Environment variables, secrets, Vercel dashboard config |
| — | [machine/](machine/) | Tools | Machine-readable documentation (schema export, permission JSON, etc.) |

---

## Reading Paths by Role

### For New Developers Joining the Team

**Start here (in order):**
1. [22-00-ai-quick-start.md](22-00-ai-quick-start.md) — 5-minute overview
2. [25-system-context-summary.md](25-system-context-summary.md) — Full context
3. [00-ARCHITECTURE.md](00-ARCHITECTURE.md) — Design decisions
4. [03-DATA-MODEL.md](03-DATA-MODEL.md) — Entity relationships
5. [01-API-PATTERNS.md](01-API-PATTERNS.md) — How to build features
6. [02-RBAC.md](02-RBAC.md) — Permission enforcement
7. Task-specific docs (e.g., [06-APPOINTMENTS.md](06-APPOINTMENTS.md) for scheduling work)

**Then:** Pick a task from the backlog and read the corresponding domain doc

### For Security Reviewers

**Critical security docs:**
1. [17-SECURITY-HARDENING.md](17-SECURITY-HARDENING.md) — Defense mechanisms
2. [04-ENCRYPTION.md](04-ENCRYPTION.md) — Crypto implementation
3. [02-RBAC.md](02-RBAC.md) — Access control
4. [05-AUDIT-LOGGING.md](05-AUDIT-LOGGING.md) — Compliance tracking
5. [26-known-unknowns.md](26-known-unknowns.md) — Security gaps and unknowns

**Then:** Review [DEPLOY_ENV_VARS.md](../DEPLOY_ENV_VARS.md) for secret management

### For AI Agents (This is You!)

**Startup sequence:**
1. [25-system-context-summary.md](25-system-context-summary.md) — Your primary reference (under 3000 words, all essentials)
2. [27-permission-matrix.md](27-permission-matrix.md) — Permission lookup when needed
3. [24-20-ai-api-recipe.md](24-20-ai-api-recipe.md) — API pattern template
4. [26-known-unknowns.md](26-known-unknowns.md) — What you should NOT assume

**When building features:**
- Check [25-system-context-summary.md](25-system-context-summary.md) for business rules and security invariants
- Verify permission with [27-permission-matrix.md](27-permission-matrix.md) before writing RBAC checks
- Use [24-20-ai-api-recipe.md](24-20-ai-api-recipe.md) as handler template
- Reference [26-known-unknowns.md](26-known-unknowns.md) for gaps and ambiguities

**When stuck:**
- Check [25-system-context-summary.md](25-system-context-summary.md) "Dangerous Areas" section
- Read [26-known-unknowns.md](26-known-unknowns.md) to see if your problem is a known ambiguity
- Query task-specific docs (e.g., [08-CHARGES-PAYMENTS.md](08-CHARGES-PAYMENTS.md) for payment logic)

### For Product Managers

**Start here:**
1. [09-PATIENT-PORTAL.md](09-PATIENT-PORTAL.md) — User-facing features
2. [06-APPOINTMENTS.md](06-APPOINTMENTS.md) — Scheduling capabilities
3. [08-CHARGES-PAYMENTS.md](08-CHARGES-PAYMENTS.md) — Billing & revenue
4. [25-system-context-summary.md](25-system-context-summary.md) "Known Gaps" — Feature roadmap gaps

**For roadmap planning:**
- [26-known-unknowns.md](26-known-unknowns.md) sections: "Features & Integrations"

### For Operations / DevOps

**Start here:**
1. [16-DEPLOYMENT-VERCEL.md](16-DEPLOYMENT-VERCEL.md) — Deployment pipeline
2. [DEPLOY_ENV_VARS.md](../DEPLOY_ENV_VARS.md) — Secrets and config
3. [04-ENCRYPTION.md](04-ENCRYPTION.md) "Key Rotation" — Operational procedures
4. [26-known-unknowns.md](26-known-unknowns.md) "Critical Actions" — Runbooks to create

**For incident response:**
- [11-EMAIL-REMINDERS.md](11-EMAIL-REMINDERS.md) — Cron troubleshooting
- [05-AUDIT-LOGGING.md](05-AUDIT-LOGGING.md) — Incident investigation
- [26-known-unknowns.md](26-known-unknowns.md) — Known infrastructure gaps

---

## How to Use This Documentation

### For Implementation

1. **Check permissions first:** Consult [27-permission-matrix.md](27-permission-matrix.md) before writing RBAC code
2. **Follow the pattern:** Use [24-20-ai-api-recipe.md](24-20-ai-api-recipe.md) as template for new handlers
3. **Verify business rules:** Cross-check [25-system-context-summary.md](25-system-context-summary.md) "Critical Business Rules"
4. **Know the gaps:** Review [26-known-unknowns.md](26-known-unknowns.md) for areas of uncertainty

### For Code Review

- Verify RBAC checks against [27-permission-matrix.md](27-permission-matrix.md)
- Check encryption/decryption against [04-ENCRYPTION.md](04-ENCRYPTION.md)
- Ensure audit logging for auditable actions ([05-AUDIT-LOGGING.md](05-AUDIT-LOGGING.md))
- Look for tenant isolation violations ([00-ARCHITECTURE.md](00-ARCHITECTURE.md))

### For Debugging

1. **Identify symptom:** What is failing? (auth, permission, data fetch, encryption, etc.)
2. **Find relevant doc:** Use table above to locate domain documentation
3. **Check known unknowns:** See if problem is listed in [26-known-unknowns.md](26-known-unknowns.md)
4. **Verify assumptions:** Compare actual behavior to documented business rules

### For Adding Features

1. **Read domain doc:** e.g., [06-APPOINTMENTS.md](06-APPOINTMENTS.md) for scheduling features
2. **Check permissions:** Add rows to [27-permission-matrix.md](27-permission-matrix.md) for new actions
3. **Verify schema:** Update [03-DATA-MODEL.md](03-DATA-MODEL.md) for new entities
4. **Add audit logging:** Include in [05-AUDIT-LOGGING.md](05-AUDIT-LOGGING.md) action taxonomy
5. **Document business rules:** Add to [25-system-context-summary.md](25-system-context-summary.md)

---

## Maintenance & Updates

### When to Regenerate

Regenerate this documentation when:
- ✅ New major feature added (e.g., Google Calendar sync)
- ✅ Data model changed (new entity or significant relationship change)
- ✅ Auth/RBAC pattern changes (new role or permission)
- ✅ Security hardening added (new defense mechanism)
- ✅ Deployment infrastructure changed (new env vars, cron, services)
- ✅ API pattern changes (new standard handler template)

Do NOT regenerate for:
- ❌ Bug fixes
- ❌ Performance tweaks
- ❌ Documentation typo fixes (edit docs directly instead)
- ❌ Dependency updates
- ❌ UI changes

### How to Regenerate

```bash
# 1. Extract current state from code
cd /mnt/Psycologger
npm run docs:generate  # (or similar task — adjust based on repo setup)

# 2. Review changes
git diff docs/generated/

# 3. Update the "Generated" date in this README
# 4. Commit
git add docs/generated/ README.md
git commit -m "docs: regenerate documentation"
```

### Version Control

- Keep generated docs in version control (`/docs/generated/`)
- Treat as source of truth for architecture/decisions
- Review docs changes in pull requests (changes to docs are notable!)
- Pin docs to each release for historical reference

---

## Key Principles

### This Documentation Is Accurate If:
- All links resolve and files exist
- All code examples compile (or at least are syntactically valid)
- All permission matrices match `rbac.ts` definitions
- Security invariants are actually enforced in code
- Business rules are followed by all API handlers

### This Documentation Is Incomplete If:
- [26-known-unknowns.md](26-known-unknowns.md) has "Critical" items (needs action)
- AI agents report confusion on multi-tenant behavior or RBAC
- New feature cannot be built without guessing at design patterns
- Security gaps remain undocumented

### Feedback

If you find:
- **Inaccuracy:** File an issue with the specific error
- **Ambiguity:** Add to [26-known-unknowns.md](26-known-unknowns.md) and clarify with team
- **Missing documentation:** Create the doc or open an issue
- **Outdated content:** Regenerate and update "Generated" date

---

## Quick Reference

### Architecture at a Glance
- **Multi-tenancy:** Enforced at middleware + query level; all queries filter by `tenantId`
- **Authentication:** NextAuth (staff) + PatientAuth (patients); dual auth system
- **Authorization:** RBAC with 5 roles, 27 permissions; enforced via `ensurePermission()` in every handler
- **Encryption:** AES-256-GCM for sensitive fields; key rotation supported via versioning
- **Audit:** 49 actions tracked in `AuditLog` with PHI redaction
- **Deployment:** Vercel (gru1); Next.js 14; Supabase PostgreSQL; Resend email

### API Pattern
```typescript
// Every handler follows this structure:
1. Authenticate: getCurrentUser() -> 401
2. Authorize: ensurePermission(user, 'action') -> 403
3. Filter by tenant: { ...query, tenantId: user.tenantId }
4. Check scope: For PSYCHOLOGIST/ASSISTANT, verify patient assignment
5. Audit: Log action with auditLog() if AUDITABLE_ACTIONS.includes(action)
```

### Security Checklist
- [ ] Encrypt sensitive fields: CPF, medical notes, session notes, journal
- [ ] Check tenant isolation: All queries include `tenantId` filter
- [ ] Verify RBAC: Call `ensurePermission()` before mutation
- [ ] Audit log: Add action to `AUDITABLE_ACTIONS` if it's important
- [ ] Validate input: Check magic bytes for uploads, parse recurrence rules carefully
- [ ] Handle errors: Use generic error messages (don't leak tenant/user info)

---

## Support

**For questions about:**
- System architecture → [00-ARCHITECTURE.md](00-ARCHITECTURE.md)
- How to build an API → [01-API-PATTERNS.md](01-API-PATTERNS.md) or [24-20-ai-api-recipe.md](24-20-ai-api-recipe.md)
- Who can do what → [27-permission-matrix.md](27-permission-matrix.md)
- Why something isn't documented → [26-known-unknowns.md](26-known-unknowns.md)
- Specific feature → Check domain doc (e.g., [06-APPOINTMENTS.md](06-APPOINTMENTS.md))

---

**Last updated:** 2026-04-04
**Documentation scope:** Psycologger v0.x (pre-beta)
**Maintained by:** Engineering team
