# Screens and UX

Psycologger provides two main interfaces: a staff application for clinical practice management and a mobile-first patient portal.

## Staff Application

### Dashboard & Today
- **Route**: `/app/today`
- **Component**: `TodayClient`
- **Purpose**: Quick view of today's schedule and pending tasks
- **Features**: Today's appointments, quick action buttons for common tasks
- **UI Pattern**: Dashboard layout with cards and action shortcuts

### Calendar
- **Route**: `/app/calendar`
- **Component**: `CalendarClient`
- **Library**: react-big-calendar
- **Views**: Month, week, and day views with drag-and-drop support
- **Purpose**: Visual schedule management and appointment planning
- **Interactions**: Click appointments to view details, drag to reschedule

### Patients

#### Patients List
- **Route**: `/app/patients`
- **Component**: `PatientsClient`
- **Features**:
  - Searchable patient list with full-text search
  - Filterable by tags and status
  - Quick actions for each patient (view profile, create appointment, create session)
- **Columns**: Name, ID, status, tags, contact, last appointment date
- **Pagination**: Server-side with configurable page size

#### Patient Detail
- **Route**: `/app/patients/[id]`
- **Component**: `PatientDetailClient`
- **Sections**:
  - Personal information (name, birth date, contact details)
  - Emergency contacts
  - Clinical notes and tags
  - Appointment history
  - Charges and payment history
  - Clinical sessions history
- **Actions**: Edit profile, create appointment, create session, manage tags

#### New/Edit Patient
- **Routes**: `/app/patients/new`, `/app/patients/[id]/edit`
- **Components**: `NewPatientClient`, `EditPatientClient`
- **Fields**:
  - Full name, email, phone, birth date
  - CPF/document
  - Address (street, city, state, ZIP)
  - Emergency contact details
  - Clinical tags and notes
  - Intake date
- **Validation**: Email format, phone format (pt-BR), CPF validation
- **UX**: Form with clear field groups, required field indicators

### Appointments

#### Appointment List (via Calendar or Today)
- **Route**: `/app/appointments`
- **Features**: Full appointment search and filtering
- **Filters**: Status, patient, date range, appointment type, therapist

#### Appointment Detail
- **Route**: `/app/appointments/[id]`
- **Component**: `AppointmentDetailClient`
- **Sections**:
  - Appointment metadata (date, time, duration, type, status)
  - Patient summary (name, contact, tags)
  - Notes and observations
  - Session link (if completed)
  - Status actions (confirm, reschedule, cancel, complete)
- **Actions Available**:
  - Confirm/reschedule (with conflict detection)
  - Cancel (with reason)
  - Mark as no-show
  - Complete and create session
  - Send reminder email

#### New Appointment
- **Route**: `/app/appointments/new`
- **Component**: `NewAppointmentClient`
- **Features**:
  - Patient selection with typeahead search
  - Date/time picker with availability view
  - Duration and appointment type selection
  - Recurring appointment support (daily, weekly, biweekly, monthly)
  - Notes and internal tags
  - Automatic conflict detection
- **Validation**: Patient required, time in business hours, no double-booking
- **Post-creation**: Automatic reminder email sent to patient

### Sessions (Clinical Notes)

#### Session Editor
- **Route**: `/app/sessions/[id]`
- **Component**: `SessionEditor`
- **Features**:
  - Rich text editor with formatting
  - Template system with three templates:
    - **SOAP**: Subjective, Objective, Assessment, Plan
    - **BIRP**: Behavior, Insight, Response, Plan
    - **FREE**: Unstructured notes
  - Revision history with version comparison
  - File attachments (upload to Supabase Storage or S3)
  - Auto-save with last-saved indicator
  - Clinical impressions and treatment plan sections
- **Attachments**: PDFs, images, documents with versioning
- **Access Control**: Only therapist and clinic admin can view/edit
- **Audit**: All edits logged with timestamp and user

#### Session List
- **Via Patient Detail**: Shows all sessions for a patient in reverse chronological order
- **Filters**: Date range, therapist

### Financial Management

#### Financial Dashboard
- **Route**: `/app/financial`
- **Component**: Financial overview component
- **Metrics**:
  - Total revenue (current month, year-to-date)
  - Pending charges and overdue amounts
  - Patient payment status summary
  - Upcoming payments

#### Charges List
- **Route**: `/app/financial/charges`
- **Component**: `ChargesClient`
- **Features**:
  - Searchable and filterable charge list
  - Status filtering (pending, paid, overdue, cancelled)
  - Date range filtering
  - CSV export capability
  - Quick actions (view, mark paid, send reminder, cancel)
- **Columns**: Date, patient, description, amount, due date, status
- **Sorting**: By date, amount, patient name, status

#### New Charge
- **Route**: `/app/financial/charges/new`
- **Component**: `NewChargeClient`
- **Fields**:
  - Patient selection (required)
  - Description/service type
  - Amount (in Brazilian Reais - R$)
  - Due date
  - Reference (appointment or session ID)
  - Payment method expectations
  - Notes
