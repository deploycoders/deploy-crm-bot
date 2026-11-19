-- Migration: Tenant-scoped WhatsApp credentials, team invitations & membership policies
-- Apply this migration to extend the multitenancy foundation.

-- 1. Extend tenant_channels with credentials
alter table if exists public.tenant_channels
  add column if not exists access_token text,
  add column if not exists credentials jsonb default '{}'::jsonb;

-- 2. Team invitations table
create table if not exists public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null default 'agent' check (role in ('owner', 'admin', 'agent')),
  invited_by uuid references auth.users(id) on delete set null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '7 days')
);

create index if not exists tenant_invitations_tenant_idx on public.tenant_invitations (tenant_id);
create index if not exists tenant_invitations_email_idx on public.tenant_invitations (email);

-- 3. Row Level Security for organization_members and invitations
alter table public.tenant_invitations enable row level security;

-- Allow members of a tenant to view fellow team members in their organization
drop policy if exists members_can_read_tenant_members on public.organization_members;
create policy members_can_read_tenant_members on public.organization_members for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Allow admins/owners to insert/update/delete organization members
drop policy if exists tenant_admins_manage_members on public.organization_members;
create policy tenant_admins_manage_members on public.organization_members for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- Invitations RLS
drop policy if exists tenant_members_read_invitations on public.tenant_invitations;
create policy tenant_members_read_invitations on public.tenant_invitations for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_admins_manage_invitations on public.tenant_invitations;
create policy tenant_admins_manage_invitations on public.tenant_invitations for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- 4. Backfill legacy tenant channel with existing credentials if available
do $$
declare
  legacy_tenant_id uuid;
begin
  select id into legacy_tenant_id from public.tenants where slug = 'legacy';
  if legacy_tenant_id is not null then
    insert into public.tenant_channels (tenant_id, provider, external_id, display_name, access_token)
    values (
      legacy_tenant_id,
      'whatsapp',
      '1304775179385550',
      'WhatsApp Principal (Legacy)',
      'EAAZAZCmIgKZCbEBSqK3knj5OLnANex8PdJhRAyoMiN19UPUhmrAZAPuFekdaHNYtojEZBen3ZBZBUAhiCdsazvV4Uip4aTvr8LXrbUvAappdMxcptqD2r2ljyBBaiUhUcVDuCn6gz2IA5ZBHgCRYqhEKBuwc6BPBHHQhvdtMZApCW4ZBp9X3g0noAk9hCDiZAy8mS85ugZDZD'
    )
    on conflict (provider, external_id) do update set
      access_token = coalesce(excluded.access_token, public.tenant_channels.access_token),
      display_name = coalesce(excluded.display_name, public.tenant_channels.display_name);
  end if;
end $$;

