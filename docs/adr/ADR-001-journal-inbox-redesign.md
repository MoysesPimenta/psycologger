# ADR-001: Journal Inbox Redesign — Patient-First Navigation with Therapist Notes & Trend Charts

**Status:** Proposed
**Date:** 2026-04-04
**Deciders:** Moyses (product owner), engineering team

---

## Context

The current `/app/journal-inbox` page shows a **flat chronological list** of all shared journal entries from all patients. The therapist can only filter by tab (unread / discuss / all) and manually scan patient names in the list.

### Current pain points

1. **No patient-level grouping** — A therapist with 30+ active patients scrolls through a mixed stream. There's no way to ask "what did Maria write this week?"
2. **No filtering or search** — No patient search, no date range, no entry type filter.
3. **No clinical context per patient** — The therapist sees isolated entries but can't track mood trends or patterns over weeks/months.
4. **No therapist annotations** — The only action is "mark as reviewed." There's no way to jot down clinical observations or session prep notes.
5. **Fixed page size (50)** — No infinite scroll or pagination controls.

### Forces at play

- Therapists think **patient-first**: "What's going on with this patient?" not "What did someone write at 14:32?"
- Journal data is **encrypted at rest** — every entry requires server-side decryption, so we must be careful about bulk fetching.
- The patient detail page already has a **tab system** (timeline, sessions, files, financial, profile) — adding a "Diário" tab is natural.
- **No chart library** is installed — we need to add one (recharts is the lightest React-native option).
- The RBAC system already gates journal access behind `patients:list` permission + `therapistId` ownership.

---

## Decision

Redesign the journal inbox into a **patient-first experience** with three components:

### A. Redesigned `/app/journal-inbox` — Triage Inbox with Patient Sidebar
### B. New tab `Diário` inside `/app/patients/[id]` — Per-Patient Journal View with Trend Chart
### C. New `JournalNote` model — Private Therapist Annotations on Entries

---

## Options Considered

### Option A: Add filters to current flat list

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Clinical value | Low — still a flat stream |
| Scalability | Poor for 50+ patients |
| Team familiarity | High — minimal change |

**Pros:** Fast to ship, minimal new code
**Cons:** Doesn't solve the fundamental navigation problem. Therapists still can't track a single patient over time. No place for notes or trends.

### Option B: Patient-first inbox + per-patient journal tab + therapist notes ✅ SELECTED

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Clinical value | **High** — patient-centric with trends |
| Scalability | Excellent — sidebar groups by patient, detail view paginates per-patient |
| Team familiarity | Medium — new model + chart lib, but patterns match existing code |

**Pros:** Matches clinical workflow (think by patient, then drill into entries). Trend chart is clinically valuable for spotting deterioration. Private notes enable session prep workflow. Reuses existing tab infrastructure.
**Cons:** More work (new model, chart library, 2 new API routes, component refactor). Decryption cost on trend data must be handled carefully.

### Option C: Standalone journal dashboard (separate from patient profile)

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Clinical value | High |
| Scalability | Good |
| Team familiarity | Low — new page architecture |

**Pros:** Maximum flexibility for journal-specific features
**Cons:** Duplicates patient navigation. Creates two places to see patient data. Harder to maintain context while switching between journal and clinical sessions.

---

## Detailed Design

### 1. Database Changes

#### New model: `JournalNote`

```prisma
model JournalNote {
  id             String       @id @default(cuid())
  tenantId       String
  journalEntryId String
  authorId       String
  noteText       String       @db.Text   // Encrypted at rest
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deletedAt      DateTime?

  tenant       Tenant       @relation(fields: [tenantId], references: [id])
  journalEntry JournalEntry @relation(fields: [journalEntryId], references: [id])
  author       User         @relation(fields: [authorId], references: [id])

  @@index([journalEntryId])
  @@index([tenantId, authorId])
}
```

**Design decisions:**
- Separate model (not a field on JournalEntry) — allows multiple notes per entry, preserves edit history, clean ownership.
- `noteText` encrypted with same AES-256-GCM as journal entries — private clinical data.
- Soft-delete via `deletedAt` — consistent with rest of the app.
- Scoped to `tenantId` — multi-tenant isolation invariant.

#### JournalEntry additions

No schema changes needed. The existing `patient` relation + `therapistId` + scores are sufficient.

### 2. API Routes

#### `GET /api/v1/journal-inbox/patients` — Patient summary for sidebar

Returns a list of patients who have shared journal entries, grouped with counts:

