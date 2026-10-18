-- 1. bootstrap_workspace
create or replace function bootstrap_workspace(p_workspace_name text, p_full_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt()->>'email';
  v_slug text;
  v_ws_id uuid;
  v_pipeline_id uuid;
  v_attempt int := 0;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from profiles where id = v_uid) then
    raise exception 'Profile already exists for this user' using errcode = '23505';
  end if;
  loop
    v_slug := lower(regexp_replace(p_workspace_name, '[^a-zA-Z0-9]+', '-', 'g'))
              || '-' || substr(gen_random_uuid()::text, 1, 6);
    exit when not exists (select 1 from workspaces where slug = v_slug);
    v_attempt := v_attempt + 1;
    if v_attempt > 10 then raise exception 'Could not generate unique slug'; end if;
  end loop;
  insert into workspaces(name, slug) values (p_workspace_name, v_slug) returning id into v_ws_id;
  insert into profiles(id, workspace_id, email, full_name, level, status, is_active)
  values (v_uid, v_ws_id, v_email, p_full_name, 'owner', 'available', true);
  insert into assignment_rules(workspace_id) values (v_ws_id);
  insert into pipelines(workspace_id, name) values (v_ws_id, 'Sales') returning id into v_pipeline_id;
  insert into stages(workspace_id, pipeline_id, name, position, is_won, is_lost) values
    (v_ws_id, v_pipeline_id, 'New', 0, false, false),
    (v_ws_id, v_pipeline_id, 'Contacted', 1, false, false),
    (v_ws_id, v_pipeline_id, 'Qualified', 2, false, false),
    (v_ws_id, v_pipeline_id, 'Won', 3, true, false),
    (v_ws_id, v_pipeline_id, 'Lost', 4, false, true);
  perform audit_record(v_ws_id, v_uid, 'workspace_bootstrapped', 'workspace', v_ws_id, null,
    jsonb_build_object('name', p_workspace_name, 'slug', v_slug));
  return jsonb_build_object('workspace_id', v_ws_id, 'slug', v_slug);
end; $$;
grant execute on function bootstrap_workspace(text, text) to authenticated;

-- 2. get_my_profile
create or replace function get_my_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
  v_ws workspaces%rowtype;
  v_perms text[];
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into v_profile from profiles where id = v_uid;
  if not found then return null; end if;
  select * into v_ws from workspaces where id = v_profile.workspace_id;
  if v_profile.level = 'owner' or v_profile.level = 'admin' then
    v_perms := array['crm.view','crm.create','crm.edit','crm.delete','crm.export',
                    'value.view','assignment.manage','integrations.manage',
                    'audit.view','users.manage','leads.view_all']::text[];
  else
    v_perms := array['crm.view','crm.create','crm.edit']::text[];
    if v_profile.role_id is not null then
      v_perms := array(select distinct unnest(v_perms || array(
        select permission from role_permissions where role_id = v_profile.role_id)));
    end if;
  end if;
  return jsonb_build_object(
    'id', v_profile.id,
    'workspace_id', v_profile.workspace_id,
    'workspace_name', v_ws.name,
    'workspace_slug', v_ws.slug,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'level', v_profile.level,
    'status', v_profile.status,
    'role_id', v_profile.role_id,
    'permissions', v_perms
  );
end; $$;
grant execute on function get_my_profile() to authenticated;

-- 3. set_user_status
create or replace function set_user_status(p_status text, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_status user_status;
  v_before user_status;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  begin
    v_status := p_status::user_status;
  exception when others then
    raise exception 'Invalid status: %', p_status using errcode = '22023';
  end;
  if v_target <> v_uid and not has_permission('users.manage') then
    raise exception 'Cannot set another user''s status without users.manage' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = v_target and workspace_id = current_workspace_id()) then
    raise exception 'User not found in workspace' using errcode = 'P0002';
  end if;
  select status into v_before from profiles where id = v_target;
  update profiles set status = v_status where id = v_target;
  perform audit_record(current_workspace_id(), v_uid, 'role_or_permission_change', 'profile', v_target,
    jsonb_build_object('status', v_before), jsonb_build_object('status', v_status));
  if v_status in ('on_leave', 'offline') then
    perform reassign_for_absence(v_target);
  end if;
end; $$;
grant execute on function set_user_status(text, uuid) to authenticated;

-- 4. Stub for reassign_for_absence (implemented in Step 3)
create or replace function reassign_for_absence(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  return;
end; $$;

-- 5. set_user_level
create or replace function set_user_level(p_user_id uuid, p_level user_level)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_caller_level user_level;
  v_target_level user_level;
begin
  if not has_permission('users.manage') then
    raise exception 'Requires users.manage' using errcode = '42501';
  end if;
  select level into v_caller_level from profiles where id = v_uid;
  select level into v_target_level from profiles where id = p_user_id;
  if v_target_level = 'owner' and v_caller_level <> 'owner' then
    raise exception 'Only an owner may modify another owner' using errcode = '42501';
  end if;
  update profiles set level = p_level where id = p_user_id;
  perform audit_record(current_workspace_id(), v_uid, 'role_or_permission_change', 'profile', p_user_id,
    jsonb_build_object('level', v_target_level), jsonb_build_object('level', p_level));
end; $$;
grant execute on function set_user_level(uuid, user_level) to authenticated;

-- 6. set_role_permissions
create or replace function set_role_permissions(p_role_id uuid, p_permissions text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('users.manage') then
    raise exception 'Requires users.manage' using errcode = '42501';
  end if;
  delete from role_permissions where role_id = p_role_id;
  if p_permissions is not null then
    insert into role_permissions(role_id, permission)
    select p_role_id, unnest(p_permissions);
  end if;
  perform audit_record(current_workspace_id(), auth.uid(), 'role_or_permission_change', 'role', p_role_id,
    null, jsonb_build_object('permissions', p_permissions));
end; $$;
grant execute on function set_role_permissions(uuid, text[]) to authenticated;
