-- ============================================================
-- COMPLETE SCHEMA FOR PDF EDITOR
-- Run this script once in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cepitbphqnffdpdldgmq/sql/new
-- ============================================================

-- 1. Profiles Table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar_url text,
  timezone text default 'UTC',
  role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Security Definer helper for role checks (avoids infinite RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles
  for select using (public.is_admin());

-- Auto-create profile trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Folders Table
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.folders enable row level security;
drop policy if exists "folders_owner_all" on public.folders;
create policy "folders_owner_all" on public.folders
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 3. Documents Table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  original_file_path text not null,
  thumbnail_path text,
  mime_type text not null default 'application/pdf',
  file_size bigint not null default 0,
  page_count int not null default 0,
  status text not null default 'ready'
    check (status in ('processing','ready','failed','archived')),
  document_type text not null default 'general'
    check (document_type in ('general','bank_statement','invoice','contract','form','other')),
  is_favorite boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;
drop policy if exists "documents_owner_all" on public.documents;
create policy "documents_owner_all" on public.documents
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "documents_admin_read" on public.documents;
create policy "documents_admin_read" on public.documents
  for select using (public.is_admin());

-- 4. Document Folders Join Table
create table if not exists public.document_folders (
  document_id uuid not null references public.documents(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade,
  primary key (document_id, folder_id)
);

alter table public.document_folders enable row level security;
drop policy if exists "doc_folders_owner_all" on public.document_folders;
create policy "doc_folders_owner_all" on public.document_folders
  for all using (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  );

-- 5. Document Versions Table
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number int not null,
  file_path text not null,
  created_by uuid references auth.users(id) on delete set null,
  operation_type text not null,
  operation_summary text,
  page_count int,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

alter table public.document_versions enable row level security;
drop policy if exists "versions_owner_read" on public.document_versions;
create policy "versions_owner_read" on public.document_versions
  for select using (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  );

drop policy if exists "versions_admin_read" on public.document_versions;
create policy "versions_admin_read" on public.document_versions
  for select using (public.is_admin());

-- 6. Annotations Table
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number int not null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.annotations enable row level security;
drop policy if exists "annotations_owner_all" on public.annotations;
create policy "annotations_owner_all" on public.annotations
  for all using (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  );

-- 7. AI Requests Table
create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  prompt text not null,
  model text not null,
  provider text not null,
  status text not null default 'processing'
    check (status in ('processing','succeeded','failed','rejected')),
  error text,
  created_at timestamptz not null default now()
);

alter table public.ai_requests enable row level security;
drop policy if exists "ai_requests_owner_all" on public.ai_requests;
create policy "ai_requests_owner_all" on public.ai_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_requests_admin_read" on public.ai_requests;
create policy "ai_requests_admin_read" on public.ai_requests
  for select using (public.is_admin());

-- 8. AI Operations Table
create table if not exists public.ai_operations (
  id uuid primary key default gen_random_uuid(),
  ai_request_id uuid not null references public.ai_requests(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  operation_json jsonb not null,
  status text not null default 'proposed'
    check (status in ('proposed','validated','rejected','applied','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table public.ai_operations enable row level security;
drop policy if exists "ai_ops_owner_all" on public.ai_operations;
create policy "ai_ops_owner_all" on public.ai_operations
  for all using (
    exists (select 1 from public.ai_requests r
            where r.id = ai_request_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.ai_requests r
            where r.id = ai_request_id and r.user_id = auth.uid())
  );

-- 9. Audit Logs Table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_owner_read" on public.audit_logs;
create policy "audit_logs_owner_read" on public.audit_logs
  for select using (auth.uid() = user_id);

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (public.is_admin());

-- 10. AI Providers Table
create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider_type text not null check (provider_type in ('openai_compatible', 'anthropic_compatible', 'gemini_compatible', 'custom')),
  base_url text not null,
  api_key_encrypted text not null,
  model text not null,
  is_active boolean not null default false,
  temperature numeric(3,2) default 0.20,
  max_tokens int default 4096,
  timeout_seconds int default 60,
  retry_count int default 1,
  usage_requests int not null default 0,
  usage_input_tokens bigint not null default 0,
  usage_output_tokens bigint not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_providers enable row level security;
drop policy if exists "ai_providers_owner_all" on public.ai_providers;
create policy "ai_providers_owner_all" on public.ai_providers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 11. User AI Settings Table
create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_suggest boolean not null default true,
  stream_responses boolean not null default false,
  default_context text not null default 'page'
    check (default_context in ('selected', 'page', 'pages', 'document')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_settings enable row level security;
drop policy if exists "ai_settings_owner_all" on public.user_ai_settings;
create policy "ai_settings_owner_all" on public.user_ai_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 12. Storage Bucket Setup
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 104857600, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Performance indexes
create index if not exists idx_documents_owner on public.documents(owner_id);
create index if not exists idx_documents_status on public.documents(status);
create index if not exists idx_versions_doc on public.document_versions(document_id);
create index if not exists idx_annotations_doc on public.annotations(document_id, page_number);
create index if not exists idx_ai_requests_user on public.ai_requests(user_id, created_at desc);
create index if not exists idx_ai_operations_doc on public.ai_operations(document_id);
create index if not exists idx_audit_logs_user on public.audit_logs(user_id, created_at desc);
