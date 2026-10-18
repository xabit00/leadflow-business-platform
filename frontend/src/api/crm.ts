import { supabase } from '../lib/supabase';
import type { Json, Tables, TablesInsert, TablesUpdate } from '../types/database';

export const PAGE_SIZE = 10;

export type Company = Tables<'companies'>;
export type Contact = Tables<'contacts'>;
export type Opportunity = Tables<'opportunities'>;
export type Pipeline = Tables<'pipelines'>;
export type Stage = Tables<'stages'>;
export type CustomField = Tables<'custom_fields'>;

export interface PageResult<T> {
  items: T[];
  count: number;
}

export interface ContactItem extends Contact {
  company_name: string | null;
}

export interface OpportunityItem extends Opportunity {
  contact_name: string;
  pipeline_name: string;
  stage_name: string;
  value: number | null;
  currency: string | null;
}

export interface CrmOptions {
  companies: Company[];
  contacts: Contact[];
  pipelines: Pipeline[];
  stages: Stage[];
  contactFields: CustomField[];
  opportunityFields: CustomField[];
}

const pageRange = (page: number) => {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
};

const throwIfError = (error: { message: string } | null) => {
  if (error) throw error;
};

export const listCompanies = async (workspaceId: string, search: string, page: number): Promise<PageResult<Company>> => {
  const { from, to } = pageRange(page);
  let query = supabase.from('companies').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('created_at', { ascending: false }).range(from, to);
  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
  const { data, error, count } = await query;
  throwIfError(error);
  return { items: data ?? [], count: count ?? 0 };
};

export const saveCompany = async (workspaceId: string, name: string, id?: string) => {
  if (id) {
    const { error } = await supabase.from('companies').update({ name: name.trim() }).eq('id', id).eq('workspace_id', workspaceId);
    throwIfError(error);
    return;
  }
  const input: TablesInsert<'companies'> = { workspace_id: workspaceId, name: name.trim() };
  const { error } = await supabase.from('companies').insert(input);
  throwIfError(error);
};

export const listContacts = async (workspaceId: string, search: string, page: number): Promise<PageResult<ContactItem>> => {
  const { from, to } = pageRange(page);
  let query = supabase.from('contacts').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('created_at', { ascending: false }).range(from, to);
  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
  const { data, error, count } = await query;
  throwIfError(error);

  const companyIds = [...new Set((data ?? []).flatMap((item) => item.company_id ? [item.company_id] : []))];
  const companyMap = new Map<string, string>();
  if (companyIds.length) {
    const companyResult = await supabase.from('companies').select('id, name').in('id', companyIds);
    throwIfError(companyResult.error);
    companyResult.data?.forEach((company) => companyMap.set(company.id, company.name));
  }
  return {
    items: (data ?? []).map((contact) => ({ ...contact, company_name: contact.company_id ? companyMap.get(contact.company_id) ?? null : null })),
    count: count ?? 0,
  };
};

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  companyId: string;
  tags: string;
  customValues: Record<string, Json>;
}

export const saveContact = async (workspaceId: string, input: ContactInput, id?: string) => {
  const values = {
    name: input.name.trim(),
    email: input.email.trim() || null,
    phone: input.phone.trim() || null,
    company_id: input.companyId || null,
    tags: input.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    custom_values: input.customValues,
  };
  if (id) {
    const update: TablesUpdate<'contacts'> = values;
    const { error } = await supabase.from('contacts').update(update).eq('id', id).eq('workspace_id', workspaceId);
    throwIfError(error);
    return;
  }
  const insert: TablesInsert<'contacts'> = { ...values, workspace_id: workspaceId };
  const { error } = await supabase.from('contacts').insert(insert);
  throwIfError(error);
};

