import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { getAssignmentRules, setAssignmentRules, type AssignmentRulesInput } from '../../api/leads';
import { normalizeError } from '../../api/errors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/crm/CrmUi';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

export const SlaEscalationPage = () => {
  const { hasPermission, profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission('assignment.manage');

  const rulesQuery = useQuery({
    queryKey: ['assignment-rules', profile?.workspace_id],
    queryFn: getAssignmentRules,
    enabled: Boolean(profile?.workspace_id),
  });

  const [form, setForm] = useState<AssignmentRulesInput>({
    ack_leave_policy: 'keep',
    ack_window_seconds: 300,
    escalation_levels: 2,
    idle_period_seconds: 900,
    level_window_seconds: 3600,
    max_open_leads: 10,
    round_robin: true,
  });

  useEffect(() => {
    const rules = rulesQuery.data;
    if (!rules) return;
    setForm({
      ack_leave_policy: rules.ack_leave_policy,
      ack_window_seconds: rules.ack_window_seconds,
      escalation_levels: rules.escalation_levels,
      idle_period_seconds: rules.idle_period_seconds,
      level_window_seconds: rules.level_window_seconds,
      max_open_leads: rules.max_open_leads,
      round_robin: rules.round_robin,
    });
  }, [rulesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => setAssignmentRules(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success('Assignment rules saved.');
    },
    onError: (error) => toast.error(normalizeError(error, 'Could not save assignment rules.').message),
  });

  const disabled = saveMutation.isPending || !canManage || !rulesQuery.data || rulesQuery.isFetching;

  return (
    <section>
      <PageHeader
        title="SLA & Escalation"
        description="Configure assignment rules, round-robin distribution, and escalation behavior."
      />
      {rulesQuery.isPending && <p role="status">Loading saved assignment rules...</p>}
      {rulesQuery.isError && (
        <div role="alert">
          <p>{normalizeError(rulesQuery.error, 'Could not load assignment rules.').message}</p>
          <Button onClick={() => void rulesQuery.refetch()}>Retry</Button>
        </div>
      )}
      {rulesQuery.isSuccess && !rulesQuery.data && <p role="alert">No assignment rules exist for this workspace. Complete workspace setup first.</p>}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Assignment Rules</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled) saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Ack leave policy</label>
                <select
                  value={form.ack_leave_policy}
                  onChange={(event) => setForm({ ...form, ack_leave_policy: event.target.value as 'keep' | 'reassign' })}
                  disabled={disabled}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                >
                  <option value="keep">Keep with current owner</option>
                  <option value="reassign">Reassign on absence</option>
                </select>
              </div>
              <Input
                label="Max open leads per user"
                type="number"
                min={1}
                step={1}
                required
                value={String(form.max_open_leads)}
                onChange={(event) => setForm({ ...form, max_open_leads: Number(event.target.value) || 0 })}
                disabled={disabled}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Ack window (seconds)"
                type="number"
                min={1}
                step={1}
                required
                value={String(form.ack_window_seconds)}
                onChange={(event) => setForm({ ...form, ack_window_seconds: Number(event.target.value) || 0 })}
                disabled={disabled}
              />
              <Input
                label="Idle period (seconds)"
                type="number"
                min={1}
                step={1}
                required
                value={String(form.idle_period_seconds)}
                onChange={(event) => setForm({ ...form, idle_period_seconds: Number(event.target.value) || 0 })}
                disabled={disabled}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Escalation levels"
                type="number"
                min={1}
                step={1}
                required
                value={String(form.escalation_levels)}
                onChange={(event) => setForm({ ...form, escalation_levels: Number(event.target.value) || 0 })}
                disabled={disabled}
              />
              <Input
                label="Level window (seconds)"
                type="number"
                min={1}
                step={1}
                required
                value={String(form.level_window_seconds)}
                onChange={(event) => setForm({ ...form, level_window_seconds: Number(event.target.value) || 0 })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer disabled:opacity-50">
                <input
                  type="checkbox"
                  checked={form.round_robin}
                  onChange={(event) => setForm({ ...form, round_robin: event.target.checked })}
                  disabled={disabled}
                  className="h-4 w-4 text-blue-600 border-slate-700 rounded"
                />
                Round-robin assignment
              </label>
            </div>
            <Button type="submit" disabled={disabled}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save rules
            </Button>
          </form>
        </div>
        {!canManage && (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
            <p className="text-sm text-slate-400">You don't have permission to manage assignment rules.</p>
          </div>
        )}
      </div>
    </section>
  );
};