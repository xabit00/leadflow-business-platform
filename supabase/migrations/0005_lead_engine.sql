-- 1. Replace the reassign_for_absence stub from 0002 with real implementation
create or replace function reassign_for_absence(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rules assignment_rules%rowtype;
  v_lead record;
begin
  select * into v_rules from assignment_rules where workspace_id = current_workspace_id();
  if not found then return; end if;
  -- Unacknowledged leads: always reassign
  for v_lead in
    select id from leads
      where owner_id = p_user_id and status = 'new'
        and workspace_id = current_workspace_id()
      for update skip locked
  loop
    perform assign_lead(v_lead.id, 'reassign_absence', ARRAY[p_user_id]);
  end loop;
  -- Acknowledged leads: follow policy
  if v_rules.ack_leave_policy = 'reassign' then
    for v_lead in
      select id from leads
        where owner_id = p_user_id and status = 'acknowledged'
          and workspace_id = current_workspace_id()
        for update skip locked
    loop
      perform assign_lead(v_lead.id, 'reassign_absence', ARRAY[p_user_id]);
    end loop;
  end if;
  perform audit_record(current_workspace_id(), auth.uid(), 'reassignment_on_absence', 'profile', p_user_id,
    jsonb_build_object('reason', 'status_changed'), null);
end; $$;

-- 2. mark_acknowledged (internal helper, no permission check — callers enforce)
create or replace function mark_acknowledged(p_lead_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lead leads%rowtype;
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then return; end if;
  if v_lead.status <> 'new' then
    update leads set last_action_at = now() where id = p_lead_id;
    return;
  end if;
  update leads set
    status = 'acknowledged',
    acknowledged_at = now(),
    ack_deadline = null,
    last_action_at = now()
  where id = p_lead_id;
  update lead_assignments set acknowledged_at = now()
    where id = (select id from lead_assignments where lead_id = p_lead_id order by assigned_at desc limit 1);
  perform audit_record(v_lead.workspace_id, p_user_id, 'acknowledgement', 'lead', p_lead_id,
    jsonb_build_object('status', v_lead.status), jsonb_build_object('status', 'acknowledged'));
end; $$;

-- 3. pick_rr_user
create or replace function pick_rr_user(p_workspace_id uuid, p_exclude uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_rules assignment_rules%rowtype;
  v_next uuid;
  v_cursor uuid;
begin
  select * into v_rules from assignment_rules where workspace_id = p_workspace_id;
  if not found then return null; end if;
  v_cursor := v_rules.last_rr_user_id;

  with eligible as (
    select p.id
    from profiles p
    where p.workspace_id = p_workspace_id
      and p.is_active = true
      and p.status = 'available'
      and p.id <> all(p_exclude)
      and (select count(*) from leads l
           where l.owner_id = p.id and l.status in ('new','acknowledged')) < v_rules.max_open_leads
  )
  select id into v_next from eligible
  order by case when v_cursor is null then 0 when id > v_cursor then 0 else 1 end, id
  limit 1;

  return v_next;
end; $$;

-- 4. assign_lead (core routing)
create or replace function assign_lead(
  p_lead_id uuid,
  p_reason assignment_reason,
  p_exclude uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead leads%rowtype;
  v_rules assignment_rules%rowtype;
  v_new_owner uuid;
  v_fallback_reason text;
  v_owner_id uuid;
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  select * into v_rules from assignment_rules where workspace_id = v_lead.workspace_id;

  v_owner_id := v_lead.owner_id;

  v_new_owner := pick_rr_user(v_lead.workspace_id, p_exclude || case when v_owner_id is not null then ARRAY[v_owner_id] else '{}'::uuid[] end);

  if v_new_owner is null and v_rules.backup_user_id is not null
     and not (v_rules.backup_user_id = any(p_exclude)) then
    v_new_owner := v_rules.backup_user_id;
    v_fallback_reason := 'Fallback to backup user';
  end if;

  if v_new_owner is null and v_rules.manager_user_id is not null
     and not (v_rules.manager_user_id = any(p_exclude)) then
    v_new_owner := v_rules.manager_user_id;
    v_fallback_reason := 'Fallback to manager';
  end if;

  if v_new_owner is null then
    select id into v_new_owner from profiles
      where workspace_id = v_lead.workspace_id and level = 'owner'
      order by created_at asc limit 1;
    v_fallback_reason := 'Fallback to workspace owner';
  end if;

  if v_new_owner is null then
    raise exception 'No assignable user: configure backup_user_id or manager_user_id' using errcode = 'P0002';
  end if;

  update leads set
    owner_id = v_new_owner,
    assigned_at = now(),
    first_assigned_at = coalesce(first_assigned_at, now()),
    ack_deadline = now() + make_interval(secs => v_rules.ack_window_seconds),
    last_action_at = now(),
    status = case when p_reason = 'reassign_absence' then status else status end,
    flagged_reason = coalesce(v_fallback_reason, flagged_reason)
  where id = p_lead_id;

  update assignment_rules set last_rr_user_id = v_new_owner where workspace_id = v_lead.workspace_id;

  insert into lead_assignments(workspace_id, lead_id, user_id, reason)
  values (v_lead.workspace_id, p_lead_id, v_new_owner, p_reason);

  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (v_lead.workspace_id, 'lead', p_lead_id, 'assignment',
    jsonb_build_object('reason', p_reason, 'new_owner', v_new_owner, 'fallback', v_fallback_reason), auth.uid());

  perform audit_record(v_lead.workspace_id, auth.uid(), 'assignment', 'lead', p_lead_id,
    jsonb_build_object('owner_id', v_owner_id), jsonb_build_object('owner_id', v_new_owner, 'reason', p_reason));

  if v_fallback_reason is not null then
    insert into notification_outbox(workspace_id, user_id, lead_id, reason)
    values (v_lead.workspace_id, v_new_owner, p_lead_id, v_fallback_reason);
  end if;

  return v_new_owner;
end; $$;

-- 5. create_lead (internal)
create or replace function create_lead(
  p_workspace_id uuid, p_contact_id uuid, p_source lead_source,
  p_title text default null, p_opportunity_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_contact contacts%rowtype;
  v_lead_id uuid;
begin
  select * into v_contact from contacts where id = p_contact_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;
  if v_contact.opted_out then raise exception 'Contact has opted out' using errcode = '22023'; end if;
  insert into leads(workspace_id, contact_id, opportunity_id, source, status)
  values (p_workspace_id, p_contact_id, p_opportunity_id, p_source, 'new')
  returning id into v_lead_id;
  perform assign_lead(v_lead_id, 'initial');
  return v_lead_id;
end; $$;

-- 6. find_or_create_contact_by_phone
create or replace function find_or_create_contact_by_phone(
  p_workspace_id uuid, p_phone text, p_name text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_phone text;
begin
  v_phone := trim(p_phone);
  select id into v_id from contacts where workspace_id = p_workspace_id and phone = v_phone limit 1;
  if v_id is not null then return v_id; end if;
  insert into contacts(workspace_id, name, phone) values (p_workspace_id, coalesce(p_name, v_phone), v_phone)
  returning id into v_id;
  return v_id;
end; $$;

-- 7. submit_public_lead (anon-callable)
create or replace function submit_public_lead(
  p_slug text, p_name text, p_phone text, p_email text, p_message text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ws_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_existing_lead uuid;
begin
  select id into v_ws_id from workspaces where slug = p_slug;
  if v_ws_id is null then raise exception 'Workspace not found: %', p_slug using errcode = 'P0002'; end if;
  p_phone := trim(p_phone);
  if p_phone is null or length(p_phone) < 5 then
    raise exception 'Invalid phone' using errcode = '22023';
  end if;
  -- dedupe: same phone in last 10 seconds with open lead
  select l.id into v_existing_lead from leads l
    join contacts c on c.id = l.contact_id
    where c.workspace_id = v_ws_id and c.phone = p_phone
      and l.created_at > now() - interval '10 seconds' and l.status = 'new'
    limit 1;
  if v_existing_lead is not null then
    return jsonb_build_object('duplicate', true, 'lead_id', v_existing_lead);
  end if;
  v_contact_id := find_or_create_contact_by_phone(v_ws_id, p_phone, p_name);
  if p_email is not null then
    update contacts set email = coalesce(email, p_email) where id = v_contact_id;
  end if;
  v_lead_id := create_lead(v_ws_id, v_contact_id, 'web_form');
  return jsonb_build_object('lead_id', v_lead_id, 'status', 'received');
end; $$;
grant execute on function submit_public_lead(text, text, text, text, text) to anon, authenticated;

-- 8. create_manual_lead
create or replace function create_manual_lead(
  p_contact_id uuid, p_source lead_source, p_title text default null
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('crm.create') then raise exception 'Requires crm.create' using errcode = '42501'; end if;
  return create_lead(current_workspace_id(), p_contact_id, p_source, p_title);
end; $$;
grant execute on function create_manual_lead(uuid, lead_source, text) to authenticated;

-- 9. acknowledge_lead
create or replace function acknowledge_lead(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lead leads%rowtype;
  v_ttr int;
begin
  select * into v_lead from leads where id = p_lead_id and workspace_id = current_workspace_id() for update;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  if v_lead.owner_id <> auth.uid() and current_level() not in ('owner','admin') then
    raise exception 'Only the owner can acknowledge' using errcode = '42501';
  end if;
  if v_lead.status <> 'new' then
    return jsonb_build_object('lead_id', p_lead_id, 'status', v_lead.status, 'already_acknowledged', true);
  end if;
  v_ttr := extract(epoch from (now() - v_lead.first_assigned_at))::int;
  perform mark_acknowledged(p_lead_id, auth.uid());
  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (v_lead.workspace_id, 'lead', p_lead_id, 'acknowledgement',
    jsonb_build_object('time_to_response_seconds', v_ttr), auth.uid());
  return jsonb_build_object('lead_id', p_lead_id, 'status', 'acknowledged', 'time_to_response_seconds', v_ttr);
end; $$;
grant execute on function acknowledge_lead(uuid) to authenticated;

-- 10. escalate_lead (public helper — called by worker and manual tests)
create or replace function escalate_lead(p_lead_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lead leads%rowtype;
  v_rules assignment_rules%rowtype;
  v_new_owner uuid;
  v_prev_owner uuid;
  v_assigned_before uuid[];
  v_fallback text;
begin
  select * into v_lead from leads where id = p_lead_id for update skip locked;
  if not found then return; end if;
  if v_lead.status <> 'new' then return; end if;
  select * into v_rules from assignment_rules where workspace_id = v_lead.workspace_id;
  v_prev_owner := v_lead.owner_id;

  -- everyone previously assigned to this lead (to avoid re-assigning to same person)
  select coalesce(array_agg(distinct user_id), '{}') into v_assigned_before
    from lead_assignments where lead_id = p_lead_id;

  update leads set
    escalation_count = coalesce(escalation_count, 0) + 1,
    escalation_level = coalesce(escalation_level, 0) + 1
  where id = p_lead_id
  returning * into v_lead;

  if v_lead.escalation_level = 1 then
    v_new_owner := pick_rr_user(v_lead.workspace_id, v_assigned_before);
    if v_new_owner is null then
      v_new_owner := v_rules.backup_user_id;
      v_fallback := 'Escalation L1: no available employee, going to backup';
    end if;
  elsif v_lead.escalation_level = 2 then
    v_new_owner := v_rules.backup_user_id;
    v_fallback := 'Escalation L2: going to backup';
    if v_new_owner is null then
      v_new_owner := v_rules.manager_user_id;
      v_fallback := 'Escalation L2: no backup, going to manager';
    end if;
  else
    v_new_owner := v_rules.manager_user_id;
    v_fallback := 'Escalation L3+: going to manager';
  end if;

  -- ultimate fallback: workspace owner; then keep current
  if v_new_owner is null then
    select id into v_new_owner from profiles
      where workspace_id = v_lead.workspace_id and level = 'owner'
      order by created_at asc limit 1;
    v_fallback := 'Escalation: exhausted, going to owner';
  end if;
  if v_new_owner is null then
    v_new_owner := v_prev_owner;
    v_fallback := 'Escalation: nobody available, lead stays with current owner';
  end if;

  update leads set
    owner_id = v_new_owner,
    assigned_at = now(),
    ack_deadline = now() + make_interval(secs => v_rules.level_window_seconds),
    last_action_at = now(),
    flagged_reason = case
      when v_lead.escalation_count >= 2 then 'Escalated ' || v_lead.escalation_count || ' times'
      else v_fallback
    end
  where id = p_lead_id;

  insert into lead_assignments(workspace_id, lead_id, user_id, reason)
  values (v_lead.workspace_id, p_lead_id, v_new_owner, 'escalation');

  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (v_lead.workspace_id, 'lead', p_lead_id, 'escalation',
    jsonb_build_object('level', v_lead.escalation_level, 'new_owner', v_new_owner, 'fallback', v_fallback), null);

  perform audit_record(v_lead.workspace_id, null, 'escalation', 'lead', p_lead_id,
    jsonb_build_object('owner_id', v_prev_owner, 'escalation_count', v_lead.escalation_count - 1),
    jsonb_build_object('owner_id', v_new_owner, 'escalation_count', v_lead.escalation_count));

  insert into notification_outbox(workspace_id, user_id, lead_id, reason)
  values (v_lead.workspace_id, v_new_owner, p_lead_id, coalesce(v_fallback, 'Escalation level ' || v_lead.escalation_level));
end; $$;
grant execute on function escalate_lead(uuid) to authenticated;

-- 11. run_escalations (worker)
create or replace function run_escalations()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_lead record;
  v_count int := 0;
begin
  for v_lead in
    select id from leads
      where status = 'new'
        and ack_deadline is not null
        and ack_deadline <= now()
      order by ack_deadline asc
      for update skip locked
      limit 50
  loop
    perform escalate_lead(v_lead.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
grant execute on function run_escalations() to service_role;

-- 12. reassign_lead (manual)
create or replace function reassign_lead(p_lead_id uuid, p_new_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lead leads%rowtype;
begin
  if not has_permission('assignment.manage') then
    raise exception 'Requires assignment.manage' using errcode = '42501';
  end if;
  select * into v_lead from leads where id = p_lead_id and workspace_id = current_workspace_id() for update;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from profiles where id = p_new_user_id and workspace_id = current_workspace_id() and is_active = true) then
    raise exception 'Target user not active in workspace' using errcode = 'P0002';
  end if;
  update leads set owner_id = p_new_user_id, last_action_at = now() where id = p_lead_id;
  insert into lead_assignments(workspace_id, lead_id, user_id, reason)
  values (v_lead.workspace_id, p_lead_id, p_new_user_id, 'manual');
  perform audit_record(v_lead.workspace_id, auth.uid(), 'manual_reassignment', 'lead', p_lead_id,
    jsonb_build_object('owner_id', v_lead.owner_id), jsonb_build_object('owner_id', p_new_user_id));
end; $$;
grant execute on function reassign_lead(uuid, uuid) to authenticated;

-- 13. deactivate_user
create or replace function deactivate_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('users.manage') then
    raise exception 'Requires users.manage' using errcode = '42501';
  end if;
  if (select level from profiles where id = p_user_id) = 'owner' and current_level() <> 'owner' then
    raise exception 'Only an owner can deactivate an owner' using errcode = '42501';
  end if;
  perform reassign_for_absence(p_user_id);
  update profiles set is_active = false where id = p_user_id;
  perform audit_record(current_workspace_id(), auth.uid(), 'deletion', 'profile', p_user_id,
    jsonb_build_object('is_active', true), jsonb_build_object('is_active', false));
end; $$;
grant execute on function deactivate_user(uuid) to authenticated;

-- 14. recovery_queue
create or replace function recovery_queue()
returns table (
  lead_id uuid, contact_name text, owner_full_name text,
  waiting_seconds int, reason text
) language plpgsql security definer set search_path = public as $$
declare v_rules assignment_rules%rowtype;
begin
  select * into v_rules from assignment_rules where workspace_id = current_workspace_id();
  return query
    select l.id,
           c.name,
           p.full_name,
           extract(epoch from (now() - coalesce(l.last_action_at, l.assigned_at, l.created_at)))::int,
           case
             when l.status = 'new' and l.ack_deadline < now() then 'unacknowledged_overdue'
             when l.escalation_count >= 2 then 'escalated_multiple'
             when l.last_action_at < now() - make_interval(secs => v_rules.idle_period_seconds) then 'idle'
           end
    from leads l
    join contacts c on c.id = l.contact_id
    left join profiles p on p.id = l.owner_id
    where l.workspace_id = current_workspace_id()
      and l.status <> 'closed'
      and (
        (l.owner_id = auth.uid())
        or has_permission('leads.view_all')
        or has_permission('assignment.manage')
      )
      and (
        (l.status = 'new' and l.ack_deadline < now())
        or l.escalation_count >= 2
        or l.last_action_at < now() - make_interval(secs => v_rules.idle_period_seconds)
      )
    order by l.created_at desc;
end; $$;
grant execute on function recovery_queue() to authenticated;

-- 15. pg_cron schedule (every 10s if supported)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('leadflow_escalations') where exists (select 1 from cron.job where jobname = 'leadflow_escalations');
  end if;
exception when others then null;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('leadflow_escalations', '10 seconds', 'select run_escalations();');
  end if;
exception when others then
  raise notice 'pg_cron scheduling failed; use Supabase Dashboard > Database > Extensions to enable pg_cron, then re-run this block';
end $$;

-- 16. Realtime additions
do $$
begin
  alter publication supabase_realtime add table lead_assignments;
exception when others then null;
end $$;

-- END OF STEP 3 MIGRATIONS
