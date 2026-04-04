# Frontend Architecture

Psycologger's frontend is built with Next.js 14 App Router, leveraging server components for data fetching and client components for interactivity. The design system is based on Tailwind CSS and Radix UI primitives, with a Portuguese (pt-BR) interface throughout.

## Routing Architecture

### Next.js 14 App Router

The application uses Next.js 14 App Router with four main route groups:

- **`/`** - Root layout (providers, global metadata)
- **`/app`** - Staff application (authenticated psychologists, assistants, admins)
- **`/portal`** - Patient portal (separate authentication, patient-facing features)
- **`/sa`** - Superadmin area (multi-tenant management, system configuration)

### Route Structure

```
app/
├── layout.tsx                          # Root layout (providers, metadata)
├── page.tsx                            # Home/landing
├── auth/
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── callback/page.tsx               # OAuth callback
│   ├── verify-email/page.tsx
│   └── reset-password/page.tsx
│
├── (app)/                              # Staff application group
│   ├── layout.tsx                      # App layout (sidebar, session check)
│   ├── dashboard/page.tsx              # Dashboard/home
│   ├── patients/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # List
│   │   ├── new/page.tsx                # Create
│   │   ├── [id]/
│   │   │   ├── page.tsx                # View/edit
│   │   │   ├── appointments/page.tsx
│   │   │   └── journal/page.tsx
│   │   └── [id]/sessions/page.tsx
│   ├── appointments/
│   │   ├── page.tsx                    # Calendar view
│   │   ├── new/page.tsx                # Create
│   │   ├── [id]/page.tsx               # View/edit
│   │   └── [id]/confirm/page.tsx
│   ├── sessions/
│   │   ├── page.tsx                    # List
│   │   ├── [id]/page.tsx               # View/edit with revisions
│   │   ├── [id]/revisions/page.tsx     # Revision history
│   │   └── templates/page.tsx          # Template management
│   ├── financial/
│   │   ├── charges/
│   │   │   ├── page.tsx                # List charges
│   │   │   ├── new/page.tsx            # Create charge
│   │   │   └── [id]/page.tsx           # View/edit
│   │   ├── payments/
│   │   │   ├── page.tsx                # Payment history
│   │   │   └── [id]/page.tsx           # Payment detail
│   │   └── reports/page.tsx            # Financial reports
│   ├── audit/
│   │   ├── page.tsx                    # Audit log viewer
│   │   └── export/page.tsx             # Audit export
│   ├── settings/
│   │   ├── team/page.tsx               # User management
│   │   ├── appointment-types/page.tsx  # Appointment type config
│   │   ├── reminder-templates/page.tsx # Email template config
│   │   ├── billing/page.tsx            # Tenant billing
│   │   └── profile/page.tsx            # User profile
│   └── reports/
│       ├── page.tsx                    # Reports overview
│       ├── appointments/page.tsx       # Appointment analytics
│       ├── patients/page.tsx           # Patient analytics
│       ├── financial/page.tsx          # Financial analytics
│       └── clinical/page.tsx           # Clinical metrics
│
├── (portal)/                           # Patient portal group
│   ├── layout.tsx                      # Portal layout (mobile-first shell, error boundary)
│   ├── (authenticated)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Portal dashboard
│   │   ├── appointments/page.tsx
│   │   ├── charges/page.tsx
│   │   ├── journal/
│   │   │   ├── page.tsx                # Journal entries list
│   │   │   ├── new/page.tsx            # Create entry
│   │   │   └── [id]/page.tsx           # View/edit entry
│   │   ├── sessions/page.tsx
│   │   ├── notifications/page.tsx
│   │   ├── consents/page.tsx
│   │   └── profile/page.tsx
│   ├── auth/
│   │   ├── magic-link/page.tsx
│   │   └── verify/page.tsx
│   └── error.tsx                       # Error boundary
│
└── (sa)/                               # Superadmin area
    ├── layout.tsx
    ├── page.tsx                        # Dashboard
    ├── tenants/
    │   ├── page.tsx                    # List tenants
    │   ├── new/page.tsx                # Create tenant
    │   └── [id]/page.tsx               # Tenant details
    ├── users/page.tsx                  # Global user management
    ├── system-settings/page.tsx        # System configuration
    └── analytics/page.tsx              # Cross-tenant analytics
```

