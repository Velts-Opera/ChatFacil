
-- Enum de roles
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'agent');

-- Empresas (tenants)
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  segment TEXT,
  phone TEXT,
  email TEXT,
  contact_name TEXT,
  business_hours TEXT,
  services_description TEXT,
  communication_tone TEXT DEFAULT 'profissional',
  plan TEXT NOT NULL DEFAULT 'start',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Perfis (1:1 auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Papéis
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, company_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helper: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Helper: company do usuário logado
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Contatos / CRM
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,
  funnel_stage TEXT DEFAULT 'novo',
  potential_value NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0B1E3F',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

-- Conversas
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'aberta',
  ai_handling BOOLEAN NOT NULL DEFAULT false,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Mensagens
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL DEFAULT 'agent',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Respostas rápidas
CREATE TABLE public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
GRANT ALL ON public.quick_replies TO service_role;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- RLS: escopo por company_id
CREATE POLICY "own company - select" ON public.companies FOR SELECT TO authenticated USING (id = public.get_user_company_id());
CREATE POLICY "own company - update" ON public.companies FOR UPDATE TO authenticated USING (id = public.get_user_company_id());
CREATE POLICY "own company - insert" ON public.companies FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "own profile - select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR company_id = public.get_user_company_id());
CREATE POLICY "own profile - update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile - insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "roles - select own company" ON public.user_roles FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());

CREATE POLICY "contacts - all own" ON public.contacts FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "tags - all own" ON public.tags FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "contact_tags - all own" ON public.contact_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.company_id = public.get_user_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.company_id = public.get_user_company_id()));

CREATE POLICY "conversations - all own" ON public.conversations FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "messages - all own" ON public.messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.company_id = public.get_user_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.company_id = public.get_user_company_id()));

CREATE POLICY "quick_replies - all own" ON public.quick_replies FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- Trigger: novo usuário -> cria profile, company e role owner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  c_name TEXT := COALESCE(meta->>'company_name', 'Minha empresa');
BEGIN
  INSERT INTO public.companies (owner_id, name, segment, phone, email, contact_name, business_hours, services_description, communication_tone)
  VALUES (
    NEW.id,
    c_name,
    meta->>'segment',
    meta->>'phone',
    NEW.email,
    COALESCE(meta->>'contact_name', NEW.email),
    meta->>'business_hours',
    meta->>'services_description',
    COALESCE(meta->>'communication_tone', 'profissional')
  )
  RETURNING id INTO new_company_id;

  INSERT INTO public.profiles (id, company_id, full_name, email)
  VALUES (NEW.id, new_company_id, COALESCE(meta->>'contact_name', NEW.email), NEW.email);

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, new_company_id, 'owner');

  -- Tags padrão
  INSERT INTO public.tags (company_id, name, color) VALUES
    (new_company_id, 'lead quente', '#EF4444'),
    (new_company_id, 'orçamento enviado', '#F59E0B'),
    (new_company_id, 'aguardando pagamento', '#8B5CF6'),
    (new_company_id, 'cliente ativo', '#16A34A'),
    (new_company_id, 'cliente inativo', '#64748B'),
    (new_company_id, 'suporte', '#0EA5E9'),
    (new_company_id, 'pós-venda', '#14B8A6');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger updated_at genérico
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_quick_replies_updated BEFORE UPDATE ON public.quick_replies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
