-- ============================================================
-- EDITOR — consolidated application schema
-- Migration 0001: extensions, profiles, folders, documents,
-- document_versions, document_folders, annotations
--
-- Idempotent (IF NOT EXISTS). Apply with `supabase db push`
-- or paste into the Supabase SQL editor in file order.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============ SHARED TRIGGER ============
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ PROFILES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  avatar_url text,
  timezone text not null default 'UTC',
  role text not null default 'editor'
    check (role in ('admin','editor','reviewer','viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Security definer helper to check admin role without recursive RLS trigger
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

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);
-- Admins may read all profiles (user management). Updates of OTHER profiles
-- go through the service role (server-side admin API) only.
create policy "profiles_admin_read" on public.profiles
  for select using (public.is_admin());

-- Auto-create profile on signup
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

-- ============ FOLDERS ============
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.folders enable row level security;
create policy "folders_owner_all" on public.folders
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ============ DOCUMENTS ============
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
create policy "documents_owner_all" on public.documents
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "documents_admin_read" on public.documents
  for select using (public.is_admin());

-- ============ DOCUMENT_FOLDERS ============
create table if not exists public.document_folders (
  document_id uuid not null references public.documents(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade,
  primary key (document_id, folder_id)
);

alter table public.document_folders enable row level security;
create policy "doc_folders_owner_all" on public.document_folders
  for all using (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  );

-- ============ DOCUMENT_VERSIONS ============
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number int not null,
  file_path text not null,
  created_by uuid not null references auth.users(id),
  operation_type text not null default 'original',
  operation_summary text,
  page_count int,
  file_size bigint,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

alter table public.document_versions enable row level security;
create policy "versions_owner_all" on public.document_versions
  for all using (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  );

-- ============ ANNOTATIONS ============
-- Metadata mirror; the PDF's own annotation objects remain the visual source.
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid references public.document_versions(id) on delete set null,
  page_number int not null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.annotations enable row level security;
create policy "annotations_owner_all" on public.annotations
  for all using (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.documents d
            where d.id = document_id and d.owner_id = auth.uid())
  );

-- ============ INDEXES ============
create index if not exists idx_documents_owner on public.documents(owner_id);
create index if not exists idx_documents_deleted on public.documents(deleted_at);
create index if not exists idx_versions_doc on public.document_versions(document_id);
create index if not exists idx_annotations_doc on public.annotations(document_id);
create index if not exists idx_folders_owner on public.folders(owner_id);

-- updated_at maintenance
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
