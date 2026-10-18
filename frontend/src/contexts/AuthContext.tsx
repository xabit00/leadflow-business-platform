import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserSummary, WorkspaceSummary } from '../types';

interface AuthContextType {
  user: UserSummary | null;
  workspace: WorkspaceSummary | null;
  isAuthenticated: boolean;
  setWorkspace: (ws: WorkspaceSummary | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Level 0 development scaffolding: initial state with placeholder values
  const [user] = useState<UserSummary | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        workspace,
        isAuthenticated: !!user,
        setWorkspace,
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
