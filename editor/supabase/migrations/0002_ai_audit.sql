-- ============================================================
-- EDITOR — AI tables, audit logs, AI providers (encrypted keys)
-- ============================================================

-- ============ AI REQUESTS ============
create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  prompt text not null,
  model text,
  provider text,
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','rejected','cancelled')),
  error text,
  created_at timestamptz not null default now()
);

alter table public.ai_requests enable row level security;
create policy "ai_requests_owner_all" on public.ai_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_requests_admin_read" on public.ai_requests
  for select using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- ============ AI OPERATIONS ============
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
create policy "ai_ops_owner_all" on public.ai_operations
  for all using (
    exists (select 1 from public.ai_requests r
            where r.id = ai_request_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.ai_requests r
            where r.id = ai_request_id and r.user_id = auth.uid())
  );

-- ============ AUDIT LOGS ============
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
-- Users read their own audit trail; writes go through the service role.
create policy "audit_logs_owner_read" on public.audit_logs
  for select using (auth.uid() = user_id);
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- ============ AI PROVIDERS (user-configured; API keys encrypted server-side) ============
create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider_type text not null default 'openai_compatible'
    check (provider_type in ('openai_compatible','anthropic_compatible','gemini_compatible','custom')),
  base_url text not null,
  api_key_encrypted text not null,   -- AES-256-GCM with server APP_ENCRYPTION_KEY
  model text not null,
  temperature numeric not null default 0.2,
  max_tokens int not null default 4096,
  timeout_seconds int not null default 60,
  retry_count int not null default 1,
  is_active boolean not null default false,   -- the user's active provider
  is_enabled boolean not null default true,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_used_at timestamptz,
  usage_requests int not null default 0,
  usage_input_tokens bigint not null default 0,
  usage_output_tokens bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.ai_providers enable row level security;
-- Encrypted keys are opaque to clients; the server decrypts with its own key.
create policy "ai_providers_owner_select" on public.ai_providers
  for select using (auth.uid() = user_id);
create policy "ai_providers_owner_insert" on public.ai_providers
  for insert with check (auth.uid() = user_id);
create policy "ai_providers_owner_update" on public.ai_providers
  for update using (auth.uid() = user_id);
create policy "ai_providers_owner_delete" on public.ai_providers
  for delete using (auth.uid() = user_id);

-- ============ USER AI SETTINGS ============
create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_provider_id uuid references public.ai_providers(id) on delete set null,
  fallback_provider_id uuid references public.ai_providers(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.user_ai_settings enable row level security;
create policy "user_ai_settings_owner_all" on public.user_ai_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_ai_requests_user on public.ai_requests(user_id, created_at desc);
create index if not exists idx_audit_user on public.audit_logs(user_id, created_at desc);
create index if not exists idx_audit_doc on public.audit_logs(document_id);
create index if not exists idx_ai_providers_user on public.ai_providers(user_id);

drop trigger if exists ai_providers_touch on public.ai_providers;
create trigger ai_providers_touch before update on public.ai_providers
  for each row execute function public.touch_updated_at();