## Layout System

### Root Layout (`layout.tsx`)

- Provider setup (session, theme, toast, query client if applicable)
- Global metadata (title, description, favicon, viewport)
- Global styles import
- Font loading (Inter via next/font)

```typescript
// Root providers wrapper
<Providers>
  <html>
    <head>
      <FontLoader />
    </head>
    <body>
      {children}
    </body>
  </html>
</Providers>
```

### App Layout (`(app)/layout.tsx`)

- Sidebar navigation component with role-based menu
- Session check (redirect to login if no session)
- User profile menu (top-right)
- Mobile responsive sidebar (drawer on small screens)
- Toast container
- Main content area (flex layout)

### Portal Layout (`(portal)/layout.tsx`)

- Mobile-first design (optimized for patient use on phones)
- Header with logo, patient name, settings menu
- Navigation tabs (Dashboard, Appointments, Charges, Journal, Notifications, Profile)
- Error boundary wrapping authenticated routes
- Toast container for in-app notifications
- Safe area insets for notch support (iOS)

### Superadmin Layout (`(sa)/layout.tsx`)

- System administration interface
- Sidebar with tenant management, user management, system settings
- Breadcrumb navigation
- Session check (redirect to login if not SUPERADMIN)

## Page Architecture

### ~45 Total Pages

Psycologger includes approximately 45 distinct pages across the staff application, patient portal, and superadmin area:

**Staff Application (~25 pages)**
- Dashboard (1)
- Patients: list, create, view/edit, appointments, journal (5)
- Appointments: calendar/list, create, view/edit, confirm (4)
- Sessions: list, create, view/edit, revisions, templates (5)
- Financial: charges list/create/view, payments list/view, reports (5)
- Settings: team, appointment types, reminder templates, billing, profile (5)
- Reports: overview, appointments, patients, financial, clinical (5)

**Patient Portal (~12 pages)**
- Auth: magic link, verify (2)
- Authenticated: dashboard, appointments, charges, journal (list/new/view), sessions, notifications, consents, profile (9)
- Error states (1)

**Superadmin Area (~8 pages)**
- Dashboard (1)
- Tenants: list, create, view/edit (3)
- Users: global management (1)
- System settings (1)
- Analytics (1)
- Help/Support (1)

## Component Architecture

### 50+ Components in 10 Groups

Components are organized by domain and functionality:

