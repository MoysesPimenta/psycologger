# Components Reference

Psycologger's component architecture is organized into four categories: UI primitives for basic interactions, shell layout components, portal-specific patient interface components, and domain-specific feature components.

## UI Primitives (src/components/ui/)

These reusable, unstyled-by-default components form the foundation of all interfaces. They use shadcn/ui patterns with Tailwind CSS.

### Button
- **Purpose**: Triggerable action element with variants and states
- **File**: `ui/button.tsx`
- **Variants**:
  - `default`: Primary action (blue background)
  - `secondary`: Secondary action (gray background)
  - `destructive`: Delete/cancel action (red background)
  - `outline`: Bordered button
  - `ghost`: Minimal button (text only)
  - `link`: Text-only button styled as link
- **Sizes**: `sm`, `default`, `lg`
- **Props**:
  - `variant`: button style variant
  - `size`: button size
  - `loading`: boolean to show spinner and disable button
  - `disabled`: boolean to disable interaction
  - `onClick`: click handler function
  - `className`: Tailwind classes
  - `children`: button label (text or React elements)
- **Usage**: Staff app actions, form submissions, portal navigation
- **Accessibility**: Keyboard focusable, proper role attributes

### Input
- **Purpose**: Text input field for forms
- **File**: `ui/input.tsx`
- **Types**: text, email, password, number, date, time, phone, search, url, file
- **Props**:
  - `type`: HTML input type
  - `placeholder`: hint text
  - `value`: controlled value
  - `onChange`: change handler
  - `disabled`: boolean
  - `required`: boolean
  - `className`: Tailwind classes
  - `ref`: ref forwarding for imperative use
- **Styling**: Border, padding, focus ring, validation states
- **Validation**: Client-side type checking; server validation in forms
- **Usage**: Patient data forms, appointment creation, search fields

### Label
- **Purpose**: Form field label with optional required indicator
- **File**: `ui/label.tsx`
- **Props**:
  - `children`: label text
  - `htmlFor`: link to input id
  - `className`: Tailwind classes
  - `required`: boolean to show asterisk
- **Styling**: Gray text, bold font weight
- **Usage**: Always paired with Input or textarea fields
- **Accessibility**: Associated with form inputs via `htmlFor`

### Card
- **Purpose**: Container for grouped content
- **File**: `ui/card.tsx`
- **Subcomponents**:
  - `Card`: Root container (white background, rounded border, shadow)
  - `CardHeader`: Top section (border-bottom, padding)
  - `CardTitle`: Header title (24px font, bold)
  - `CardDescription`: Header subtitle (gray, smaller font)
  - `CardContent`: Main content area (padding)
  - `CardFooter`: Bottom section (flex layout, gap, border-top)
- **Props**: All accept `className` for Tailwind overrides
- **Usage**: Dashboard cards, detail panels, grouped settings, modal content
- **Variants**: Can be nested for complex layouts

### Badge
- **Purpose**: Small label or status indicator
- **File**: `ui/badge.tsx`
- **Variants**:
  - `default`: Gray background, primary text
  - `secondary`: Light gray, secondary text
  - `success`: Green background for positive states
  - `destructive`: Red background for errors/warnings
- **Sizes**: `default` (small), `lg` (larger)
- **Props**:
  - `variant`: badge style
  - `className`: Tailwind classes
  - `children`: badge text
- **Usage**: Status tags, priority labels, category indicators (patient tags, appointment status)
- **Accessibility**: Conveyed with text + color, not color alone

### Toast / Toaster
- **Purpose**: Non-modal notification system for feedback
- **File**: `ui/toast.tsx`, `ui/toaster.tsx`
- **Toast Component**:
  - `variant`: success, error, default
  - `title`: notification headline
  - `description`: additional message
  - `action`: optional action button
  - `open`: controlled visibility
  - `onOpenChange`: dismiss handler
- **Toaster Component**: Root container (renders multiple toasts stacked in top-right)
- **Hook Integration**: Managed via `use-toast` hook
- **Usage**: Success notifications after form submission, error alerts, confirmations
- **Auto-dismiss**: Toasts auto-hide after 5 seconds
- **Accessibility**: ARIA alert role, keyboard closable

## Shell Components (src/components/shell/)

