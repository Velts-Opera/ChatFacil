CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.business_can_access_company(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT current_user IN ('postgres','service_role')
 OR COALESCE(current_setting('request.jwt.claim.role',true),'')='service_role'
 OR _company_id=public.get_user_company_id()
 OR public.is_super_admin();
$$;
REVOKE EXECUTE ON FUNCTION public.business_can_access_company(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_can_access_company(uuid) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.business_services(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 name text NOT NULL, description text, duration_minutes integer NOT NULL DEFAULT 30 CHECK(duration_minutes BETWEEN 5 AND 720),
 price_cents integer NOT NULL DEFAULT 0 CHECK(price_cents>=0), recurrence_days integer CHECK(recurrence_days BETWEEN 1 AND 730),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS uniq_business_services_company_name ON public.business_services(company_id,lower(name));
CREATE INDEX IF NOT EXISTS idx_business_services_company_active ON public.business_services(company_id,active);
ALTER TABLE public.business_services ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.business_services TO authenticated; GRANT ALL ON public.business_services TO service_role;
DROP POLICY IF EXISTS "business services own" ON public.business_services;
CREATE POLICY "business services own" ON public.business_services FOR ALL TO authenticated USING(public.business_can_access_company(company_id)) WITH CHECK(public.business_can_access_company(company_id));
DROP TRIGGER IF EXISTS trg_business_services_updated_at ON public.business_services;
CREATE TRIGGER trg_business_services_updated_at BEFORE UPDATE ON public.business_services FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.business_resources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL DEFAULT 'professional', active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS uniq_business_resources_company_name ON public.business_resources(company_id,lower(name));
ALTER TABLE public.business_resources ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.business_resources TO authenticated; GRANT ALL ON public.business_resources TO service_role;
DROP POLICY IF EXISTS "business resources own" ON public.business_resources;
CREATE POLICY "business resources own" ON public.business_resources FOR ALL TO authenticated USING(public.business_can_access_company(company_id)) WITH CHECK(public.business_can_access_company(company_id));
DROP TRIGGER IF EXISTS trg_business_resources_updated_at ON public.business_resources;
CREATE TRIGGER trg_business_resources_updated_at BEFORE UPDATE ON public.business_resources FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.business_resource_services(
 resource_id uuid NOT NULL REFERENCES public.business_resources(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES public.business_services(id) ON DELETE CASCADE, PRIMARY KEY(resource_id,service_id));
ALTER TABLE public.business_resource_services ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.business_resource_services TO authenticated; GRANT ALL ON public.business_resource_services TO service_role;
DROP POLICY IF EXISTS "business resource services own" ON public.business_resource_services;
CREATE POLICY "business resource services own" ON public.business_resource_services FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.business_resources r WHERE r.id=resource_id AND public.business_can_access_company(r.company_id)))
 WITH CHECK(EXISTS(SELECT 1 FROM public.business_resources r WHERE r.id=resource_id AND public.business_can_access_company(r.company_id)));

CREATE TABLE IF NOT EXISTS public.business_hours(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6), opens_at time NOT NULL, closes_at time NOT NULL,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(closes_at>opens_at), UNIQUE(company_id,weekday,opens_at,closes_at));
CREATE INDEX IF NOT EXISTS idx_business_hours_company_weekday ON public.business_hours(company_id,weekday,active);
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.business_hours TO authenticated; GRANT ALL ON public.business_hours TO service_role;
DROP POLICY IF EXISTS "business hours own" ON public.business_hours;
CREATE POLICY "business hours own" ON public.business_hours FOR ALL TO authenticated USING(public.business_can_access_company(company_id)) WITH CHECK(public.business_can_access_company(company_id));
DROP TRIGGER IF EXISTS trg_business_hours_updated_at ON public.business_hours;
CREATE TRIGGER trg_business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.business_automation_settings(
 company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE, timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
 slot_interval_minutes integer NOT NULL DEFAULT 15 CHECK(slot_interval_minutes BETWEEN 5 AND 120),
 minimum_lead_minutes integer NOT NULL DEFAULT 60 CHECK(minimum_lead_minutes BETWEEN 0 AND 10080),
 booking_horizon_days integer NOT NULL DEFAULT 60 CHECK(booking_horizon_days BETWEEN 1 AND 365),
 inactive_after_days integer NOT NULL DEFAULT 30 CHECK(inactive_after_days BETWEEN 1 AND 730),
 reactivation_enabled boolean NOT NULL DEFAULT false, empty_slot_enabled boolean NOT NULL DEFAULT false, reminders_enabled boolean NOT NULL DEFAULT true,
 reactivation_template_name text, empty_slot_template_name text, reminder_template_name text, template_language text NOT NULL DEFAULT 'pt_BR',
 max_daily_outreach integer NOT NULL DEFAULT 20 CHECK(max_daily_outreach BETWEEN 1 AND 500),
 max_contacts_per_slot integer NOT NULL DEFAULT 3 CHECK(max_contacts_per_slot BETWEEN 1 AND 20),
 lookahead_days integer NOT NULL DEFAULT 3 CHECK(lookahead_days BETWEEN 1 AND 14),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.business_automation_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.business_automation_settings TO authenticated; GRANT ALL ON public.business_automation_settings TO service_role;
DROP POLICY IF EXISTS "business automation settings own" ON public.business_automation_settings;
CREATE POLICY "business automation settings own" ON public.business_automation_settings FOR ALL TO authenticated USING(public.business_can_access_company(company_id)) WITH CHECK(public.business_can_access_company(company_id));
DROP TRIGGER IF EXISTS trg_business_automation_settings_updated_at ON public.business_automation_settings;
CREATE TRIGGER trg_business_automation_settings_updated_at BEFORE UPDATE ON public.business_automation_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.business_services(id) ON DELETE SET NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.business_resources(id) ON DELETE SET NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS booking_source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS no_show_at timestamptz;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS reminder_2h_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_appointments_company_resource_time ON public.appointments(company_id,resource_id,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_status_time ON public.appointments(contact_id,status,starts_at DESC);

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS automation_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_service_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS expected_return_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lifetime_value_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_reactivation_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS reactivation_attempts integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_contacts_company_expected_return ON public.contacts(company_id,expected_return_at) WHERE automation_opt_out=false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS automation_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.business_opportunities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 opportunity_type text NOT NULL CHECK(opportunity_type IN('inactive_customer','empty_slot','appointment_reminder')),
 contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE, service_id uuid REFERENCES public.business_services(id) ON DELETE SET NULL,
 resource_id uuid REFERENCES public.business_resources(id) ON DELETE SET NULL, appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
 slot_start timestamptz, slot_end timestamptz, score numeric(8,2) NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'detected' CHECK(status IN('detected','queued','contacted','converted','dismissed','failed')),
 fingerprint text NOT NULL UNIQUE, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 detected_at timestamptz NOT NULL DEFAULT now(), queued_at timestamptz, contacted_at timestamptz, converted_at timestamptz,
 converted_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_business_opportunities_company_status ON public.business_opportunities(company_id,status,detected_at DESC);
ALTER TABLE public.business_opportunities ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.business_opportunities TO authenticated; GRANT ALL ON public.business_opportunities TO service_role;
DROP POLICY IF EXISTS "business opportunities own" ON public.business_opportunities;
CREATE POLICY "business opportunities own" ON public.business_opportunities FOR ALL TO authenticated USING(public.business_can_access_company(company_id)) WITH CHECK(public.business_can_access_company(company_id));
DROP TRIGGER IF EXISTS trg_business_opportunities_updated_at ON public.business_opportunities;
CREATE TRIGGER trg_business_opportunities_updated_at BEFORE UPDATE ON public.business_opportunities FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.outbound_queue ADD COLUMN IF NOT EXISTS business_opportunity_id uuid REFERENCES public.business_opportunities(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_outbound_queue_business_opportunity ON public.outbound_queue(business_opportunity_id) WHERE business_opportunity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.internal_worker_tokens(token_hash text PRIMARY KEY,name text NOT NULL,enabled boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),last_used_at timestamptz);
ALTER TABLE public.internal_worker_tokens ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.internal_worker_tokens FROM PUBLIC,anon,authenticated; GRANT ALL ON public.internal_worker_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.seed_business_defaults(_company_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.business_automation_settings(company_id) VALUES(_company_id) ON CONFLICT(company_id) DO NOTHING;
 INSERT INTO public.business_resources(company_id,name,kind) VALUES(_company_id,'Atendimento','professional') ON CONFLICT DO NOTHING;
 INSERT INTO public.business_hours(company_id,weekday,opens_at,closes_at) SELECT _company_id,d,time '09:00',time '18:00' FROM generate_series(1,5)d ON CONFLICT DO NOTHING;
END;$$;
REVOKE EXECUTE ON FUNCTION public.seed_business_defaults(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.seed_business_defaults(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.tg_seed_business_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.seed_business_defaults(NEW.id); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_companies_seed_business_defaults ON public.companies;
CREATE TRIGGER trg_companies_seed_business_defaults AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.tg_seed_business_defaults();
SELECT public.seed_business_defaults(id) FROM public.companies;
