import { useState } from 'react';
import { Activity, Menu, Loader2, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeError } from '../../api/errors';
import type { UserStatus } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

const statuses: { value: UserStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'offline', label: 'Offline' },
];

export const Navbar = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
  const location = useLocation();
  const title = ({ '/': 'Overview', '/contacts': 'Contacts', '/companies': 'Companies', '/opportunities': 'Opportunities', '/lead-intake': 'Lead intake', '/sla-escalation': 'SLA & escalation', '/recovery-queue': 'Recovery queue' } as Record<string, string>)[location.pathname] ?? 'Workspace';
  const navigate = useNavigate();
  const toast = useToast();
  const { profile, signOut, updateAvailability } = useAuth();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const changeStatus = async (status: UserStatus) => {
    setUpdatingStatus(true);
    try {
      await updateAvailability(status);
      toast.success(`Availability changed to ${statuses.find((item) => item.value === status)?.label ?? status}.`);
    } catch (caught) {
      toast.error(normalizeError(caught, 'Could not update your availability.').message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const logout = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (caught) {
      toast.error(normalizeError(caught, 'Could not sign out.').message);
      setSigningOut(false);
    }
  };

  return (
    <header className='workspace-topbar'>
      <div className='flex min-h-20 items-center justify-between gap-3 px-4 sm:px-8'>
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="mobile-menu-toggle" onClick={onOpenMenu} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="header-breadcrumb"><span>Workspace</span><span>/</span><strong>{title}</strong></div>
        </div>

        <div className='flex items-center justify-end gap-2 min-w-0'>
          <label className='sr-only' htmlFor='availability-status'>Availability status</label>
          <div className='relative'>
            {updatingStatus && <Loader2 className='absolute left-2 top-2.5 w-3.5 h-3.5 text-blue-400 animate-spin pointer-events-none' />}
            {!updatingStatus && <Activity className='absolute left-2 top-2.5 w-3.5 h-3.5 text-emerald-400 pointer-events-none' />}
            <select
              id='availability-status'
              value={profile?.status ?? 'offline'}
              onChange={(event) => void changeStatus(event.target.value as UserStatus)}
              disabled={updatingStatus}
              className='max-w-32 sm:max-w-none appearance-none rounded-lg border border-slate-700 bg-slate-900 py-2 pl-7 pr-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60'
            >
              {!statuses.some((item) => item.value === profile?.status) && profile?.status && <option value={profile.status}>{profile.status}</option>}
              {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>

          <span className='hidden md:block max-w-36 truncate text-xs text-slate-300' title={profile?.email}>{profile?.full_name}</span>
          <button
            type='button'
            onClick={() => void logout()}
            disabled={signingOut}
            aria-label='Sign out'
            className='inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
          >
            {signingOut ? <Loader2 className='w-4 h-4 animate-spin' /> : <LogOut className='w-4 h-4' />}
          </button>
        </div>
      </div>
    </header>
  );
};
