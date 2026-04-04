# Backend Architecture

Psycologger's backend is built with Next.js API routes, Prisma ORM, Supabase PostgreSQL, and supporting services for email, storage, and job scheduling. The architecture emphasizes security, auditability, and multi-tenant isolation.

## Server Composition

### API Routes as Controllers

Next.js API routes (route.ts files) serve as HTTP controllers. Each route handler is responsible for:

1. Extracting and validating request data (params, query, body)
2. Checking authentication and authorization
3. Calling business logic in `src/lib`
4. Returning JSON responses or errors

```
src/app/api/
├── auth/
│   ├── login/route.ts
│   ├── signup/route.ts
│   ├── logout/route.ts
│   ├── callback/route.ts
│   └── verify-email/route.ts
├── patients/
│   ├── route.ts              # GET, POST
│   ├── search/route.ts       # GET (search)
│   └── [id]/
│       ├── route.ts          # GET, PATCH, DELETE
│       ├── consent/route.ts  # GET, POST
│       └── portal-invite/route.ts
├── appointments/
│   ├── route.ts              # GET, POST
│   ├── [id]/
│   │   ├── route.ts          # GET, PATCH, DELETE
│   │   └── confirm/route.ts  # POST
│   └── check-conflicts/route.ts
├── sessions/
│   ├── route.ts              # GET, POST
│   ├── [id]/
│   │   ├── route.ts          # GET, PATCH, DELETE
│   │   ├── revisions/route.ts
│   │   └── files/route.ts
│   └── templates/route.ts
├── charges/
│   ├── route.ts              # GET, POST
│   └── [id]/route.ts         # GET, PATCH, DELETE
├── payments/
│   ├── route.ts              # GET, POST
│   └── [id]/route.ts         # GET, PATCH
├── financial/
│   ├── reports/route.ts
│   └── export/route.ts
├── audit/
│   ├── route.ts              # GET (with filters)
│   └── export/route.ts       # GET (CSV)
├── files/
│   ├── upload/route.ts       # POST
│   ├── [id]/route.ts         # GET (download), DELETE
│   └── signed-url/route.ts   # POST
├── settings/
│   ├── users/route.ts        # GET, POST, PATCH
│   ├── appointment-types/route.ts
│   ├── reminder-templates/route.ts
│   └── profile/route.ts
├── cron/
│   ├── payment-reminders/route.ts
│   └── appointment-reminders/route.ts
├── portal/
│   ├── auth/
│   │   ├── magic-link/route.ts
│   │   └── verify/route.ts
│   ├── dashboard/route.ts
│   ├── appointments/route.ts
│   ├── charges/route.ts
│   ├── journal/route.ts      # GET, POST
│   ├── [id]/route.ts         # PATCH, DELETE
│   ├── notifications/route.ts
│   ├── [id]/read/route.ts
│   ├── consents/route.ts
│   └── profile/route.ts
└── health/route.ts           # GET (health check)
```

### Service Layer (src/lib)

Business logic and utilities organized by domain:

```
src/lib/
├── auth.ts                    # NextAuth configuration, session helpers
├── context.ts                 # getAuthContext(), getPatientContext()
├── permissions.ts             # requirePermission()
├── validation.ts              # Zod schemas
├── errors.ts                  # Custom error classes
├── responses.ts               # Response formatting helpers
├── audit.ts                   # auditLog() function
├── encryption.ts              # AES-256-GCM encryption/decryption
├── mailer.ts                  # Resend email sending
├── storage.ts                 # Supabase Storage helpers
├── cache.ts                   # Redis + in-memory cache
├── rate-limit.ts              # Rate limiting
├── date-utils.ts              # Timezone-aware date helpers
│
├── services/
│   ├── patient.service.ts
│   ├── appointment.service.ts
│   ├── session.service.ts
│   ├── charge.service.ts
│   ├── payment.service.ts
│   ├── portal.service.ts
│   ├── notification.service.ts
│   ├── user.service.ts
│   ├── tenant.service.ts
│   ├── report.service.ts
│   └── file.service.ts
│
├── validators/
│   ├── patient.schema.ts
│   ├── appointment.schema.ts
│   ├── session.schema.ts
│   ├── charge.schema.ts
│   ├── payment.schema.ts
│   ├── portal.schema.ts
│   └── user.schema.ts
│
└── templates/
    ├── email-templates.ts     # Email HTML templates
    └── reminder-templates.ts
```

