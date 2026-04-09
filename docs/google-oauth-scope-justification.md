# Google OAuth Scope Justification — Psycologger

## Application Overview

**Psycologger** is a SaaS platform for psychology and mental health practices. It helps therapists and clinics manage appointments, clinical notes, billing, and patient communication.

**Homepage:** https://psycologger.vercel.app
**Privacy Policy:** https://psycologger.vercel.app/privacy
**Terms of Service:** https://psycologger.vercel.app/terms

---

## Requested Scopes

### 1. `https://www.googleapis.com/auth/calendar`

**Why we need it:** Psycologger allows mental health professionals to sync their patient appointments with Google Calendar. This scope enables the application to list the user's available calendars so the professional can choose which calendar to sync appointments to.

**How we use it:**
- List the user's calendars (read-only) so they can select a target calendar
- The user explicitly chooses which calendar to use in the Psycologger settings page

**What we do NOT do:**
- We do not read, modify, or delete any existing calendar events created by the user
- We do not access calendar data beyond the list of calendars and events we create

### 2. `https://www.googleapis.com/auth/calendar.events`

**Why we need it:** When a therapist creates, reschedules, or cancels an appointment in Psycologger, the corresponding event is automatically created, updated, or removed in their selected Google Calendar. This eliminates double-entry and reduces scheduling errors.

**How we use it:**
- **Create events** when a new patient appointment is scheduled in Psycologger
- **Update events** when an appointment is rescheduled (new date/time)
- **Delete events** when an appointment is cancelled
- Each synced event includes: appointment date/time, duration, and patient first name (no clinical data)

**What we do NOT do:**
- We do not read events the user created outside of Psycologger
- We do not include any clinical notes, session content, or sensitive health information in calendar events
- We do not share calendar data with any third party

---

## Data Handling & Security

- **Encrypted token storage:** Google OAuth tokens (access + refresh) are encrypted with AES-256-GCM before being stored in our database. The encryption key is never exposed in client-side code.
- **Per-user authorization:** Each therapist individually connects their own Google account. The application does not use a shared service account.
- **Revocation:** Users can disconnect their Google Calendar at any time from the Psycologger settings page, which immediately deletes their stored tokens.
- **Minimal data in events:** Calendar events contain only the appointment time, duration, and patient first name. No diagnosis, clinical notes, or sensitive health data is ever written to Google Calendar.
- **Multi-tenant isolation:** Each clinic's data is isolated; one clinic cannot access another's calendar tokens or appointment data.

---

## User Flow

1. Therapist navigates to **Settings → Integrations → Google Calendar** and clicks "Connect"
2. They are redirected to Google's OAuth consent screen
3. After granting access, they return to Psycologger and select which calendar to use
4. From this point, appointments created/updated/cancelled in Psycologger are automatically reflected in their Google Calendar
5. To disconnect, the therapist clicks "Disconnect" in settings, which deletes stored tokens

---

## Google API Services User Data Policy Compliance

Psycologger's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements:

1. We only use Google Calendar data to provide the calendar sync feature described above
2. We do not transfer Google data to third parties (except as needed for infrastructure — encrypted at rest)
3. We do not use Google data for advertising or marketing purposes
4. We do not allow humans to read Google data except where the user has given affirmative consent, it is necessary for security purposes, or it is necessary to comply with applicable law