```
components/
├── ui/                        # Base Radix UI components
│   ├── button.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── popover.tsx
│   ├── select.tsx
│   ├── tabs.tsx
│   ├── toast.tsx
│   ├── tooltip.tsx
│   ├── switch.tsx
│   ├── checkbox.tsx
│   ├── radio-group.tsx
│   ├── separator.tsx
│   ├── badge.tsx
│   ├── card.tsx
│   └── skeleton.tsx
│
├── shell/                     # Layout shells
│   ├── app-sidebar.tsx
│   ├── app-header.tsx
│   ├── app-topbar.tsx
│   ├── portal-header.tsx
│   ├── portal-nav.tsx
│   └── error-boundary.tsx
│
├── portal/                    # Portal-specific components
│   ├── portal-dashboard.tsx
│   ├── appointment-card.tsx
│   ├── charge-card.tsx
│   ├── journal-entry-form.tsx
│   ├── journal-entry-card.tsx
│   ├── notification-item.tsx
│   ├── consent-card.tsx
│   └── profile-form.tsx
│
├── patients/                  # Patient management components
│   ├── patient-table.tsx
│   ├── patient-form.tsx
│   ├── patient-card.tsx
│   ├── patient-search.tsx
│   ├── patient-tags.tsx
│   ├── patient-filter.tsx
│   └── consent-modal.tsx
│
├── appointments/              # Appointment components
│   ├── appointment-calendar.tsx    # react-big-calendar wrapper
│   ├── appointment-form.tsx
│   ├── appointment-card.tsx
│   ├── appointment-details.tsx
│   ├── recurring-form.tsx
│   ├── time-picker.tsx
│   ├── timezone-select.tsx
│   └── conflict-alert.tsx
│
├── sessions/                  # Session & note components
│   ├── session-form.tsx
│   ├── session-card.tsx
│   ├── session-details.tsx
│   ├── template-selector.tsx
│   ├── rich-editor.tsx        # Note editor with formatting
│   ├── revision-viewer.tsx
│   ├── revision-diff.tsx
│   ├── file-upload.tsx
│   └── session-tags.tsx
│
├── financial/                 # Charge & payment components
│   ├── charge-table.tsx
│   ├── charge-form.tsx
│   ├── charge-card.tsx
│   ├── payment-form.tsx
│   ├── payment-method-select.tsx
│   ├── invoice-generator.tsx
│   ├── financial-report.tsx
│   └── pix-qr-code.tsx
│
├── settings/                  # Settings components
│   ├── user-table.tsx
│   ├── user-form.tsx
│   ├── appointment-type-table.tsx
│   ├── appointment-type-form.tsx
│   ├── reminder-template-editor.tsx
│   └── billing-form.tsx
│
├── reports/                   # Analytics & reporting
│   ├── appointment-report.tsx
│   ├── patient-report.tsx
│   ├── financial-report.tsx
│   ├── clinical-metrics.tsx
│   ├── chart-wrapper.tsx      # Chart.js or similar wrapper
│   └── export-button.tsx
│
├── audit/                     # Audit logging components
│   ├── audit-log-table.tsx
│   ├── audit-filter.tsx
│   ├── audit-detail-modal.tsx
│   └── export-audit-button.tsx
│
├── shared/                    # Shared utilities
│   ├── loading-skeleton.tsx
│   ├── empty-state.tsx
│   ├── pagination.tsx
│   ├── data-table.tsx         # Reusable table component
│   ├── confirm-dialog.tsx
│   ├── error-alert.tsx
│   └── success-toast.tsx
│
└── icons/                     # SVG icons
    ├── patient-icon.tsx
    ├── appointment-icon.tsx
    ├── session-icon.tsx
    ├── charge-icon.tsx
    ├── settings-icon.tsx
    └── [...16 more icons]
```

## Design System

### Tailwind CSS