### AppSidebar
- **Purpose**: Main navigation and user profile menu for staff app
- **File**: `shell/app-sidebar.tsx`
- **Location**: Left sidebar on desktop, collapsible on mobile
- **Sections**:
  - Logo / clinic name (top)
  - Main navigation menu:
    - Today
    - Calendar
    - Patients
    - Appointments
    - Sessions
    - Financial
    - Journal Inbox
    - Reports
    - Audit Log
    - Settings (with dropdown submenu)
  - User profile section (bottom):
    - Avatar, name, email
    - Logout button
    - Settings shortcut
- **Props**:
  - `user`: current user object (name, email, avatar)
  - `currentRoute`: active route for highlighting
- **Responsive**:
  - Desktop: Fixed sidebar, always visible
  - Tablet: Collapsible sidebar with toggle button
  - Mobile: Slide-out drawer, dismissible
- **Styling**: Dark gray background, white text, hover states on menu items
- **Icons**: lucide-react icons for each menu item
- **Accessibility**: Proper navigation landmark, skip link, keyboard navigation

## Portal Components (src/components/portal/)

Portal components are optimized for patient use and mobile-first design. They include safety disclaimers and crisis resources.

### PortalShell
- **Purpose**: Root layout wrapper for entire patient portal
- **File**: `portal/portal-shell.tsx`
- **Sections**:
  - Safety disclaimer header (pt-BR message)
  - Main content area
  - Bottom navigation (mobile) / side drawer (tablet+)
  - Crisis resources fixed footer button
- **Navigation Items**: Dashboard, Sessions, Journal, Payments, Profile, Notifications, Help
- **Mobile Features**:
  - Bottom tab bar with icons
  - Large touch targets (48px+)
  - Dark mode support
- **Tablet/Desktop**: Responsive drawer layout
- **Crisis Button**: Always visible, links to emergency resources
- **User Info**: Collapsible profile with logout

### PortalErrorBoundary
- **Purpose**: Catch and display portal component errors gracefully
- **File**: `portal/portal-error-boundary.tsx`
- **Behavior**:
  - Catches JavaScript errors in child components
  - Displays user-friendly error message in pt-BR
  - Suggests actions (try again, go to dashboard, contact support)
  - Logs errors for monitoring (Sentry integration)
- **Props**: `children` (wrapped components)
- **Fallback UI**: Error card with retry button

### PortalCrisisCard
- **Purpose**: Emergency resources and crisis hotline information
- **File**: `portal/portal-crisis-card.tsx`
- **Content**:
  - Brazilian crisis hotline numbers:
    - CVV (Suicide Prevention): 188
    - SAMU (Ambulance): 192
    - Police: 190
  - Therapist emergency contact option
  - "This is not for emergencies" disclaimer
  - "Call emergency services" CTA button
- **Design**: Red accent color, prominent placement
- **Accessibility**: Semantic HTML, high contrast text

### PortalLoginClient
- **Purpose**: Email-based patient login form
- **File**: `portal/portal-login-client.tsx`
- **Form Fields**:
  - Email input with validation
  - Password input (masked)
  - Remember me checkbox (future)
- **Actions**:
  - Login button (with loading state)
  - Forgot password link (redirects to magic login)
  - Sign up / activation link
- **Client-side State**: Loading, error messages, form validation
- **Submit Handler**: Calls login API endpoint with email/password
- **Error Handling**: Shows error messages from server (invalid credentials, account locked)

### PortalActivateClient
- **Purpose**: First-time patient account setup wizard
- **File**: `portal/portal-activate-client.tsx`
- **Steps**:
  1. Email verification (pre-filled from invitation)
  2. Set password (with strength indicator)
  3. Accept consent forms (checkboxes with links to legal docs)
  4. Emergency contact setup (name, relationship, phone)
  5. Preferences (notifications, communication method)
- **State**: Current step, form data, loading states
- **Validation**: Password strength (min 8 chars, uppercase, number, symbol), email format
- **Submit**: POST to `/api/v1/auth/activate` with activation code
- **Redirect**: To dashboard on success

### PortalMagicLoginClient
- **Purpose**: Passwordless login via email link
- **File**: `portal/portal-magic-login-client.tsx`
- **Flow**:
  1. Email entry form
  2. Submit sends login link to email
  3. Success message "Check your email"
  4. Link click auto-logs in patient (token in URL)
- **Client State**: Email input, loading, success message
- **API Call**: POST `/api/v1/auth/magic-login` with email
- **Token Handling**: Token passed via URL param, verified server-side

