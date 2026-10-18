import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, Workspace, AvailabilityStatus } from '../types';
import apiClient, { getErrorMessage } from '../api/client';

interface AuthContextType {
  user: User | null;
  workspace: Workspace | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  login: (token: string, user: User, workspace: Workspace) => void;
  logout: () => Promise<void>;
  updateAvailability: (status: AvailabilityStatus) => Promise<void>;
  switchWorkspace: (workspace: Workspace) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      if (user.role === 'Owner' || user.role === 'Admin') return true;
      return permissions.includes(permission);
    },
    [user, permissions]
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('leadflow_auth_token');
      localStorage.removeItem('leadflow_workspace_id');
      setUser(null);
      setWorkspace(null);
      setPermissions([]);
    }
  }, []);

  const login = useCallback((token: string, newUser: User, newWorkspace: Workspace) => {
    localStorage.setItem('leadflow_auth_token', token);
    localStorage.setItem('leadflow_workspace_id', newWorkspace.id);
    setUser(newUser);
    setWorkspace(newWorkspace);
    setPermissions(newUser.permissions || []);
  }, []);

  const updateAvailability = useCallback(
    async (status: AvailabilityStatus) => {
      try {
        const response = await apiClient.put<{ availability: AvailabilityStatus; user: User }>(
          '/api/v1/employees/availability',
          { availability: status }
        );
        setUser((prev) => (prev ? { ...prev, availability: response.data.availability } : null));
      } catch (err) {
        throw new Error(getErrorMessage(err, 'Failed to update employee availability'));
      }
    },
    []
  );

  const switchWorkspace = useCallback((newWs: Workspace) => {
    setWorkspace(newWs);
    localStorage.setItem('leadflow_workspace_id', newWs.id);
    // Reload user permissions for the new workspace
    window.location.reload();
  }, []);

  // Restore authenticated session on mount via /auth/me
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('leadflow_auth_token');
      const useMocks = import.meta.env.VITE_USE_MOCKS === 'true';

      // In mock development mode, initialize default mock session if none exists
      if (!token && useMocks) {
        try {
          const res = await apiClient.get<{ user: User; workspace: Workspace; permissions: string[] }>(
            '/api/v1/auth/me'
          );
          setUser(res.data.user);
          setWorkspace(res.data.workspace);
          setPermissions(res.data.permissions || []);
          localStorage.setItem('leadflow_auth_token', 'mock-session-token');
          localStorage.setItem('leadflow_workspace_id', res.data.workspace.id);
        } catch {
          // Fall through
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await apiClient.get<{ user: User; workspace: Workspace; permissions: string[] }>(
          '/api/v1/auth/me'
        );
        setUser(res.data.user);
        setWorkspace(res.data.workspace);
        setPermissions(res.data.permissions || []);
      } catch {
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();

    // Listen for unauthorized events emitted by apiClient interceptor
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('leadflow:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('leadflow:unauthorized', handleUnauthorized);
    };
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        workspace,
        permissions,
        isAuthenticated: !!user,
        isLoading,
        hasPermission,
        login,
        logout,
        updateAvailability,
        switchWorkspace,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