- **Validation**: Patient required, positive amount, due date in future (optional)
- **Auto-emails**: Charge notification sent to patient via portal

### Reports

#### Financial Reports
- **Route**: `/app/reports`
- **Component**: `ReportsClient`
- **Report Types**:
  - **Competência View**: Revenue by accrual period (when service was provided)
  - **Caixa View**: Revenue by cash receipt date
- **Filters**: Date range, patient, appointment type, therapist
- **Metrics**:
  - Total revenue
  - Pending amount
  - Overdue amount
  - Payment rate (paid / total)
- **Export**: CSV download with full details for accounting software integration

### Journal & Crisis Management

#### Journal Inbox
- **Route**: `/app/journal-inbox`
- **Component**: `JournalInboxClient`
- **Purpose**: Review patient journal entries shared by patients
- **Features**:
  - Unread entry indicators
  - Crisis keyword highlighting (crisis, emergency, suicidal, harm, etc.)
  - Patient and date filtering
  - Mark as read/archive
  - Print entry
- **Crisis Workflow**:
  - Entries containing crisis keywords are flagged
  - Visual alert (red badge, toast notification)
  - Therapist must acknowledge
  - Recommended: immediate patient contact

### Settings

#### Profile Settings
- **Route**: `/app/settings/profile`
- **Component**: `ProfileSettingsClient`
- **Fields**:
  - Name, email, phone
  - Professional credentials (CRPF number, specializations)
  - Avatar/profile picture
  - Bio/about section
  - Timezone preference
  - Availability hours

#### Clinic Settings
- **Route**: `/app/settings/clinic`
- **Component**: `ClinicSettingsClient`
- **Sections**:
  - Clinic name and contact information
  - Address and phone
  - Logo/branding
  - Business hours
  - Payment method preferences
  - Financial settings (tax ID, bank details for reporting)

#### Users Management
- **Route**: `/app/settings/users`
- **Component**: `UsersSettingsClient`
- **Features**:
  - Add/remove clinic staff
  - Set role (admin, therapist, receptionist)
  - Manage permissions by role
  - Disable accounts (soft delete)
  - View user activity log

#### Appointment Types
- **Route**: `/app/settings/appointment-types`
- **Component**: `AppointmentTypesClient`
- **Fields per type**:
  - Name, description
  - Default duration (in minutes)
  - Billable amount
  - Color coding
  - Enabled/disabled toggle
- **Usage**: Used for categorizing appointments and pre-filling charge amounts

#### Appointment Reminders
- **Route**: `/app/settings/reminders`
- **Component**: `RemindersClient`
- **Configuration**:
  - Reminder timing (e.g., 1 day before, 2 hours before)
  - Email vs portal notification toggle
  - Optional SMS setup (future)
  - Message templates with variable substitution
- **Default**: Reminder 24 hours before appointment

#### Export Data
- **Route**: `/app/settings/export`
- **Component**: `ExportClient`
- **Formats**: CSV (patients, appointments, sessions, charges, audit logs)
- **Data Retention**: Full historical export available
- **Privacy**: Export respects access controls

#### Integrations
- **Route**: `/app/settings/integrations`
- **Component**: `IntegrationsClient`
- **Available Integrations**:
  - Google Calendar (sync appointments)
  - Resend email configuration verification
  - S3/R2 file storage settings (test endpoint)
  - NFSe provider configuration (stub)
  - Sentry error monitoring toggle
  - Upstash Redis rate limiting setup

### Audit Log
- **Route**: `/app/audit`
- **Component**: `AuditClient`
- **Features**:
  - Full audit trail of system actions (49 event types)
  - Searchable by user, action type, patient, date range
  - Columns: Timestamp, user, action, resource, details
  - CSV export for compliance/legal review
  - Filters: Action type, date range, user
- **Immutable**: Audit records cannot be modified or deleted
- **Retention**: Configurable retention period (default: 7 years for legal compliance)

## Patient Portal (Mobile-First)

### Authentication

#### Login
- **Route**: `/portal/login`
- **Component**: `PortalLoginClient`
- **Input**: Email address
- **Flow**: Email validation, password entry or magic link
- **Design**: Centered form, large touch targets

#### Activate Account
- **Route**: `/portal/activate`
- **Component**: `PortalActivateClient`
- **Purpose**: First-time patient setup
- **Steps**:
  1. Verify invitation link/code
  2. Set password
  3. Accept consent forms
  4. Set emergency contact
  5. Preferences (notifications, communication method)
- **UI**: Step-by-step wizard

#### Magic Login
- **Route**: `/portal/magic-login`
- **Component**: `PortalMagicLoginClient`
- **Purpose**: Passwordless login for patients
- **Flow**: Email entry, link sent, auto-login on link click
- **UX**: Accessible for users who forget passwords

### Dashboard
- **Route**: `/portal/dashboard`
- **Component**: `PortalDashboardClient`
- **Sections**:
  - Next appointment card (date, time, therapist, location/video link)
  - Pending charges summary with payment link
  - Recent journal entries (preview)
  - Notifications count
- **Mobile**: Bottom navigation or side drawer menu