### PortalDashboardClient
- **Purpose**: Patient home screen with key information
- **File**: `portal/portal-dashboard-client.tsx`
- **Sections**:
  - Welcome message (personalized with patient name)
  - Next appointment card:
    - Date, time, therapist name, location
    - "Join video session" link (if video appointment)
    - "Reschedule" option
  - Quick actions (cards with links):
    - View pending charges
    - New journal entry
    - View notifications
    - View/pay invoices
  - Recent journal entries (preview cards)
  - Pending charges summary
- **Data Fetching**: useEffect with API call to `/api/v1/patient/dashboard`
- **Loading State**: Skeleton placeholders
- **Error State**: Error card with retry button

### PortalSessionsClient
- **Purpose**: List and quick view of completed therapy sessions
- **File**: `portal/portal-sessions-client.tsx`
- **Display**:
  - Reverse chronological list of sessions
  - Each session shows: date, therapist, duration, notes preview
- **Actions**: Click to view full session detail
- **Filters**: Date range, therapist filter (dropdown)
- **Pagination**: Load more or infinite scroll
- **Data Fetching**: GET `/api/v1/patient/sessions`

### PortalSessionDetailClient
- **Purpose**: View single completed session with notes
- **File**: `portal/portal-session-detail-client.tsx`
- **Display**:
  - Session header (date, therapist, duration)
  - Clinical notes (read-only, therapist-controlled visibility)
  - Audio/video session link (if recorded)
    - **Video Player**: Redacted player that prevents download/screen capture
    - URL visible but player UI obscures URL
  - Attachments (view-only)
  - Session metadata (mood before/after if logged)
- **Access Control**: Only patient's own sessions visible
- **Download Prevention**: Video/audio links expire after 24 hours

### PortalJournalListClient
- **Purpose**: Patient mood journal entry list with quick stats
- **File**: `portal/portal-journal-list-client.tsx`
- **Display**:
  - Reverse chronological list of entries
  - Each entry card: date, mood score (1-10), mood emoji, preview text
  - Color coding by mood (red=low, yellow=medium, green=high)
- **Quick Stats** (over selected date range):
  - Average mood, anxiety, energy, sleep scores
  - Mini chart showing trend
- **Filters**: Date range picker
- **Actions**: Click entry to view/edit detail, "+ New Entry" button
- **Data Fetching**: GET `/api/v1/patient/journal` with date range params

### PortalJournalDetailClient
- **Purpose**: View and edit single journal entry
- **File**: `portal/portal-journal-detail-client.tsx`
- **Display**:
  - Full entry with all scores (mood, anxiety, energy, sleep)
  - Free-text notes (read-only initially)
  - Attachments (images, audio voice memos)
  - "Shared with therapist" badge
  - Therapist response section (if therapist has commented)
  - Date/time of entry
- **Edit Mode**:
  - Available within 24 hours of creation
  - Edit scores and notes
  - Toggle share with therapist
  - Delete option (soft delete)
- **Crisis Detection**: Text analyzed for keywords; if detected, shows warning badge "Therapist will see this entry marked urgent"

### PortalJournalNewClient
- **Purpose**: Create new journal entry
- **File**: `portal/portal-journal-new-client.tsx`
- **Form Fields**:
  - Date (defaults to today)
  - Time (defaults to now)
  - Mood score slider (1-10)
  - Anxiety score slider (1-10)
  - Energy score slider (1-10)
  - Sleep quality slider (1-10)
  - Mood emoji picker (optional visual)
  - Free-text notes textarea
  - Attachments (upload images, voice memo recording)
  - Checkbox: "Share with therapist" (default: true)
  - Optional: "This is urgent" checkbox
- **Client State**: Form data, validation errors, upload progress, loading
- **Submit Handler**:
  - POST `/api/v1/patient/journal` with entry data
  - Crisis keyword check (server-side)
  - On success: redirect to journal list with success toast
- **Voice Recording**: Optional audio capture for mood/feelings
- **Accessibility**: Large labels, simple color choices

### PortalPaymentsClient
- **Purpose**: View patient charges and payment status
- **File**: `portal/portal-payments-client.tsx`
- **Tabs**:
  - Pending: Unpaid charges with due dates, sorted by due date (earliest first)
  - Paid: Historical paid charges, sorted by paid date
- **For Each Charge Card**:
  - Amount in R$ (bold, large)
  - Description (service/appointment type)
  - Due date (red if overdue)
  - "Pay Now" button (links to payment gateway)
  - Receipt link (if paid)
- **Summary**: Total due, overdue amount, next payment date
- **Data Fetching**: GET `/api/v1/patient/charges`
- **Pagination**: Server-side or infinite scroll for many charges

