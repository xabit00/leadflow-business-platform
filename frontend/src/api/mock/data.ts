import { User, Workspace, AvailabilityStatus } from '../../types';

export const mockWorkspace: Workspace = {
  id: 'ws-leadflow-001',
  name: 'Apex Field & Service Solutions',
  slug: 'apex-field',
  plan: 'pro',
  role: 'Owner',
};

export const mockWorkspacesList: Workspace[] = [
  mockWorkspace,
  {
    id: 'ws-leadflow-002',
    name: 'Summit HVAC Commercial',
    slug: 'summit-hvac',
    plan: 'enterprise',
    role: 'Admin',
  },
];

export const mockCurrentUser: User = {
  id: 'usr-001',
  email: 'alex.morgan@apexservices.demo',
  first_name: 'Alex',
  last_name: 'Morgan',
  full_name: 'Alex Morgan',
  role: 'Owner',
  permissions: [
    'crm:read',
    'crm:write',
    'crm:delete',
    'leads:view',
    'leads:assign',
    'leads:escalate',
    'settings:manage',
    'integrations:manage',
    'audit:view',
    'value:view',
  ],
  availability: 'Available',
  workspace_id: mockWorkspace.id,
};

export interface TeamMemberStatus {
  id: string;
  name: string;
  email: string;
  role: string;
  availability: AvailabilityStatus;
  open_leads_count: number;
  last_active: string;
}

export const mockTeamMembers: TeamMemberStatus[] = [
  {
    id: 'usr-001',
    name: 'Alex Morgan',
    email: 'alex.morgan@apexservices.demo',
    role: 'Owner',
    availability: 'Available',
    open_leads_count: 2,
    last_active: 'Just now',
  },
  {
    id: 'usr-002',
    name: 'Sarah Jenkins',
    email: 'sarah.j@apexservices.demo',
    role: 'Senior Sales Rep',
    availability: 'Busy',
    open_leads_count: 5,
    last_active: '5m ago',
  },
  {
    id: 'usr-003',
    name: 'David Kim',
    email: 'david.k@apexservices.demo',
    role: 'Sales Associate',
    availability: 'Available',
    open_leads_count: 1,
    last_active: '12m ago',
  },
  {
    id: 'usr-004',
    name: 'Elena Rostova',
    email: 'elena.r@apexservices.demo',
    role: 'Support Engineer',
    availability: 'On leave',
    open_leads_count: 0,
    last_active: '2d ago',
  },
];
