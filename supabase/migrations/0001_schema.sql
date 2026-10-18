-- ============================================================================
-- 0001_schema.sql: Core Schema & Enums for LeadFlow
-- ============================================================================

-- 1. Extensions
create extension if not exists pgcrypto;

-- 2. Custom Enumeration Types (Order and labels strictly enforced)
create type user_level as enum (
  'owner',
  'admin',
  'user'
);

create type user_status as enum (
  'available',
  'busy',
  'on_leave',
  'offline'
);

create type lead_source as enum (
  'web_form',
  'message',
  'manual'
);

create type lead_status as enum (
  'new',
  'acknowledged',
  'closed'
);

create type assignment_reason as enum (
  'initial',
  'escalation',
  'reassign_absence',
  'manual'
);

create type ack_leave_policy as enum (
  'keep',
  'reassign'
);

create type custom_field_entity as enum (
  'contact',
  'opportunity'
);

create type custom_field_type as enum (
  'text',
  'number',
  'date',
  'dropdown',
  'checkbox'
);

create type integration_status as enum (
  'not_connected',
  'connected',
  'error'
);

create type integration_direction as enum (
  'inbound',
  'outbound'
);

create type message_direction as enum (
  'inbound',
  'outbound'
);

create type message_status as enum (
  'queued',
  'sent',
  'delivered',
  'failed'
);

create type payment_status as enum (
  'pending',
  'paid',
  'failed',
  'expired',
  'refunded'
);

create type outbox_status as enum (
  'pending',
  'sent',
  'failed'
);

-- 3. Core Tables

-- Workspaces
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

-- Roles
create table roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  unique (workspace_id, name)
);

-- Role Permissions
create table role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id) on delete cascade,
  permission text not null,
  unique (role_id, permission)
);

-- Profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  full_name text not null,
  level user_level not null default 'user',
  role_id uuid null references roles(id) on delete set null,
  status user_status not null default 'offline',
  is_active boolean not null default true,
  telegram_chat_id text,
  notify_email text,
  created_at timestamptz not null default now()
);

-- Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Contacts
create table contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  company_id uuid null references companies(id) on delete set null,
  name text not null,
  phone text,
  email text,
  tags text[] not null default '{}',
  opted_out boolean not null default false,
  custom_values jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Pipelines
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Stages
create table stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  position int not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  required_field_ids uuid[] not null default '{}'
);

-- Opportunities
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete restrict,
  pipeline_id uuid not null references pipelines(id) on delete restrict,
  stage_id uuid not null references stages(id) on delete restrict,
  title text not null,
  owner_id uuid null references profiles(id) on delete set null,
  custom_values jsonb not null default '{}',
  version int not null default 1,
  payment_status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Opportunity Values
create table opportunity_values (
  opportunity_id uuid primary key references opportunities(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  value numeric(14,2) not null default 0,
  currency text not null default 'USD'
);

-- Custom Fields
create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity custom_field_entity not null,
  pipeline_id uuid null references pipelines(id) on delete cascade,
  name text not null,
  field_key text not null,
  type custom_field_type not null,
  options jsonb not null default '[]',
  position int not null default 0
);

-- Saved Lists
create table saved_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Leads
create table leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete restrict,
  opportunity_id uuid null references opportunities(id) on delete set null,
  source lead_source not null,
  status lead_status not null default 'new',
  owner_id uuid null references profiles(id) on delete set null,
  first_assigned_at timestamptz,
  assigned_at timestamptz,
  ack_deadline timestamptz,
  acknowledged_at timestamptz,
  escalation_level int not null default 0,
  escalation_count int not null default 0,
  last_action_at timestamptz,
  flagged_reason text,
  created_at timestamptz not null default now()
);

-- Lead Assignments
create table lead_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  reason assignment_reason not null,
  acknowledged_at timestamptz
);

-- Assignment Rules
create table assignment_rules (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  round_robin boolean not null default true,
  max_open_leads int not null default 10,
  ack_window_seconds int not null default 60,
  escalation_levels int not null default 3,
  level_window_seconds int not null default 60,
  idle_period_seconds int not null default 3600,
  backup_user_id uuid null references profiles(id) on delete set null,
  manager_user_id uuid null references profiles(id) on delete set null,
  ack_leave_policy ack_leave_policy not null default 'keep',
  last_rr_user_id uuid null references profiles(id) on delete set null
);

