# Push Notifications Architecture — Psycologger

## Overview

Psycologger provides a provider-agnostic push notification layer that supports both staff and patient portal clients. Currently implemented as a foundation with database storage and event logging; actual delivery via APNs (Apple) and FCM (Google) is stubbed pending credential configuration.

## Data Model

### DeviceToken Table

```sql
CREATE TABLE "DeviceToken" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NULLABLE,
  "userId" UUID NULLABLE,       -- One of userId or patientId must be set
  "patientId" UUID NULLABLE,
  "platform" ENUM ('IOS', 'ANDROID', 'WEB') NOT NULL,
  "token" TEXT UNIQUE NOT NULL, -- Push provider's device token
  "pushProvider" ENUM ('APNS', 'FCM', 'WEBPUSH') NOT NULL,
  "appVersion" TEXT NULLABLE,
  "locale" TEXT NULLABLE,       -- BCP47 locale (e.g., "pt-BR")
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP,
  "lastSeenAt" TIMESTAMP NULLABLE,
  "revokedAt" TIMESTAMP NULLABLE -- Soft-delete: don't hard-delete for audit trail
);

-- Indexes for efficient filtering by user/patient + revocation status
CREATE INDEX ON "DeviceToken"("userId", "revokedAt");
CREATE INDEX ON "DeviceToken"("patientId", "revokedAt");
CREATE INDEX ON "DeviceToken"("tenantId", "revokedAt");
```

**Fields:**

- **id**: UUID primary key
- **tenantId**: Tenant scope (nullable for patient-portal devices; inferred from patient's tenant)
- **userId**: Staff user ID (null for patient devices)
- **patientId**: Patient ID (null for staff devices)
- **platform**: Device OS (IOS, ANDROID, WEB)
- **token**: Device token from push provider (unique constraint prevents duplicates)
- **pushProvider**: Which service issued the token (APNS, FCM, WEBPUSH)
- **appVersion**: App/build version for debugging
- **locale**: Device locale (useful for localized push copy)
- **revokedAt**: Soft-delete timestamp (never hard-delete for audit compliance)

## API Endpoints

### Staff Endpoints

#### Register Device Token
```
POST /api/v1/devices/register
Authorization: Bearer <staff-jwt>

{
  "platform": "IOS" | "ANDROID" | "WEB",
  "token": "device-token-from-apns-or-fcm",
  "pushProvider": "APNS" | "FCM" | "WEBPUSH",
  "appVersion": "1.0.0",      // optional
  "locale": "pt-BR"           // optional
}

Response:
{
  "deviceId": "uuid",
  "registered": true
}
```

#### Revoke Device Token
```
DELETE /api/v1/devices/:token
Authorization: Bearer <staff-jwt>

Response: 204 No Content
```

### Patient Portal Endpoints

#### Register Device Token (Portal)
```
POST /api/v1/portal/devices/register
Cookie: _patient-auth=<magic-link-session>

{
  "platform": "IOS" | "ANDROID" | "WEB",
  "token": "device-token-from-apns-or-fcm",
  "pushProvider": "APNS" | "FCM" | "WEBPUSH",
  "appVersion": "1.0.0",      // optional
  "locale": "pt-BR"           // optional
}

Response:
{
  "deviceId": "uuid",
  "registered": true
}
```

#### Revoke Device Token (Portal)
```
DELETE /api/v1/portal/devices/:token
Cookie: _patient-auth=<magic-link-session>

Response: 204 No Content
```

## Push Abstraction Layer

### Library: `src/lib/push/index.ts`

Exports four functions and one interface:

#### `registerDeviceToken(opts)`
Register a new or update existing device token.

```typescript
interface RegisterOpts {
  kind: "staff" | "patient";
  actorId: string;              // userId for staff, patientId for patient
  tenantId?: string;            // required for staff, inferred for patient
  platform: "IOS" | "ANDROID" | "WEB";
  token: string;
  pushProvider: "APNS" | "FCM" | "WEBPUSH";
  appVersion?: string;
  locale?: string;
}

async function registerDeviceToken(opts: RegisterOpts): Promise<string>
// Returns deviceId (UUID) on success
// Audited as PUSH_TOKEN_REGISTERED
```

- Upserts token (idempotent via `token` unique constraint)
- Re-enables previously revoked tokens
- Updates `lastSeenAt` on re-registration

#### `revokeDeviceToken(opts)`
Soft-delete a device token.

```typescript
interface RevokeOpts {
  token: string;
}

async function revokeDeviceToken(opts: RevokeOpts): Promise<void>
// Sets revokedAt = NOW()
// Audited as PUSH_TOKEN_REVOKED
```

- Never hard-deletes (preserves audit trail)
- Gracefully handles missing tokens

#### `sendPushToUser(userId, payload)`
Send push notification to all active devices registered to a staff user.

```typescript
interface PushPayload {
  title?: string;
  body?: string;
  badge?: number;
  sound?: string;
  data?: Record<string, string>;
  apns?: Record<string, unknown>;  // APNs-specific overrides
  fcm?: Record<string, unknown>;   // FCM-specific overrides
}

async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: boolean; reason?: string }>
```

**Current behavior (stub):**
- Logs to console: `[push] would send to userId {userId}: {payload}`
- Always returns `{ sent: false, reason: "provider-not-configured" }`

**Future behavior:**
- Query DeviceToken where `userId = {userId}` AND `revokedAt IS NULL`
- Dispatch to APNs/FCM based on platform and pushProvider
- Return `{ sent: true }` on success or `{ sent: false, reason: "..." }` on error

#### `sendPushToPatient(patientId, payload)`
Send push notification to all active devices registered to a patient.

```typescript
async function sendPushToPatient(
  patientId: string,
  payload: PushPayload
): Promise<{ sent: boolean; reason?: string }>
```

**Current behavior (stub):**
- Logs to console: `[push] would send to patientId {patientId}: {payload}`
- Always returns `{ sent: false, reason: "provider-not-configured" }`

**Future behavior:** Same as `sendPushToUser`, but queries by `patientId`.

## Audit Logging

Two new audit actions are emitted:

- **PUSH_TOKEN_REGISTERED**: When device token is registered/re-enabled
  - Entity: DeviceToken
  - Summary: `{ platform, pushProvider, kind }`
  
- **PUSH_TOKEN_REVOKED**: When device token is revoked
  - Entity: DeviceToken
  - Summary: `{ platform, pushProvider }`

## Configuration

### Current (Stub)

No configuration required. Functions execute successfully but return `sent: false`.

### Future (With Real Providers)

#### Apple Push Notification Service (APNs)

Add to environment:

```
APNS_KEY_ID=ABC123DEF456          # APNs key ID from Apple Developer
APNS_TEAM_ID=X123Y456Z789         # Apple team ID
APNS_PRIVATE_KEY=<base64-encoded>  # PKCS8 private key, base64
```

**Implementation steps:**
1. Obtain private key from Apple Developer console
2. Base64-encode the PKCS8 PEM file
3. Set above env vars in Vercel
4. In `sendPushToUser/sendPushToPatient`, check for iOS devices and call APNs API

#### Firebase Cloud Messaging (FCM)

Add to environment:

```
FCM_SERVER_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Implementation steps:**
1. Create Firebase project and get server key (if using legacy HTTP API) or service account JSON (recommended)
2. Set env var in Vercel
3. In `sendPushToUser/sendPushToPatient`, check for Android/Web devices and call FCM API

#### WebPush

Optional for web clients using Service Workers.

```
WEBPUSH_PUBLIC_KEY=...
WEBPUSH_PRIVATE_KEY=...
WEBPUSH_EMAIL=admin@psycologger.com
```

## Mobile Client Integration

### Swift (iOS)

```swift
import UserNotifications

// Request permission
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
  if granted {
    DispatchQueue.main.async {
      UIApplication.shared.registerForRemoteNotifications()
    }
  }
}