### PortalProfileClient
- **Purpose**: Patient profile settings and preferences
- **File**: `portal/portal-profile-client.tsx`
- **Editable Sections**:
  - **Personal Info** (collapsible):
    - Name, email, phone, birth date
    - Can edit all fields
  - **Emergency Contact** (collapsible):
    - Contact name, relationship, phone
    - Can edit
  - **Preferences** (collapsible):
    - Notification method (email, SMS, in-app)
    - Communication preference (email, phone, portal message)
    - Timezone
    - Language (pt-BR, en)
  - **Therapy Info** (read-only):
    - Therapist name, clinic name, start date
    - Clinic phone number
- **Edit Workflow**: Click "Edit" button, make changes, click "Save"
- **Validation**: Email format, phone format, required fields
- **Submit Handler**: PUT `/api/v1/patient/profile` with updated data
- **Success Feedback**: Toast confirmation

### PortalPrivacyClient
- **Purpose**: Consent and privacy management
- **File**: `portal/portal-privacy-client.tsx`
- **Sections**:
  - **Current Consent**: Display current accepted consent form with accept/decline options
  - **Consent History**: List of all versions accepted with dates
  - **View Consent Document**: Link to full text in modal
  - **Data Preferences**:
    - Opt-in to research/studies
    - Opt-in to analytics
    - Opt-in to appointment reminders
  - **Data Rights**:
    - Download my data (CSV export)
    - Delete my account (with confirmation warning)
    - Privacy Policy link
    - Terms of Service link
- **Destructive Actions**: Confirmation modal required for delete
- **API Calls**:
  - Accept consent: POST `/api/v1/patient/consent/accept`
  - Delete data: POST `/api/v1/patient/data/delete`

### PortalNotificationsClient
- **Purpose**: Inbox for all patient notifications
- **File**: `portal/portal-notifications-client.tsx`
- **Notification Types**:
  - Appointment reminders (24h before)
  - Appointment confirmations
  - Charge notifications
  - Therapist messages
  - System announcements
  - Journal responses from therapist
- **Display**: List of notifications with timestamp, type icon, title, preview text
- **Actions**:
  - Click to open and read full notification
  - Mark as read / mark as unread
  - Dismiss / archive
  - Delete
- **Unread Badge**: Shows count of unread notifications in navigation
- **Data Fetching**: GET `/api/v1/patient/notifications` with pagination
- **Sorting**: Most recent first
- **Filter**: Show unread / all notifications

## Domain Components (src/components/)

Domain-specific components handle feature-level logic and data orchestration.

### PatientsClient
- **Purpose**: Staff view of all patients in searchable, filterable list
- **File**: `components/patients-client.tsx`
- **Features**:
  - Full-text search by name, email, phone, CPF
  - Filter by tags, status (active/inactive), date range
  - Sortable columns: name, last appointment, total charges, status
  - Pagination (20 per page default)
- **Table Columns**: Name, ID/CPF, Status badge, Tags (up to 3 visible), Contact, Last Appointment, Actions
- **Row Actions**: View profile, create appointment, create session, edit, deactivate
- **API**: GET `/api/v1/patients` with query params for search/filter/sort/pagination
- **State**: Search term, filters, current page, loading, error
- **Mobile**: Responsive table (scrolls horizontally on small screens)

### PatientDetailClient
- **Purpose**: Full patient profile for staff with all related data
- **File**: `components/patient-detail-client.tsx`
- **Sections** (accordion or tabs):
  - **Demographics**: Name, birth date, CPF, email, phone, address, tags
  - **Emergency Contacts**: List of emergency contacts with edit/delete
  - **Clinical Info**: Diagnoses (ICD codes), clinical notes, intake date, status
  - **Appointments**: Upcoming and past appointments list with status
  - **Sessions**: List of clinical sessions with dates
  - **Charges**: Financial history (paid, pending, overdue)
- **Side Actions** (floating button or action menu):
  - New appointment
  - New session
  - Edit patient
  - Send message/email
  - Export patient data
  - Add note
- **Data Fetching**: GET `/api/v1/patients/[id]` (includes related data)
- **Responsive**: Mobile-friendly accordion layout, desktop uses tabs

