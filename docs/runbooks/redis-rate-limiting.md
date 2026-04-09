# Redis Rate Limiting Runbook

## Overview

Psycologger uses Redis for distributed rate limiting to protect APIs from abuse:
- Patient portal login attempts
- API endpoint throttling
- File upload size limits
- Payment processing requests

This runbook documents how to verify Redis connectivity, understand rate limiting behavior, and handle fallback scenarios.

## Architecture

### Rate Limiting Flow

```
Request → Middleware
         ↓
         Check Redis (increment counter)
         ↓
         Counter exceeded? → Return 429 Too Many Requests
         ↓
         Counter OK → Allow request to proceed
         ↓
         Response
```

### Configuration

Rate limiting is configured via environment variables:

```bash
# Redis connection
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=secure-password-here
REDIS_DB=0

# Rate limiting policies
RATE_LIMIT_LOGIN_ATTEMPTS=5 per 15 minutes
RATE_LIMIT_API_REQUESTS=100 per minute
RATE_LIMIT_FILE_UPLOAD=10 per hour
```

## Verification Steps

### Step 1: Check Redis Connectivity

**Via Redis CLI:**

```bash
# Connect to Redis
redis-cli -u redis://localhost:6379

# Verify connection
PING
# Expected: PONG

# Check memory usage
INFO memory

# List rate limiting keys (example)
KEYS "ratelimit:*"
```

**Via Application Health Check:**

```bash
curl https://your-domain/api/v1/health
```

Check response (though the health endpoint only checks DB and encryption):

```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok" },
    "encryption": { "status": "ok" },
    "redis": { "status": "ok" }  // If implemented
  }
}
```

### Step 2: Test Rate Limiting

**Test Login Rate Limiting:**

```bash
# Attempt 6 login requests rapidly
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST https://your-domain/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n\n"
done
```

Expected:
- Attempts 1–5: HTTP 401 (auth fails, but not rate limited)
- Attempt 6: HTTP 429 (rate limited)

Response format (HTTP 429):

```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Too many login attempts. Please try again in 15 minutes.",
    "details": null
  }
}
```

**Check Response Headers:**

```bash
curl -i https://your-domain/api/auth/signin \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'
```

Look for `Retry-After` header on 429 responses:

```
Retry-After: 900
```

(900 seconds = 15 minutes)

### Step 3: Monitor Redis Keys

**List Active Rate Limit Keys:**

```bash
redis-cli KEYS "ratelimit:*"
```

Expected keys:
- `ratelimit:login:<email_hash>` — Login attempts per user
- `ratelimit:api:<user_id>` — API requests per authenticated user
- `ratelimit:ip:<ip_hash>` — Requests per IP (for unauthenticated endpoints)
- `ratelimit:upload:<user_id>` — File uploads per user

**Inspect a Rate Limit Key:**

```bash
redis-cli GET "ratelimit:login:abc123def456"
# Returns: current counter value

redis-cli TTL "ratelimit:login:abc123def456"
# Returns: seconds until key expires
```

### Step 4: Check Rate Limiting Logs

Search application logs for rate limiting events:

```bash
# CloudFlare Workers Tail
wrangler tail --format pretty --filter="rate.limit|TOO_MANY_REQUESTS"

# Grep application logs
grep "TOO_MANY_REQUESTS\|rate.*limit" /var/log/app.log

# Sentry
# Filter by error: TOO_MANY_REQUESTS
```

## Monitoring Checklist

### Daily

- [ ] Redis connectivity is OK (no connection errors in logs)
- [ ] Rate limiting is triggered appropriately (429 responses when limits exceeded)
- [ ] `Retry-After` headers are correct
- [ ] No sudden spike in 429 responses (indicates attack or misconfiguration)

### Weekly

- [ ] Review rate limit configuration (verify limits are appropriate)
- [ ] Check Redis memory usage (should not exceed available RAM)
- [ ] Audit logs show no suspicious patterns (e.g., single IP hammering endpoints)
- [ ] Verify TTL on rate limiting keys (should auto-expire)

### Monthly

- [ ] Review and adjust rate limits based on usage patterns
- [ ] Test Redis failover behavior
- [ ] Verify fallback behavior when Redis is unavailable
- [ ] Check for legitimate users hitting rate limits (false positives)

## Fallback Behavior (Redis Unavailable)

If Redis becomes unavailable, the application should gracefully degrade:

### Option 1: In-Memory Fallback (Development)

```typescript
// If Redis is unavailable, fall back to in-memory counter
const rateLimitMemory = new Map<string, { count: number; expiresAt: number }>();

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  try {
    // Try Redis first
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000));
    }
    return count <= limit;
  } catch (err) {
    console.warn("[rate-limit] Redis unavailable, using in-memory fallback");
    // Fall back to in-memory
    const entry = rateLimitMemory.get(key) || { count: 0, expiresAt: Date.now() };
    if (Date.now() > entry.expiresAt) {
      entry.count = 0;
      entry.expiresAt = Date.now() + windowMs;
    }
    entry.count++;
    rateLimitMemory.set(key, entry);
    return entry.count <= limit;
  }
}
```

