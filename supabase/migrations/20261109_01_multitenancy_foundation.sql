-- Multi-tenant foundation for SalesBot CRM.
-- Apply this migration in the Supabase SQL editor before deploying the code changes.
-- It creates a "legacy" tenant and moves all pre-existing CRM data into it.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner', 'admin', 'agent')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, user_id)
);

-- A WhatsApp phone-number ID belongs to exactly one tenant. Webhooks resolve
-- their tenant from this table; never from a request header or payload field.
create table if not exists public.tenant_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('whatsapp')),
  external_id text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, external_id)
);

insert into public.tenants (slug, name)
values ('legacy', 'Organización existente')
on conflict (slug) do nothing;

-- New table rather than altering the historical key/value table: old global
-- settings stay intact and can be copied manually if desired.
create table if not exists public.tenant_bot_settings (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, key)
);

-- Add tenant_id to existing CRM entities, backfill them, then enforce it.
do $$
declare
  legacy_tenant_id uuid;
  table_name text;
begin
  select id into legacy_tenant_id from public.tenants where slug = 'legacy';
  foreach table_name in array array['contacts', 'conversations', 'messages', 'audit_log']
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I add column if not exists tenant_id uuid references public.tenants(id) on delete cascade', table_name);
      execute format('update public.%I set tenant_id = $1 where tenant_id is null', table_name) using legacy_tenant_id;
      execute format('alter table public.%I alter column tenant_id set not null', table_name);
      execute format('create index if not exists %I on public.%I (tenant_id)', table_name || '_tenant_id_idx', table_name);
    end if;
  end loop;
end $$;

-- Phone numbers are unique within a tenant, not globally.
do $$
begin
  if to_regclass('public.contacts') is not null then
    alter table public.contacts drop constraint if exists contacts_phone_key;
    create unique index if not exists contacts_tenant_phone_key on public.contacts (tenant_id, phone);
  end if;
end $$;

-- Every CRM table is protected by membership-based RLS. The service-role key
-- bypasses RLS, so server-side code must still filter using a verified tenant.
alter table public.tenants enable row level security;
alter table public.organization_members enable row level security;
alter table public.tenant_channels enable row level security;
alter table public.tenant_bot_settings enable row level security;

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.is_active
  );
$$;

grant execute on function public.is_tenant_member(uuid) to authenticated;

create or replace function public.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.is_active
      and m.role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_tenant_admin(uuid) to authenticated;

drop policy if exists tenant_members_can_read_tenants on public.tenants;
create policy tenant_members_can_read_tenants on public.tenants for select to authenticated
  using (public.is_tenant_member(id));

drop policy if exists members_can_read_own_memberships on public.organization_members;
create policy members_can_read_own_memberships on public.organization_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists tenant_members_can_read_channels on public.tenant_channels;
create policy tenant_members_can_read_channels on public.tenant_channels for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_members_read_bot_settings on public.tenant_bot_settings;
create policy tenant_members_read_bot_settings on public.tenant_bot_settings for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_admins_manage_bot_settings on public.tenant_bot_settings;
create policy tenant_admins_manage_bot_settings on public.tenant_bot_settings for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['contacts', 'conversations', 'messages', 'audit_log']
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists tenant_isolation on public.%I', table_name);
      execute format('create policy tenant_isolation on public.%I for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id))', table_name);
    end if;
  end loop;
end $$;