export const listOpportunities = async (workspaceId: string, search: string, page: number, canViewValue: boolean): Promise<PageResult<OpportunityItem>> => {
  const { from, to } = pageRange(page);
  let query = supabase.from('opportunities').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).range(from, to);
  if (search.trim()) query = query.ilike('title', `%${search.trim()}%`);
  const { data, error, count } = await query;
  throwIfError(error);
  const opportunities = data ?? [];

  const contactIds = [...new Set(opportunities.map((item) => item.contact_id))];
  const pipelineIds = [...new Set(opportunities.map((item) => item.pipeline_id))];
  const stageIds = [...new Set(opportunities.map((item) => item.stage_id))];
  const opportunityIds = opportunities.map((item) => item.id);
  const [contacts, pipelines, stages, values] = await Promise.all([
    contactIds.length ? supabase.from('contacts').select('id, name').in('id', contactIds) : Promise.resolve({ data: [], error: null }),
    pipelineIds.length ? supabase.from('pipelines').select('id, name').in('id', pipelineIds) : Promise.resolve({ data: [], error: null }),
    stageIds.length ? supabase.from('stages').select('id, name').in('id', stageIds) : Promise.resolve({ data: [], error: null }),
    canViewValue && opportunityIds.length ? supabase.from('opportunity_values').select('opportunity_id, value, currency').in('opportunity_id', opportunityIds) : Promise.resolve({ data: [], error: null }),
  ]);
  [contacts.error, pipelines.error, stages.error, values.error].forEach(throwIfError);
  const contactMap = new Map((contacts.data ?? []).map((item) => [item.id, item.name]));
  const pipelineMap = new Map((pipelines.data ?? []).map((item) => [item.id, item.name]));
  const stageMap = new Map((stages.data ?? []).map((item) => [item.id, item.name]));
  const valueMap = new Map((values.data ?? []).map((item) => [item.opportunity_id, item]));

  return {
    items: opportunities.map((opportunity) => ({
      ...opportunity,
      contact_name: contactMap.get(opportunity.contact_id) ?? 'Unknown contact',
      pipeline_name: pipelineMap.get(opportunity.pipeline_id) ?? 'Unknown pipeline',
      stage_name: stageMap.get(opportunity.stage_id) ?? 'Unknown stage',
      value: valueMap.get(opportunity.id)?.value ?? null,
      currency: valueMap.get(opportunity.id)?.currency ?? null,
    })),
    count: count ?? 0,
  };
};

export interface OpportunityInput {
  title: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  value: string;
  currency: string;
  customValues: Record<string, Json>;
}

export const createOpportunity = async (workspaceId: string, input: OpportunityInput) => {
  const opportunityInput: TablesInsert<'opportunities'> = { workspace_id: workspaceId, title: input.title.trim(), contact_id: input.contactId, pipeline_id: input.pipelineId, stage_id: input.stageId, custom_values: input.customValues };
  const { data, error } = await supabase.from('opportunities').insert(opportunityInput).select().single();
  throwIfError(error);
  if (!input.value.trim() || !data) return;
  const valueInput: TablesInsert<'opportunity_values'> = { workspace_id: workspaceId, opportunity_id: data.id, value: Number(input.value), currency: input.currency.trim().toUpperCase() || 'USD' };
  const valueResult = await supabase.from('opportunity_values').insert(valueInput);
  throwIfError(valueResult.error);
};

export const updateOpportunity = async (workspaceId: string, item: OpportunityItem, input: OpportunityInput) => {
  const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc('update_opportunity', { p_opportunity_id: item.id, p_expected_version: item.version, p_patch: { title: input.title.trim(), custom_values: input.customValues } });
  throwIfError(error);
  if (input.value.trim()) {
    const valueInput: TablesInsert<'opportunity_values'> = { workspace_id: workspaceId, opportunity_id: item.id, value: Number(input.value), currency: input.currency.trim().toUpperCase() || 'USD' };
    const valueResult = await supabase.from('opportunity_values').upsert(valueInput, { onConflict: 'opportunity_id' });
    throwIfError(valueResult.error);
  }
};

export const getCrmOptions = async (workspaceId: string): Promise<CrmOptions> => {
  const [companies, contacts, pipelines, stages, fields] = await Promise.all([
    supabase.from('companies').select('*').eq('workspace_id', workspaceId).order('name'),
    supabase.from('contacts').select('*').eq('workspace_id', workspaceId).order('name').limit(500),
    supabase.from('pipelines').select('*').eq('workspace_id', workspaceId).order('name'),
    supabase.from('stages').select('*').eq('workspace_id', workspaceId).order('position'),
    supabase.from('custom_fields').select('*').eq('workspace_id', workspaceId).order('position'),
  ]);
  [companies.error, contacts.error, pipelines.error, stages.error, fields.error].forEach(throwIfError);
  return {
    companies: companies.data ?? [],
    contacts: contacts.data ?? [],
    pipelines: pipelines.data ?? [],
    stages: stages.data ?? [],
    contactFields: (fields.data ?? []).filter((field) => field.entity === 'contact'),
    opportunityFields: (fields.data ?? []).filter((field) => field.entity === 'opportunity'),
  };
};