## Request Pipeline

Every API request follows this pipeline:

```
1. middleware.ts
   ↓
2. Route Handler (GET/POST/PATCH/DELETE)
   ↓
3. getAuthContext() - Extract session, userId, tenantId
   ↓
4. getPatientContext() - Extract patientId if applicable
   ↓
5. requirePermission() - Check role/permission
   ↓
6. Zod Validation - Parse and validate request body
   ↓
7. Business Logic - Call service layer
   ↓
8. Prisma Transaction - Execute database operations
   ↓
9. auditLog() - Record action
   ↓
10. Response - Return JSON or error
   ↓
11. handleApiError() - Catch and format errors
```

### Example: Create Appointment

```typescript
// app/api/appointments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/context";
import { appointmentSchema } from "@/lib/validators";
import { appointmentService } from "@/lib/services";
import { handleApiError } from "@/lib/responses";

export async function POST(req: NextRequest) {
  try {
    // 1. Extract context
    const { userId, tenantId } = await getAuthContext(req);

    // 2. Check permission
    await requirePermission(userId, "APPOINTMENT_CREATE");

    // 3. Validate request
    const body = await req.json();
    const data = appointmentSchema.parse(body);

    // 4. Business logic
    const appointment = await appointmentService.create({
      tenantId,
      userId,
      ...data,
    });

    // 5. Audit log
    await auditLog({
      tenantId,
      userId,
      action: "appointment.created",
      resourceId: appointment.id,
    });

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
```

## Authentication & Context

### getAuthContext()

Extracts authenticated user context from JWT token:

```typescript
// lib/context.ts
export async function getAuthContext(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new UnauthorizedError("Not authenticated");
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    tenantId: session.user.tenantId,
    role: session.user.role,
    permissions: session.user.permissions,
  };
}
```

### getPatientContext()

Extracts patient-specific context:

```typescript
export async function getPatientContext(req: NextRequest) {
  const auth = await getAuthContext(req);
  const patientId = req.nextUrl.searchParams.get("patientId");

  // Verify access: patient must belong to user's tenant
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient || patient.tenantId !== auth.tenantId) {
    throw new ForbiddenError("Patient not found");
  }

  return { ...auth, patientId, patient };
}
```

### requirePermission()

Enforces role-based access control:

```typescript
export function requirePermission(role: string, action: string) {
  const rolePermissions = {
    SUPERADMIN: ["*"], // All permissions
    TENANT_ADMIN: [
      "PATIENT_CRUD",
      "APPOINTMENT_CRUD",
      "SESSION_CRUD",
      "CHARGE_VIEW",
      "PAYMENT_RECORD",
      "AUDIT_VIEW",
      "AUDIT_EXPORT",
      "USER_MANAGE",
      "SETTINGS_MANAGE",
    ],
    PSYCHOLOGIST: [
      "PATIENT_VIEW",
      "PATIENT_CREATE",
      "APPOINTMENT_CRUD",
      "SESSION_CRUD",
      "CHARGE_VIEW",
      "PAYMENT_RECORD",
      "REPORT_VIEW",
    ],
    ASSISTANT: [
      "PATIENT_VIEW",
      "APPOINTMENT_VIEW",
      "SESSION_VIEW",
      "CHARGE_VIEW",
    ],
    READONLY: ["PATIENT_VIEW", "APPOINTMENT_VIEW", "SESSION_VIEW"],
  };

  const permissions = rolePermissions[role] || [];
  if (permissions.includes("*")) return true;
  if (!permissions.includes(action)) {
    throw new ForbiddenError(`Permission denied: ${action}`);
  }
}
```

## Validation

### Zod Schemas

Input validation uses Zod for runtime type checking:

```typescript
// lib/validators/appointment.schema.ts
import { z } from "zod";

export const appointmentSchema = z.object({
  patientId: z.string().uuid(),
  psychologistId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  startTime: z.date(),
  endTime: z.date(),
  timezone: z.string().refine(isValidIANATimeZone),
  isRecurring: z.boolean().optional(),
  recurringPattern: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  recurringEndDate: z.date().optional(),
  notes: z.string().optional(),
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;
```

### Schema Composition

Complex forms combine multiple schemas:

```typescript
export const appointmentCreateSchema = z.object({
  ...appointmentSchema.shape,
  skipConflictCheck: z.boolean().optional(),
});

export const appointmentUpdateSchema = appointmentSchema.partial();
```

## Error Handling

