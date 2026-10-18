import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, Mail, MessageCircle, UserPlus, Loader2 } from 'lucide-react';
import { createManualLead } from '../../api/leads';
import { normalizeError } from '../../api/errors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/crm/CrmUi';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

export const LeadIntakePage = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canCreate = hasPermission('crm.create');

  const [source, setSource] = useState<'web_form' | 'message' | 'manual'>('manual');
  const [form, setForm] = useState({ contactId: '', title: '' });

  const mutation = useMutation({
    mutationFn: () => createManualLead({ contactId: form.contactId, source, title: form.title }),
    onSuccess: async (leadId) => {
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Lead created (${leadId}).`);
      setForm({ contactId: '', title: '' });
    },
    onError: (error) => toast.error(normalizeError(error, 'Could not create lead.').message),
  });

  return (
    <section>
      <PageHeader
        title="Lead Intake"
        description="Create manual leads from inbound sources and assign them to your team."
        action={
          canCreate ? (
            <Button onClick={() => {}} variant="outline" disabled>
              <UserPlus className="h-4 w-4" /> New lead
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">Create Lead</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
              className="space-y-4"
            >
              <Input
                label="Contact"
                placeholder="Select or search a contact"
                value={form.contactId}
                onChange={(event) => setForm({ ...form, contactId: event.target.value })}
                disabled={mutation.isPending}
              />
              <Input
                label="Title (optional)"
                placeholder="e.g. Website inquiry"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                disabled={mutation.isPending}
              />
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Source:</span>
                {['web_form', 'message', 'manual'].map((s) => (
                  <label key={s} className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={source === s}
                      onChange={() => setSource(s as 'web_form' | 'message' | 'manual')}
                      disabled={mutation.isPending}
                      className="h-4 w-4 text-blue-600 border-slate-700"
                    />
                    {s.replace('_', ' ')}
                  </label>
                ))}
              </div>
              <Button type="submit" disabled={!form.contactId || mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create lead
              </Button>
            </form>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">Sources</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-800/50 bg-slate-950/50">
                <Phone className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-200">Phone call</p>
                  <p className="text-xs text-slate-500">Log an inbound call and create a lead.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-800/50 bg-slate-950/50">
                <Mail className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-200">Email</p>
                  <p className="text-xs text-slate-500">Convert an email inquiry into a lead.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-800/50 bg-slate-950/50">
                <MessageCircle className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-200">Message</p>
                  <p className="text-xs text-slate-500">Create a lead from chat or SMS.</p>
                </div>
              </div>
            </div>
          </div>
          {!canCreate && (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
              <p className="text-sm text-slate-400">You don't have permission to create leads.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};