- Utility-first CSS framework
- Custom Tailwind config for Psycologger branding
- Color palette:
  - **Primary**: Blue (#2563eb)
  - **Success**: Green (#10b981)
  - **Warning**: Amber (#f59e0b)
  - **Error**: Red (#ef4444)
  - **Neutral**: Gray (#6b7280 base)
- Responsive breakpoints (sm, md, lg, xl, 2xl)
- Dark mode support (optional, configured via Tailwind)

### Radix UI Primitives

Psycologger uses Radix UI as the headless component library, providing accessible, unstyled primitives styled with Tailwind:

- **Dialog**: Modal dialogs for forms, confirmations
- **Dropdown Menu**: User menu, bulk actions, inline actions
- **Popover**: Tooltips, date pickers, popovers
- **Select**: Dropdown selects (appointment types, payment methods, roles)
- **Tabs**: Tab navigation (patient details, appointment types)
- **Toast**: In-app notifications (success, error, info)
- **Tooltip**: Help text on hover
- **Switch**: Toggle settings, enable/disable features
- **Checkbox**: Multi-select in tables, consent checkboxes
- **Radio Group**: Single selection (appointment frequency: once, weekly, monthly)

### shadcn/ui-Style Components

Components follow shadcn/ui patterns: unstyled Radix primitives + Tailwind CSS, with TypeScript types and accessibility built in.

### Typography

- **Font**: Inter (loaded via next/font)
- **Sizes**:
  - H1: text-4xl, font-bold
  - H2: text-2xl, font-bold
  - H3: text-lg, font-semibold
  - Body: text-sm, font-normal
  - Small: text-xs, font-normal
- **Line Heights**: Tight (1.2) for headings, normal (1.5) for body

### Spacing

- **Scale**: 4px base unit (0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64)
- **Padding/Margin**: Tailwind scale (p-2, m-4, gap-8, etc.)

### Component States

All interactive components support:

- **Default**: Normal state
- **Hover**: Visual feedback on hover
- **Active**: Pressed/selected state
- **Disabled**: Grayed out, cursor-not-allowed
- **Focus**: Keyboard navigation indicator
- **Loading**: Spinner or skeleton state
- **Error**: Red border/text, error message below input

## Forms

### react-hook-form + Zod

Complex forms use react-hook-form for state management + Zod for validation:

```typescript
// Example: Patient form
const patientSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email("Invalid email"),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "Invalid CPF"),
  phone: z.string().min(10, "Phone too short"),
  birthDate: z.date(),
  tags: z.array(z.string()).optional(),
});

type PatientFormData = z.infer<typeof patientSchema>;

export function PatientForm() {
  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {/* ... more fields ... */}
    </form>
  );
}
```

### Simple Inline Validation

For simpler forms (login, filters), inline validation is used:

```typescript
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    if (!email.includes("@")) {
      setError("Invalid email");
      return;
    }
    // ... submit
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && <div className="text-red-500">{error}</div>}
    </form>
  );
}
```

## State Management

### Server Components by Default

Next.js 14 defaults to server components. Data fetching happens on the server; components are rendered once and sent to the browser as HTML.

```typescript
// app/(app)/patients/page.tsx - Server Component
export default async function PatientsPage() {
  const patients = await getPatients(); // Server-side fetch
  return <PatientTable data={patients} />;
}
```

### Client Components for Interactivity

Components that need state, event handlers, or hooks use `"use client"`:

```typescript
// components/patients/patient-table.tsx - Client Component
"use client";

import { useState } from "react";

export function PatientTable({ data }) {
  const [filter, setFilter] = useState("");

  return (
    <div>
      <input
        placeholder="Search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {/* Render filtered data */}
    </div>
  );
}
```

### Session State

Auth state managed via `useSession()` hook from NextAuth:

```typescript
"use client";

import { useSession } from "next-auth/react";

export function AppHeader() {
  const { data: session, status } = useSession();

  if (status === "loading") return <LoadingSkeleton />;
  if (!session) return null;

  return <header>Welcome, {session.user.name}</header>;
}
```

### Local State

Simple state managed with `useState` and `useRef`:

```typescript
"use client";

import { useState, useRef } from "react";

export function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    setUploading(true);
    // ... upload logic
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" hidden />
      <button onClick={() => fileInputRef.current?.click()}>Choose File</button>
      {file && <p>{file.name}</p>}
    </div>
  );
}
```

## Data Fetching

### Server Components

Server components fetch data directly in the component or in a separate `lib/data.ts` module:

```typescript
// lib/data.ts
export async function getPatients(tenantId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/patients?tenantId=${tenantId}`,
    {
      headers: { "Authorization": `Bearer ${token}` },
    }
  );
  if (!response.ok) throw new Error("Failed to fetch patients");
  return response.json();
}

// app/(app)/patients/page.tsx
import { getPatients } from "@/lib/data";

export default async function PatientsPage() {
  const patients = await getPatients(session.user.tenantId);
  return <PatientTable data={patients} />;
}
```

### Client Components

Client components use `fetch()` in `useEffect`:

```typescript
"use client";

import { useEffect, useState } from "react";

export function AppointmentForm() {
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/appointment-types")
      .then((res) => res.json())
      .then((data) => {
        setAppointmentTypes(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSkeleton />;

  return (
    <select>
      {appointmentTypes.map((type) => (
        <option key={type.id} value={type.id}>
          {type.name}
        </option>
      ))}
    </select>
  );
}
```

### No SWR or React Query

Psycologger doesn't use SWR or React Query. Data fetching relies on native `fetch()` and Next.js built-in features (revalidation, ISR).

## Calendar Component

### react-big-calendar

Appointments are displayed using `react-big-calendar`:

```typescript
"use client";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const locales = { "pt-BR": ptBR };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export function AppointmentCalendar({ events }) {
  return (
    <Calendar
      localizer={localizer}
      events={events}
      startAccessor="startTime"
      endAccessor="endTime"
      style={{ height: 500 }}
      culture="pt-BR"
    />
  );
}
```

## Optimistic Updates

### Portal Notifications Example

Marking a notification as read uses optimistic updates with rollback:

```typescript
"use client";

import { useState } from "react";

export function NotificationItem({ notification, onMarkRead }) {
  const [isRead, setIsRead] = useState(notification.isRead);

  const handleMarkRead = async () => {
    // Optimistic update
    setIsRead(true);

    try {
      await fetch(`/api/portal/notifications/${notification.id}/read`, {
        method: "PATCH",
      });
    } catch (error) {
      // Rollback on error
      setIsRead(false);
      console.error("Failed to mark as read");
    }
  };

  return (
    <div className={isRead ? "opacity-50" : ""}>
      {notification.message}
      {!isRead && (
        <button onClick={handleMarkRead}>Mark as read</button>
      )}
    </div>
  );
}
```

## Loading & Error States

### Skeleton Loaders

Loading states use skeleton screens with `animate-pulse`:

```typescript
"use client";

export function PatientTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 animate-pulse rounded" />
      ))}
    </div>
  );
}
```

### Error Boundaries

Portal routes use error boundaries:

```typescript
// app/(portal)/error.tsx
"use client";

export default function PortalError({ error, reset }) {
  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold text-red-500">Something went wrong</h1>
      <p className="text-gray-600">{error.message}</p>
      <button onClick={() => reset()} className="mt-4 btn btn-primary">
        Try again
      </button>
    </div>
  );
}
```

### Inline Error Messages

Form errors displayed directly below inputs:

```typescript
<input type="email" />
{errors.email && (
  <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>
)}
```

## Accessibility

### Radix UI Built-in a11y

Radix UI components include:

- Proper ARIA attributes (role, aria-label, aria-describedby)
- Keyboard navigation (Tab, Arrow keys, Enter, Escape)
- Focus management
- Screen reader support

### Semantic HTML

Components use semantic elements:

```typescript
// Good
<button>Click me</button>
<nav>{/* navigation links */}</nav>
<main>{/* main content */}</main>