```json
{
  "data": [
    {
      "patientId": "...",
      "patientName": "Maria Silva",
      "preferredName": "Maria",
      "unreadCount": 3,
      "flaggedCount": 1,
      "discussCount": 2,
      "totalShared": 15,
      "lastEntryAt": "2026-04-03T14:30:00Z",
      "latestMoodScore": 4
    }
  ]
}
```

**Implementation:** Single Prisma `groupBy` on `journalEntry` + conditional counts. No decryption needed (aggregates only). Sorted by `lastEntryAt` desc (most recent activity first), with flagged patients pinned to top.

#### `GET /api/v1/journal-inbox?patientId=xxx` — Entries filtered by patient

Extends the existing route to accept `patientId` query param. When provided, filters entries to that patient only. Keeps existing `tab` filter.

#### `GET /api/v1/journal-inbox/trends?patientId=xxx` — Score trends for chart

Returns time-series data for a patient's mood/anxiety/energy/sleep scores:

```json
{
  "data": [
    { "date": "2026-03-15", "moodScore": 6, "anxietyScore": 4, "energyScore": 7, "sleepScore": 8 },
    { "date": "2026-03-18", "moodScore": 4, "anxietyScore": 7, "energyScore": 3, "sleepScore": 5 }
  ]
}
```

**Implementation:** Query shared entries for patient, select only score fields + createdAt. **No decryption** — scores are plain integers, only `noteText` is encrypted. Very efficient.

#### `POST /api/v1/journal-inbox/[id]/notes` — Create therapist note

Encrypts `noteText`, creates `JournalNote`. Requires `patients:list` permission + entry must belong to therapist's patient.

#### `GET /api/v1/journal-inbox/[id]/notes` — List notes for an entry

Returns decrypted notes authored by the current therapist (or any staff in the tenant with permission). Paginated.

#### `DELETE /api/v1/journal-inbox/notes/[noteId]` — Soft-delete a note

Only the note author can delete. Sets `deletedAt`.

### 3. Frontend Components

#### A. Redesigned Journal Inbox (`/app/journal-inbox`)

**Layout: Three-panel (patient list | entry list | detail)**

```
┌──────────────────────────────────────────────────────────────┐
│  Diário dos Pacientes                        🔍 search       │
├─────────────┬───────────────────┬────────────────────────────┤
│ PATIENTS    │ ENTRIES           │ DETAIL                     │
│             │                   │                            │
│ 🔴 Maria  3 │ ▌ Humor 6/10     │ Maria Silva                │
│    João   1 │   03/04 14:30     │ Reflexão · 03/04 às 14:30  │
│    Ana    0 │                   │                            │
│    Pedro  2 │ ▌ Reflexão        │ Humor: 6  Ansiedade: 4     │
│             │   02/04 09:15     │ Energia: 7  Sono: 8        │
│             │                   │                            │
│             │   Pergunta        │ [note text...]             │
│             │   01/04 18:00     │                            │
│             │                   │ ── Notas do Terapeuta ──   │
│             │                   │ "Sessão prep: discutir..." │
│             │                   │ [+ Adicionar nota]         │
│             │                   │                            │
│             │                   │ [Marcar como revisado]     │
└─────────────┴───────────────────┴────────────────────────────┘
```

**Patient sidebar features:**
- Search/filter patients by name
- Each patient shows: name, unread badge count, flag icon if any flagged entries
- Sorted: flagged first, then by most recent entry
- Clicking a patient loads their entries in the middle panel
- "Todos" mode (no patient selected) = current behavior (all entries mixed)

**Entry list (middle panel):**
- Same cards as today, but filtered to selected patient
- Tabs remain: Não lidos / Próxima sessão / Todos
- Infinite scroll or "load more" pagination

**Detail panel (right):**
- Same as today + new "Notas do Terapeuta" section at bottom
- Collapsible note list with add/delete
- Inline text area for quick note entry

#### B. Patient Profile Tab: "Diário"

New tab in the existing `PatientDetailClient` tab bar:

```typescript
type Tab = "timeline" | "sessions" | "journal" | "files" | "financial" | "profile";
//                                    ^^^^^^^^ NEW
```

**Content:**
1. **Trend Chart** (top) — Recharts `LineChart` showing mood, anxiety, energy, sleep over time. Date range selector (7d / 30d / 90d / all).
2. **Entry List** (below chart) — Same entry cards, filtered to this patient. Includes therapist notes inline.
3. **Quick Stats** — Total entries, average mood this month vs last, most common emotion tags.

#### C. Trend Chart Component

