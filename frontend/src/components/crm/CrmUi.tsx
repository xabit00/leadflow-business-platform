import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { CustomField } from '../../api/crm';
import type { Json } from '../../types/database';

export const selectClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50';

export const PageHeader = ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => (
  <header className='mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
    <div>
      <h1 className='text-3xl font-semibold tracking-tight text-white'>{title}</h1>
      <p className='mt-2 max-w-2xl text-sm text-slate-400'>{description}</p>
    </div>
    {action}
  </header>
);

export const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) => (
  <label className='relative block w-full sm:max-w-sm'>
    <span className='sr-only'>Search</span>
    <Search className='pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500' />
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className='w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30' />
  </label>
);

export const Pagination = ({ page, count, pageSize, onChange }: { page: number; count: number; pageSize: number; onChange: (page: number) => void }) => {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <div className='mt-4 flex items-center justify-between gap-3 text-xs text-slate-400'>
      <span>{count ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, count)} of ${count}` : '0 records'}</span>
      <div className='flex items-center gap-2'>
        <Button type='button' variant='outline' size='sm' disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label='Previous page'><ChevronLeft className='h-4 w-4' /></Button>
        <span className='min-w-16 text-center'>Page {page} / {pages}</span>
        <Button type='button' variant='outline' size='sm' disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label='Next page'><ChevronRight className='h-4 w-4' /></Button>
      </div>
    </div>
  );
};

export const Drawer = ({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (open && !panel.open) panel.showModal();
    if (!open && panel.open) panel.close();
  }, [open]);
  return (
    <dialog ref={dialog} className="crm-dialog" aria-labelledby="crm-drawer-title" onCancel={onClose} onClose={onClose} onClick={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="flex min-h-full flex-col bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
          <h2 id="crm-drawer-title" className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800" aria-label="Close panel"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 p-6">{children}</div>
      </div>
    </dialog>
  );
};

const optionStrings = (options: Json): string[] => Array.isArray(options) ? options.filter((value): value is string => typeof value === 'string') : [];

export const CustomFields = ({ fields, values, onChange, disabled }: { fields: CustomField[]; values: Record<string, Json>; onChange: (values: Record<string, Json>) => void; disabled?: boolean }) => {
  if (!fields.length) return null;
  return (
    <fieldset className='space-y-4 border-t border-slate-800 pt-4'>
      <legend className='px-1 text-xs font-semibold uppercase tracking-wider text-slate-400'>Custom fields</legend>
      {fields.map((field) => {
        const value = values[field.field_key];
        if (field.type === 'checkbox') {
          return <label key={field.id} className='flex items-center gap-3 text-sm text-slate-300'><input type='checkbox' checked={value === true} disabled={disabled} onChange={(event) => onChange({ ...values, [field.field_key]: event.target.checked })} className='h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500' />{field.name}</label>;
        }
        if (field.type === 'dropdown') {
          return <label key={field.id} className='block space-y-1.5 text-xs font-medium text-slate-300'>{field.name}<select value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(event) => onChange({ ...values, [field.field_key]: event.target.value })} className={selectClass}><option value=''>Select an option</option>{optionStrings(field.options).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
        }
        return <label key={field.id} className='block space-y-1.5 text-xs font-medium text-slate-300'>{field.name}<input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''} disabled={disabled} onChange={(event) => onChange({ ...values, [field.field_key]: field.type === 'number' ? Number(event.target.value) : event.target.value })} className={selectClass} /></label>;
      })}
    </fieldset>
  );
};

export const LoadingRows = () => <div className='space-y-2' aria-label='Loading records'>{[0, 1, 2, 3, 4].map((row) => <div key={row} className='h-14 animate-pulse rounded-lg bg-slate-800/70' />)}</div>;

export const EmptyState = ({ title, message }: { title: string; message: string }) => <div className='rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center'><h3 className='font-medium text-slate-200'>{title}</h3><p className='mx-auto mt-2 max-w-md text-sm text-slate-400'>{message}</p></div>;

export const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => <div className='rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200' role='alert'><p>{message}</p><Button type='button' variant='outline' size='sm' className='mt-3' onClick={onRetry}>Try again</Button></div>;
