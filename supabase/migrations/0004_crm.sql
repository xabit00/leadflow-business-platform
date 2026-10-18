-- 1. Stage-required-fields trigger
create or replace function check_stage_required_fields() returns trigger
language plpgsql as $$
declare
  v_stage stages%rowtype;
  v_missing text[] := '{}';
  v_fid uuid;
  v_field custom_fields%rowtype;
  v_key text;
begin
  if new.stage_id is not distinct from old.stage_id then return new; end if;
  select * into v_stage from stages where id = new.stage_id;
  if v_stage.required_field_ids is null or array_length(v_stage.required_field_ids, 1) is null then
    return new;
  end if;
  foreach v_fid in array v_stage.required_field_ids loop
    select * into v_field from custom_fields where id = v_fid;
    if not found then continue; end if;
    v_key := v_field.field_key;
    if not (new.custom_values ? v_key) or coalesce(new.custom_values->>v_key, '') = '' then
      v_missing := v_missing || v_field.name;
    end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    raise exception 'Missing required fields for stage "%": %', v_stage.name, array_to_string(v_missing, ', ')
      using errcode = '22023';
  end if;
  return new;
end; $$;

drop trigger if exists trg_opportunity_stage_required on opportunities;
create trigger trg_opportunity_stage_required
before update of stage_id on opportunities
for each row execute function check_stage_required_fields();

-- 2. Version bump trigger
create or replace function bump_opportunity_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_opportunity_version on opportunities;
create trigger trg_opportunity_version
before update on opportunities
for each row execute function bump_opportunity_version();

