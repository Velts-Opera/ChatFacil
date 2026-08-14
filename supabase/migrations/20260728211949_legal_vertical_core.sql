-- Vertical Jurídica: extensão ADITIVA sobre companies/contacts/conversations/
-- messages/channels/appointments. Nada existente é recriado.
-- Extensões vivem no schema `extensions` (padrão Supabase), por isso tudo é qualificado.

CREATE OR REPLACE FUNCTION public.unaccent_immutable(TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = extensions, public AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

CREATE TABLE IF NOT EXISTS public.law_firm_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  responsible_lawyer_name TEXT,
  oab_number TEXT,
  oab_uf CHAR(2),
  address TEXT,
  website TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  practice_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  consultation_minutes INTEGER NOT NULL DEFAULT 45,
  buffer_minutes INTEGER NOT NULL DEFAULT 15,
  meeting_modes TEXT[] NOT NULL DEFAULT ARRAY['presencial','online'],
  disclose_virtual_assistant BOOLEAN NOT NULL DEFAULT true,
  scoring_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_identities_contact ON public.contact_identities(contact_id);

CREATE TABLE IF NOT EXISTS public.intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN (
    'NEW','COLLECTING','WAITING_DOCUMENTS','READY_FOR_REVIEW','CONFLICT_REVIEW',
    'URGENT','ACCEPTED','DECLINED','SCHEDULED','CLIENT','CLOSED')),
  practice_area TEXT,
  urgency TEXT NOT NULL DEFAULT 'NORMAL' CHECK (urgency IN ('NORMAL','ALTA','CRITICA')),
  mentioned_deadline TEXT,
  legal_deadline_status TEXT NOT NULL DEFAULT 'NOT_MENTIONED'
    CHECK (legal_deadline_status IN ('NOT_MENTIONED','REQUIRES_LAWYER_REVIEW','REVIEWED')),
  conflict_status TEXT NOT NULL DEFAULT 'SEM_CONFLITO'
    CHECK (conflict_status IN ('SEM_CONFLITO','CONFLITO_POTENCIAL','LIBERADO_PELO_ADVOGADO','IMPEDIDO')),
  lead_priority TEXT CHECK (lead_priority IN
    ('PRIORIDADE_ALTA','PRIORIDADE_NORMAL','PRECISA_REVISAO','FORA_DO_ESCOPO')),
  lead_score INTEGER,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intakes_company_status ON public.intakes(company_id, status);
CREATE INDEX IF NOT EXISTS idx_intakes_conversation ON public.intakes(conversation_id);

CREATE TABLE IF NOT EXISTS public.intake_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  intake_id UUID NOT NULL REFERENCES public.intakes(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value JSONB,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  source_document_id UUID,
  confidence NUMERIC(3,2),
  verified_by_human BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (intake_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_intake_fields_company ON public.intake_fields(company_id);

CREATE TABLE IF NOT EXISTS public.matters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  intake_id UUID REFERENCES public.intakes(id) ON DELETE SET NULL,
  responsible_lawyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  practice_area TEXT,
  status TEXT NOT NULL DEFAULT 'NOVO' CHECK (status IN
    ('NOVO','TRIAGEM','CONSULTA','ANALISE','PROPOSTA','CLIENTE','CASO_ATIVO','ENCERRADO')),
  court TEXT, court_number TEXT, jurisdiction TEXT,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','ALTA','CRITICA')),
  origin TEXT,
  conflict_status TEXT NOT NULL DEFAULT 'SEM_CONFLITO',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matters_company_status ON public.matters(company_id, status);

CREATE TABLE IF NOT EXISTS public.matter_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  matter_id UUID REFERENCES public.matters(id) ON DELETE CASCADE,
  intake_id UUID REFERENCES public.intakes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CLIENT','OPPOSING','OTHER')),
  document TEXT,
  normalized_name TEXT GENERATED ALWAYS AS (lower(public.unaccent_immutable(name))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matter_parties_company ON public.matter_parties(company_id);
CREATE INDEX IF NOT EXISTS idx_matter_parties_name_trgm
  ON public.matter_parties USING gin (normalized_name extensions.gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.matter_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matter_timeline_matter
  ON public.matter_timeline(company_id, matter_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.conflict_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  intake_id UUID REFERENCES public.intakes(id) ON DELETE CASCADE,
  input_names JSONB NOT NULL,
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_company ON public.conflict_checks(company_id);

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  matter_id UUID REFERENCES public.matters(id) ON DELETE SET NULL,
  intake_id UUID REFERENCES public.intakes(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  filename TEXT, mime_type TEXT, size_bytes BIGINT,
  safety_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (safety_status IN ('pending','clean','rejected')),
  extracted_text TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_documents_company ON public.legal_documents(company_id);

CREATE TABLE IF NOT EXISTS public.document_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value TEXT,
  confidence NUMERIC(3,2),
  verified_by_human BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_extractions_company ON public.document_extractions(company_id);

CREATE TABLE IF NOT EXISTS public.handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  intake_id UUID REFERENCES public.intakes(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'LAWYER_APPROVAL'
    CHECK (tier IN ('SAFE_AUTO','CONFIRM_CLIENT','LAWYER_APPROVAL')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','done')),
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_handoffs_company_status ON public.handoffs(company_id, status);

CREATE TABLE IF NOT EXISTS public.voice_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  intake_id UUID REFERENCES public.intakes(id) ON DELETE SET NULL,
  external_call_id TEXT,
  duration_seconds INTEGER,
  transcript TEXT, summary TEXT, intent TEXT,
  recording_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, external_call_id)
);
CREATE INDEX IF NOT EXISTS idx_voice_calls_company ON public.voice_calls(company_id);

CREATE TABLE IF NOT EXISTS public.email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  external_thread_id TEXT,
  subject TEXT,
  classification TEXT CHECK (classification IN
    ('NOVO_LEAD','CLIENTE','TRIBUNAL','PARTE_CONTRARIA','DOCUMENTO',
     'FINANCEIRO','ADMINISTRATIVO','SPAM','PRECISA_ADVOGADO')),
  requires_lawyer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, external_thread_id)
);
CREATE INDEX IF NOT EXISTS idx_email_threads_company ON public.email_threads(company_id);

CREATE TABLE IF NOT EXISTS public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  legal_basis TEXT,
  channel TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_consents_contact ON public.consents(company_id, contact_id);