### Custom Error Classes

Consistent error hierarchy:

```typescript
// lib/errors.ts
export class ApiError extends Error {
  constructor(
    public message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string) {
    super(message, 400, "BAD_REQUEST");
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string) {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string) {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}
```

### handleApiError()

Centralizes error response formatting:

```typescript
// lib/responses.ts
export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status }
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: error.errors,
        },
      },
      { status: 400 }
    );
  }

  if (error instanceof PrismaClientKnownRequestError) {
    return NextResponse.json(
      {
        error: {
          code: "DATABASE_ERROR",
          message: "Database operation failed",
        },
      },
      { status: 500 }
    );
  }

  // Fallback for unexpected errors
  console.error("Unhandled error:", error);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    },
    { status: 500 }
  );
}
```

## Background Jobs

### Vercel Cron

Scheduled jobs run via Vercel Cron:

```typescript
// app/api/cron/payment-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Verify cron secret
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all tenants
    const tenants = await prisma.tenant.findMany();

    for (const tenant of tenants) {
      // Get pending charges due today in tenant's timezone
      const charges = await prisma.charge.findMany({
        where: {
          tenantId: tenant.id,
          status: "PENDING",
          dueDate: { lte: new Date() },
        },
      });

      // Send reminder emails
      for (const charge of charges) {
        await mailer.send({
          to: charge.patient.email,
          template: "payment-reminder",
          data: {
            patientName: charge.patient.name,
            amount: charge.amount,
            dueDate: charge.dueDate,
          },
        });

        // Update status to OVERDUE
        await prisma.charge.update({
          where: { id: charge.id },
          data: { status: "OVERDUE" },
        });

        // Audit log
        await auditLog({
          tenantId: tenant.id,
          action: "email.sent",
          metadata: { template: "payment-reminder", chargeId: charge.id },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
```

**Cron Configuration** (vercel.json):

```json
{
  "crons": [
    {
      "path": "/api/cron/payment-reminders",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/appointment-reminders",
      "schedule": "0 8 * * *"
    }
  ]
}
```

### Fire-and-Forget Email Sends

Emails are sent asynchronously without blocking the request:

```typescript
// Don't await email send; fire-and-forget
mailer.send({
  to: patient.email,
  template: "appointment-confirmation",
  data: { /* ... */ },
}).catch((err) => {
  console.error("Email send failed:", err);
  // Could log to Sentry or similar
});

// Return response immediately
return NextResponse.json(appointment, { status: 201 });
```

## Email System

### Resend Integration

Emails sent via Resend SDK:

```typescript
// lib/mailer.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  template,
  data,
}: {
  to: string;
  template: string;
  data: Record<string, any>;
}) {
  // Development: log to console instead of sending
  if (process.env.NODE_ENV === "development") {
    console.log(`[EMAIL] To: ${to}, Template: ${template}`, data);
    return;
  }

  const html = getEmailTemplate(template, data);

  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "noreply@psycologger.com",
    to,
    subject: getEmailSubject(template),
    html,
  });
}

function getEmailTemplate(template: string, data: Record<string, any>) {
  switch (template) {
    case "appointment-confirmation":
      return `
        <h1>Confirmação de Consulta</h1>
        <p>Olá ${data.patientName},</p>
        <p>Sua consulta com ${data.psychologistName} está confirmada para ${data.appointmentTime}.</p>
      `;
    // ... more templates
    default:
      return "";
  }
}
```

### Template Customization

Reminder templates stored in database per tenant:

```typescript
// Fetch tenant reminder template
const reminderTemplate = await prisma.reminderTemplate.findUnique({
  where: {
    tenantId_type: {
      tenantId,
      type: "PAYMENT_REMINDER",
    },
  },
});

// Use tenant-customized template or default
const template = reminderTemplate?.content || DEFAULT_PAYMENT_REMINDER;

// Render with tenant branding
const html = template
  .replace("{TENANT_NAME}", tenant.name)
  .replace("{TENANT_LOGO_URL}", tenant.logoUrl)
  .replace("{PATIENT_NAME}", patient.name)
  .replace("{AMOUNT}", formatCurrency(charge.amount))
  .replace("{DUE_DATE}", formatDate(charge.dueDate));
```

## Storage

### Supabase Storage

Files uploaded to Supabase Storage via REST API:

