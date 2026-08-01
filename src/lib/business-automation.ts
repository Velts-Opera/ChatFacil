import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type BusinessService = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  recurrence_days: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BusinessResource = {
  id: string;
  company_id: string;
  name: string;
  kind: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BusinessHour = {
  id: string;
  company_id: string;
  weekday: number;
  opens_at: string;
  closes_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BusinessAutomationSettings = {
  company_id: string;
  timezone: string;
  slot_interval_minutes: number;
  minimum_lead_minutes: number;
  booking_horizon_days: number;
  inactive_after_days: number;
  reactivation_enabled: boolean;
  empty_slot_enabled: boolean;
  reminders_enabled: boolean;
  reactivation_template_name: string | null;
  empty_slot_template_name: string | null;
  reminder_template_name: string | null;
  template_language: string;
  max_daily_outreach: number;
  max_contacts_per_slot: number;
  lookahead_days: number;
  created_at: string;
  updated_at: string;
};

export type BusinessOpportunityStatus =
  | 'detected'
  | 'queued'
  | 'contacted'
  | 'converted'
  | 'dismissed'
  | 'failed';

export type BusinessOpportunityType =
  | 'inactive_customer'
  | 'empty_slot'
  | 'appointment_reminder';

export type BusinessOpportunity = {
  id: string;
  company_id: string;
  opportunity_type: BusinessOpportunityType;
  contact_id: string | null;
  service_id: string | null;
  resource_id: string | null;
  appointment_id: string | null;
  slot_start: string | null;
  slot_end: string | null;
  score: number;
  status: BusinessOpportunityStatus;
  fingerprint: string;
  payload: Json;
  detected_at: string;
  queued_at: string | null;
  contacted_at: string | null;
  converted_at: string | null;
  converted_appointment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AvailableSlot = {
  slot_start: string;
  slot_end: string;
  resource_id: string;
  resource_name: string;
};

export type BusinessAppointment = {
  id: string;
  company_id: string;
  contact_id: string | null;
  service_id: string | null;
  resource_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  price_cents: number;
  booking_source: string;
  timezone: string;
  completed_at: string | null;
  cancelled_at: string | null;
  no_show_at: string | null;
  reminder_24h_sent_at: string | null;
  reminder_2h_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessMetrics = {
  appointments: number;
  completed: number;
  cancelled: number;
  scheduled_revenue_cents: number;
  recovered_revenue_cents: number;
  open_opportunities: number;
  reactivated_customers: number;
};

export type BusinessOnboardingStatus = {
  services_count: number;
  resources_count: number;
  business_hours_count: number;
  approved_templates_count: number;
  connected_whatsapp: boolean;
  booking_ready: boolean;
  outreach_ready: boolean;
};

export type CreateBusinessServiceInput = {
  company_id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  price_cents: number;
  recurrence_days?: number | null;
  active?: boolean;
};

export type UpdateBusinessServiceInput = Partial<
  Pick<
    BusinessService,
    | 'name'
    | 'description'
    | 'duration_minutes'
    | 'price_cents'
    | 'recurrence_days'
    | 'active'
  >
>;

export type CreateBusinessResourceInput = {
  company_id: string;
  name: string;
  kind?: string;
  active?: boolean;
};

export type UpdateBusinessResourceInput = Partial<
  Pick<BusinessResource, 'name' | 'kind' | 'active'>
>;

export type ReplaceBusinessHourInput = Pick<
  BusinessHour,
  'weekday' | 'opens_at' | 'closes_at'
> & {
  active?: boolean;
};

export type UpdateBusinessAutomationSettingsInput = Partial<
  Omit<BusinessAutomationSettings, 'company_id' | 'created_at' | 'updated_at'>
>;

type BusinessServiceInsert = CreateBusinessServiceInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

type BusinessResourceInsert = CreateBusinessResourceInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

type BusinessDatabase = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      business_services: {
        Row: BusinessService;
        Insert: BusinessServiceInsert;
        Update: Partial<BusinessServiceInsert>;
        Relationships: [];
      };
      business_resources: {
        Row: BusinessResource;
        Insert: BusinessResourceInsert;
        Update: Partial<BusinessResourceInsert>;
        Relationships: [];
      };
      business_hours: {
        Row: BusinessHour;
        Insert: Omit<BusinessHour, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<BusinessHour>;
        Relationships: [];
      };
      business_automation_settings: {
        Row: BusinessAutomationSettings;
        Insert: Partial<BusinessAutomationSettings> & { company_id: string };
        Update: Partial<BusinessAutomationSettings>;
        Relationships: [];
      };
      business_opportunities: {
        Row: BusinessOpportunity;
        Insert: Partial<BusinessOpportunity> & {
          company_id: string;
          opportunity_type: BusinessOpportunityType;
          fingerprint: string;
        };
        Update: Partial<BusinessOpportunity>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      business_available_slots: {
        Args: {
          _company_id: string;
          _service_id: string;
          _from: string;
          _to: string;
          _resource_id?: string | null;
        };
        Returns: AvailableSlot[];
      };
      business_book_appointment: {
        Args: {
          _company_id: string;
          _contact_id: string;
          _service_id: string;
          _resource_id: string;
          _starts_at: string;
          _booking_source?: string;
          _description?: string | null;
        };
        Returns: BusinessAppointment;
      };
      business_cancel_appointment: {
        Args: {
          _appointment_id: string;
          _reason?: string | null;
        };
        Returns: BusinessAppointment;
      };
      business_complete_appointment: {
        Args: {
          _appointment_id: string;
        };
        Returns: BusinessAppointment;
      };
      business_detect_opportunities: {
        Args: {
          _company_id?: string | null;
        };
        Returns: number;
      };
      business_metrics: {
        Args: {
          _company_id: string;
          _from?: string;
          _to?: string;
        };
        Returns: Json;
      };
      business_onboarding_status: {
        Args: {
          _company_id: string;
        };
        Returns: Json;
      };
      business_replace_hours: {
        Args: {
          _company_id: string;
          _hours: Json;
        };
        Returns: BusinessHour[];
      };
      business_set_resource_services: {
        Args: {
          _company_id: string;
          _resource_id: string;
          _service_ids: string[];
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const businessDb = supabase as unknown as SupabaseClient<BusinessDatabase>;

type ErrorLike = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export class BusinessAutomationError extends Error {
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;

  constructor(action: string, error: ErrorLike) {
    super(`${action}: ${error.message}`);
    this.name = 'BusinessAutomationError';
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;
  }
}

function throwIfError(action: string, error: ErrorLike | null): void {
  if (error) throw new BusinessAutomationError(action, error);
}

function requireData<T>(action: string, data: T | null, error: ErrorLike | null): T {
  throwIfError(action, error);
  if (data === null) {
    throw new BusinessAutomationError(action, {
      message: 'O banco não retornou os dados esperados.',
    });
  }
  return data;
}

function requireJsonRecord(action: string, value: Json): Record<string, Json | undefined> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new BusinessAutomationError(action, {
      message: 'O banco retornou um formato inválido.',
    });
  }
  return value;
}

function jsonNumber(record: Record<string, Json | undefined>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BusinessAutomationError('Validar resposta do banco', {
      message: `O campo ${key} não é numérico.`,
    });
  }
  return value;
}

function jsonBoolean(record: Record<string, Json | undefined>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new BusinessAutomationError('Validar resposta do banco', {
      message: `O campo ${key} não é booleano.`,
    });
  }
  return value;
}

export async function listBusinessServices(
  companyId: string,
  includeInactive = false,
): Promise<BusinessService[]> {
  let query = businessDb
    .from('business_services')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  return requireData('Listar serviços', data, error);
}

export async function createBusinessService(
  input: CreateBusinessServiceInput,
): Promise<BusinessService> {
  const { data, error } = await businessDb
    .from('business_services')
    .insert(input)
    .select('*')
    .single();
  return requireData('Criar serviço', data, error);
}

export async function updateBusinessService(
  companyId: string,
  serviceId: string,
  changes: UpdateBusinessServiceInput,
): Promise<BusinessService> {
  const { data, error } = await businessDb
    .from('business_services')
    .update(changes)
    .eq('company_id', companyId)
    .eq('id', serviceId)
    .select('*')
    .single();
  return requireData('Atualizar serviço', data, error);
}

export function archiveBusinessService(
  companyId: string,
  serviceId: string,
): Promise<BusinessService> {
  return updateBusinessService(companyId, serviceId, { active: false });
}

export async function listBusinessResources(
  companyId: string,
  includeInactive = false,
): Promise<BusinessResource[]> {
  let query = businessDb
    .from('business_resources')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  return requireData('Listar profissionais e recursos', data, error);
}

export async function createBusinessResource(
  input: CreateBusinessResourceInput,
): Promise<BusinessResource> {
  const { data, error } = await businessDb
    .from('business_resources')
    .insert(input)
    .select('*')
    .single();
  return requireData('Criar profissional ou recurso', data, error);
}

export async function updateBusinessResource(
  companyId: string,
  resourceId: string,
  changes: UpdateBusinessResourceInput,
): Promise<BusinessResource> {
  const { data, error } = await businessDb
    .from('business_resources')
    .update(changes)
    .eq('company_id', companyId)
    .eq('id', resourceId)
    .select('*')
    .single();
  return requireData('Atualizar profissional ou recurso', data, error);
}

export function archiveBusinessResource(
  companyId: string,
  resourceId: string,
): Promise<BusinessResource> {
  return updateBusinessResource(companyId, resourceId, { active: false });
}

export async function setBusinessResourceServices(
  companyId: string,
  resourceId: string,
  serviceIds: string[],
): Promise<void> {
  const { error } = await businessDb.rpc('business_set_resource_services', {
    _company_id: companyId,
    _resource_id: resourceId,
    _service_ids: serviceIds,
  });
  throwIfError('Vincular serviços ao profissional ou recurso', error);
}

export async function listBusinessHours(companyId: string): Promise<BusinessHour[]> {
  const { data, error } = await businessDb
    .from('business_hours')
    .select('*')
    .eq('company_id', companyId)
    .order('weekday')
    .order('opens_at');
  return requireData('Listar horários de funcionamento', data, error);
}

export async function replaceBusinessHours(
  companyId: string,
  hours: ReplaceBusinessHourInput[],
): Promise<BusinessHour[]> {
  const { data, error } = await businessDb.rpc('business_replace_hours', {
    _company_id: companyId,
    _hours: hours as unknown as Json,
  });
  return requireData('Salvar horários de funcionamento', data, error);
}

export async function getBusinessAutomationSettings(
  companyId: string,
): Promise<BusinessAutomationSettings> {
  const { data, error } = await businessDb
    .from('business_automation_settings')
    .select('*')
    .eq('company_id', companyId)
    .single();
  return requireData('Carregar configurações da automação', data, error);
}

export async function updateBusinessAutomationSettings(
  companyId: string,
  changes: UpdateBusinessAutomationSettingsInput,
): Promise<BusinessAutomationSettings> {
  const { data, error } = await businessDb
    .from('business_automation_settings')
    .upsert({ company_id: companyId, ...changes }, { onConflict: 'company_id' })
    .select('*')
    .single();
  return requireData('Salvar configurações da automação', data, error);
}

export async function getAvailableBusinessSlots(input: {
  companyId: string;
  serviceId: string;
  from: string;
  to: string;
  resourceId?: string | null;
}): Promise<AvailableSlot[]> {
  const { data, error } = await businessDb.rpc('business_available_slots', {
    _company_id: input.companyId,
    _service_id: input.serviceId,
    _from: input.from,
    _to: input.to,
    _resource_id: input.resourceId ?? null,
  });
  return requireData('Consultar horários disponíveis', data, error);
}

export async function bookBusinessAppointment(input: {
  companyId: string;
  contactId: string;
  serviceId: string;
  resourceId: string;
  startsAt: string;
  bookingSource?: string;
  description?: string | null;
}): Promise<BusinessAppointment> {
  const { data, error } = await businessDb.rpc('business_book_appointment', {
    _company_id: input.companyId,
    _contact_id: input.contactId,
    _service_id: input.serviceId,
    _resource_id: input.resourceId,
    _starts_at: input.startsAt,
    _booking_source: input.bookingSource ?? 'admin',
    _description: input.description ?? null,
  });
  return requireData('Criar agendamento', data, error);
}

export async function cancelBusinessAppointment(
  appointmentId: string,
  reason?: string | null,
): Promise<BusinessAppointment> {
  const { data, error } = await businessDb.rpc('business_cancel_appointment', {
    _appointment_id: appointmentId,
    _reason: reason ?? null,
  });
  return requireData('Cancelar agendamento', data, error);
}

export async function completeBusinessAppointment(
  appointmentId: string,
): Promise<BusinessAppointment> {
  const { data, error } = await businessDb.rpc('business_complete_appointment', {
    _appointment_id: appointmentId,
  });
  return requireData('Concluir agendamento', data, error);
}

export async function listBusinessOpportunities(
  companyId: string,
  statuses: BusinessOpportunityStatus[] = ['detected', 'queued', 'contacted'],
): Promise<BusinessOpportunity[]> {
  let query = businessDb
    .from('business_opportunities')
    .select('*')
    .eq('company_id', companyId)
    .order('score', { ascending: false })
    .order('detected_at', { ascending: false });
  if (statuses.length > 0) query = query.in('status', statuses);
  const { data, error } = await query;
  return requireData('Listar oportunidades', data, error);
}

export async function dismissBusinessOpportunity(
  companyId: string,
  opportunityId: string,
): Promise<BusinessOpportunity> {
  const { data, error } = await businessDb
    .from('business_opportunities')
    .update({ status: 'dismissed' })
    .eq('company_id', companyId)
    .eq('id', opportunityId)
    .select('*')
    .single();
  return requireData('Descartar oportunidade', data, error);
}

export async function runBusinessOpportunityScan(companyId: string): Promise<number> {
  const { data, error } = await businessDb.rpc('business_detect_opportunities', {
    _company_id: companyId,
  });
  return requireData('Detectar oportunidades', data, error);
}

export async function getBusinessMetrics(
  companyId: string,
  range?: { from?: string; to?: string },
): Promise<BusinessMetrics> {
  const { data, error } = await businessDb.rpc('business_metrics', {
    _company_id: companyId,
    ...(range?.from ? { _from: range.from } : {}),
    ...(range?.to ? { _to: range.to } : {}),
  });
  const record = requireJsonRecord(
    'Carregar métricas do negócio',
    requireData('Carregar métricas do negócio', data, error),
  );
  return {
    appointments: jsonNumber(record, 'appointments'),
    completed: jsonNumber(record, 'completed'),
    cancelled: jsonNumber(record, 'cancelled'),
    scheduled_revenue_cents: jsonNumber(record, 'scheduled_revenue_cents'),
    recovered_revenue_cents: jsonNumber(record, 'recovered_revenue_cents'),
    open_opportunities: jsonNumber(record, 'open_opportunities'),
    reactivated_customers: jsonNumber(record, 'reactivated_customers'),
  };
}

export async function getBusinessOnboardingStatus(
  companyId: string,
): Promise<BusinessOnboardingStatus> {
  const { data, error } = await businessDb.rpc('business_onboarding_status', {
    _company_id: companyId,
  });
  const record = requireJsonRecord(
    'Carregar status do onboarding',
    requireData('Carregar status do onboarding', data, error),
  );
  return {
    services_count: jsonNumber(record, 'services_count'),
    resources_count: jsonNumber(record, 'resources_count'),
    business_hours_count: jsonNumber(record, 'business_hours_count'),
    approved_templates_count: jsonNumber(record, 'approved_templates_count'),
    connected_whatsapp: jsonBoolean(record, 'connected_whatsapp'),
    booking_ready: jsonBoolean(record, 'booking_ready'),
    outreach_ready: jsonBoolean(record, 'outreach_ready'),
  };
}