### Option 2: Fail Open (Permissive)

Allow requests when Redis is unavailable (trades security for availability):

```typescript
try {
  return await checkRedisRateLimit(key, limit);
} catch {
  console.warn("[rate-limit] Redis unavailable, allowing request");
  return true; // Allow request
}
```

### Option 3: Fail Closed (Restrictive)

Block all requests when Redis is unavailable (trades availability for security):

```typescript
try {
  return await checkRedisRateLimit(key, limit);
} catch {
  console.error("[rate-limit] Redis unavailable, blocking request");
  return false; // Block request
}
```

**Recommendation**: Use Option 2 (Fail Open) for public APIs, Option 3 (Fail Closed) for sensitive operations like password reset.

## Troubleshooting

### High Redis Memory Usage

**Symptom**: Redis memory usage approaching limits, eviction warnings

**Causes**:
- Rate limit keys not expiring (missing TTL)
- Too many unique IPs or users (keys accumulating)
- Keys with very long TTL

**Resolution**:
1. Check TTL on keys:
   ```bash
   redis-cli SCAN 0 MATCH "ratelimit:*" COUNT 100 | while read key; do
     echo "$key: $(redis-cli TTL $key)"
   done
   ```

2. Implement key expiration:
   ```typescript
   await redis.expire(key, windowSeconds);
   ```

3. Reduce rate limiting window or limit count:
   ```bash
   # Reduce from 100 req/min to 50 req/min
   RATE_LIMIT_API_REQUESTS=50 per minute
   ```

4. Clear old keys (use with caution):
   ```bash
   redis-cli EVAL "return redis.call('del', unpack(redis.call('keys', ARGV[1])))" 0 "ratelimit:*"
   ```

### Rate Limiting Too Strict

**Symptom**: Legitimate users getting 429 responses

**Causes**:
- Rate limit thresholds too low
- Shared IP addresses (e.g., corporate network)
- Burst traffic patterns not accounted for

**Resolution**:
1. Review rate limit configuration
2. Increase limits:
   ```bash
   RATE_LIMIT_API_REQUESTS=200 per minute
   ```
3. Implement per-user limits instead of IP-based (for authenticated users)
4. Add whitelist for known IPs:
   ```typescript
   const WHITELIST = ["203.0.113.0", "198.51.100.0"];
   if (WHITELIST.includes(clientIp)) {
     return true; // Skip rate limiting
   }
   ```

### Rate Limiting Too Permissive

**Symptom**: Suspicious activity not being blocked, DDoS attack not mitigated

**Causes**:
- Rate limit thresholds too high
- Keys not configured correctly
- Fallback behavior allowing too much traffic

**Resolution**:
1. Lower rate limits:
   ```bash
   RATE_LIMIT_API_REQUESTS=50 per minute
   ```
2. Add IP-based rate limiting:
   ```typescript
   const ipKey = `ratelimit:ip:${hash(clientIp)}`;
   const allowed = await checkRateLimit(ipKey, 1000, 3600 * 1000); // 1000 req/hour per IP
   ```
3. Implement progressive delays (exponential backoff):
   ```typescript
   if (count > limit * 0.8) {
     // At 80% of limit, start adding delays
     await sleep((count - limit * 0.8) * 100);
   }
   ```

### Redis Connection Refused

**Symptom**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Checks**:
1. Is Redis running?
   ```bash
   redis-cli PING
   ```
2. Is Redis port accessible?
   ```bash
   telnet localhost 6379
   ```
3. Is `REDIS_URL` environment variable set correctly?
   ```bash
   echo $REDIS_URL
   ```

**Resolution**:
1. Start Redis:
   ```bash
   redis-server
   ```
2. Check Redis status:
   ```bash
   redis-cli INFO server | grep redis_version
   ```
3. Update connection string if host/port changed

## Integration Points

Rate limiting is used at:

1. **Authentication** (`src/app/api/auth/signin`):
   - Limit: 5 attempts per 15 minutes per email
   - Key: `ratelimit:login:<email_hash>`

2. **API Endpoints** (middleware):
   - Limit: 100 requests per minute per user (or IP)
   - Key: `ratelimit:api:<user_id|ip_hash>`

3. **File Upload** (`src/app/api/v1/files/upload`):
   - Limit: 10 uploads per hour per user
   - Key: `ratelimit:upload:<user_id>`

4. **Payment Requests** (`src/app/api/v1/charges/[id]/pay`):
   - Limit: 5 attempts per hour per user
   - Key: `ratelimit:payment:<user_id>`

## References

- [Redis Documentation](https://redis.io/docs/)
- [Rate Limiting Algorithms](https://en.wikipedia.org/wiki/Rate_limiting)
- [OWASP: Brute Force Protection](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html#brute-force-protection)
- Health Check Endpoint: `src/app/api/v1/health/route.ts`
