# SuperAdmin Support Inbox

Last updated: 2026-04-08

The Support Inbox is a SuperAdmin-only customer support pipeline that
ingests inbound emails (Resend), threads them into tickets, lets SAs
reply or annotate, and audits everything. PHI never enters this surface
intentionally — but bodies are still encrypted at rest because emails
are user-controlled and may incidentally contain sensitive data.

## Pipeline

1. **Resend inbound webhook** → `POST /api/v1/webhooks/resend-inbound`
   - Verifies signature, fetches the full email via Resend
     `GET /emails/receiving/{id}` to recover the body and attachments.
   - Idempotent on RFC822 `Message-ID`. Replays are no-ops.
   - Resolves an existing ticket via `In-Reply-To` / `References` headers
     or by `(fromEmail, subjectNormalized)` within a 14-day window;
     otherwise creates a new `SupportTicket` with status `OPEN`.
   - Body is wrapped (`{text, html}`) and AES-256-GCM encrypted before
     insert into `SupportMessage.bodyEncrypted`.
   - Attachments processed via `processInboundAttachments()` (see below).
   - Auditable via `SUPPORT_TICKET_RECEIVED` / `SUPPORT_MESSAGE_RECEIVED`.

2. **SA inbox** → `/sa/support`
   - Lists tickets with filter persistence (status, tenant, search) carried
     into pagination links.
   - Per-ticket badges:
     - `Mensagens` — outbound message count
     - `Notas` — internal note count
     - `Aberto há` — age of the oldest open message
     - `🐢 Rotten` — > 48h since last SA reply on `OPEN`/`PENDING`
     - `⭐ One Stop Shop` — customer replied within **3 days of an SA
       outbound** (positive signal, set when scanning messages
       chronologically per ticket).
   - Real-time-ish: page revalidates on focus; cron + polling fill the
     gap when the tab is backgrounded.

3. **SA detail** → `/sa/support/[id]`
   - Newest-first timeline directly under the composer.
   - Internal notes are amber-bordered and tagged
     "🔒 Nota interna (staff apenas)".
   - HTML messages render in a sandboxed iframe with strict CSP
     (`default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'`).
   - Plain-text fallback rendered as `<pre>`.
   - Attachment strip below each message (see Attachments).

4. **Composer** → `src/components/sa/support-ticket-actions.tsx`
   - "Salvar, enviar (Aguardando)" — sends as OUTBOUND, sets `PENDING`.
   - "Salvar, enviar (Fechar)" — sends as OUTBOUND, sets `CLOSED`.
   - "Salvar e fechar" — if body is non-empty it dispatches as
     `send("CLOSED")`, otherwise persists the note and just sets
     `CLOSED` (no email).

5. **Auto-close** → `GET/POST /api/v1/cron/support-stale-pending`
   - Bearer-auth via `CRON_SECRET`. Vercel cron `0 5 * * *`.
   - Closes `PENDING` tickets with `lastMessageAt < now - 7 days`,
     attaching an encrypted INTERNAL note explaining the closure.
   - Audit action: `SUPPORT_TICKET_AUTO_CLOSED`.

## Attachments (end-to-end)

### Storage layout
- Bucket: `support-attachments` (private, **must exist** in both
  Supabase projects — created manually in 2026-04-08).
- Object key: `{ticketId}/{messageId}/{sha256}.bin`.
- Files are AES-256-GCM encrypted **before upload** via
  `encryptBuffer()`; the version byte format matches `crypto.ts` so
  ENCRYPTION_KEY rotation handles attachments transparently.

### Ingest (`src/lib/support-attachments.ts`)
- Pulled from `body.attachments[]` in the Resend `/emails/receiving/{id}`
  payload.
- Per-file cap: **10 MB**. Per-message cap: **25 MB**.
- Filename sanitized (no path separators, no control chars, ≤ 200 chars).
- SHA-256 fingerprint stored for dedupe analysis.
- Render-allowlist (inlined inline-disposition):
  `application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`.
- Anything outside the allowlist is **quarantined** (`quarantined=true`).
- Audit: `SUPPORT_ATTACHMENT_STORED` or `SUPPORT_ATTACHMENT_QUARANTINED`.

### Download (`GET /api/v1/sa/support/attachments/[id]`)
- `requireSuperAdmin()`. UUID-validated.
- Streams the decrypted bytes. Quarantined files require `?force=1`
  and a confirm dialog in the UI.
- Headers: `Content-Disposition` is `inline` for allowlisted, otherwise
  `attachment`. Quarantined response is forced to
  `application/octet-stream`. Strict CSP, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`.
- Audit: `SUPPORT_ATTACHMENT_DOWNLOADED` (records filename, mime, size,
  ticketId, `forced` boolean).

### UI (`src/components/sa/support-attachments.tsx`)
- Image attachments render as inline thumbnails using the SA endpoint as
  `src` (browser sends the SA cookie automatically).
- PDFs surface as "Abrir PDF" links opening in a new tab; the strict
  response headers ensure the browser sandboxes them.
- Quarantined files are a button with `window.confirm()` warning before
  appending `?force=1` and triggering a download.

## Permissions

| Action | Role | Notes |
|---|---|---|
| List/read tickets | SUPERADMIN | All routes under `/sa/support/**` and `/api/v1/sa/support/**` |
| Reply / change status | SUPERADMIN | OUTBOUND messages routed through Resend |
| Add internal note | SUPERADMIN | Stored as `direction = INTERNAL`, never exposed to customers |
| Download attachment | SUPERADMIN | Quarantined requires explicit `?force=1` |
| Webhook ingest | (Resend) | Signature-verified; no session |
| Cron stale-pending | Vercel cron | `Authorization: Bearer ${CRON_SECRET}` |

## Database

- `SupportTicket` — status, lastMessageAt, fromEmail, subjectNormalized
- `SupportMessage` — direction (INBOUND/OUTBOUND/INTERNAL), bodyEncrypted,
  rfc822MessageId (unique nullable for idempotency)
- `SupportAttachment` — id, messageId (cascade), filename, mimeType,
  sizeBytes, sha256, storageKey, quarantined, createdAt
  - Indexes: `(messageId)`, `(sha256)`

## Audit actions used by this surface

```
SUPPORT_TICKET_RECEIVED
SUPPORT_TICKET_REPLIED
SUPPORT_TICKET_STATUS_CHANGED
SUPPORT_TICKET_AUTO_CLOSED
SUPPORT_NOTE_ADDED
SUPPORT_ATTACHMENT_STORED
SUPPORT_ATTACHMENT_QUARANTINED
SUPPORT_ATTACHMENT_DOWNLOADED
```

## Operational notes

- The `support-attachments` bucket **must exist** in every environment
  before inbound emails with attachments will succeed end-to-end. The
  ingest helper does not auto-create it.
- ENCRYPTION_KEY rotation: `decryptBuffer()` walks the same
  current/previous, versioned/legacy chain as `decrypt()`, so rolling
  the key does not break historical attachments.
- The cron route is exempt from middleware auth — only the
  `CRON_SECRET` Bearer check protects it.
