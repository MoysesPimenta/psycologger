# Rate Limiting

**Last verified against code:** 2026-09-05

## Store precedence

`src/lib/rate-limit.ts` resolves a limiter in this order:

1. **Upstash Redis** — used when `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` are both set and the client initialises. Sliding
   window, prefix `psycologger:rl:<limit>:<windowSeconds>`.
2. **Postgres** — `RateLimitCounter` table, fixed window. Used when Upstash is
   unconfigured, or configured but erroring.
3. **In-memory** — development only. In production, if both shared stores fail,
   the limiter denies the request rather than degrading to a per-instance map.

## Why the Postgres fallback exists

On 2026-09-04 the project's Upstash database (`saved-elephant-93350`) no longer
resolved — `getaddrinfo ENOTFOUND`. The limiter failed closed in production, so
every one of the 22 rate-limited endpoints returned denied: patient creation,
appointments, clinical sessions, charges, payments, profile updates, portal
magic links, invite acceptance and `/api/v1/onboarding`.

The practical effect was that new users could authenticate by magic link but got
`429` when creating their clinic, which presents to the user as "login is
broken". A single external dependency going away took down every write in the
app.

Postgres is already a hard dependency of every request and its counters are
shared across serverless instances, so it preserves the security property that
made fail-closed the right call in the first place. In-memory counters would not
— on Vercel each lambda would keep its own tally.

## RateLimitCounter

| Column | Notes |
|---|---|
| `key` | SHA-256 of `"<limit>:<windowMs>:<key>"` |
| `windowStart` | Start of the fixed window (`floor(now / windowMs) * windowMs`) |
| `count` | Incremented atomically by the upsert |
| `expiresAt` | `windowStart + windowMs` |

Primary key `(key, windowStart)`; index on `expiresAt`.

Rate-limit keys embed emails, IP addresses and tenant/user ids, so the key is
**hashed before storage** — no identifier is persisted. The limit and window are
folded into the hash so two limiter configs never share a counter row.

The increment is a single `INSERT … ON CONFLICT DO UPDATE … RETURNING` under the
primary key, so concurrent lambdas cannot race past the limit. Expired rows are
swept opportunistically (`DELETE … WHERE expiresAt < NOW()`), rate-limited by
`RATE_LIMIT_CLEANUP_INTERVAL_MS`; a failed sweep never blocks a request.

Rows are disposable. Truncating the table resets all windows and nothing else.

## Operational notes

- Reinstating Upstash needs no code change — set the two env vars and redeploy;
  Upstash is preferred automatically.
- `env-check.ts` still marks the Upstash vars as required in production. They are
  no longer load-bearing, so that rule is now stricter than reality and should be
  relaxed to a warning.
- Denials are logged as `{"evt":"rate_limit_denied","store":"postgres",…}` for
  log-drain aggregation. The Upstash path logs the key; the Postgres path does
  not, since the key is hashed by then.
- A `prisma migrate deploy` that dies mid-run can leave advisory lock 72707369
  held by an orphaned session, which makes every later deploy fail with `P1002`.
  Clear it by terminating the idle backend holding it in `pg_locks`.
