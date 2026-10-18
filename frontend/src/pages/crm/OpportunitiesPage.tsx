import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, EyeOff, Kanban, Loader2, Pencil, Plus } from 'lucide-react';
import {
  createOpportunity,
  getCrmOptions,
  listOpportunities,
  PAGE_SIZE,
  updateOpportunity,
  type OpportunityInput,
  type OpportunityItem,
} from '../../api/crm';
import { normalizeError } from '../../api/errors';
import {
  CustomFields,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  Pagination,
  SearchBox,
  selectClass,
} from '../../components/crm/CrmUi';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToast } from '../../hooks/useToast';
import type { Json } from '../../types/database';

const CURRENCIES = ['USD', 'GBP', 'EUR', 'AED', 'SAR'];

const emptyForm: OpportunityInput = {
  title: '',
  contactId: '',
  pipelineId: '',
  stageId: '',
  value: '',
  currency: 'USD',
  customValues: {},
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  expired: 'bg-slate-600/40 text-slate-400 border-slate-600/40',
  refunded: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

export const OpportunitiesPage = () => {
  const { profile, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<OpportunityItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<OpportunityInput>(emptyForm);

  const canCreate = hasPermission('crm.create');
  const canEdit = hasPermission('crm.edit');
  const canViewValue = hasPermission('value.view');

  const query = useQuery({
    queryKey: ['opportunities', profile?.workspace_id, debouncedSearch, page, canViewValue],
    queryFn: () => listOpportunities(profile!.workspace_id, debouncedSearch, page, canViewValue),
    enabled: Boolean(profile),
  });

  const options = useQuery({
    queryKey: ['crm-options', profile?.workspace_id],
    queryFn: () => getCrmOptions(profile!.workspace_id),
    enabled: Boolean(profile && drawerOpen),
  });

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? updateOpportunity(profile!.workspace_id, editing, form)
        : createOpportunity(profile!.workspace_id, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast.success(editing ? 'Opportunity updated.' : 'Opportunity created.');
      setDrawerOpen(false);
    },
    onError: (error) => toast.error(normalizeError(error, 'Could not save the opportunity.').message),
  });

  // Filter stages to the selected pipeline when editing
  const filteredStages = options.data?.stages.filter(
    (s) => s.pipeline_id === form.pipelineId,
  ) ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (opp: OpportunityItem) => {
    setEditing(opp);
    setForm({
      title: opp.title,
      contactId: opp.contact_id,
      pipelineId: opp.pipeline_id,
      stageId: opp.stage_id,
      value: opp.value != null ? String(opp.value) : '',
      currency: opp.currency ?? 'USD',
      customValues: (opp.custom_values && typeof opp.custom_values === 'object' && !Array.isArray(opp.custom_values))
        ? (opp.custom_values as Record<string, Json>)
        : {},
    });
    setDrawerOpen(true);
  };

  return (
    <section>
      <PageHeader
        title="Opportunities"
        description="Track deals through your sales pipeline from first contact to close."
        action={canCreate ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New opportunity
          </Button>
        ) : undefined}
      />

      <div className="mb-4">
        <SearchBox
          value={search}
          onChange={(value) => { setSearch(value); setPage(1); }}
          placeholder="Search opportunities by title"
        />
      </div>

      {query.isLoading ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState
          message={normalizeError(query.error, 'Could not load opportunities.').message}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data?.items.length ? (
        <EmptyState
          title="No opportunities found"
          message={search ? 'Try a different search.' : 'Create your first opportunity to start tracking deals.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
          <table className="min-w-[780px] w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Pipeline → Stage</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {query.data.items.map((opp) => (
                <tr key={opp.id} className="hover:bg-slate-800/30">
                  {/* Title */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                        <Kanban className="h-4 w-4" />
                      </span>
                      <p className="font-medium text-slate-100 max-w-[180px] truncate">{opp.title}</p>
                    </div>
                  </td>
                  {/* Contact */}
                  <td className="px-4 py-3 text-slate-300">{opp.contact_name}</td>
                  {/* Pipeline → Stage */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-400">{opp.pipeline_name}</span>
                      <span className="text-slate-600">→</span>
                      <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-blue-300 border border-blue-500/20">
                        {opp.stage_name}
                      </span>
                    </div>
                  </td>
                  {/* Value */}
                  <td className="px-4 py-3">
                    {!canViewValue ? (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <EyeOff className="h-3 w-3" /> Restricted
                      </span>
                    ) : opp.value != null ? (
                      <span className="flex items-center gap-1 text-sm font-medium text-emerald-400">
                        <DollarSign className="h-3.5 w-3.5" />
                        {opp.value.toLocaleString()} {opp.currency}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  {/* Payment status */}
                  <td className="px-4 py-3">
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${statusColors[opp.payment_status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      {opp.payment_status}
                    </span>
                  </td>
                  {/* Action */}
                  <td className="px-4 py-3 text-right">
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(opp)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        count={query.data?.count ?? 0}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />

      {/* Create / Edit drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Edit opportunity' : 'New opportunity'}
      >
        {options.isError ? (
          <ErrorState
            message={normalizeError(options.error, 'Could not load form options.').message}
            onRetry={() => void options.refetch()}
          />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}
          >
            <Input
              label="Title"
              required
              autoFocus
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              disabled={mutation.isPending}
            />

            {/* Contact */}
            <label className="block space-y-1.5 text-xs font-medium text-slate-300">
              Contact *
              <select
                required
                value={form.contactId}
                onChange={(event) => setForm({ ...form, contactId: event.target.value })}
                disabled={mutation.isPending || options.isLoading || Boolean(editing)}
                className={selectClass}
              >
                <option value="">Select contact</option>
                {options.data?.contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {/* Pipeline */}
            <label className="block space-y-1.5 text-xs font-medium text-slate-300">
              Pipeline *
              <select
                required
                value={form.pipelineId}
                onChange={(event) =>
                  setForm({ ...form, pipelineId: event.target.value, stageId: '' })
                }
                disabled={mutation.isPending || options.isLoading || Boolean(editing)}
                className={selectClass}
              >
                <option value="">Select pipeline</option>
                {options.data?.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            {/* Stage */}
            <label className="block space-y-1.5 text-xs font-medium text-slate-300">
              Stage *
              <select
                required
                value={form.stageId}
                onChange={(event) => setForm({ ...form, stageId: event.target.value })}
                disabled={mutation.isPending || !form.pipelineId}
                className={selectClass}
              >
                <option value="">Select stage</option>
                {filteredStages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            {/* Value + Currency */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Value"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 5000"
                value={form.value}
                onChange={(event) => setForm({ ...form, value: event.target.value })}
                disabled={mutation.isPending}
              />
              <label className="block space-y-1.5 text-xs font-medium text-slate-300">
                Currency
                <select
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value })}
                  disabled={mutation.isPending}
                  className={selectClass}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            {/* Custom fields */}
            <CustomFields
              fields={options.data?.opportunityFields ?? []}
              values={form.customValues}
              onChange={(customValues) => setForm({ ...form, customValues })}
              disabled={mutation.isPending}
            />

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDrawerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !form.title.trim() ||
                  !form.contactId ||
                  !form.pipelineId ||
                  !form.stageId ||
                  mutation.isPending
                }
              >
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save changes' : 'Create opportunity'}
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </section>
  );
};
