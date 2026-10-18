import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Pencil, Phone, Plus, UserRound } from 'lucide-react';
import { getCrmOptions, listContacts, PAGE_SIZE, saveContact, type ContactInput, type ContactItem } from '../../api/crm';
import { normalizeError } from '../../api/errors';
import { CustomFields, Drawer, EmptyState, ErrorState, LoadingRows, PageHeader, Pagination, SearchBox, selectClass } from '../../components/crm/CrmUi';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToast } from '../../hooks/useToast';
import type { Json } from '../../types/database';

const emptyForm: ContactInput = { name: '', email: '', phone: '', companyId: '', tags: '', customValues: {} };

const customValuesOf = (value: Json): Record<string, Json> => value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, Json>) : {};

export const ContactsPage = () => {
  const { profile, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ContactItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<ContactInput>(emptyForm);
  const canCreate = hasPermission('crm.create');
  const canEdit = hasPermission('crm.edit');

  const query = useQuery({
    queryKey: ['contacts', profile?.workspace_id, debouncedSearch, page],
    queryFn: () => listContacts(profile!.workspace_id, debouncedSearch, page),
    enabled: Boolean(profile),
  });
  const options = useQuery({
    queryKey: ['crm-options', profile?.workspace_id],
    queryFn: () => getCrmOptions(profile!.workspace_id),
    enabled: Boolean(profile && drawerOpen),
  });
  const mutation = useMutation({
    mutationFn: () => saveContact(profile!.workspace_id, form, editing?.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['crm-options'] });
      toast.success(editing ? 'Contact updated.' : 'Contact created.');
      setDrawerOpen(false);
    },
    onError: (error) => toast.error(normalizeError(error, 'Could not save the contact.').message),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDrawerOpen(true); };
  const openEdit = (contact: ContactItem) => {
    setEditing(contact);
    setForm({ name: contact.name, email: contact.email ?? '', phone: contact.phone ?? '', companyId: contact.company_id ?? '', tags: contact.tags.join(', '), customValues: customValuesOf(contact.custom_values) });
    setDrawerOpen(true);
  };

  return (
    <section>
      <PageHeader title='Contacts' description='People your team is actively serving and following up with.' action={canCreate ? <Button onClick={openCreate}><Plus className='h-4 w-4' />New contact</Button> : undefined} />
      <div className='mb-4'><SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder='Search contacts by name' /></div>
      {query.isLoading ? <LoadingRows /> : query.isError ? <ErrorState message={normalizeError(query.error, 'Could not load contacts.').message} onRetry={() => void query.refetch()} /> : !query.data?.items.length ? <EmptyState title='No contacts found' message={search ? 'Try a different search.' : 'Create your first contact to begin tracking opportunities.'} /> : (
        <div className='overflow-x-auto rounded-xl border border-slate-800 bg-slate-900'>
          <table className='min-w-[720px] w-full text-left text-sm'>
            <thead className='bg-slate-950/60 text-xs uppercase tracking-wider text-slate-500'><tr><th className='px-4 py-3 font-medium'>Contact</th><th className='px-4 py-3 font-medium'>Company</th><th className='px-4 py-3 font-medium'>Tags</th><th className='px-4 py-3 text-right font-medium'>Action</th></tr></thead>
            <tbody className='divide-y divide-slate-800'>
              {query.data.items.map((contact) => <tr key={contact.id} className='hover:bg-slate-800/30'><td className='px-4 py-3'><div className='flex items-start gap-3'><span className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400'><UserRound className='h-4 w-4' /></span><div><p className='font-medium text-slate-100'>{contact.name}</p>{contact.email && <p className='mt-1 flex items-center gap-1.5 text-xs text-slate-400'><Mail className='h-3 w-3' />{contact.email}</p>}{contact.phone && <p className='mt-1 flex items-center gap-1.5 text-xs text-slate-400'><Phone className='h-3 w-3' />{contact.phone}</p>}</div></div></td><td className='px-4 py-3 text-slate-300'>{contact.company_name ?? 'Independent'}</td><td className='px-4 py-3'><div className='flex max-w-64 flex-wrap gap-1.5'>{contact.tags.length ? contact.tags.map((tag) => <span key={tag} className='rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300'>{tag}</span>) : <span className='text-xs text-slate-500'>No tags</span>}</div></td><td className='px-4 py-3 text-right'>{canEdit && <Button variant='ghost' size='sm' onClick={() => openEdit(contact)}><Pencil className='h-4 w-4' />Edit</Button>}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} count={query.data?.count ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editing ? 'Edit contact' : 'Create contact'}>
        {options.isError ? <ErrorState message={normalizeError(options.error, 'Could not load contact options.').message} onRetry={() => void options.refetch()} /> : (
          <form className='space-y-4' onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
            <Input label='Full name' required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={mutation.isPending} />
            <div className='grid gap-4 sm:grid-cols-2'><Input label='Email' type='email' value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} disabled={mutation.isPending} /><Input label='Phone' type='tel' value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} disabled={mutation.isPending} /></div>
            <label className='block space-y-1.5 text-xs font-medium text-slate-300'>Company<select value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })} disabled={mutation.isPending || options.isLoading} className={selectClass}><option value=''>Independent</option>{options.data?.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
            <Input label='Tags' helperText='Separate tags with commas.' value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} disabled={mutation.isPending} />
            <CustomFields fields={options.data?.contactFields ?? []} values={form.customValues} onChange={(customValues) => setForm({ ...form, customValues })} disabled={mutation.isPending} />
            <div className='flex justify-end gap-2 border-t border-slate-800 pt-4'><Button type='button' variant='ghost' onClick={() => setDrawerOpen(false)}>Cancel</Button><Button type='submit' disabled={!form.name.trim() || mutation.isPending}>{mutation.isPending && <Loader2 className='h-4 w-4 animate-spin' />}{editing ? 'Save changes' : 'Create contact'}</Button></div>
          </form>
        )}
      </Drawer>
    </section>
  );
};