-- 3. move_opportunity_stage RPC
create or replace function move_opportunity_stage(
  p_opportunity_id uuid, p_stage_id uuid, p_expected_version int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_opp opportunities%rowtype;
  v_stage stages%rowtype;
begin
  if not has_permission('crm.edit') then
    raise exception 'Requires crm.edit' using errcode = '42501';
  end if;
  select * into v_opp from opportunities
    where id = p_opportunity_id and workspace_id = current_workspace_id() for update;
  if not found then raise exception 'Opportunity not found' using errcode = 'P0002'; end if;
  if v_opp.version <> p_expected_version then
    raise exception 'Version conflict: expected %, got %', p_expected_version, v_opp.version using errcode = '40001';
  end if;
  select * into v_stage from stages
    where id = p_stage_id and workspace_id = current_workspace_id();
  if not found then raise exception 'Stage not found' using errcode = 'P0002'; end if;
  update opportunities set stage_id = p_stage_id, owner_id = coalesce(owner_id, auth.uid()) where id = p_opportunity_id;
  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (current_workspace_id(), 'opportunity', p_opportunity_id, 'stage_change',
    jsonb_build_object('from_stage', v_opp.stage_id, 'to_stage', p_stage_id), auth.uid());
  select * into v_opp from opportunities where id = p_opportunity_id;
  return jsonb_build_object('opportunity_id', p_opportunity_id, 'stage_id', p_stage_id, 'version', v_opp.version);
end; $$;
grant execute on function move_opportunity_stage(uuid, uuid, int) to authenticated;

-- 4. update_opportunity RPC
create or replace function update_opportunity(
  p_opportunity_id uuid, p_patch jsonb, p_expected_version int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_opp opportunities%rowtype;
begin
  if not has_permission('crm.edit') then raise exception 'Requires crm.edit' using errcode = '42501'; end if;
  select * into v_opp from opportunities
    where id = p_opportunity_id and workspace_id = current_workspace_id() for update;
  if not found then raise exception 'Opportunity not found' using errcode = 'P0002'; end if;
  if v_opp.version <> p_expected_version then
    raise exception 'Version conflict: expected %, got %', p_expected_version, v_opp.version using errcode = '40001';
  end if;
  update opportunities set
    title = coalesce(p_patch->>'title', title),
    custom_values = coalesce(p_patch->'custom_values', custom_values),
    owner_id = case when p_patch ? 'owner_id' then (p_patch->>'owner_id')::uuid else owner_id end
  where id = p_opportunity_id;
  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (current_workspace_id(), 'opportunity', p_opportunity_id, 'field_edit', p_patch, auth.uid());
  select * into v_opp from opportunities where id = p_opportunity_id;
  return to_jsonb(v_opp);
end; $$;
grant execute on function update_opportunity(uuid, jsonb, int) to authenticated;

-- 5. delete_stage
create or replace function delete_stage(p_stage_id uuid, p_move_to_stage_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int; v_stage stages%rowtype;
begin
  if not has_permission('crm.delete') then raise exception 'Requires crm.delete' using errcode = '42501'; end if;
  select * into v_stage from stages where id = p_stage_id and workspace_id = current_workspace_id();
  if not found then raise exception 'Stage not found' using errcode = 'P0002'; end if;
  select count(*) into v_count from opportunities where stage_id = p_stage_id;
  if v_count > 0 and p_move_to_stage_id is null then
    raise exception 'Stage has % opportunities; provide move_to_stage_id', v_count using errcode = '23514';
  end if;
  if v_count > 0 then
    if not exists (select 1 from stages where id = p_move_to_stage_id and workspace_id = current_workspace_id()) then
      raise exception 'Target stage not found' using errcode = 'P0002';
    end if;
    update opportunities set stage_id = p_move_to_stage_id where stage_id = p_stage_id;
  end if;
  delete from stages where id = p_stage_id;
  perform audit_record(current_workspace_id(), auth.uid(), 'pipeline_config_change', 'stage', p_stage_id,
    jsonb_build_object('moved_to', p_move_to_stage_id, 'opportunities_moved', v_count), null);
end; $$;
grant execute on function delete_stage(uuid, uuid) to authenticated;

-- 6. reorder_stages
create or replace function reorder_stages(p_pipeline_id uuid, p_ordered_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if not has_permission('crm.edit') then raise exception 'Requires crm.edit' using errcode = '42501'; end if;
  for i in 1..array_length(p_ordered_ids, 1) loop
    update stages set position = i - 1
      where id = p_ordered_ids[i] and pipeline_id = p_pipeline_id and workspace_id = current_workspace_id();
  end loop;
  perform audit_record(current_workspace_id(), auth.uid(), 'pipeline_config_change', 'pipeline', p_pipeline_id,
    null, jsonb_build_object('ordered', p_ordered_ids));
end; $$;
grant execute on function reorder_stages(uuid, uuid[]) to authenticated;

-- 7. delete_custom_field
create or replace function delete_custom_field(p_field_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_field custom_fields%rowtype; v_key text;
begin
  if not has_permission('crm.edit') then raise exception 'Requires crm.edit' using errcode = '42501'; end if;
  select * into v_field from custom_fields where id = p_field_id and workspace_id = current_workspace_id();
  if not found then raise exception 'Field not found' using errcode = 'P0002'; end if;
  v_key := v_field.field_key;
  if v_field.entity = 'contact' then
    update contacts set custom_values = custom_values - v_key where workspace_id = current_workspace_id();
  else
    update opportunities set custom_values = custom_values - v_key where workspace_id = current_workspace_id();
  end if;
  update stages set required_field_ids = array_remove(required_field_ids, p_field_id)
    where workspace_id = current_workspace_id();
  delete from custom_fields where id = p_field_id;
  perform audit_record(current_workspace_id(), auth.uid(), 'field_config_change', 'custom_field', p_field_id,
    jsonb_build_object('field_key', v_key), null);
end; $$;
grant execute on function delete_custom_field(uuid) to authenticated;

-- 8. add_note
create or replace function add_note(p_entity_type text, p_entity_id uuid, p_text text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_permission('crm.edit') then raise exception 'Requires crm.edit' using errcode = '42501'; end if;
  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (current_workspace_id(), p_entity_type, p_entity_id, 'note',
    jsonb_build_object('text', p_text), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function add_note(text, uuid, text) to authenticated;

-- 9. contact_overview
create or replace function contact_overview(p_contact_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
  v_contact contacts%rowtype;
  v_company companies%rowtype;
  v_opps jsonb;
  v_show_value boolean := has_permission('value.view');
  v_payments jsonb;
  v_appts jsonb;
  v_msgs jsonb;
  v_acts jsonb;
  v_assigned jsonb;
begin
  if not has_permission('crm.view') then raise exception 'Requires crm.view' using errcode = '42501'; end if;
  select * into v_contact from contacts where id = p_contact_id and workspace_id = current_workspace_id();
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;
  if v_contact.company_id is not null then
    select * into v_company from companies where id = v_contact.company_id;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id, 'title', o.title, 'stage_id', o.stage_id, 'pipeline_id', o.pipeline_id,
      'owner_id', o.owner_id, 'payment_status', o.payment_status, 'version', o.version,
      'custom_values', o.custom_values,
      'value', case when v_show_value then ov.value else null end,
      'currency', case when v_show_value then ov.currency else null end,
      'value_masked', not v_show_value
    ) order by o.created_at desc
  ), '[]'::jsonb) into v_opps
  from opportunities o
  left join opportunity_values ov on ov.opportunity_id = o.id
  where o.contact_id = p_contact_id;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb) into v_payments
  from payments p where p.contact_id = p_contact_id;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.starts_at desc), '[]'::jsonb) into v_appts
  from appointments a where a.contact_id = p_contact_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb) into v_msgs
  from (select * from messages where contact_id = p_contact_id order by created_at desc limit 10) m;

  select coalesce(jsonb_agg(to_jsonb(act) order by act.created_at desc), '[]'::jsonb) into v_acts
  from (select * from activities where entity_type = 'contact' and entity_id = p_contact_id
        union all
        select * from activities where entity_type = 'opportunity' and entity_id in (select id from opportunities where contact_id = p_contact_id)
        order by created_at desc limit 20) act;

  select to_jsonb(p.*) into v_assigned from profiles p
    where p.id = (select owner_id from leads where contact_id = p_contact_id and status='new' order by created_at desc limit 1);

  v_result := jsonb_build_object(
    'contact', to_jsonb(v_contact),
    'company', case when v_company.id is not null then to_jsonb(v_company) else null end,
    'opportunities', v_opps,
    'payments', v_payments,
    'appointments', v_appts,
    'messages', v_msgs,
    'activities', v_acts,
    'assigned_employee', v_assigned
  );
  return v_result;
end; $$;
grant execute on function contact_overview(uuid) to authenticated;

-- 10. get_assignment_rules
create or replace function get_assignment_rules() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(r) from assignment_rules r where workspace_id = current_workspace_id();
$$;
grant execute on function get_assignment_rules() to authenticated;

-- 11. set_assignment_rules
create or replace function set_assignment_rules(p_rules jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('assignment.manage') then
    raise exception 'Requires assignment.manage' using errcode = '42501';
  end if;
  update assignment_rules set
    round_robin = coalesce((p_rules->>'round_robin')::boolean, round_robin),
    max_open_leads = coalesce((p_rules->>'max_open_leads')::int, max_open_leads),
    ack_window_seconds = coalesce((p_rules->>'ack_window_seconds')::int, ack_window_seconds),
    escalation_levels = coalesce((p_rules->>'escalation_levels')::int, escalation_levels),
    level_window_seconds = coalesce((p_rules->>'level_window_seconds')::int, level_window_seconds),
    idle_period_seconds = coalesce((p_rules->>'idle_period_seconds')::int, idle_period_seconds),
    backup_user_id = case when p_rules ? 'backup_user_id' then (p_rules->>'backup_user_id')::uuid else backup_user_id end,
    manager_user_id = case when p_rules ? 'manager_user_id' then (p_rules->>'manager_user_id')::uuid else manager_user_id end,
    ack_leave_policy = coalesce((p_rules->>'ack_leave_policy')::ack_leave_policy, ack_leave_policy)
  where workspace_id = current_workspace_id();
  perform audit_record(current_workspace_id(), auth.uid(), 'role_or_permission_change', 'assignment_rules',
    current_workspace_id(), null, p_rules);
end; $$;
grant execute on function set_assignment_rules(jsonb) to authenticated;
