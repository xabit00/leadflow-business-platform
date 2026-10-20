import { supabase } from '../lib/supabase';
import type { Tables } from '../types/database';

export type Lead = Tables<'leads'>;
export type LeadAssignment = Tables<'lead_assignments'>;
export type AssignmentRule = Tables<'assignment_rules'>;

const throwIfError = (error: { message: string } | null) => {
  if (error) throw error;
};

export interface AssignmentRulesInput {
  ack_leave_policy: 'keep' | 'reassign';
  ack_window_seconds: number;
  backup_user_id?: string | null;
  escalation_levels: number;
  idle_period_seconds: number;
  level_window_seconds: number;
  manager_user_id?: string | null;
  max_open_leads: number;
  round_robin: boolean;
}

export const getAssignmentRules = async (): Promise<AssignmentRule | null> => {
  const { data, error } = await supabase.rpc('get_assignment_rules');
  throwIfError(error);
  return (data ?? null) as AssignmentRule | null;
};

export const setAssignmentRules = async (rules: AssignmentRulesInput) => {
  const { error } = await supabase.rpc('set_assignment_rules', { p_rules: { ...rules } });
  throwIfError(error);
};

export interface CreateManualLeadInput {
  contactId: string;
  source: 'web_form' | 'message' | 'manual';
  title?: string;
}

export const createManualLead = async (input: CreateManualLeadInput): Promise<string> => {
  const { data, error } = await supabase.rpc('create_manual_lead', {
    p_contact_id: input.contactId,
    p_source: input.source,
    p_title: input.title ?? undefined,
  });
  throwIfError(error);
  return data as string;
};

export const acknowledgeLead = async (leadId: string) => {
  const { data, error } = await supabase.rpc('acknowledge_lead', { p_lead_id: leadId });
  throwIfError(error);
  return data;
};

export const escalateLead = async (leadId: string) => {
  const { error } = await supabase.rpc('escalate_lead', { p_lead_id: leadId });
  throwIfError(error);
};

export const reassignLead = async (leadId: string, newUserId: string) => {
  const { error } = await supabase.rpc('reassign_lead', { p_lead_id: leadId, p_new_user_id: newUserId });
  throwIfError(error);
};

export interface RecoveryQueueItem {
  lead_id: string;
  contact_name: string;
  owner_full_name: string | null;
  waiting_seconds: number;
  reason: string;
}

export const recoveryQueue = async (): Promise<RecoveryQueueItem[]> => {
  const { data, error } = await supabase.rpc('recovery_queue');
  throwIfError(error);
  return (data ?? []) as RecoveryQueueItem[];
};