# LeadFlow Backend Contract

## RPCs

| RPC | Signature | Returns | Permission |
|-----|-----------|---------|------------|
| bootstrap_workspace | (p_workspace_name text, p_full_name text) | jsonb {workspace_id, slug} | none (auth required) |
| get_my_profile | () | jsonb or null | none (auth required) |
| set_user_status | (p_status text, p_user_id uuid default null) | void | self OR users.manage |
| set_user_level | (p_user_id uuid, p_level user_level) | void | users.manage |
| set_role_permissions | (p_role_id uuid, p_permissions text[]) | void | users.manage |
| move_opportunity_stage | (p_opportunity_id uuid, p_stage_id uuid, p_expected_version int) | jsonb {opportunity_id, stage_id, version} | crm.edit |
| update_opportunity | (p_opportunity_id uuid, p_patch jsonb, p_expected_version int) | jsonb (full opp row) | crm.edit |
| delete_stage | (p_stage_id uuid, p_move_to_stage_id uuid default null) | void | crm.delete |
| reorder_stages | (p_pipeline_id uuid, p_ordered_ids uuid[]) | void | crm.edit |
| delete_custom_field | (p_field_id uuid) | void | crm.edit |
| add_note | (p_entity_type text, p_entity_id uuid, p_text text) | uuid | crm.edit |
| contact_overview | (p_contact_id uuid) | jsonb | crm.view |
| get_assignment_rules | () | jsonb | (member of workspace) |
| set_assignment_rules | (p_rules jsonb) | void | assignment.manage |
| submit_public_lead | (p_slug text, p_name text, p_phone text, p_email text, p_message text default null) | jsonb {lead_id, status} or {duplicate, lead_id} | anon (no auth) |
| create_manual_lead | (p_contact_id uuid, p_source lead_source, p_title text default null) | uuid | crm.create |
| acknowledge_lead | (p_lead_id uuid) | jsonb {lead_id, status, time_to_response_seconds?} | lead.owner or admin/owner |
| escalate_lead | (p_lead_id uuid) | void | authenticated (for demos) |
| reassign_lead | (p_lead_id uuid, p_new_user_id uuid) | void | assignment.manage |
| deactivate_user | (p_user_id uuid) | void | users.manage |
| recovery_queue | () | setof {lead_id, contact_name, owner_full_name, waiting_seconds, reason} | lead.owner or leads.view_all or assignment.manage |
| run_escalations | () | int | service_role only |
| get_audit_log | (p_event_type text default null, p_actor_id uuid default null, p_target_type text default null, p_date_from timestamptz default null, p_date_to timestamptz default null, p_limit int default 100, p_offset int default 0) | setof audit rows | audit.view |
| get_dashboard | () | jsonb (all metrics) | member |
| dashboard_drilldown | (p_metric text) | jsonb array | member |
| get_dashboard_preferences | () | jsonb | member |
| save_dashboard_preferences | (p_hidden jsonb) | void | member |

## Helper functions
- current_workspace_id() -> uuid
- current_level() -> user_level
- has_permission(perm text) -> boolean
- audit_record(p_workspace_id, p_actor_id, p_event_type, p_target_type, p_target_id, p_before, p_after) -> uuid

## Permission keys
crm.view, crm.create, crm.edit, crm.delete, crm.export, value.view, assignment.manage, integrations.manage, audit.view, users.manage, leads.view_all

## Tables
workspaces, profiles, roles, role_permissions, companies, contacts, pipelines, stages, opportunities, opportunity_values, custom_fields, saved_lists, leads, lead_assignments, assignment_rules, activities, audit_log, dashboard_preferences, integrations, integration_events, messages, payments, appointments, notification_outbox

## Row Level Security (RLS) & Table Access
- RLS is now ENABLED on all tables
- Direct table reads: contacts, companies, opportunities require `crm.view`; opportunity_values requires `value.view` (masking enforced by policy)
- Lead tables are RPC-only (no direct insert/update/delete)
- audit_log is SELECT-only with `audit.view`

## Convention
Every RPC parameter MUST be prefixed with `p_`. Supabase-js matches args by name.

## Lead Routing & Escalations
- pg_cron: run_escalations runs every 10 seconds (if pg_cron enabled)
- Escalation chain: L1 next available → L2 backup → L3+ manager → fallback owner → stays with current
- Every escalation inserts notification_outbox row for Member 3 to deliver
- Lead is NEVER ownerless (if escalation exhausts all options, the lead stays with the last owner and gets flagged)

## Service-role-only hooks (Member 3 calls via Edge Functions)
- record_inbound_message(p_workspace_id, p_contact_id, p_provider_message_id, p_body)
- update_message_status(p_provider_message_id, p_status, p_failure_reason)
- record_payment_event(p_workspace_id, p_provider, p_event_id, p_event_type, p_data jsonb)
- log_integration_event(...)
- mark_notification_result(p_outbox_id, p_status, p_error)
- appointment_created_hook(p_workspace_id, p_user_id, p_contact_id, p_opportunity_id, p_title, p_starts_at, p_ends_at)

## Member 3 wiring for notification_outbox
1. Supabase Dashboard -> Database -> Webhooks -> Create
2. Table: notification_outbox, Event: INSERT
3. Type: Supabase Edge Function -> `notify-telegram`
4. Edge Function receives {record: {...}}, fetches lead + profiles.telegram_chat_id, sends Telegram message
5. Then calls supabase.rpc('mark_notification_result', { p_outbox_id, p_status:'sent' }) via service_role

## HOW TO APPLY (end to end)
1. Supabase Dashboard -> SQL Editor -> run 0001..0006 in order
2. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars
3. npx tsx supabase/seed/seed.ts
4. npx supabase gen types typescript --project-id svyqunrdgbgxxgmeerba > frontend/src/types/database.ts
5. Frontend signup -> bootstrap_workspace -> get_my_profile
