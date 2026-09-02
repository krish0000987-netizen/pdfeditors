# Supabase Setup for EDITOR

No real credentials appear anywhere in this repository. Everything below uses
values from **your** Supabase dashboard.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Choose a name, region and a strong database password (store it in a
   password manager — EDITOR itself never needs it).

## 2. Configure Authentication

**Authentication → Sign In / Providers**

- Enable **Email**.
- For local development you may set *Confirm email* to **off** so signups are
  usable immediately; in production keep it on.
- (Optional) Configure SMTP under *Auth → SMTP* so password-reset emails are
  delivered from your domain.

**URL Configuration**

- Site URL: `http://localhost:3000` (dev) or your production URL.
- Add redirect `http://localhost:3000/reset-password` — the reset flow uses it.

## 3–4. Create tables / apply migrations

**Database → Migrations** (or the SQL editor, in this order):

1. `supabase/migrations/0001_init.sql` — profiles (+ signup trigger),
   folders, documents, document_versions, document_folders, annotations, RLS.
2. `supabase/migrations/0002_ai_audit.sql` — ai_requests, ai_operations,
   ai_providers (encrypted keys, usage counters), user_ai_settings,
   audit_logs, RLS.
3. `supabase/migrations/0003_storage.sql` — private `documents` bucket and
   owner-scoped storage policies.

With the CLI instead:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

All tables have Row Level Security enabled. Ownership is enforced by
`auth.uid()`; admins additionally get **read** access to profiles, documents,
AI requests and audit logs — never write access to other users' data.

## 5. Storage

Migration 0003 creates the **private** `documents` bucket (100 MB limit,
`application/pdf` only). Objects live under
`documents/{user_id}/{document_id}/original|versions|…`.

- Users can read/write only inside their own top-level folder.
- The server (service role) writes version files and streams downloads —
  users never receive public or signed URLs.

## 6. RLS verification

Quick self-check in the SQL editor:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and rowsecurity = false;
-- should return 0 rows
```

## 7. Environment variables

**Project Settings → API** → copy into `editor/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SECRET_KEY=<secret key>            # SERVER ONLY
APP_ENCRYPTION_KEY=<openssl rand -base64 32> # encrypts stored AI keys
```

## 8. Make yourself an admin

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Sign up through the app first (so the profile row exists), then run the
statement, then refresh — the **Admin** item appears in the sidebar.

## 9. Start the application

```bash
cd engine-service && python main.py   # terminal 1
cd editor && npm run dev              # terminal 2
```
