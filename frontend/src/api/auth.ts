import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Enums, Tables } from '../types/database';

export type UserStatus = Enums<'user_status'>;

export interface AuthProfile {
  id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  email: string;
  full_name: string;
  level: Tables<'profiles'>['level'];
  status: UserStatus;
  role_id: string | null;
  permissions: string[];
}

const ALL_PERMISSIONS = [
  'crm.view', 'crm.create', 'crm.edit', 'crm.delete', 'crm.export', 'value.view',
  'leads.view', 'leads.create', 'leads.edit', 'leads.assign', 'leads.escalate',
  'leads.view_all', 'assignment.manage', 'pipelines.manage', 'users.manage', 'roles.manage', 'integrations.manage',
  'payments.view', 'payments.manage', 'appointments.manage', 'audit.view', 'settings.manage',
];

const USER_PERMISSIONS = ['crm.view', 'crm.create', 'crm.edit'];

export interface SignUpInput {
  companyName: string;
  fullName: string;
  email: string;
  password: string;
}

export const getSession = () => supabase.auth.getSession();

export const onAuthStateChange = (callback: (event: AuthChangeEvent, session: Session | null) => void) =>
  supabase.auth.onAuthStateChange(callback);

export const signIn = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email: email.trim(), password });

export const signUp = ({ companyName, fullName, email, password }: SignUpInput) =>
  supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: { full_name: fullName.trim(), workspace_name: companyName.trim() },
    },
  });

export const signOut = () => supabase.auth.signOut();

export const bootstrapWorkspace = (workspaceName: string, fullName: string) =>
  supabase.rpc('bootstrap_workspace', {
    p_workspace_name: workspaceName.trim(),
    p_full_name: fullName.trim(),
  });

export const getMyProfile = async (): Promise<AuthProfile> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('No authenticated user found.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, workspace_id, email, full_name, level, status, role_id')
    .eq('id', userData.user.id)
    .single();
  if (profileError) throw profileError;

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('name, slug')
    .eq('id', profile.workspace_id)
    .single();
  if (workspaceError) throw workspaceError;

  let permissions = profile.level === 'owner' || profile.level === 'admin' ? ALL_PERMISSIONS : USER_PERMISSIONS;
  if (profile.level === 'user' && profile.role_id) {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role_id', profile.role_id);
    if (error) throw error;
    permissions = [...new Set([...permissions, ...data.map((item) => item.permission)])];
  }

  return {
    ...profile,
    workspace_name: workspace.name,
    workspace_slug: workspace.slug,
    permissions,
  };
};

export const setUserStatus = (userId: string, status: UserStatus) =>
  supabase.rpc('set_user_status', { p_status: status, p_user_id: userId });
