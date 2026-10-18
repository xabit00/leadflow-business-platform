export type AvailabilityStatus = 'Available' | 'Busy' | 'On leave' | 'Offline';

export interface ApiErrorPayload {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
  timestamp?: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  permissions: string[];
  availability: AvailabilityStatus;
  workspace_id: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
}

export interface AuthSession {
  token: string;
  user: User;
  workspace: Workspace;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages?: number;
}

export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
  environment: string;
  timestamp: string;
  database: string;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export interface NavItem {
  label: string;
  path: string;
  iconName?: string;
  badge?: string;
  isPlaceholder?: boolean;
}
