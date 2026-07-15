-- ChatFacil Multitenant Admin Panel
-- Super admin da plataforma gerencia várias empresas (tenants) num único sistema:
-- cadastrar, editar, ativar/desativar e entrar no ambiente de cada empresa.
-- Cada empresa mantém WhatsApp, agente IA, prompt, base de conhecimento, agenda,
-- conversas e automações totalmente isolados via RLS por company_id.

-- ============ SUPER ADMINS DA PLATAFORMA ============
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

DROP POLICY IF EXISTS "platform admins - see self" ON public.platform_admins;
CREATE POLICY "platform admins - see self" ON public.platform_admins
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Primeiro super admin da plataforma (se a conta já existir)
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'veltrani@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Se a conta ainda não existe, promove automaticamente no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_platform_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'veltrani@gmail.com' THEN
    INSERT INTO public.platform_admins (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_platform_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_platform_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_platform_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_platform_admin();

-- ============ EMPRESAS: ATIVAR / DESATIVAR ============
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Usuário de empresa desativada perde acesso ao ambiente (todas as RLS dependem
-- desta função). Super admin continua enxergando para poder gerenciar/reativar.
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

-- Super admin gerencia todas as empresas
DROP POLICY IF EXISTS "super admin - select companies" ON public.companies;
CREATE POLICY "super admin - select companies" ON public.companies
  FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "super admin - update companies" ON public.companies;
CREATE POLICY "super admin - update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super admin - delete companies" ON public.companies;
CREATE POLICY "super admin - delete companies" ON public.companies
  FOR DELETE TO authenticated USING (public.is_super_admin());

-- ============ AGENTE IA EXCLUSIVO POR EMPRESA ============
CREATE TABLE IF NOT EXISTS public.ai_agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  agent_name TEXT NOT NULL DEFAULT 'Assistente',
  system_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'claude-sonnet-5',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.4,
  max_tokens INTEGER NOT NULL DEFAULT 1024,
  handoff_keywords TEXT[] NOT NULL DEFAULT ARRAY['humano', 'atendente', 'pessoa'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_settings TO authenticated;
GRANT ALL ON public.ai_agent_settings TO service_role;
ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai agent settings - all own" ON public.ai_agent_settings;
CREATE POLICY "ai agent settings - all own" ON public.ai_agent_settings
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

DROP TRIGGER IF EXISTS trg_ai_agent_settings_updated_at ON public.ai_agent_settings;
CREATE TRIGGER trg_ai_agent_settings_updated_at
  BEFORE UPDATE ON public.ai_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Empresas existentes ganham o registro do agente
INSERT INTO public.ai_agent_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

-- ============ AGENDA EXCLUSIVA POR EMPRESA ============
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'agendado', -- agendado | confirmado | concluido | cancelado
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_company_starts ON public.appointments(company_id, starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments - all own" ON public.appointments;
CREATE POLICY "appointments - all own" ON public.appointments
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ SEED PADRÃO INCLUI AGENTE IA ============
CREATE OR REPLACE FUNCTION public.seed_company_defaults(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.quick_replies (company_id, title, message, category)
  VALUES
    (_company_id, 'Saudação', 'Olá! Como posso te ajudar hoje?', 'atendimento'),
    (_company_id, 'Transferir para humano', 'Vou chamar uma pessoa da equipe para te ajudar melhor.', 'atendimento'),
    (_company_id, 'Fora do horário', 'Estamos fora do horário de atendimento, mas já recebemos sua mensagem.', 'atendimento')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.ai_knowledge_items (company_id, title, content)
  VALUES
    (_company_id, 'Regra de segurança', 'Responda apenas com base nas informações cadastradas. Se não souber, diga que vai transferir para um atendente humano.'),
    (_company_id, 'Tom de atendimento', 'Seja claro, educado, objetivo e comercial. Não prometa o que a empresa não cadastrou.')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.ai_agent_settings (company_id)
  VALUES (_company_id)
  ON CONFLICT (company_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_company_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_company_defaults(uuid) TO service_role;

-- ============ RPCs DO PAINEL DO ADMINISTRADOR ============

-- Cadastrar empresa com ambiente completo (tags, respostas rápidas, base e agente IA)
CREATE OR REPLACE FUNCTION public.admin_create_company(
  _name TEXT,
  _segment TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _contact_name TEXT DEFAULT NULL,
  _plan TEXT DEFAULT 'start'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador da plataforma pode cadastrar empresas';
  END IF;

  INSERT INTO public.companies (owner_id, name, segment, phone, email, contact_name, plan)
  VALUES (auth.uid(), _name, _segment, _phone, _email, COALESCE(_contact_name, _name), COALESCE(_plan, 'start'))
  RETURNING id INTO new_company_id;

  INSERT INTO public.tags (company_id, name, color) VALUES
    (new_company_id, 'lead quente', '#EF4444'),
    (new_company_id, 'orçamento enviado', '#F59E0B'),
    (new_company_id, 'aguardando pagamento', '#8B5CF6'),
    (new_company_id, 'cliente ativo', '#16A34A'),
    (new_company_id, 'cliente inativo', '#64748B'),
    (new_company_id, 'suporte', '#0EA5E9'),
    (new_company_id, 'pós-venda', '#14B8A6')
  ON CONFLICT DO NOTHING;

  PERFORM public.seed_company_defaults(new_company_id);

  RETURN new_company_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_create_company(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_company(text, text, text, text, text, text) TO authenticated;

-- Entrar no ambiente de uma empresa (troca o contexto do super admin)
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

-- Visão geral de todas as empresas para o painel do administrador
CREATE OR REPLACE FUNCTION public.admin_company_overview()
RETURNS TABLE (
  id UUID,
  name TEXT,
  segment TEXT,
  plan TEXT,
  is_active BOOLEAN,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ,
  whatsapp_status TEXT,
  whatsapp_phone TEXT,
  ai_enabled BOOLEAN,
  has_prompt BOOLEAN,
  knowledge_count BIGINT,
  appointments_count BIGINT,
  contacts_count BIGINT,
  conversations_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.segment,
    c.plan,
    c.is_active,
    c.contact_name,
    c.phone,
    c.email,
    c.created_at,
    ch.status AS whatsapp_status,
    ch.phone_number AS whatsapp_phone,
    COALESCE(ag.is_enabled, false) AS ai_enabled,
    COALESCE(NULLIF(TRIM(ag.system_prompt), '') IS NOT NULL, false) AS has_prompt,
    (SELECT count(*) FROM public.ai_knowledge_items k WHERE k.company_id = c.id AND k.is_active) AS knowledge_count,
    (SELECT count(*) FROM public.appointments a WHERE a.company_id = c.id) AS appointments_count,
    (SELECT count(*) FROM public.contacts ct WHERE ct.company_id = c.id) AS contacts_count,
    (SELECT count(*) FROM public.conversations cv WHERE cv.company_id = c.id) AS conversations_count
  FROM public.companies c
  LEFT JOIN LATERAL (
    SELECT status, phone_number
    FROM public.channels
    WHERE company_id = c.id AND type = 'whatsapp'
    ORDER BY (status = 'connected') DESC, updated_at DESC
    LIMIT 1
  ) ch ON true
  LEFT JOIN public.ai_agent_settings ag ON ag.company_id = c.id
  WHERE public.is_super_admin()
  ORDER BY c.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_company_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_company_overview() TO authenticated;
