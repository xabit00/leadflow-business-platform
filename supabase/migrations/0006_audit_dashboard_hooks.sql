-- 1. get_audit_log (filters + pagination)
create or replace function get_audit_log(
  p_event_type text default null,
  p_actor_id uuid default null,
  p_target_type text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit int default 100,
  p_offset int default 0
) returns table (
  id uuid, actor_id uuid, event_type text, target_type text,
  target_id uuid, before jsonb, after jsonb, created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('audit.view') then
    raise exception 'Requires audit.view' using errcode = '42501';
  end if;
  return query
    select a.id, a.actor_id, a.event_type, a.target_type,
           a.target_id, a.before, a.after, a.created_at
    from audit_log a
    where a.workspace_id = current_workspace_id()
      and (p_event_type is null or a.event_type = p_event_type)
      and (p_actor_id is null or a.actor_id = p_actor_id)
      and (p_target_type is null or a.target_type = p_target_type)
      and (p_date_from is null or a.created_at >= p_date_from)
      and (p_date_to is null or a.created_at <= p_date_to)
    order by a.created_at desc
    limit p_limit offset p_offset;
end; $$;
grant execute on function get_audit_log(text, uuid, text, timestamptz, timestamptz, int, int) to authenticated;

-- 2. get_dashboard
create or replace function get_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid := current_workspace_id();
  v_show_all boolean := (has_permission('leads.view_all') or has_permission('assignment.manage'));
  v_show_value boolean := has_permission('value.view');
  v_result jsonb;
  v_new_leads int;
  v_pipeline jsonb;
  v_avg_ttr numeric;
  v_recovery_count int;
  v_escalations int;
  v_avail jsonb;
  v_appts int;
  v_collected numeric;
  v_pending numeric;
  v_projected numeric;
begin
  -- New leads today (scoped)
  select count(*) into v_new_leads from leads
    where workspace_id = v_ws
      and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
      and (v_show_all or owner_id = v_uid);

  -- Open pipeline value by stage
  if v_show_value then
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_pipeline
    from (
      select s.id as stage_id, s.name as stage_name,
             coalesce(sum(ov.value), 0) as total_value,
             count(o.id) as opportunity_count
      from stages s
      left join opportunities o on o.stage_id = s.id and o.workspace_id = v_ws
      left join opportunity_values ov on ov.opportunity_id = o.id
      where s.workspace_id = v_ws and not s.is_won and not s.is_lost
      group by s.id, s.name
      order by s.position
    ) x;
  else
    v_pipeline := null;
  end if;

  -- Avg time to first response (seconds)
  select avg(extract(epoch from (acknowledged_at - first_assigned_at)))::numeric
    into v_avg_ttr
    from leads
    where workspace_id = v_ws
      and acknowledged_at is not null
      and first_assigned_at is not null
      and (v_show_all or owner_id = v_uid);

  -- Recovery queue count
  select count(*) into v_recovery_count from recovery_queue();

  -- Escalations last 24h
  select count(*) into v_escalations from lead_assignments
    where workspace_id = v_ws
      and reason = 'escalation'
      and assigned_at >= now() - interval '24 hours'
      and (v_show_all or user_id = v_uid);

  -- Availability
  select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) into v_avail
  from (
    select status::text as status, count(*) as cnt
    from profiles
    where workspace_id = v_ws and is_active = true
    group by status
  ) z;

  -- Upcoming appointments
  select count(*) into v_appts from appointments
    where workspace_id = v_ws and starts_at >= now();

  -- Collected revenue this month
  select coalesce(sum(case when status = 'paid' then amount
                          when status = 'refunded' then -amount
                          else 0 end), 0)
    into v_collected
    from payments
    where workspace_id = v_ws
      and created_at >= date_trunc('month', now());

  -- Projected
  if v_show_value then
    select coalesce(sum(amount), 0) into v_pending from payments
      where workspace_id = v_ws and status = 'pending';
    select coalesce(sum(ov.value), 0) + v_pending into v_projected
      from opportunities o
      join stages s on s.id = o.stage_id
      join opportunity_values ov on ov.opportunity_id = o.id
      where o.workspace_id = v_ws and not s.is_won and not s.is_lost;
  else
    v_projected := null;
  end if;

  v_result := jsonb_build_object(
    'new_leads_today', v_new_leads,
    'open_pipeline_value_by_stage', v_pipeline,
    'pipeline_masked', not v_show_value,
    'avg_time_to_first_response_seconds', v_avg_ttr,
    'recovery_queue_count', v_recovery_count,
    'escalations_last_24h', v_escalations,
    'availability_counts', v_avail,
    'upcoming_appointments', v_appts,
    'collected_revenue_this_month', v_collected,
    'projected_revenue', v_projected
  );
  return v_result;
