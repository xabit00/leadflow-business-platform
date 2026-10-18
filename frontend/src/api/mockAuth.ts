import type { Session, User } from '@supabase/supabase-js';
import type { AuthProfile } from './auth';

export const DEMO_EMAIL = 'owner@leadflow.demo';
export const DEMO_PASSWORD = 'DemoPass123!';

const STORAGE_KEY = 'leadflow_mock_auth';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

export interface MockAuthState {
  session: Session;
  profile: AuthProfile;
}

export const createMockAuth = (
  email = DEMO_EMAIL,
  fullName = 'Alex Morgan',
  workspaceName = 'Apex Field Services',
): MockAuthState => {
  const now = new Date().toISOString();
  const user: User = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: now,
    app_metadata: {},
    user_metadata: { full_name: fullName },
    identities: [],
    created_at: now,
    updated_at: now,
  };

  return {
    session: {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    },
    profile: {
      id: USER_ID,
      workspace_id: WORKSPACE_ID,
      workspace_name: workspaceName,
      workspace_slug: 'apex-field-services',
      email,
      full_name: fullName,
      level: 'owner',
      status: 'available',
      role_id: '33333333-3333-4333-8333-333333333333',
      permissions: ['crm.view', 'crm.create', 'crm.edit', 'crm.delete', 'crm.export', 'value.view', 'leads.view', 'leads.create', 'leads.edit', 'leads.assign', 'leads.escalate', 'leads.view_all', 'assignment.manage', 'pipelines.manage', 'users.manage', 'roles.manage', 'integrations.manage', 'payments.view', 'payments.manage', 'appointments.manage', 'audit.view', 'settings.manage'],
    },
  };
};

export const readMockAuth = (): MockAuthState | null => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as MockAuthState;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const saveMockAuth = (state: MockAuthState) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
export const clearMockAuth = () => localStorage.removeItem(STORAGE_KEY);