-- Activities
create table activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  kind text not null,
  payload jsonb not null default '{}',
  actor_id uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Audit Log
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid null references profiles(id) on delete set null,
  event_type text not null,
  target_type text not null,
  target_id uuid null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- Dashboard Preferences
create table dashboard_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  hidden_widgets jsonb not null default '[]'
);

-- Integrations
create table integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  status integration_status not null default 'not_connected',
  config jsonb not null default '{}',
  last_ok_at timestamptz,
  last_error text,
  unique (workspace_id, provider)
);

-- Integration Events
create table integration_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  direction integration_direction not null,
  event_id text not null,
  status text not null,
  reference text,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  lead_id uuid null references leads(id) on delete set null,
  direction message_direction not null,
  body text not null,
  provider_message_id text unique,
  status message_status not null default 'queued',
  failure_reason text,
  created_at timestamptz not null default now()
);

-- Payments
create table payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  requested_by uuid null references profiles(id) on delete set null,
  amount numeric(14,2) not null,
  currency text not null default 'USD',
  status payment_status not null default 'pending',
  provider_ref text unique,
  created_at timestamptz not null default now()
);

-- Appointments
create table appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  opportunity_id uuid null references opportunities(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  google_event_id text,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

-- Notification Outbox
create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  reason text not null,
  status outbox_status not null default 'pending',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

-- 4. Performance Indexes
create index idx_profiles_workspace_id on profiles(workspace_id);
create index idx_profiles_email on profiles(email);

create index idx_contacts_workspace_id on contacts(workspace_id);
create index idx_contacts_phone on contacts(phone);
create index idx_contacts_workspace_created on contacts(workspace_id, created_at desc);

create index idx_opportunities_workspace_id on opportunities(workspace_id);
create index idx_opportunities_contact_id on opportunities(contact_id);
create index idx_opportunities_stage_id on opportunities(stage_id);
create index idx_opportunities_owner_id on opportunities(owner_id);

create index idx_leads_workspace_status on leads(workspace_id, status);
create index idx_leads_workspace_ack_deadline on leads(workspace_id, ack_deadline) where status = 'new';
create index idx_leads_owner_id on leads(owner_id);

create index idx_lead_assignments_lead_id on lead_assignments(lead_id);

create index idx_activities_workspace_entity_created on activities(workspace_id, entity_type, entity_id, created_at desc);

create index idx_audit_log_workspace_created on audit_log(workspace_id, created_at desc);
create index idx_audit_log_event_type on audit_log(event_type);

create index idx_notification_outbox_workspace_status on notification_outbox(workspace_id, status);

-- 5. Helper Functions (SECURITY DEFINER with set search_path = public)

create or replace function current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from profiles where id = auth.uid();
$$;

create or replace function current_level()
returns user_level
language sql
stable
security definer
set search_path = public
as $$
  select level from profiles where id = auth.uid();
$$;

create or replace function has_permission(perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_level user_level;
  v_role_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select level, role_id into v_level, v_role_id
  from profiles
  where id = auth.uid();

  if v_level is null then
    return false;
  end if;

  -- Owner level always returns true
  if v_level = 'owner' then
    return true;
  end if;

  -- Admin level base default: all permissions granted
  if v_level = 'admin' then
    return true;
  end if;

  -- User level base default: 'crm.view', 'crm.create', 'crm.edit'
  if v_level = 'user' and perm in ('crm.view', 'crm.create', 'crm.edit') then
    return true;
  end if;

  -- Check explicit role permissions for assigned role
  if v_role_id is not null then
    if exists (
      select 1 from role_permissions
      where role_id = v_role_id and permission = perm
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

-- 6. Audit Immutability Protection

create or replace function prevent_audit_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only and cannot be modified or deleted';
end;
$$;

create trigger trg_audit_log_prevent_modification
before update or delete on audit_log
for each row
execute function prevent_audit_modification();

-- 7. Helper Security Definer Function: audit_record

create or replace function audit_record(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit_id uuid;
begin
  insert into audit_log (
    workspace_id,
    actor_id,
    event_type,
    target_type,
    target_id,
    before,
    after
  ) values (
    p_workspace_id,
    p_actor_id,
    p_event_type,
    p_target_type,
    p_target_id,
    p_before,
    p_after
  ) returning id into v_audit_id;

  return v_audit_id;
end;
$$;
