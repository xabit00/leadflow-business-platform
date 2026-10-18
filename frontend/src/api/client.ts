import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiErrorPayload } from '../types';
import { initMocks } from './mock';

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Initialize mock adapter if VITE_USE_MOCKS=true
initMocks(apiClient);

// Request Interceptor: Attach Bearer Token & Workspace ID
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('leadflow_auth_token');
    const workspaceId = localStorage.getItem('leadflow_workspace_id');

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (workspaceId && config.headers) {
      config.headers['X-Workspace-ID'] = workspaceId;
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response Interceptor: Standardized Error Parsing and Status Handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: ApiErrorPayload; detail?: string | unknown[] }>) => {
    if (error.response?.status === 401) {
      // Clear expired credentials
      localStorage.removeItem('leadflow_auth_token');
      // Dispatch custom event for clean in-app handling without full page reload
      window.dispatchEvent(new CustomEvent('leadflow:unauthorized'));
    }

    return Promise.reject(error);
  }
);

/**
 * Standardized error message extractor for LeadFlow API errors
 */
export const getErrorMessage = (error: unknown, fallback = 'An unexpected error occurred'): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.error?.message) {
      return data.error.message;
    }
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
    if (error.response?.status === 409) {
      return 'Conflict: This record was modified by another user. Please reload the latest data.';
    }
    if (error.response?.status === 403) {
      return 'Permission Denied: You do not have sufficient privileges to perform this action.';
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

export default apiClient;