### NewPatientClient / EditPatientClient
- **Purpose**: Patient creation and editing form
- **Files**: `components/new-patient-client.tsx`, `components/edit-patient-client.tsx`
- **Form Fields** (same for both):
  - **Personal Info**: Full name, preferred name, email, phone, birth date
  - **Document**: CPF, RG, profession
  - **Address**: Street, number, complement, city, state, ZIP
  - **Emergency Contact**: Name, relationship, phone (repeatable)
  - **Clinical**: Diagnoses (searchable ICD-10 picker), clinical notes, tags (multi-select)
  - **Intake**: Intake date, referring source, initial assessment notes
- **Validation**: Email format, phone format (accepts various Brazilian formats), CPF check digit validation
- **Submit Handler**:
  - New: POST `/api/v1/patients` creates patient
  - Edit: PUT `/api/v1/patients/[id]` updates patient
- **Redirect**: On success, goes to patient detail page
- **File Attachments**: Optional intake documents (PDF, images)

### CalendarClient
- **Purpose**: Visual calendar view of all appointments
- **File**: `components/calendar-client.tsx`
- **Library**: react-big-calendar
- **Views**: Month, week, day, agenda (switchable buttons)
- **Features**:
  - Color-coding by appointment type
  - Click event to view/edit appointment
  - Drag appointment to reschedule (with validation)
  - Double-click to create new appointment
  - Filters (by therapist, type, status)
  - Current day/time indicator
- **Data**: GET `/api/v1/appointments` with date range
- **Loading**: Skeleton events while loading
- **Responsive**: Mobile uses week view by default

### TodayClient
- **Purpose**: Dashboard of today's schedule and quick actions
- **File**: `components/today-client.tsx`
- **Sections**:
  - **Upcoming Appointments** (scrollable list):
    - Time, patient name, appointment type, location, status
    - Action buttons (view, reschedule, complete, send reminder)
  - **Quick Actions** (large buttons):
    - New appointment
    - New patient
    - View charges
    - View journal inbox
  - **Pending Tasks**:
    - Unreviewed journal entries
    - Overdue charges
    - Awaiting action appointments (confirmations)
  - **Stats** (cards):
    - Appointments today, revenue today, patients this month
- **Data Fetching**: GET `/api/v1/appointments?date=today` and related endpoints
- **Refresh**: Auto-refresh every 5 minutes, manual refresh button

### NewAppointmentClient
- **Purpose**: Create new appointment with recurring support
- **File**: `components/new-appointment-client.tsx`
- **Form Fields**:
  - **Patient**: Searchable typeahead (by name, email, phone)
  - **Date/Time**: Calendar + time picker, shows availability
  - **Duration**: Dropdown (15min, 30min, 60min, 90min, 120min)
  - **Type**: Dropdown of appointment types (affects billing)
  - **Location**: Text field (address or "Video Conference")
  - **Notes**: Optional notes for therapist
  - **Tags**: Multi-select internal tags
  - **Recurring**: Toggle + options:
    - Frequency (daily, weekly, biweekly, monthly)
    - End date or count
    - Days of week (for weekly)
- **Validation**: Patient required, time in business hours, no double-booking, date in future
- **Availability Check**: Shows therapist availability for selected patient
- **Submit Handler**:
  - POST `/api/v1/appointments` (creates single)
  - POST `/api/v1/appointments/recurring` (creates series)
- **Success**: Confirmation toast, redirects to appointment detail
- **Email**: Confirmation email auto-sent to patient

### AppointmentDetailClient
- **Purpose**: View and manage single appointment
- **File**: `components/appointment-detail-client.tsx`
- **Display**:
  - Header (date, time, status badge)
  - Patient info (name, contact, tags)
  - Appointment type and location
  - Notes and internal tags
  - Attendee info (therapist assigned)
- **Status Actions** (context-dependent buttons):
  - Confirm (if pending, sends email)
  - Reschedule (opens date/time picker)
  - Mark complete (transitions to completed, prompts for session creation)
  - Cancel (asks for reason, sends cancellation email)
  - Mark no-show
  - Send reminder email (manual)
- **Session Link**: If session exists, link to view/edit session
- **Attachments**: Any pre-appointment documents
- **Edit Mode**: Click edit button to modify details (time, location, notes, type)
- **Data Fetching**: GET `/api/v1/appointments/[id]`

