# State Management and Event Flows

Psycologger uses a minimal, server-first architecture with strategic client-side state and event-driven side effects.

## Global State

### NextAuth Session
- **Purpose**: The only cross-component shared state
- **Provider**: `SessionProvider` wraps app (from NextAuth)
- **Access**: via `useSession()` hook in client components
- **Structure**:
  ```typescript
  {
    user: {
      id: string,
      email: string,
      name: string,
      role: 'admin' | 'therapist' | 'receptionist',
      clinicId: string,
      avatar?: string
    },
    expires: ISO8601 timestamp,
    status: 'loading' | 'authenticated' | 'unauthenticated'
  }
  ```
- **Refresh**: Automatic via NextAuth, token refresh on route change
- **JWT Token**: Stored in secure httpOnly cookie, 30-day expiration
- **Client-Side Check**: `useSession()` with status check before rendering protected content
- **Server-Side Check**: `getServerSession()` in API routes and Server Components

### SessionProvider Configuration
- **Location**: `src/providers.tsx` (wraps entire app)
- **Options**:
  - `session`: Prop-passed session from getServerSession (initial SSR)
  - `refetchInterval`: 5 minutes (background token refresh)
  - `refetchOnWindowFocus`: true (refresh when tab regains focus)
  - `signoutCallback`: Redirects to login page

## Local State (Component-Level)

### Form State
- **Library**: React's `useState` hook
- **Pattern**: Each form maintains its own state for inputs
- **Example** (NewAppointmentClient):
  ```typescript
  const [patientId, setPatientId] = useState('');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  ```
- **Validation**: Real-time feedback on change or blur
- **Submission**: Client validates, then POST to API; on error, update `errors` state
- **File Uploads**: Separate loading state for upload progress

### UI State
- **Loading Indicators**: `isLoading` boolean during API calls
- **Error Messages**: `error` string or `errors` object by field
- **Modal Open/Close**: `isOpen` boolean toggled by buttons
- **Tab/Accordion Selection**: `activeTab` or `expandedSections` set
- **Pagination**: `currentPage` number managed in component
- **Filters**: `searchTerm`, `filterByStatus`, `filterByDate` etc.
- **Dropdown Open**: Some components use UI-level state for dropdown visibility

### Editor State (SessionEditor)
- **Content**: Current session notes (rich text)
- **Template**: Selected template (SOAP/BIRP/FREE)
- **Dirty Flag**: Boolean to track unsaved changes
- **Last Saved**: Timestamp for UI display
- **Attachment List**: Array of uploaded files with metadata
- **Revision History**: Fetched from server, displayed in modal

### Portal State
- **Journal Entry Form**: Scores (mood, anxiety, energy, sleep), notes, attachments
- **Profile Edit**: Editable field values with original values for cancel
- **Charge List**: Current tab (pending/paid), filters, sort order
- **Notifications List**: Read/unread status, modal open for detail view

## Server State Management

### Fetch Strategy
- **Server Components**: Fetch data in component body, await, render directly
- **Client Components**: Fetch in `useEffect`, manage loading/error states, show skeleton while fetching
- **API Routes**: GET, POST, PUT routes handle database queries
- **Database**: PostgreSQL via Prisma ORM (Supabase)

### Data Fetching in Client Components
```typescript
useEffect(() => {
  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/patients?search=${searchTerm}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setPatients(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setPatients([]);
    } finally {
      setIsLoading(false);
    }
  };
  fetchPatients();
}, [searchTerm]); // Re-fetch when searchTerm changes
```

### Caching Approach
- **No client-side caching**: Each useEffect fetch is a fresh GET request
- **Browser HTTP cache**: Leveraged via Cache-Control headers on API responses
- **Stale After**: API responses generally cacheable for 5-60 seconds
- **Invalidation**: Manual (button click to refetch) or automatic (route change)
- **No SWR/React Query**: Avoided to keep stack minimal

### Data Refetching
- **Manual Refresh**: "Refresh" button calls fetchFunction() again
- **Route Navigation**: New route = new useEffect with fresh fetch
- **Mutation Success**: After POST/PUT/DELETE, usually redirect or call fetch again
- **Polling**: None by default; TimerComponent can implement with setInterval

## Optimistic Updates

### Portal Notifications (Mark as Read)
- **Scenario**: Patient clicks "Mark as read" on notification
- **UI Update**: Immediate (optimistic) - notification appears read
- **API Call**: PATCH `/api/v1/patient/notifications/[id]/read` sent in background
- **Rollback**: If API fails, revert UI state to unread + show error toast
- **Pattern**:
  ```typescript
  const [notifications, setNotifications] = useState([]);

  const markAsRead = async (notificationId) => {
    const original = notifications.find(n => n.id === notificationId);
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? {...n, read: true} : n)
    );

    try {
      await fetch(`/api/v1/patient/notifications/${notificationId}/read`, {
        method: 'PATCH'
      });
    } catch (err) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? original : n)
      );
      toast.error('Failed to mark as read');
    }
  };
  ```

