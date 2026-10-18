import { useQuery } from '@tanstack/react-query';
import { Clock, User, AlertCircle } from 'lucide-react';
import { recoveryQueue } from '../../api/leads';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { PageHeader } from '../../components/crm/CrmUi';
import { Button } from '../../components/ui/Button';

export const RecoveryQueuePage = () => {
  const { profile } = useAuth();
  const toast = useToast();

  const query = useQuery({
    queryKey: ['recovery-queue', profile?.workspace_id],
    queryFn: recoveryQueue,
    enabled: Boolean(profile),
  });

  const reasonLabels: Record<string, { label: string; color: string }> = {
    unacknowledged_overdue: { label: 'Unacknowledged & overdue', color: 'text-red-300' },
    escalated_multiple: { label: 'Escalated multiple times', color: 'text-orange-300' },
    idle: { label: 'Idle (no recent action)', color: 'text-amber-300' },
  };

  const formatWait = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  return (
    <section>
      <PageHeader
        title="Recovery Queue"
        description="Leads that need attention: overdue acknowledgements, repeated escalations, or idle owners."
        action={
          <Button
            onClick={() => {
              toast.info('Recovery actions require assignment.manage permission.');
            }}
            variant="outline"
            disabled
          >
            <Clock className="h-4 w-4" /> Refresh queue
          </Button>
        }
      />
      <div className="space-y-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/70" />
            ))}
          </div>
        ) : query.error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200" role="alert">
            {query.error.message}
          </div>
        ) : query.data?.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-slate-500 mb-3" />
            <h3 className="text-sm font-semibold text-slate-100 mb-1">Queue is clear</h3>
            <p className="text-xs text-slate-400">No leads require recovery at this time.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-slate-800 bg-slate-950/50">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Lead</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Contact</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Owner</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Waiting</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {(query.data ?? []).map((item) => (
                  <tr key={item.lead_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-500 shrink-0" />
                        <span className="text-slate-200">{item.lead_id.slice(0, 8)}…</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{item.contact_name}</td>
                    <td className="px-4 py-3 text-slate-300">{item.owner_full_name ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 text-slate-300">{formatWait(item.waiting_seconds)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${reasonLabels[item.reason]?.color ?? 'text-slate-400'}`}>
                        {reasonLabels[item.reason]?.label ?? item.reason}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};