```
┌─────────────────────────────────────────────────┐
│  Evolução do Paciente          [7d] [30d] [90d] │
│  10 ─┐                                         │
│   8  │        ╭─╮                               │
│   6  │  ──●──╯   ╰──●──                Humor ── │
│   4  │       ╭──●──╮                   Ansi ··· │
│   2  │      ╯       ╰──                Ener --- │
│   0  ┼──┬──┬──┬──┬──┬──┬──┬──          Sono ─·─ │
│      Mar 1  8  15 22 29 Abr            ▲scores  │
└─────────────────────────────────────────────────┘
```

Uses **recharts** (`LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `ResponsiveContainer`). Already available as a CDN import in React artifacts, but for production we `npm install recharts`.

### 4. Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Decrypting all entries for a patient | Paginate: load 20 entries at a time. Trend endpoint returns scores only (no decryption). |
| Patient sidebar with 100+ patients | `groupBy` aggregation is fast. No full-text scan. Cached client-side with SWR/stale state. |
| Trend chart data for 1 year | Scores are plain integers — query is a simple SELECT on indexed `patientId` + `therapistId`. Sub-50ms. |
| Therapist notes encryption overhead | Notes are short text. Encrypt/decrypt one at a time on demand. Negligible. |

### 5. Security & RBAC

- All new endpoints require `patients:list` permission (consistent with existing inbox).
- `JournalNote` is scoped to `tenantId` — multi-tenant isolation enforced.
- Notes are **never visible to the patient** — portal API routes have no access to `JournalNote`.
- Note `noteText` encrypted with same key as journal entries — at-rest protection.
- CSRF protection applies automatically (middleware already handles state-changing routes).

### 6. Migration Path

The current inbox continues to work during development. The redesign is purely additive:
1. Add `JournalNote` model + migration
2. Add new API routes (existing routes unchanged)
3. Refactor `JournalInboxClient` to three-panel layout
4. Add `journal` tab to `PatientDetailClient`
5. Install recharts, build trend chart component

No breaking changes. No data migration. Backward compatible.

---

## Consequences

### What becomes easier
- Therapists can instantly see a patient's journal history and mood trends before a session
- Session prep is streamlined: private notes + "discuss next session" entries in one view
- Crisis patterns become visible through trend charts (e.g., declining mood over 2 weeks)
- The journal feature becomes a real clinical tool, not just a notification inbox

### What becomes harder
- Component complexity increases (three-panel layout with state coordination)
- One more Prisma model to maintain
- Recharts adds ~45KB gzipped to the bundle (acceptable for a clinical tool)

### What we'll need to revisit
- **Notification system** — Should therapists get push/email notifications for flagged entries? (Future ADR)
- **Export** — Will therapists want to export a patient's journal history as PDF for clinical records?
- **AI insights** — Could we surface automated observations from journal patterns? (Much later)

---

## Implementation Phases

### Phase 1: Foundation (Schema + API) — ~2-3 hours
1. Prisma migration: add `JournalNote` model
2. `GET /api/v1/journal-inbox/patients` — patient summary endpoint
3. `GET /api/v1/journal-inbox/trends?patientId=xxx` — trend data endpoint
4. `POST/GET/DELETE /api/v1/journal-inbox/[id]/notes` — therapist notes CRUD
5. Extend existing `GET /api/v1/journal-inbox` with `patientId` filter param
6. Unit tests for new endpoints

### Phase 2: Inbox Redesign — ~3-4 hours
7. Install recharts
8. New component: `JournalPatientSidebar` (patient list with search + badges)
9. Refactor `JournalInboxClient` → three-panel layout
10. New component: `JournalTherapistNotes` (note list + add/delete inline)
11. Wire up patient selection → entry filtering → detail view

### Phase 3: Patient Profile Integration — ~2-3 hours
12. New component: `JournalTrendChart` (recharts LineChart with date range)
13. New component: `PatientJournalTab` (chart + entry list for one patient)
14. Add "Diário" tab to `PatientDetailClient`
15. New server-side data fetching in `patients/[id]/page.tsx`

### Phase 4: Polish — ~1-2 hours
16. Loading skeletons for all new panels
17. Empty states (no entries, no notes, no trends)
18. Mobile responsive layout (stack panels vertically on small screens)
19. Keyboard navigation for patient sidebar

---

## Action Items

1. [ ] Review and approve this ADR
2. [ ] Phase 1: Schema migration + API endpoints
3. [ ] Phase 2: Inbox UI redesign
4. [ ] Phase 3: Patient profile journal tab
5. [ ] Phase 4: Polish and responsive design
6. [ ] Update documentation (route catalog, component docs)
