ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.company_id
  FROM public.profiles p
  JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = auth.uid()
    AND (c.is_active OR public.is_super_admin());
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;

DROP POLICY IF EXISTS "super admin - select companies" ON public.companies;
CREATE POLICY "super admin - select companies" ON public.companies
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS "super admin - update companies" ON public.companies;
CREATE POLICY "super admin - update companies" ON public.companies
  FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "super admin - delete companies" ON public.companies;
CREATE POLICY "super admin - delete companies" ON public.companies
  FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'agendado',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_company_starts ON public.appointments(company_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON public.appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_created_by ON public.appointments(created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments - all own" ON public.appointments;
CREATE POLICY "appointments - all own" ON public.appointments
  FOR ALL TO authenticated
  USING (company_id = (SELECT public.get_user_company_id()))
  WITH CHECK (company_id = (SELECT public.get_user_company_id()));
DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.admin_enter_company(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador da plataforma pode trocar de empresa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;
  UPDATE public.profiles SET company_id = _company_id WHERE id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_enter_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_enter_company(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_company_overview()
RETURNS TABLE (
  id UUID, name TEXT, segment TEXT, plan TEXT, is_active BOOLEAN,
  contact_name TEXT, phone TEXT, email TEXT, created_at TIMESTAMPTZ,
  whatsapp_status TEXT, whatsapp_phone TEXT, ai_enabled BOOLEAN,
  has_prompt BOOLEAN, knowledge_count BIGINT, appointments_count BIGINT,
  contacts_count BIGINT, conversations_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.name, c.segment, c.plan, c.is_active, c.contact_name, c.phone, c.email, c.created_at,
    ch.status AS whatsapp_status, ch.phone_number AS whatsapp_phone,
    COALESCE(ag.is_enabled, false) AS ai_enabled,
    COALESCE(NULLIF(TRIM(ag.system_prompt), '') IS NOT NULL, false) AS has_prompt,
    (SELECT count(*) FROM public.ai_knowledge_items k WHERE k.company_id = c.id AND k.is_active) AS knowledge_count,
    (SELECT count(*) FROM public.appointments a WHERE a.company_id = c.id) AS appointments_count,
    (SELECT count(*) FROM public.contacts ct WHERE ct.company_id = c.id) AS contacts_count,
    (SELECT count(*) FROM public.conversations cv WHERE cv.company_id = c.id) AS conversations_count
  FROM public.companies c
  LEFT JOIN LATERAL (
    SELECT status, phone_number FROM public.channels
    WHERE company_id = c.id AND type = 'whatsapp'
    ORDER BY (status = 'connected') DESC, updated_at DESC LIMIT 1
  ) ch ON true
  LEFT JOIN public.ai_agent_settings ag ON ag.company_id = c.id
  WHERE public.is_super_admin()
  ORDER BY c.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_company_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_company_overview() TO authenticated;

NOTIFY pgrst, 'reload schema';