### SessionEditor
- **Purpose**: Rich editor for clinical session notes with templates
- **File**: `components/session-editor.tsx`
- **Features**:
  - **Template Selection** (tabs): SOAP, BIRP, FREE
    - SOAP: Subjective, Objective, Assessment, Plan (standard psychiatric template)
    - BIRP: Behavior, Insight, Response, Plan (alternative therapeutic template)
    - FREE: Unstructured notes
  - **Rich Text Editor**: Bold, italic, underline, lists, links, code blocks
  - **Sections** (collapsible):
    - Main notes (template sections or free text)
    - Clinical impressions (separate field)
    - Treatment plan / next steps
    - Session metadata (mood before/after, energy, themes)
  - **Revision History**:
    - List of all edits with timestamps and user
    - Click to view previous version (read-only)
    - Diff view option
  - **File Attachments**:
    - Upload files to Supabase Storage or S3
    - Versioning (old versions kept)
    - Download/view attachments
  - **Auto-save**: Debounced save (saves after 2 seconds of typing)
  - **Last Saved**: Timestamp displayed ("Last saved 2 minutes ago")
- **State**: Current template, content, dirty flag, last saved time, revision history
- **API**:
  - GET `/api/v1/sessions/[id]` (fetch current + history)
  - PUT `/api/v1/sessions/[id]` (save content)
  - GET `/api/v1/sessions/[id]/revisions` (fetch history)
- **Audit**: Every save logged with user and timestamp
- **Access Control**: Only assigned therapist + admin can edit
- **Mobile**: Full-width editor, template picker in bottom sheet

### ChargesClient
- **Purpose**: Searchable list of all charges with filters and actions
- **File**: `components/charges-client.tsx`
- **Features**:
  - **Filters** (above table):
    - Status dropdown (pending, paid, overdue, cancelled, all)
    - Patient search
    - Date range picker
    - Therapist filter
  - **Table Columns**: Date, patient, description, amount, due date, status badge, actions
  - **Sorting**: Click column headers
  - **Pagination**: 50 per page, server-side
  - **Row Actions**: View details, mark paid, send reminder, void/cancel, edit
  - **CSV Export**: Download all filtered charges
- **Data Fetching**: GET `/api/v1/charges` with filters/sort/pagination
- **Bulk Actions**: Select multiple rows, bulk mark paid, bulk delete (with confirmation)
- **Mobile**: Horizontal scroll table, stack columns on small screens

### NewChargeClient
- **Purpose**: Create new charge for patient
- **File**: `components/new-charge-client.tsx`
- **Form Fields**:
  - **Patient**: Required dropdown/search
  - **Service/Description**: Dropdown (consultation, intake, follow-up, group session, etc.) or free text
  - **Amount**: Number input in R$ (Brazilian currency), with currency symbol
  - **Due Date**: Date picker (optional, can be open/due on payment)
  - **Reference**: Dropdown to link to appointment or session (optional)
  - **Payment Method Expected**: Dropdown (cash, bank transfer, credit card, check)
  - **Notes**: Free text
- **Validation**: Patient required, amount > 0, due date not in past (if specified)
- **Submit Handler**: POST `/api/v1/charges` creates charge
- **Email**: Charge notification email sent to patient via portal
- **Redirect**: Back to charges list with success toast

### ClinicSettingsClient
- **Purpose**: Clinic-wide settings and branding
- **File**: `components/clinic-settings-client.tsx`
- **Sections**:
  - **Basic Info**: Clinic name, address, phone, email, website
  - **Branding**: Logo upload, color scheme, favicon
  - **Business Hours**: Open/close times per day, holidays
  - **Financial**: Tax ID, bank account details (for reporting, not transactions), payment methods
  - **Appointment Defaults**: Default duration, default buffer between appointments
- **Edit Workflow**: Each section editable in place or modal
- **Submit Handler**: PUT `/api/v1/clinic/settings`
- **Logo Storage**: Uploaded to Supabase Storage or S3
- **Admin Only**: Requires clinic admin role

### ProfileSettingsClient
- **Purpose**: Individual user profile settings
- **File**: `components/profile-settings-client.tsx`
- **Sections**:
  - **Basic Info**: Name, email, phone (editable)
  - **Professional**: CRPF number, specializations (multi-select), credentials upload
  - **Avatar**: Upload profile picture, gravatar option
  - **Bio**: Free text about/expertise
  - **Availability**: Hours and days available for appointments
  - **Timezone**: For scheduling and notifications
  - **Preferences**: Dark mode toggle, language, email digest frequency
- **Edit In-Place**: Click to edit each section
- **Submit**: PUT `/api/v1/user/profile`
- **Avatar Storage**: Uploaded to Supabase Storage
- **Email Verification**: If email changed, verification email sent

