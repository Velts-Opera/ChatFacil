-- Extensões aditivas em tabelas existentes
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS normalized_name TEXT
  GENERATED ALWAYS AS (lower(public.unaccent_immutable(name))) STORED;
CREATE INDEX IF NOT EXISTS idx_contacts_normalized_name_trgm
  ON public.contacts USING gin (normalized_name extensions.gin_trgm_ops);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS matter_id UUID REFERENCES public.matters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lawyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'consulta',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS meeting_url TEXT,
  ADD COLUMN IF NOT EXISTS external_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS external_event_id TEXT,
  ADD COLUMN IF NOT EXISTS source_information TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED';

-- Duas reuniões simultâneas do mesmo advogado passam a ser impossíveis no banco.
-- `timestamptz + interval` é STABLE (depende do TimeZone), então não cabe em índice:
-- a proteção exige ends_at preenchido. A vertical jurídica sempre grava ends_at
-- a partir de law_firm_profiles.consultation_minutes.
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_double_booking;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_no_double_booking
  EXCLUDE USING gist (
    lawyer_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (lawyer_id IS NOT NULL AND ends_at IS NOT NULL AND status <> 'cancelado');

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_external_event
  ON public.appointments(company_id, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- RLS: mesmo contrato do resto do produto (company_id + get_user_company_id()).
DO $do$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'law_firm_profiles','contact_identities','intakes','intake_fields','matters',
    'matter_parties','matter_timeline','conflict_checks','legal_documents',
    'document_extractions','handoffs','voice_calls','email_threads','consents'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s - all own" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s - all own" ON public.%I FOR ALL TO authenticated '
      'USING (company_id = public.get_user_company_id()) '
      'WITH CHECK (company_id = public.get_user_company_id())', t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['law_firm_profiles','intakes','matters','handoffs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', t, t);
  END LOOP;
END $do$;