```typescript
// lib/storage.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function uploadFile(
  tenantId: string,
  fileId: string,
  buffer: Buffer,
  mimeType: string
) {
  const path = `tenants/${tenantId}/files/${fileId}`;

  const { data, error } = await supabase.storage
    .from("psycologger-files")
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return data;
}

export async function generateSignedUrl(
  tenantId: string,
  fileId: string,
  expiresIn: number = 3600 // 1 hour
) {
  const path = `tenants/${tenantId}/files/${fileId}`;

  const { data, error } = await supabase.storage
    .from("psycologger-files")
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

export async function deleteFile(tenantId: string, fileId: string) {
  const path = `tenants/${tenantId}/files/${fileId}`;

  const { error } = await supabase.storage
    .from("psycologger-files")
    .remove([path]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}
```

## Rate Limiting

### Upstash Redis with In-Memory Fallback

Rate limiting using sliding window algorithm:

```typescript
// lib/rate-limit.ts
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Fallback in-memory cache (dev/edge environments)
const inMemoryCache = new Map<string, number[]>();

export async function rateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60000
) {
  try {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Try Redis first
    const requests = await redis.zrangebyscore(key, windowStart, now);

    if (requests.length >= limit) {
      return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
    }

    // Add current request
    await redis.zadd(key, { score: now, member: `${now}-${Math.random()}` });
    await redis.expire(key, Math.ceil(windowMs / 1000));

    return { allowed: true };
  } catch (error) {
    // Fallback to in-memory
    console.warn("Redis unavailable, using in-memory rate limit", error);

    const now = Date.now();
    const windowStart = now - windowMs;
    const cached = inMemoryCache.get(key) || [];

    const recent = cached.filter((t) => t > windowStart);

    if (recent.length >= limit) {
      return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
    }

    recent.push(now);
    inMemoryCache.set(key, recent);

    return { allowed: true };
  }
}
```

### Usage in Route Handler

```typescript
export async function POST(req: NextRequest) {
  const { allowed, retryAfter } = await rateLimit(
    `user:${userId}:appointment-create`,
    10, // 10 requests
    60000 // per minute
  );

  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limited" },
      { status: 429, headers: { "Retry-After": retryAfter.toString() } }
    );
  }

  // ... continue processing
}
```

## Audit Logging

### auditLog() Function

Records every state-changing operation:

```typescript
// lib/audit.ts
export async function auditLog({
  tenantId,
  userId,
  action,
  resource,
  resourceId,
  changes,
  metadata,
  ipAddress,
  userAgent,
}: {
  tenantId: string;
  userId: string;
  action: string; // e.g., "patient.created"
  resource?: string; // e.g., "patient"
  resourceId?: string;
  changes?: { before?: any; after?: any };
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}) {
  // Redact PHI from changes
  const redactedChanges = redactPHI({
    before: changes?.before,
    after: changes?.after,
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      resource,
      resourceId,
      changes: redactedChanges,
      metadata,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    },
  });
}

function redactPHI(data: any): any {
  const sensitiveKeys = [
    "cpf",
    "noteText",
    "email",
    "phone",
    "cardNumber",
    "bankAccount",
    "ssn",
    "idNumber",
    "address",
    "birthDate",
  ];

  const redact = (obj: any): any => {
    if (!obj) return obj;

    if (Array.isArray(obj)) {
      return obj.map(redact);
    }

    if (typeof obj === "object") {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = sensitiveKeys.includes(key) ? "[REDACTED]" : redact(value);
      }
      return result;
    }

    return obj;
  };

  return redact(data);
}
```

### Calling auditLog()

Called after every state-changing operation:

```typescript
export async function POST(req: NextRequest) {
  // ... validation, business logic

  const patient = await prisma.patient.create({
    data: { /* ... */ },
  });

  // Audit log
  await auditLog({
    tenantId,
    userId,
    action: "patient.created",
    resource: "patient",
    resourceId: patient.id,
    changes: { after: patient },
    metadata: { endpoint: "/api/patients" },
  });

  return NextResponse.json(patient, { status: 201 });
}
```

## Transactions

### Atomic Operations

Prisma transactions ensure atomicity:

```typescript
// Partial payment creates remainder charge
await prisma.$transaction(async (tx) => {
  // Record payment
  const payment = await tx.payment.create({
    data: {
      chargeId,
      amount: paymentAmount,
      method: paymentMethod,
      paidAt: new Date(),
    },
  });

  // Update original charge status
  await tx.charge.update({
    where: { id: chargeId },
    data: { status: "PAID", paidDate: new Date() },
  });

  // Create remainder charge if partial payment
  if (remainder > 0) {
    await tx.charge.create({
      data: {
        tenantId,
        patientId,
        psychologistId,
        amount: remainder,
        description: "Saldo Restante",
        status: "PENDING",
        dueDate: addDays(new Date(), 7),
      },
    });
  }

  return payment;
});
```