### AppointmentTypesClient
- **Purpose**: Define appointment types for clinic
- **File**: `components/appointment-types-client.tsx`
- **Features**:
  - **List View**: Table of all appointment types with columns: name, duration, billable amount, enabled toggle
  - **Create New**: Button to open new type form
  - **Edit**: Click row or edit icon to modify
  - **Delete**: Soft delete (disable type, keep historical records)
- **Form Fields per Type**:
  - **Name**: Display name (e.g., "Individual Therapy", "Couples Counseling")
  - **Description**: Notes about this type
  - **Duration**: Default minutes (used as pre-fill in new appointment)
  - **Billable Amount**: Default charge amount in R$
  - **Color Code**: Color picker for calendar display
  - **Enabled**: Toggle (disabled types not shown in new appointment form)
- **Submit Handler**: POST (new) or PUT (edit) `/api/v1/appointment-types`
- **Validation**: Name required, duration > 0, amount >= 0

### RemindersClient
- **Purpose**: Configure appointment reminder emails
- **File**: `components/reminders-client.tsx`
- **Settings**:
  - **Default Reminder Timing**: Dropdown (1 day before, 2 days before, 1 week before, 2 hours before, 1 hour before)
  - **Enabled**: Toggle reminders on/off
  - **Message Template**: Rich text editor for reminder email content with variables:
    - {{appointmentDate}}, {{appointmentTime}}, {{patientName}}, {{therapistName}}, {{appointmentType}}
  - **Method**: Radio buttons (email only, or email + portal notification)
  - **Per Appointment Type**: Can override defaults per type (table)
- **Preview**: Show preview of email with sample variables
- **Submit Handler**: PUT `/api/v1/clinic/reminders`
- **Test Email**: Button to send test reminder to current user

### UsersSettingsClient
- **Purpose**: Manage clinic staff and permissions
- **File**: `components/users-settings-client.tsx`
- **Features**:
  - **Users List**: Table of all users with columns: name, email, role, status, last login, actions
  - **Add User**: Button to open invite form
  - **Edit User**: Click row to edit role and permissions
  - **Disable User**: Soft delete (no login, but keep historical data)
- **Invite Form**:
  - Email address (required)
  - Role dropdown: admin, therapist, receptionist
  - Initial password or send password reset email
- **Role Permissions** (table):
  - Admin: Full access to all features and settings
  - Therapist: Patients, appointments, sessions, financial (own), journal inbox
  - Receptionist: Patients (read-only), appointments (create/edit/cancel), charges (read-only)
- **Submit Handler**:
  - Invite: POST `/api/v1/users/invite` sends email with setup link
  - Update role: PUT `/api/v1/users/[id]` changes permissions
- **Audit**: User creation/modification/deactivation logged
- **Admin Only**: Only clinic admin can manage users

### ExportClient
- **Purpose**: Export clinic data in CSV format for compliance/reporting
- **File**: `components/export-client.tsx`
- **Export Options** (checkboxes):
  - Patients (full records with contact, tags, status)
  - Appointments (all with patient, therapist, type, status, notes)
  - Sessions (clinical notes, attachments not included)
  - Charges (all transactions with patient, date, amount, status, payment date)
  - Audit Logs (all 49 event types with user, timestamp, resource, action)
- **Date Range**: Optional (affects appointments, sessions, charges, audit logs)
- **Format**: CSV only (Excel/Google Sheets compatible)
- **Submit Handler**:
  - GET `/api/v1/export` with selected options and date range
  - Returns CSV file stream (browser download)
- **File Naming**: clinic_export_[date].csv
- **Data Sensitivity**: Full export includes protected health information, audit recommends access control

### IntegrationsClient
- **Purpose**: Configure optional third-party integrations
- **File**: `components/integrations-client.tsx`
- **Integrations**:
  - **Google Calendar**: OAuth flow to sync appointments
    - Connect button (launches Google auth)
    - Sync toggle (auto-sync enabled/disabled)
    - Test sync button
    - Last synced timestamp
  - **Email (Resend)**: Verify API key configured
    - API key check (shows masked key)
    - Test email button
    - Send test to current user
  - **File Storage (S3/R2)**: Configuration form
    - Endpoint, bucket name, region
    - Access key, secret (masked)
    - Test connection button
  - **NFSe (Brazilian invoicing)**: Configuration stub
    - Provider dropdown
    - Credentials form
  - **Sentry Error Monitoring**: Toggle on/off, DSN verification
  - **Upstash Redis**: Configuration for rate limiting (optional)
- **Status Indicators**: Green check for working, red X for error/missing
- **Admin Only**: Only clinic admin can modify integrations