### Sessions
- **Route**: `/portal/sessions`
- **Component**: `PortalSessionsClient`
- **List view**: Session list in reverse chronological order
- **Session Detail** (`/portal/sessions/[id]`)
  - **Component**: `PortalSessionDetailClient`
  - **Sections**: Session date, therapist, clinical notes (therapist-controlled visibility), session audio/video link (with video player redaction to prevent download)
  - **Privacy**: Therapist controls what notes are shared with patient

### Journal (Patient Mood Tracker)

#### Journal List
- **Route**: `/portal/journal`
- **Component**: `PortalJournalListClient`
- **Display**: List of entries with date, mood score, brief preview
- **Filters**: Date range
- **Quick stats**: Average mood/anxiety/energy/sleep for selected range

#### Journal New Entry
- **Route**: `/portal/journal/new`
- **Component**: `PortalJournalNewClient`
- **Form Fields**:
  - Date/time (defaults to now)
  - Mood score (1-10 slider)
  - Anxiety level (1-10 slider)
  - Energy level (1-10 slider)
  - Sleep quality (1-10 slider)
  - Free-text notes
  - Attachments (images, audio)
  - Checkbox: "Share with therapist" (default: true)
- **Crisis Detection**: Automatic flagging of keywords for therapist alert
- **UX**: Mobile-optimized, dark mode support

#### Journal Entry Detail
- **Route**: `/portal/journal/[id]`
- **Component**: `PortalJournalDetailClient`
- **Display**: Full entry with all scores and notes
- **Edit**: Ability to edit own entries (within 24 hours)
- **Therapist Notes**: Section for therapist response if shared

### Payments

#### Payments List
- **Route**: `/portal/payments`
- **Component**: `PortalPaymentsClient`
- **Tabs**:
  - Pending: Unpaid charges with due dates
  - Paid: Historical paid charges
- **For each charge**: Amount, due date, description, payment link
- **Payment Methods**: Integration with Stripe or PayPal (future enhancement)
- **Receipts**: Download receipt link after payment

### Profile
- **Route**: `/portal/profile`
- **Component**: `PortalProfileClient`
- **Editable Fields**:
  - Name, email, phone
  - Emergency contact (name, relationship, phone)
  - Preferred communication method
  - Notification preferences
  - Timezone/language
- **Display**: Current therapy status, therapist name, clinic contact

### Notifications
- **Route**: `/portal/notifications`
- **Component**: `PortalNotificationsClient`
- **Types of notifications**:
  - Appointment reminders
  - Charge notifications
  - Therapist messages/notes
  - System messages
- **Features**: Mark as read, dismiss, notification preferences

### Privacy & Consent
- **Route**: `/portal/privacy`
- **Component**: `PortalPrivacyClient`
- **Sections**:
  - Consent form management (accept/view current/view history)
  - Data usage preferences (research, analytics opt-in)
  - Privacy policy
  - Terms of service
  - Data deletion request (initiates GDPR-style process)

### Help & Crisis Resources
- **Route**: `/portal/help`
- **Component**: Built-in crisis resource section (part of PortalShell)
- **Content**:
  - FAQs about using the platform
  - Crisis hotline numbers (Brazilian: CVV 188, SAMU 192)
  - Emergency contact guidance
  - Therapist direct contact in emergency
- **Mobile**: Always accessible via fixed footer button
- **Safety Disclaimer**: "This platform is not for emergencies. In crisis, contact emergency services."

### Mobile Navigation
- **Component**: `PortalShell`
- **Navigation**: Bottom navigation bar (mobile) or side drawer (tablet)
- **Items**: Dashboard, Sessions, Journal, Payments, Profile, Notifications, Help
- **User Info**: Collapsed user profile with logout option
- **Safety Disclaimer**: Always visible at top of PortalShell (pt-BR message about platform limitations)

## UX Patterns

### Forms
- **Validation**: Real-time feedback with error messages below fields
- **Required Fields**: Marked with asterisk (*) and red label color
- **Submit Buttons**: Disabled during submission with loading spinner
- **Success**: Toast notification after successful submission

### Tables
- **Sorting**: Click column header to sort (ascending/descending)
- **Pagination**: Server-side for large datasets
- **Filtering**: Above table with date pickers, dropdowns, text search
- **Row Actions**: Right-side action buttons (view, edit, delete) with confirmation modals

### Modals & Alerts
- **Confirmation**: Always required for destructive actions (cancel appointment, delete charge)
- **Error States**: Modal with clear error message and suggested actions
- **Success**: Toast notification in top-right corner

### Responsive Design
- **Staff App**: Desktop-first (responsive at tablet size)
- **Patient Portal**: Mobile-first (optimized for phones, responsive at desktop)
- **Touch Targets**: Minimum 44x44px on mobile

### Accessibility
- **Color**: Not sole means of information (status shown with text + icon)
- **Keyboard Navigation**: All interactive elements reachable via Tab
- **Labels**: All form inputs have associated labels
- **ARIA**: Alerts, modals, and regions properly marked
- **Language**: Portuguese (pt-BR) throughout UI