// Handle token in AppDelegate
func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
  UNUserNotificationCenter.current().delegate = self
  return true
}

func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
  
  // POST to /api/v1/devices/register
  let payload = [
    "platform": "IOS",
    "token": token,
    "pushProvider": "APNS",
    "appVersion": Bundle.main.appVersion
  ]
  // HTTP POST to staff or portal endpoint with auth
}
```

### Kotlin (Android)

```kotlin
import com.google.firebase.messaging.FirebaseMessaging

FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
  if (task.isSuccessful) {
    val token = task.result
    
    // POST to /api/v1/devices/register
    val payload = mapOf(
      "platform" to "ANDROID",
      "token" to token,
      "pushProvider" to "FCM",
      "appVersion" to BuildConfig.VERSION_NAME
    )
    // HTTP POST to staff or portal endpoint with auth
  }
}
```

## Known Limitations

1. **No delivery reports**: Current stub doesn't track whether push was actually delivered to device
2. **No analytics**: No metrics on push open rates, clicks, or engagement
3. **No scheduling**: Pushes are sent immediately; no delayed/batched sending
4. **No templating**: Full payload must be built by caller; no template engine
5. **No expiration strategy**: Tokens are never auto-pruned if devices become unregistered at provider
6. **No rate limiting per device**: Multiple pushes in quick succession could overwhelm user

## Testing

### Unit Tests

```bash
npx vitest run tests/unit/push-stub.test.ts
```

Covers:
- Token registration and upsert
- Revocation soft-delete
- Audit logging
- Stub behavior (always returns sent:false)
- Payload handling (minimal to full)

### Manual Testing

1. Register device token via `/api/v1/devices/register` (or portal equivalent)
2. Check `DeviceToken` table: new row created with `revokedAt = NULL`
3. Call `sendPushToUser` or `sendPushToPatient` — check console logs
4. Revoke token via `DELETE /api/v1/devices/:token`
5. Check `DeviceToken` table: `revokedAt` now set

## Future Roadmap

- [ ] Wire APNs provider (requires APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY)
- [ ] Wire FCM provider (requires FCM_SERVER_KEY)
- [ ] Delivery status tracking (sent_at, delivered_at, failed_reason)
- [ ] Push analytics dashboard (open rates, click-through)
- [ ] Token expiration auto-prune (query provider for invalid tokens)
- [ ] Scheduled push (send at specific time or after delay)
- [ ] Batching and rate limiting per device
- [ ] Localized push templates
