import MockAdapter from 'axios-mock-adapter';
import { AxiosInstance } from 'axios';
import { mockCurrentUser, mockWorkspace, mockWorkspacesList, mockTeamMembers } from './data';
import { AvailabilityStatus } from '../../types';

let currentUserState = { ...mockCurrentUser };
let currentWorkspaceState = { ...mockWorkspace };
let teamMembersState = [...mockTeamMembers];

export const initMocks = (axiosInstance: AxiosInstance): void => {
  const useMocks = import.meta.env.VITE_USE_MOCKS === 'true';

  if (!useMocks) {
    console.info('[LeadFlow API] Live Backend Mode Active (Mocks Disabled)');
    return;
  }

  console.info('[LeadFlow API] Mock Adapter Active (VITE_USE_MOCKS=true)');
  // delayResponse simulates natural network latency (150ms) to test loading states
  const mock = new MockAdapter(axiosInstance, { delayResponse: 150 });

  // 1. Health check — allow checking real backend or fallback mock
  mock.onGet('/health').reply(() => {
    return [200, {
      status: 'healthy',
      app_name: 'LeadFlow (Mock Active)',
      version: '0.1.0',
      environment: 'development-mock',
      timestamp: new Date().toISOString(),
      database: 'In-Memory Mock Store',
    }];
  });

  // 2. Auth: Me
  mock.onGet('/api/v1/auth/me').reply(200, {
    user: currentUserState,
    workspace: currentWorkspaceState,
    permissions: currentUserState.permissions,
  });

  // 3. Auth: Login
  mock.onPost('/api/v1/auth/login').reply((config) => {
    try {
      const body = JSON.parse(config.data || '{}');
      if (body.email === 'error@test.com') {
        return [401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }];
      }

      currentUserState.email = body.email || currentUserState.email;
      return [200, {
        token: 'mock-jwt-leadflow-session-token-' + Date.now(),
        user: currentUserState,
        workspace: currentWorkspaceState,
      }];
    } catch {
      return [400, { error: { code: 'BAD_REQUEST', message: 'Malformed login payload' } }];
    }
  });

  // 4. Auth: Register (Signup & Workspace Creation)
  mock.onPost('/api/v1/auth/register').reply((config) => {
    try {
      const body = JSON.parse(config.data || '{}');
      const newWorkspace = {
        id: 'ws-' + Math.random().toString(36).substring(2, 9),
        name: body.company_name || 'My New Business',
        slug: (body.company_name || 'my-biz').toLowerCase().replace(/\s+/g, '-'),
        plan: 'starter',
        role: 'Owner',
      };
      currentUserState = {
        id: 'usr-' + Math.random().toString(36).substring(2, 9),
        email: body.email,
        first_name: body.first_name || 'Admin',
        last_name: body.last_name || 'User',
        full_name: `${body.first_name || 'Admin'} ${body.last_name || 'User'}`,
        role: 'Owner',
        permissions: [
          'crm:read', 'crm:write', 'crm:delete',
          'leads:view', 'leads:assign', 'leads:escalate',
          'settings:manage', 'integrations:manage', 'audit:view', 'value:view'
        ],
        availability: 'Available',
        workspace_id: newWorkspace.id,
      };
      currentWorkspaceState = newWorkspace;

      return [201, {
        token: 'mock-jwt-leadflow-session-token-' + Date.now(),
        user: currentUserState,
        workspace: currentWorkspaceState,
      }];
    } catch {
      return [400, { error: { code: 'BAD_REQUEST', message: 'Registration failed' } }];
    }
  });

  // 5. Auth: Logout
  mock.onPost('/api/v1/auth/logout').reply(200, { message: 'Logged out successfully' });

  // 6. Workspaces
  mock.onGet('/api/v1/workspaces').reply(200, {
    items: mockWorkspacesList,
    total: mockWorkspacesList.length,
    page: 1,
    page_size: 20,
  });

  // 7. Team Availability
  mock.onGet('/api/v1/employees/availability').reply(200, {
    items: teamMembersState,
    total: teamMembersState.length,
    page: 1,
    page_size: 50,
  });

  mock.onPut('/api/v1/employees/availability').reply((config) => {
    try {
      const body = JSON.parse(config.data || '{}');
      const newStatus = body.availability as AvailabilityStatus;
      currentUserState.availability = newStatus;
      teamMembersState = teamMembersState.map(m =>
        m.id === currentUserState.id ? { ...m, availability: newStatus, last_active: 'Just now' } : m
      );
      return [200, { availability: newStatus, user: currentUserState }];
    } catch {
      return [400, { error: { code: 'UPDATE_FAILED', message: 'Could not update availability' } }];
    }
  });

  // Fallback: pass-through any unhandled routes to real backend
  mock.onAny().passThrough();
};