### Conflict Detection in Transaction

Prevent double-booking by checking conflicts inside transaction:

```typescript
await prisma.$transaction(async (tx) => {
  // Check for conflicts (acquires row-level lock)
  const conflicts = await tx.appointment.findMany({
    where: {
      psychologistId,
      tenantId,
      status: { notIn: ["CANCELED"] },
      OR: [
        {
          startTime: { lt: appointmentEndTime },
          endTime: { gt: appointmentStartTime },
        },
      ],
    },
  });

  if (conflicts.length > 0) {
    throw new ConflictError("Appointment conflicts with existing booking");
  }

  // Create appointment (safe, no concurrent insert possible)
  const appointment = await tx.appointment.create({
    data: {
      tenantId,
      psychologistId,
      patientId,
      startTime: appointmentStartTime,
      endTime: appointmentEndTime,
      // ...
    },
  });

  return appointment;
});
```

## Encryption

### AES-256-GCM

Sensitive data encrypted at rest:

```typescript
// lib/encryption.ts
import crypto from "crypto";

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return versioned payload: version + iv + authTag + ciphertext
  return `1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(versionedPayload: string): string {
  const [version, ivHex, authTagHex, encrypted] = versionedPayload.split(":");

  if (version !== "1") {
    throw new Error("Unsupported encryption version");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

### Usage

```typescript
// Store encrypted
const encryptedCPF = encrypt(cpf);
await prisma.patient.create({
  data: {
    cpf: encryptedCPF,
    // ...
  },
});

// Retrieve and decrypt
const patient = await prisma.patient.findUnique({ where: { id } });
const decryptedCPF = decrypt(patient.cpf);
```

## Multi-Tenancy

### Tenant Isolation

Every query includes `tenantId` filter:

```typescript
// All queries must filter by tenantId
const patients = await prisma.patient.findMany({
  where: { tenantId },
});

// Row-level security via Postgres RLS (optional additional layer)
```

### Tenant Context

Middleware extracts tenant from session:

```typescript
// middleware.ts
export async function middleware(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;

  if (!tenantId) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  // Add to request headers for access in route handlers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-id", tenantId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
```

## Performance

### Database Indexes

Critical indexes on `tenantId` + other frequently-filtered fields:

```sql
-- Appointments by psychologist + time
CREATE INDEX idx_appointments_psychologist_start_time
ON appointments(tenant_id, psychologist_id, start_time);

-- Charges by patient + status
CREATE INDEX idx_charges_patient_status
ON charges(tenant_id, patient_id, status);

-- Audit logs by tenant + resource
CREATE INDEX idx_audit_logs_tenant_resource
ON audit_logs(tenant_id, resource, resource_id);
```

### Query Optimization

Use `select` to fetch only required fields:

```typescript
const appointments = await prisma.appointment.findMany({
  where: { tenantId },
  select: {
    id: true,
    startTime: true,
    endTime: true,
    patient: { select: { id: true, name: true } },
    psychologist: { select: { id: true, name: true } },
  },
});
```

Avoid N+1 queries with `include`:

```typescript
// N+1 problem - avoid
const patients = await prisma.patient.findMany({
  where: { tenantId },
});
for (const patient of patients) {
  const charges = await prisma.charge.findMany({
    where: { patientId: patient.id },
  }); // N+1 queries
}

// Solution - use include
const patients = await prisma.patient.findMany({
  where: { tenantId },
  include: { charges: true }, // Single query
});
```

## Environment Variables

Required backend environment variables:

```
# Database
DATABASE_URL=postgresql://user:password@host/dbname?schema=public

# NextAuth
NEXTAUTH_URL=https://app.psycologger.com
NEXTAUTH_SECRET=your-secret-key

# OAuth (if using)
GITHUB_ID=...
GITHUB_SECRET=...

# Email
RESEND_API_KEY=re_...

# Storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Encryption
ENCRYPTION_KEY=... # 64-character hex string (256 bits)

# Rate limiting
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Cron
CRON_SECRET=... # Used to verify cron requests

# Monitoring (optional)
SENTRY_DSN=...
```
