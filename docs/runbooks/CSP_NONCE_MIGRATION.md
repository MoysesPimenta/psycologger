# CSP Nonce Migration Plan

## Why
Current `script-src 'self' 'unsafe-inline'` is weak. Any stored-XSS payload
that reaches a Next.js page can execute immediately. Nonce-based CSP lets
us drop `'unsafe-inline'` entirely while still allowing Next.js 14 RSC
hydration scripts.

## Why we have not done it yet
The previous attempt added `'strict-dynamic'` without a nonce, which under
CSP3 causes `'unsafe-inline'` to be ignored — every hydration script was
blocked and the whole site went blank. Rollback required a force-push to
5bec91b + hotfix cherry-picks. Retrying requires care.

## Plan (execute on `feat/csp-nonce` branch only)

1. **Middleware:** generate a 16-byte base64 nonce per request, put it in
   a request header (`x-csp-nonce`) AND in the CSP header itself:
   `script-src 'self' 'nonce-XXXX' 'strict-dynamic'`
2. **Root layout:** read the nonce from `headers()` and pass it to any
   `<Script>` tags we control.
3. **Next.js inline scripts:** Next 14 App Router auto-picks up the nonce
   from the request header when `experimental.inlineScriptNonce` or the
   `nonce` prop on `<Script>` is set. Verify against the actual Next
   version we run (`next@14.x`).
4. **Third-party:** audit Stripe.js, Resend pixel, and any CDN scripts —
   each must either accept a nonce or be removed.

## Test plan (DO NOT skip)
- [ ] Preview deploy to `staging` Vercel env
- [ ] Load `/`, `/login`, `/app`, `/portal/login`, `/portal/magic-login/<fake>`
      — confirm no blank pages in Chrome, Safari, Firefox
- [ ] Check DevTools console for any CSP violations
- [ ] Run Playwright smoke suite against the preview URL
- [ ] Only after all green: merge to main

## Rollback
Previous CSP string in `src/middleware.ts` is:
```
script-src 'self' 'unsafe-inline'
```
Revert the middleware commit if any blank-page regression hits.