### ReportsClient
- **Purpose**: Financial reporting with flexible views
- **File**: `components/reports-client.tsx`
- **Report Views**:
  - **Competência View**: Revenue by accrual period (when service was provided)
    - Shows revenue by month in which appointment/session occurred
  - **Caixa View**: Revenue by cash receipt (when payment received)
    - Shows revenue by month in which payment was marked paid
- **Filters**:
  - Date range (month/year pickers)
  - Patient (optional, single or multi-select)
  - Appointment type (multi-select)
  - Therapist (multi-select)
  - Status (pending, paid, overdue)
- **Display** (table):
  - Columns: Period, appointment count, total revenue, pending, paid
  - Subtotals by therapist (if filtered to multi-therapist)
  - Grand total row
- **Metrics Cards**:
  - Total revenue, pending amount, overdue amount, payment rate (%)
- **CSV Export**: Download filtered report data
- **Charts** (optional): Bar chart showing revenue trend

### JournalInboxClient
- **Purpose**: Therapist inbox for patient journal entries
- **File**: `components/journal-inbox-client.tsx`
- **Features**:
  - **Filters** (above list):
    - Status: Unread / all
    - Crisis keyword: Show only flagged entries
    - Patient filter (dropdown)
    - Date range
  - **List View**: Entries in reverse chronological order
    - Unread badge (blue dot)
    - Crisis badge (red, if crisis keywords detected)
    - Patient name, date, mood score, preview text
  - **Row Actions**: Click to expand/read full entry, mark read/unread, archive, print, print
- **Full Entry Modal/Panel**:
  - Full entry text with all scores (mood, anxiety, energy, sleep)
  - Attachments (view/download)
  - Shared timestamp
  - Therapist notes section (add response/observations)
  - Patient contact button (send message, schedule callback)
- **Crisis Workflow**:
  - Entries with keywords (crisis, suicidal, emergency, harm, etc.) highlighted
  - Crisis badge with alert icon
  - Toast notification on new crisis entry
  - Therapist must acknowledge before entry can be archived
  - Option to contact emergency services (show hotline numbers)
- **Data Fetching**: GET `/api/v1/journal-inbox` with pagination and filters
- **Mark As Read**: PATCH `/api/v1/journal/[id]/read` updates state

### AuditClient
- **Purpose**: Immutable audit trail of all system actions
- **File**: `components/audit-client.tsx`
- **Features**:
  - **Search**: Full-text search on action descriptions, user names, resource IDs
  - **Filters**:
    - Action type (49 types, dropdown)
    - User (multi-select)
    - Date range (calendar pickers)
    - Resource type (patient, appointment, charge, session, user, etc.)
  - **Table Columns**: Timestamp, user name, action type, resource (patient name or ID), description, details (JSON expandable)
  - **Sorting**: By timestamp (newest first), by user, by resource
  - **Pagination**: 50 per page, server-side
- **Row Detail**: Click to expand and see full action details (JSON format)
- **CSV Export**: Download audit log (all columns) filtered by current search/filters
- **Immutability**: No edit/delete buttons (records are permanent)
- **Data Fetching**: GET `/api/v1/audit` with search, filters, sort, pagination
- **Compliance**: Used for legal/compliance reviews (LGPD, CFP regulations)

## Component Patterns

### Data Fetching
- **Server Components**: Fetch directly in component (no useEffect)
- **Client Components**: useEffect with async/await, show loading skeleton while fetching
- **Error States**: Try/catch blocks, error toast or error card display
- **Caching**: No client-side caching (each component fetches independently)

### Form Handling
- **Validation**: Client-side (instant feedback), server-side (final check)
- **Submission**: Disabled button during request, loading spinner
- **Success**: Toast notification, redirect or list refresh
- **Error**: Error message in form or toast, form remains editable

### Responsive Design
- **Staff App**: Desktop-first, responsive at tablet breakpoints
- **Portal**: Mobile-first, responsive at desktop
- **Component Props**: Accept `className` for Tailwind customization
- **Tailwind Utilities**: Used for layout (flex, grid), spacing (p-, m-), sizing (w-, h-)

### Accessibility
- **Keyboard Navigation**: All interactive elements reachable via Tab
- **Semantic HTML**: Proper heading hierarchy, button/link roles
- **ARIA Labels**: Modal, alert, live region roles where needed
- **Color**: Not sole conveyor of information (status shows text + color + icon)
- **Language**: Portuguese (pt-BR) throughout UI
