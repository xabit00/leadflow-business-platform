import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { setAssignmentRules } from '../../api/leads';
import { normalizeError } from '../../api/errors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/crm/CrmUi';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

export const SlaEscalationPage = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission('assignment.manage');

  const [form, setForm] = useState({
    ack_leave_policy: 'keep',
    ack_window_seconds: 300,
    backup_user_id: '',
    escalation_levels: 2,
    idle_period_seconds: 900,
    last_rr_user_id: '',
    level_window_seconds: 3600,
    manager_user_id: '',
    max_open_leads: 10,
    round_robin: true,
  });

  const saveMutation = useMutation({
    mutationFn: () => setAssignmentRules(form as any),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success('Assignment rules saved.');
    },
    onError: (error) => toast.error(normalizeError(error, 'Could not save assignment rules.').message),
  });

  return (
    <section>
      <PageHeader
        title="SLA & Escalation"
        description="Configure assignment rules, round-robin distribution, and escalation behavior."
      />
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Assignment Rules</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Ack leave policy</label>
                <select
                  value={form.ack_leave_policy}
                  onChange={(event) => setForm({ ...form, ack_leave_policy: event.target.value as 'keep' | 'reassign' })}
                  disabled={saveMutation.isPending || !canManage}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                >
                  <option value="keep">Keep with current owner</option>
                  <option value="reassign">Reassign on absence</option>
                </select>
              </div>
              <Input
                label="Max open leads per user"
                type="number"
                value={String(form.max_open_leads)}
                onChange={(event) => setForm({ ...form, max_open_leads: Number(event.target.value) || 0 })}
                disabled={saveMutation.isPending || !canManage}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Ack window (seconds)"
                type="number"
                value={String(form.ack_window_seconds)}
                onChange={(event) => setForm({ ...form, ack_window_seconds: Number(event.target.value) || 0 })}
                disabled={saveMutation.isPending || !canManage}
              />
              <Input
                label="Idle period (seconds)"
                type="number"
                value={String(form.idle_period_seconds)}
                onChange={(event) => setForm({ ...form, idle_period_seconds: Number(event.target.value) || 0 })}
                disabled={saveMutation.isPending || !canManage}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Escalation levels"
                type="number"
                value={String(form.escalation_levels)}
                onChange={(event) => setForm({ ...form, escalation_levels: Number(event.target.value) || 0 })}
                disabled={saveMutation.isPending || !canManage}
              />
              <Input
                label="Level window (seconds)"
                type="number"
                value={String(form.level_window_seconds)}
                onChange={(event) => setForm({ ...form, level_window_seconds: Number(event.target.value) || 0 })}
                disabled={saveMutation.isPending || !canManage}
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer disabled:opacity-50">
                <input
                  type="checkbox"
                  checked={form.round_robin}
                  onChange={(event) => setForm({ ...form, round_robin: event.target.checked })}
                  disabled={saveMutation.isPending || !canManage}
                  className="h-4 w-4 text-blue-600 border-slate-700 rounded"
                />
                Round-robin assignment
              </label>
            </div>
            <Button type="submit" disabled={saveMutation.isPending || !canManage}>
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