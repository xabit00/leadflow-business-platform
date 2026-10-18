export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
  environment: string;
  timestamp: string;
  database: string;
}

export interface UserSummary {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  workspace_id?: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface NavItem {
  label: string;
  path: string;
  iconName?: string;
  badge?: string;
  isPlaceholder?: boolean;
}