end; $$;
grant execute on function get_dashboard() to authenticated;

-- 3. dashboard_drilldown
create or replace function dashboard_drilldown(p_metric text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid := current_workspace_id();
  v_show_all boolean := (has_permission('leads.view_all') or has_permission('assignment.manage'));
  v_result jsonb;
begin
  if p_metric = 'new_leads_today' then
    select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_result
    from leads l
    where l.workspace_id = v_ws
      and l.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
      and (v_show_all or l.owner_id = v_uid);
  elsif p_metric = 'recovery_queue' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_result
    from recovery_queue() r;
  elsif p_metric = 'escalations_24h' then
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_result
    from lead_assignments a
    where a.workspace_id = v_ws and a.reason = 'escalation'
      and a.assigned_at >= now() - interval '24 hours'
      and (v_show_all or a.user_id = v_uid);
  elsif p_metric = 'open_opportunities' then
    select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into v_result
    from opportunities o
    join stages s on s.id = o.stage_id
    where o.workspace_id = v_ws and not s.is_won and not s.is_lost;
  elsif p_metric = 'collected_revenue' then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_result
    from payments p
    where p.workspace_id = v_ws
      and p.created_at >= date_trunc('month', now())
      and p.status in ('paid','refunded');
  else
    raise exception 'Unknown metric: %', p_metric using errcode = '22023';
  end if;
  return v_result;
end; $$;
grant execute on function dashboard_drilldown(text) to authenticated;

-- 4. Dashboard preferences
create or replace function get_dashboard_preferences()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(
    (select hidden_widgets from dashboard_preferences where user_id = auth.uid()),
    '[]'::jsonb
  );
$$;
grant execute on function get_dashboard_preferences() to authenticated;

create or replace function save_dashboard_preferences(p_hidden jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into dashboard_preferences(user_id, workspace_id, hidden_widgets)
  values (auth.uid(), current_workspace_id(), p_hidden)
  on conflict (user_id) do update set hidden_widgets = excluded.hidden_widgets;
end; $$;
grant execute on function save_dashboard_preferences(jsonb) to authenticated;

-- 5. Service-role-only hooks (Member 3 calls these via Edge Functions)

-- revoke from everyone first
revoke all on function find_or_create_contact_by_phone(uuid, text, text) from anon, authenticated;
revoke all on function create_lead(uuid, uuid, lead_source, text, uuid) from anon, authenticated;
revoke all on function escalate_lead(uuid) from anon, authenticated;
revoke all on function assign_lead(uuid, assignment_reason, uuid[]) from anon, authenticated;
revoke all on function run_escalations() from anon, authenticated;

-- record_inbound_message
create or replace function record_inbound_message(
  p_workspace_id uuid, p_contact_id uuid,
  p_provider_message_id text, p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_lead_id uuid;
begin
  select id into v_id from messages where provider_message_id = p_provider_message_id;
  if v_id is not null then return v_id; end if;
  insert into messages(workspace_id, contact_id, direction, body, provider_message_id, status)
  values (p_workspace_id, p_contact_id, 'inbound', p_body, p_provider_message_id, 'delivered')
  returning id into v_id;
  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (p_workspace_id, 'contact', p_contact_id, 'message', jsonb_build_object('body', p_body), null);
  -- if no open lead exists, create one
  if not exists (select 1 from leads where contact_id = p_contact_id and status = 'new') then
    v_lead_id := create_lead(p_workspace_id, p_contact_id, 'message');
  end if;
  return v_id;
end; $$;
grant execute on function record_inbound_message(uuid, uuid, text, text) to service_role;

-- update_message_status
create or replace function update_message_status(
  p_provider_message_id text, p_status message_status, p_failure_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update messages set status = p_status, failure_reason = p_failure_reason
    where provider_message_id = p_provider_message_id;
end; $$;
grant execute on function update_message_status(text, message_status, text) to service_role;

-- record_payment_event
create or replace function record_payment_event(
  p_workspace_id uuid, p_provider text, p_event_id text,
  p_event_type text, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_provider_ref text := p_data->>'provider_ref';
  v_opportunity_id uuid := (p_data->>'opportunity_id')::uuid;
  v_amount numeric := (p_data->>'amount')::numeric;
  v_currency text := coalesce(p_data->>'currency', 'USD');
  v_status payment_status := coalesce((p_data->>'status')::payment_status, 'pending');
  v_contact_id uuid;
  v_payment_id uuid;
  v_existing uuid;
begin
  select id into v_existing from integration_events
    where provider = p_provider and event_id = p_event_id;
  if v_existing is not null then
    return jsonb_build_object('duplicate', true);
  end if;
  insert into integration_events(workspace_id, provider, direction, event_id, status, reference, error)
  values (p_workspace_id, p_provider, 'inbound', p_event_id, 'ok', v_provider_ref, null);

  select contact_id into v_contact_id from opportunities where id = v_opportunity_id;
  if v_contact_id is null then
    return jsonb_build_object('error', 'opportunity not found');
  end if;

  insert into payments(workspace_id, opportunity_id, contact_id, amount, currency, status, provider_ref)
  values (p_workspace_id, v_opportunity_id, v_contact_id, v_amount, v_currency, v_status, v_provider_ref)
  on conflict (provider_ref) do update set status = excluded.status, amount = excluded.amount
  returning id into v_payment_id;

  if v_status = 'paid' then
    update opportunities set payment_status = 'paid' where id = v_opportunity_id;
  elsif v_status = 'refunded' then
    update opportunities set payment_status = 'refunded' where id = v_opportunity_id;
  end if;

  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (p_workspace_id, 'opportunity', v_opportunity_id, 'payment',
    jsonb_build_object('amount', v_amount, 'currency', v_currency, 'status', v_status), null);

  perform audit_record(p_workspace_id, null, 'integration_change', 'payment', v_payment_id,
    null, p_data);

  return jsonb_build_object('payment_id', v_payment_id, 'opportunity_id', v_opportunity_id);
end; $$;
grant execute on function record_payment_event(uuid, text, text, text, jsonb) to service_role;

-- log_integration_event
create or replace function log_integration_event(
  p_workspace_id uuid, p_provider text, p_direction integration_direction,
  p_event_id text, p_status text, p_reference text default null, p_error text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into integration_events(workspace_id, provider, direction, event_id, status, reference, error)
  values (p_workspace_id, p_provider, p_direction, p_event_id, p_status, p_reference, p_error)
  on conflict (provider, event_id) do nothing
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function log_integration_event(uuid, text, integration_direction, text, text, text, text) to service_role;

-- mark_notification_result
create or replace function mark_notification_result(
  p_outbox_id uuid, p_status outbox_status, p_error text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update notification_outbox set status = p_status, last_error = p_error, attempts = attempts + 1
    where id = p_outbox_id;
end; $$;
grant execute on function mark_notification_result(uuid, outbox_status, text) to service_role;

-- appointment_created_hook
create or replace function appointment_created_hook(
  p_workspace_id uuid, p_user_id uuid, p_contact_id uuid, p_opportunity_id uuid,
  p_title text, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into appointments(workspace_id, contact_id, opportunity_id, user_id, starts_at, ends_at, status)
  values (p_workspace_id, p_contact_id, p_opportunity_id, p_user_id, p_starts_at, p_ends_at, 'scheduled')
  returning id into v_id;
  insert into activities(workspace_id, entity_type, entity_id, kind, payload, actor_id)
  values (p_workspace_id, 'contact', p_contact_id, 'appointment',
    jsonb_build_object('title', p_title, 'starts_at', p_starts_at), p_user_id);
  return v_id;
end; $$;
grant execute on function appointment_created_hook(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz) to service_role;

-- 6. Block outbound messages to opted-out contacts
create or replace function check_opted_out() returns trigger
language plpgsql as $$
declare v_opted boolean;
begin
  if new.direction = 'outbound' then
    select opted_out into v_opted from contacts where id = new.contact_id;
    if v_opted = true then
      raise exception 'Contact has opted out; cannot send outbound message' using errcode = '22023';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_block_opted_out on messages;
create trigger trg_block_opted_out before insert on messages
for each row execute function check_opted_out();

-- 7. Realtime additions
do $$ begin
  alter publication supabase_realtime add table notification_outbox, appointments;
exception when others then null; end $$;
