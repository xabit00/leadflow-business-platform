-- ============================================================================
-- 0002_auth.sql: Workspace Bootstrap, Membership & Authorization Functions
-- ============================================================================

-- 1. Bootstrap Workspace Function
-- Invoked by a newly authenticated user to initialize their workspace,
-- become the workspace owner, and populate baseline pipeline & assignment rules.
create or replace function bootstrap_workspace(
  p_workspace_name text,
  p_full_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_pipeline_id uuid;
  v_base_slug text;
  v_slug text;
  v_email text;
begin
  -- 1. Validation
  if auth.uid() is null then
    raise exception 'Unauthorized: user must be authenticated';
  end if;

  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Profile already exists for current user';
  end if;

  v_email := coalesce(
    auth.jwt()->>'email',
    (select email from auth.users where id = auth.uid())
  );

  if v_email is null or v_email = '' then
    raise exception 'Cannot resolve email for user %', auth.uid();
  end if;

  -- 2. Slug generation with collision resolution loop
  v_base_slug := trim(both '-' from lower(regexp_replace(p_workspace_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base_slug is null or v_base_slug = '' then
    v_base_slug := 'workspace';
  end if;

  loop
    v_slug := v_base_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
    exit when not exists (select 1 from workspaces where slug = v_slug);
  end loop;

  -- 3. Insert workspace
  insert into workspaces (name, slug)
  values (p_workspace_name, v_slug)
  returning id into v_workspace_id;

  -- 4. Insert owner profile
  insert into profiles (
    id,
    workspace_id,
    email,
    full_name,
    level,
    status,
    is_active
  ) values (
    auth.uid(),
    v_workspace_id,
    v_email,
    p_full_name,
    'owner',
    'available',
    true
  );

  -- 5. Insert default assignment rules
  insert into assignment_rules (workspace_id)
  values (v_workspace_id);

  -- 6. Insert default "Sales" pipeline and stages
  insert into pipelines (workspace_id, name)
  values (v_workspace_id, 'Sales')
  returning id into v_pipeline_id;

  insert into stages (workspace_id, pipeline_id, name, position, is_won, is_lost)
  values
    (v_workspace_id, v_pipeline_id, 'New', 0, false, false),
    (v_workspace_id, v_pipeline_id, 'Contacted', 1, false, false),
    (v_workspace_id, v_pipeline_id, 'Qualified', 2, false, false),
    (v_workspace_id, v_pipeline_id, 'Won', 3, true, false),
    (v_workspace_id, v_pipeline_id, 'Lost', 4, false, true);

  -- 7. Audit log record
  perform audit_record(
    v_workspace_id,
    auth.uid(),
    'workspace_bootstrapped',
    'workspace',
    v_workspace_id,
    null,
    jsonb_build_object(
      'workspace_name', p_workspace_name,
      'slug', v_slug,
      'owner_id', auth.uid()
    )
  );

  -- 8. Return response
  return jsonb_build_object(
    'workspace_id', v_workspace_id,
    'profile_id', auth.uid()
  );
end;
$$;

-- 2. Stub: reassign_for_absence
-- Placeholder no-op function, implemented fully in Step 3
create or replace function reassign_for_absence(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  /* filled in Step 3 */
end;
$$;

-- 3. Set User Status
-- Modifies a user status. Caller must be self OR have 'users.manage' permission.
-- Triggers automatic reassign_for_absence if set to 'on_leave' or 'offline'.
create or replace function set_user_status(
  p_user_id uuid,
  p_status user_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_ws uuid;
  v_old_status user_status;
  v_caller_ws uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select workspace_id, status into v_target_ws, v_old_status
  from profiles
  where id = p_user_id;

  if not found then
    raise exception 'Profile not found for user %', p_user_id;
  end if;

  v_caller_ws := current_workspace_id();
  if v_caller_ws is null or v_target_ws <> v_caller_ws then
    raise exception 'Permission denied: cross-workspace modification';
  end if;

  if auth.uid() <> p_user_id and not has_permission('users.manage') then
    raise exception 'Permission denied: requires users.manage';
  end if;

  update profiles
  set status = p_status
  where id = p_user_id;

  if p_status in ('on_leave', 'offline') then
    perform reassign_for_absence(p_user_id);
  end if;

  perform audit_record(
    v_target_ws,
    auth.uid(),
    'user_status_updated',
    'profile',
    p_user_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_status)
  );
end;
$$;

-- 4. Set Role Permissions
-- Replaces permissions assigned to a given role. Requires 'users.manage' permission.
create or replace function set_role_permissions(
  p_role_id uuid,
  p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws_id uuid;
  v_old_permissions jsonb;
  v_new_permissions jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not has_permission('users.manage') then
    raise exception 'Permission denied: requires users.manage';
  end if;

  select workspace_id into v_ws_id
  from roles
  where id = p_role_id;

  if not found then
    raise exception 'Role not found';
  end if;

  if v_ws_id <> current_workspace_id() then
    raise exception 'Permission denied: cross-workspace modification';
  end if;

  select coalesce(jsonb_agg(permission), '[]'::jsonb) into v_old_permissions
  from role_permissions
  where role_id = p_role_id;

  delete from role_permissions where role_id = p_role_id;

  if p_permissions is not null and array_length(p_permissions, 1) > 0 then
    insert into role_permissions (role_id, permission)
    select distinct p_role_id, unnest(p_permissions);
  end if;

  select coalesce(jsonb_agg(permission), '[]'::jsonb) into v_new_permissions
  from role_permissions
  where role_id = p_role_id;

  perform audit_record(
    v_ws_id,
    auth.uid(),
    'role_permissions_updated',
    'role',
    p_role_id,
    jsonb_build_object('permissions', v_old_permissions),
    jsonb_build_object('permissions', v_new_permissions)
  );
end;
$$;

-- 5. Set User Level
-- Changes user privilege tier (owner/admin/user). Requires 'users.manage'.
-- Cannot demote an owner unless caller is owner.
create or replace function set_user_level(
  p_user_id uuid,
  p_level user_level
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_ws uuid;
  v_old_level user_level;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not has_permission('users.manage') then
    raise exception 'Permission denied: requires users.manage';
  end if;

  select workspace_id, level into v_target_ws, v_old_level
  from profiles
  where id = p_user_id;

  if not found then
    raise exception 'Profile not found for user %', p_user_id;
  end if;

  if v_target_ws <> current_workspace_id() then
    raise exception 'Permission denied: cross-workspace modification';
  end if;

  if v_old_level = 'owner' and p_level <> 'owner' and current_level() <> 'owner' then
    raise exception 'Permission denied: only an owner can demote an owner';
  end if;

  update profiles
  set level = p_level
  where id = p_user_id;

  perform audit_record(
    v_target_ws,
    auth.uid(),
    'user_level_updated',
    'profile',
    p_user_id,
    jsonb_build_object('level', v_old_level),
    jsonb_build_object('level', p_level)
  );
end;
$$;

-- NOTE: user creation itself is done by the seed script or by Supabase Admin API, not by an RPC (per ROLE.txt simpler flow).

-- END OF STEP 1 MIGRATIONS
