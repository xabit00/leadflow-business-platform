import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ShieldAlert, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  requiredPermission?: string;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredPermission, children }) => {
  const { isAuthenticated, isLoading, profile, profileError, refreshProfile, hasPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-mono tracking-wide">Restoring LeadFlow session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profileError || !profile) {
    return (
      <div className='min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-6'>
        <ShieldAlert className='w-8 h-8 text-amber-400 mb-3' />
        <h2 className='text-lg font-semibold text-white'>Workspace profile unavailable</h2>
        <p className='text-sm text-slate-400 max-w-md mt-2'>{profileError ?? 'Your session is valid, but no workspace profile was returned.'}</p>
        <button type='button' onClick={() => void refreshProfile()} className='mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400'>
          Retry profile load
        </button>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">Access Restricted (403)</h3>
        <p className="text-sm text-slate-400 max-w-md mb-4 leading-relaxed">
          Your assigned role does not grant permission <code className="text-amber-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{requiredPermission}</code> required to access this screen.
        </p>
        <p className="text-xs text-slate-400">
          Contact your workspace Owner or Administrator to request permission expansion.
        </p>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
};