// Avoid
<div onClick={() => {}}>Click me</div>
```

### ARIA Attributes

Custom components include explicit ARIA:

```typescript
<div
  role="button"
  tabIndex={0}
  aria-label="Close menu"
  onClick={handleClose}
  onKeyDown={(e) => e.key === "Enter" && handleClose()}
>
  ×
</div>
```

## Internationalization (i18n)

### Portuguese (pt-BR) Throughout

Psycologger is entirely in Portuguese. No i18n framework is used; strings are hardcoded.

**Common Portuguese Terms**:
- Agenda: Appointment calendar
- Consulta: Appointment/session
- Acompanhamento: Follow-up
- Paciente: Patient
- Psicólogo(a): Psychologist
- Assistente: Assistant
- Cobrança: Charge/billing
- Pagamento: Payment
- Diário: Journal
- Consentimento: Consent
- Arquivo: File/record
- Auditoria: Audit

### String Constants

Hardcoded strings stored in a constants file:

```typescript
// constants/strings.ts
export const STRINGS = {
  PATIENT: "Paciente",
  APPOINTMENT: "Consulta",
  SESSION: "Acompanhamento",
  CHARGE: "Cobrança",
  PAYMENT: "Pagamento",
  JOURNAL: "Diário",
  // ... 100+ more
};
```

Or inline with comments:

```typescript
<h1>Meus Pacientes</h1> {/* My Patients */}
<button>Criar Nova Consulta</button> {/* Create New Appointment */}
```

## Performance Optimizations

### Server Components

Default to server components to reduce JavaScript bundle size.

### Code Splitting

Next.js App Router automatically code-splits at route boundaries. Client components are code-split per route.

### Image Optimization

Use `next/image` for automatic image optimization:

```typescript
import Image from "next/image";

<Image
  src="/logo.png"
  alt="Psycologger logo"
  width={200}
  height={200}
  priority
/>;
```

### Font Optimization

Fonts loaded via `next/font`:

```typescript
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }) {
  return (
    <html className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```
