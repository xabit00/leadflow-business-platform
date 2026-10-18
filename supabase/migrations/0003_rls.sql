-- 1. Enable Row Level Security on ALL tables created in 0001
alter table workspaces enable row level security;
alter table profiles enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table companies enable row level security;
alter table contacts enable row level security;
alter table pipelines enable row level security;
alter table stages enable row level security;
alter table opportunities enable row level security;
alter table opportunity_values enable row level security;
alter table custom_fields enable row level security;
alter table saved_lists enable row level security;
alter table leads enable row level security;
alter table lead_assignments enable row level security;
alter table assignment_rules enable row level security;
alter table activities enable row level security;
alter table audit_log enable row level security;
alter table dashboard_preferences enable row level security;
alter table integrations enable row level security;
alter table integration_events enable row level security;
alter table messages enable row level security;
alter table payments enable row level security;
alter table appointments enable row level security;
alter table notification_outbox enable row level security;

-- 2. Policies per table (all SECURITY-safe using current_workspace_id() and has_permission())

-- workspaces
create policy "ws_self_select" on workspaces for select
  using (id = current_workspace_id());

-- profiles
create policy "profiles_select" on profiles for select
  using (workspace_id = current_workspace_id());
-- No INSERT/UPDATE/DELETE policies — all changes go through RPCs

-- roles, role_permissions
create policy "roles_select" on roles for select
  using (workspace_id = current_workspace_id());
create policy "role_perms_select" on role_permissions for select
  using (role_id in (select id from roles where workspace_id = current_workspace_id()));
-- No write policies — set_role_permissions RPC handles

-- companies
create policy "companies_select" on companies for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "companies_insert" on companies for insert
  with check (workspace_id = current_workspace_id() and has_permission('crm.create'));
create policy "companies_update" on companies for update
  using (workspace_id = current_workspace_id() and has_permission('crm.edit'));
create policy "companies_delete" on companies for delete
  using (workspace_id = current_workspace_id() and has_permission('crm.delete'));

-- contacts — same pattern as companies
create policy "contacts_select" on contacts for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "contacts_insert" on contacts for insert
  with check (workspace_id = current_workspace_id() and has_permission('crm.create'));
create policy "contacts_update" on contacts for update
  using (workspace_id = current_workspace_id() and has_permission('crm.edit'));
create policy "contacts_delete" on contacts for delete
  using (workspace_id = current_workspace_id() and has_permission('crm.delete'));

-- pipelines, stages, custom_fields, saved_lists — same pattern
-- For saved_lists INSERT, also check owner_id = auth.uid()

-- pipelines
create policy "pipelines_select" on pipelines for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "pipelines_insert" on pipelines for insert
  with check (workspace_id = current_workspace_id() and has_permission('crm.create'));
create policy "pipelines_update" on pipelines for update
  using (workspace_id = current_workspace_id() and has_permission('crm.edit'));
create policy "pipelines_delete" on pipelines for delete
  using (workspace_id = current_workspace_id() and has_permission('crm.delete'));

-- stages
create policy "stages_select" on stages for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "stages_insert" on stages for insert
  with check (workspace_id = current_workspace_id() and has_permission('crm.create'));
create policy "stages_update" on stages for update
  using (workspace_id = current_workspace_id() and has_permission('crm.edit'));
create policy "stages_delete" on stages for delete
  using (workspace_id = current_workspace_id() and has_permission('crm.delete'));

-- custom_fields
create policy "custom_fields_select" on custom_fields for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "custom_fields_insert" on custom_fields for insert
  with check (workspace_id = current_workspace_id() and has_permission('crm.create'));
create policy "custom_fields_update" on custom_fields for update
  using (workspace_id = current_workspace_id() and has_permission('crm.edit'));
create policy "custom_fields_delete" on custom_fields for delete
  using (workspace_id = current_workspace_id() and has_permission('crm.delete'));

-- saved_lists
create policy "saved_lists_select" on saved_lists for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "saved_lists_insert" on saved_lists for insert
  with check (workspace_id = current_workspace_id() and has_permission('crm.create') and owner_id = auth.uid());
create policy "saved_lists_update" on saved_lists for update
  using (workspace_id = current_workspace_id() and has_permission('crm.edit'));
create policy "saved_lists_delete" on saved_lists for delete
  using (workspace_id = current_workspace_id() and has_permission('crm.delete'));

-- opportunities — same pattern as companies (crm.view/create/edit/delete)
create policy "opportunities_select" on opportunities for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "opportunities_insert" on opportunities for insert
  with check (workspace_id = current_workspace_id() and has_permission('crm.create'));
create policy "opportunities_update" on opportunities for update
  using (workspace_id = current_workspace_id() and has_permission('crm.edit'));
create policy "opportunities_delete" on opportunities for delete
  using (workspace_id = current_workspace_id() and has_permission('crm.delete'));

-- opportunity_values (CRITICAL — masking)
create policy "opp_values_select" on opportunity_values for select
  using (workspace_id = current_workspace_id() and has_permission('value.view'));
create policy "opp_values_insert" on opportunity_values for insert
  with check (workspace_id = current_workspace_id() and (has_permission('value.view') or has_permission('assignment.manage')));
create policy "opp_values_update" on opportunity_values for update
  using (workspace_id = current_workspace_id() and (has_permission('value.view') or has_permission('assignment.manage')));

-- leads — SELECT only
create policy "leads_select" on leads for select
  using (workspace_id = current_workspace_id()
    and (owner_id = auth.uid()
      or has_permission('leads.view_all')
      or has_permission('assignment.manage')));
-- NO INSERT/UPDATE/DELETE policies — RPC-only

-- lead_assignments — same SELECT shape as leads
create policy "lead_assignments_select" on lead_assignments for select
  using (workspace_id = current_workspace_id()
    and (user_id = auth.uid()
      or has_permission('leads.view_all')
      or has_permission('assignment.manage')));

-- activities
create policy "activities_select" on activities for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
-- No writes — RPCs and SECURITY DEFINER functions only

-- audit_log
create policy "audit_log_select" on audit_log for select
  using (workspace_id = current_workspace_id() and has_permission('audit.view'));
-- No writes — audit_record SECURITY DEFINER only

-- assignment_rules
create policy "assignment_rules_select" on assignment_rules for select
  using (workspace_id = current_workspace_id());
-- No writes — set_assignment_rules RPC

-- dashboard_preferences
create policy "dash_prefs_all" on dashboard_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- integrations
create policy "integrations_select" on integrations for select
  using (workspace_id = current_workspace_id() and has_permission('integrations.manage'));
-- No writes — service_role only

-- messages, payments, appointments
create policy "messages_select" on messages for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "payments_select" on payments for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
create policy "appointments_select" on appointments for select
  using (workspace_id = current_workspace_id() and has_permission('crm.view'));
-- No writes — service_role only

-- integration_events, notification_outbox
create policy "int_events_select" on integration_events for select
  using (workspace_id = current_workspace_id() and has_permission('integrations.manage'));
create policy "outbox_select" on notification_outbox for select
  using (workspace_id = current_workspace_id() and has_permission('assignment.manage'));

-- 3. Realtime publication (guard with DO block)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'leads') then
      alter publication supabase_realtime add table leads;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
      alter publication supabase_realtime add table messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payments') then
      alter publication supabase_realtime add table payments;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activities') then
      alter publication supabase_realtime add table activities;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
      alter publication supabase_realtime add table profiles;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'appointments') then
      alter publication supabase_realtime add table appointments;
    end if;
  end if;
end;
$$;