### Journal Entry Edit (Potential Future)
- **Could implement**: Optimistic save of journal edits
- **Currently**: Debounced auto-save with server confirmation

## Event Triggers & Side Effects

### Audit Logging (49 Event Types)
- **Trigger Points**:
  - Patient created/updated/deleted
  - Appointment created/rescheduled/cancelled/completed
  - Session created/edited/deleted
  - Charge created/edited/paid/voided
  - User created/deactivated
  - Settings changed
  - Journal entry created/edited/deleted
  - Login/logout attempts
  - Export requested
  - Consent accepted/changed
  - Reminder email sent
  - File uploaded/deleted
  - And 30+ more actions
- **Implementation**: POST to `/api/v1/audit` in each API route handler
- **Payload**:
  ```typescript
  {
    action: 'APPOINTMENT_CREATED',
    userId: string,
    resourceId: string,
    resourceType: 'appointment' | 'patient' | ... ,
    details: {
      appointmentId: string,
      patientId: string,
      date: string,
      therapistId: string
    },
    timestamp: ISO8601,
    ipAddress: string,
    userAgent: string
  }
  ```
- **Storage**: Immutable Audit table in database, never updated/deleted
- **Retention**: Configurable (default 7 years for legal compliance)
- **Access**: Visible only to clinic admin (via /app/audit)
- **Export**: CSV export available for compliance reviews

### Email Notifications (Fire-and-Forget)
- **Trigger Points**:
  - **Appointment Confirmation**: When appointment created, email sent to patient
  - **Appointment Reminder**: Cron job daily 9 AM, sends to patients with appointments tomorrow
  - **Appointment Cancellation**: When therapist cancels, cancellation email sent
  - **Charge Created**: Notification email sent to patient (via portal)
  - **Charge Reminder**: Manual send option, cron job (configurable)
  - **Patient Invitation**: When new patient account created, activation link emailed
  - **Password Reset**: Magic login link emailed on request
  - **Portal Message**: When therapist posts note on journal entry, notification email sent
- **Service**: Resend email platform (requires RESEND_API_KEY)
- **Error Handling**: Fire-and-forget pattern (non-fatal failure)
  - API logs send failure but doesn't block user operation
  - Failed sends retried asynchronously (future enhancement)
  - User sees success toast even if email fails (transparent degradation)
- **Templates**: Handlebars templates in `src/emails/` with variables:
  - Patient name, therapist name, appointment date/time, charge amount, etc.
- **From Address**: EMAIL_FROM env var (default: "Psycologger <noreply@psycologger.com>")
- **Unsubscribe**: Portal preferences control which emails patient receives

### Cron Jobs

#### Payment Reminder Cron
- **Endpoint**: POST `/api/v1/cron/payment-reminders`
- **Schedule**: Daily at 9:00 AM (UTC, via Vercel Cron)
- **Auth**: Bearer token via CRON_SECRET header (env var)
- **Logic**:
  1. Find all charges due tomorrow (dueDate == today + 1 day)
  2. Find all overdue charges (dueDate < today and status not paid)
  3. For each charge, fetch patient email from database
  4. Send email via Resend with amount, due date, payment link
  5. Update charge.reminderSentAt timestamp
  6. Log action to audit table
