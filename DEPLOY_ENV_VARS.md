# Psycologger — Vercel Environment Variables

Copy these into Vercel → Project → Settings → Environment Variables.

---

## Required Variables

### DATABASE_URL
Supabase **Transaction Pooler** URL (port 6543)
Get it from: Supabase Dashboard → Your Project → Settings → Database → Connection pooling → Transaction mode

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

### DIRECT_URL
Supabase **Direct Connection** URL (port 5432)
Get it from: Supabase Dashboard → Your Project → Settings → Database → Connection string → URI

```
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### NEXTAUTH_SECRET
Pre-generated — copy this exactly:
```
+M3/wlEFprJ7Uu9cYhOKpP3GVMTCT9AX73/pOMS/tb4=
```

### NEXTAUTH_URL
Set this AFTER Vercel gives you a domain. Format:
```
https://psycologger.vercel.app
```
(Replace with your actual Vercel URL)

### ENCRYPTION_KEY
Pre-generated — copy this exactly:
```
gCf6CYFvmyLjx3q2euRopIg1BbyAX+0LRRZG8g0/30s=
```

### RESEND_API_KEY
Get from: https://resend.com → API Keys → Create API Key
```
re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### EMAIL_FROM
```
Psycologger <noreply@yourdomain.com>
```
Or while testing (before a domain):
```
Psycologger <onboarding@resend.dev>
```

---

## Steps to deploy

1. ✅ Push code to GitHub: `git push -u origin main` (from your Mac Terminal)
2. ✅ Create Supabase project (psycologger, South America region)
3. ✅ Authorize Vercel with GitHub
4. In Vercel → Import Git Repository → select `MoysesPimenta/psycologger`
5. Add all environment variables above
6. Click **Deploy**
7. After deploy succeeds, copy the `.vercel.app` URL
8. Update `NEXTAUTH_URL` in Vercel env vars to that URL
9. Redeploy (Vercel → Deployments → Redeploy)

---

## After deploy — seed demo data (run from your Mac Terminal)

```bash
cd ~/path/to/Psycologger
npm install
DIRECT_URL="your-direct-url" DATABASE_URL="your-pooler-url" npx tsx prisma/seed.ts
```

This creates:
- SuperAdmin: `admin@psycologger.com`
- Demo psychologist: `psi@demo.com`
- Demo clinic admin: `admin@demo.com`
- 5 sample patients + appointments + clinical notes
