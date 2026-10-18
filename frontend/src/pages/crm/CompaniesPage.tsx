import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Pencil, Plus } from 'lucide-react';
import { listCompanies, PAGE_SIZE, saveCompany, type Company } from '../../api/crm';
import { normalizeError } from '../../api/errors';
import { Drawer, EmptyState, ErrorState, LoadingRows, PageHeader, Pagination, SearchBox } from '../../components/crm/CrmUi';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToast } from '../../hooks/useToast';

export const CompaniesPage = () => {
  const { profile, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Company | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState('');
  const canCreate = hasPermission('crm.create');
  const canEdit = hasPermission('crm.edit');

  const query = useQuery({
    queryKey: ['companies', profile?.workspace_id, debouncedSearch, page],
    queryFn: () => listCompanies(profile!.workspace_id, debouncedSearch, page),
    enabled: Boolean(profile),
  });
  const mutation = useMutation({
    mutationFn: () => saveCompany(profile!.workspace_id, name, editing?.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.invalidateQueries({ queryKey: ['crm-options'] });
      toast.success(editing ? 'Company updated.' : 'Company created.');
      setDrawerOpen(false);
    },
    onError: (error) => toast.error(normalizeError(error, 'Could not save the company.').message),
  });

  const openCreate = () => { setEditing(null); setName(''); setDrawerOpen(true); };
  const openEdit = (company: Company) => { setEditing(company); setName(company.name); setDrawerOpen(true); };

  return (
    <section>
      <PageHeader title='Companies' description='Organizations connected to contacts and opportunities.' action={canCreate ? <Button onClick={openCreate}><Plus className='h-4 w-4' />New company</Button> : undefined} />
      <div className='mb-4'><SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder='Search companies' /></div>
      {query.isLoading ? <LoadingRows /> : query.isError ? <ErrorState message={normalizeError(query.error, 'Could not load companies.').message} onRetry={() => void query.refetch()} /> : !query.data?.items.length ? <EmptyState title='No companies found' message={search ? 'Try a different search.' : 'Create a company to organize your contacts.'} /> : (
        <div className='overflow-hidden rounded-xl border border-slate-800 bg-slate-900'>
          <div className='divide-y divide-slate-800'>
            {query.data.items.map((company) => <div key={company.id} className='flex items-center justify-between gap-4 p-4'><div className='flex min-w-0 items-center gap-3'><span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400'><Building2 className='h-4 w-4' /></span><div className='min-w-0'><p className='truncate text-sm font-medium text-slate-100'>{company.name}</p><p className='text-xs text-slate-500'>Added {new Date(company.created_at).toLocaleDateString()}</p></div></div>{canEdit && <Button variant='ghost' size='sm' onClick={() => openEdit(company)}><Pencil className='h-4 w-4' />Edit</Button>}</div>)}
          </div>
        </div>
      )}
      <Pagination page={page} count={query.data?.count ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editing ? 'Edit company' : 'Create company'}>
        <form className='space-y-5' onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <Input label='Company name' required autoFocus value={name} onChange={(event) => setName(event.target.value)} disabled={mutation.isPending} />
          <div className='flex justify-end gap-2 border-t border-slate-800 pt-4'><Button type='button' variant='ghost' onClick={() => setDrawerOpen(false)}>Cancel</Button><Button type='submit' disabled={!name.trim() || mutation.isPending}>{mutation.isPending && <Loader2 className='h-4 w-4 animate-spin' />}{editing ? 'Save changes' : 'Create company'}</Button></div>
        </form>
      </Drawer>
    </section>
  );
};