- **Error Handling**: If send fails for one charge, continue with next (don't block cron)
- **Database Transaction**: All updates in single transaction for consistency
- **Idempotency**: Query checks reminderSentAt to avoid duplicate sends on same day
- **Response**: Returns count of reminders sent (e.g., `{ sent: 23, failed: 1 }`)

### Portal Notifications (Database-Stored)
- **Types**:
  - Appointment reminder (created 24h before appointment)
  - Appointment confirmation (created when appointment scheduled)
  - Charge notification (created when charge created)
  - Therapist message (created when therapist posts note)
  - System announcement (created by clinic admin)
- **Storage**: Notifications table in database (associated with patient)
- **Access**: Patient views via `/portal/notifications` endpoint
- **State**: read/unread boolean, createdAt, expiresAt (optional auto-delete)
- **Creation**: POST `/api/v1/notifications` called from related API routes
- **Delivery**: Database-stored (not pushed to client in real-time, polling in portal)
- **Mark as Read**: PATCH `/api/v1/patient/notifications/[id]/read`
- **Dismiss/Archive**: PATCH `/api/v1/patient/notifications/[id]/archived`

### Crisis Flagging (Journal Entries)
- **Trigger**: Patient creates or edits journal entry
- **Detection**: Server-side keyword scan on notes field
- **Keywords** (case-insensitive):
  - "crisis", "emergency", "suicidal", "suicide", "kill myself", "harm myself", "hurt myself"
  - "danger", "dangerous", "self-harm", "self harm"
  - Portuguese: "crise", "emergência", "suicida", "me machucar", "me ferir"
  - And similar in both languages
- **Action on Detection**:
  1. Set `journalEntry.crisis = true` in database
  2. Create notification for assigned therapist: "Crisis keyword detected in journal entry"
  3. Send email to therapist (real-time alert)
  4. Log audit event: "JOURNAL_ENTRY_CRISIS_FLAGGED"
  5. Show badge in therapist's journal inbox
- **Therapist Action**: Therapist acknowledges/reviews entry, contacts patient if needed
- **Portal Display**: Warning badge on entry ("This entry contains sensitive content")
- **No Automatic Action**: Crisis flag does not auto-contact authorities; therapist must respond

## State Lifecycle Example: Appointment Creation

### User Flow & State Changes
1. **Navigate to New Appointment** (`/app/appointments/new`)
   - Component mounts, `NewAppointmentClient` initializes state
   - State: `{ patientId: '', date: null, time: '', duration: 60, isLoading: false, errors: {} }`

2. **Select Patient**
   - User types in typeahead, `onChange` filters patient list
   - State: `{ ...prev, patientId: string (selected) }`

3. **Pick Date & Time**
   - User clicks date picker, selects date
   - User selects time (checks availability)
   - State: `{ ...prev, date: Date, time: string }`

4. **Fill Other Fields**
   - Type, duration, notes, tags
   - State updates for each field

5. **Submit Form**
   - User clicks "Create Appointment"
   - Client validates: patientId required, time in future, no conflicts
   - State: `{ ...prev, isLoading: true, errors: {} }`
   - Button disabled + spinner shown

6. **API Call**
   - POST `/api/v1/appointments` with appointment data
   - Server validates again, checks double-booking, generates recurring series if needed
   - Server creates appointments in database
   - Server **triggers side effects**:
     - Audit log entry created
     - Patient email sent (fire-and-forget)
     - Cron scheduled for reminder email (Vercel Cron)
   - Server responds with `{ success: true, appointmentId: string }`

7. **Handle Response**
   - Client receives 201 response
   - State: `{ ...prev, isLoading: false }`
   - Show toast: "Appointment created"
   - Redirect to `/app/appointments/[id]` (detail view)

8. **Error Scenario**
   - Server rejects (e.g., "Patient not found" or "Conflict with existing appointment")
   - Client receives 400/409 response with `{ error: message }`
   - State: `{ ...prev, isLoading: false, errors: { general: message } }`
   - Error displayed in UI, form remains for correction
   - User can edit and retry

### Server-Side Event Flow
```
POST /api/v1/appointments
  ↓
Validate input (patientId, date, time, duration)
  ↓
Check patient exists
  ↓
Check therapist availability (if assigned)
  ↓
Check for double-booking
  ↓
Create appointment(s) in database (with transaction if recurring)
  ↓ (Side effects triggered)
  ├─→ POST /api/v1/audit { action: 'APPOINTMENT_CREATED', ... }
  ├─→ await sendEmail('appointmentConfirmation', patient.email, { appointmentDate, therapistName })
  │   (Note: fire-and-forget, non-blocking)
  └─→ (Cron scheduled automatically by Vercel at appointment time - 24h)
  ↓
Return 201 with appointmentId
```

## State Cleanup & Teardown

### Component Unmount
- **useEffect Cleanup**: Timers/intervals cleared
- **Example** (SessionEditor auto-save):
  ```typescript
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSession(); // PUT /api/v1/sessions/[id]
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(timer); // Cleanup on unmount/dependency change
  }, [content]);
  ```

### Route Navigation
- **useEffect deps**: Route param changes (e.g., patient ID) trigger cleanup + refetch
- **Abort Controller** (future enhancement): Could cancel in-flight API calls on unmount

## Concurrency Considerations

### Race Conditions Avoided
- **Form Submission**: Button disabled during request (prevents double-submit)
- **List Refetch**: setLoading(true) before fetch, prevents stale re-renders
- **Navigation**: Router-level guards (useSession checks before rendering protected pages)

### Potential Issues (Not Currently Handled)
- **Simultaneous Edits**: If therapist A and therapist B edit same session simultaneously, last write wins (no conflict detection)
- **Offline Changes**: No offline mode; if network drops, unsaved changes lost
- **Concurrent Cron**: If same cron fires twice, could send duplicate reminder emails (idempotency via timestamp check mitigates)

## Future Enhancements

### Planned Improvements
- **React Query/SWR**: Add cache-based data fetching for better performance
- **WebSocket Notifications**: Real-time notifications instead of polling
- **Offline Mode**: Service worker + IndexedDB for offline editing
- **Undo/Redo**: State history in session editor
- **Conflict Detection**: Session merge strategy for simultaneous edits
- **Batch Operations**: Bulk update/delete with optimistic UI
