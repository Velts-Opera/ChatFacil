-- ChatFacil AI Pro Backend hardening
-- Real WhatsApp Cloud API model, secure credential storage, AI auto-reply tables,
-- indexes and sane status defaults. This migration is additive and safe over the
-- Lovable-generated schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Normalize legacy conversation status created as "open" by the previous webhook.
UPDATE public.conversations SET status = 'aberta' WHERE status = 'open';
UPDATE public.conversations SET status = 'resolvida' WHERE status = 'closed';

-- ============ CHANNELS HARDENING ============
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta_cloud_api',
  ADD COLUMN IF NOT EXISTS app_id TEXT,
  ADD COLUMN IF NOT EXISTS app_secret_present BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_name TEXT,
  ADD COLUMN IF NOT EXISTS quality_rating TEXT,
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_handoff_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handoff_when_unknown BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS greeting_message TEXT DEFAULT 'Olá! Recebemos sua mensagem. Vou te ajudar por aqui.',
  ADD COLUMN IF NOT EXISTS out_of_hours_message TEXT DEFAULT 'Olá! Estamos fora do horário de atendimento. Já recebemos sua mensagem e responderemos assim que possível.',
  ADD COLUMN IF NOT EXISTS business_hours TEXT DEFAULT 'Segunda a sexta, 09:00 às 18:00',
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Important: credentials should not live in public.channels. Existing legacy values are
-- retained only until the next successful connection, then cleared by Edge Functions.
COMMENT ON COLUMN public.channels.access_token IS 'LEGACY ONLY. Do not read/use from frontend. New tokens live in channel_secrets, service_role-only.';

CREATE INDEX IF NOT EXISTS idx_channels_company_type_status ON public.channels(company_id, type, status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_phone_number_id ON public.channels(phone_number_id)
  WHERE phone_number_id IS NOT NULL AND type = 'whatsapp';

-- ============ SERVICE-ONLY CHANNEL SECRETS ============
CREATE TABLE IF NOT EXISTS public.channel_secrets (
  channel_id UUID PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  app_secret TEXT,
  token_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.channel_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.channel_secrets FROM anon, authenticated;
GRANT ALL ON public.channel_secrets TO service_role;

DROP TRIGGER IF EXISTS trg_channel_secrets_updated_at ON public.channel_secrets;
CREATE TRIGGER trg_channel_secrets_updated_at
  BEFORE UPDATE ON public.channel_secrets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CONTACTS / CONVERSATIONS / MESSAGES HARDENING ============
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wa_id TEXT,
  ADD COLUMN IF NOT EXISTS profile_name TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_contacts_company_channel_wa_id
  ON public.contacts(company_id, channel_id, wa_id)
  WHERE wa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_company_phone ON public.contacts(company_id, phone);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message TEXT,
  ADD COLUMN IF NOT EXISTS last_message_direction TEXT,
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_last_replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_conversation_company_channel_contact_open
  ON public.conversations(company_id, channel_id, contact_id)
  WHERE status <> 'resolvida';
CREATE INDEX IF NOT EXISTS idx_conversations_company_status_last ON public.conversations(company_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_channel_last ON public.conversations(channel_id, last_message_at DESC);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS meta_message_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_meta_message_id
  ON public.messages(meta_message_id)
  WHERE meta_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_company_channel_created ON public.messages(company_id, channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at ASC);

-- Existing messages policy scopes by conversation. Add a direct policy for service-compatible rows with company_id.
DROP POLICY IF EXISTS "messages - all own company direct" ON public.messages;
CREATE POLICY "messages - all own company direct" ON public.messages FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- ============ WEBHOOK EVENTS ============
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created ON public.webhook_events(status, created_at DESC);

-- ============ AI KNOWLEDGE / RUNS ============
CREATE TABLE IF NOT EXISTS public.ai_knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_company_active ON public.ai_knowledge_items(company_id, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_items TO authenticated;
GRANT ALL ON public.ai_knowledge_items TO service_role;
ALTER TABLE public.ai_knowledge_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai knowledge - all own" ON public.ai_knowledge_items;
CREATE POLICY "ai knowledge - all own" ON public.ai_knowledge_items FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());
DROP TRIGGER IF EXISTS trg_ai_knowledge_updated_at ON public.ai_knowledge_items;
CREATE TRIGGER trg_ai_knowledge_updated_at
  BEFORE UPDATE ON public.ai_knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  inbound_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  outbound_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'created',
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  input TEXT,
  output TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_company_created ON public.ai_interactions(company_id, created_at DESC);
GRANT SELECT ON public.ai_interactions TO authenticated;
GRANT ALL ON public.ai_interactions TO service_role;
ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai interactions - select own" ON public.ai_interactions;
CREATE POLICY "ai interactions - select own" ON public.ai_interactions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

-- ============ AUTOMATION RULES ============
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'keyword',
  keyword TEXT,
  response TEXT,
  add_tag TEXT,
  assign_to_human BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_company_active ON public.automation_rules(company_id, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_rules TO authenticated;
GRANT ALL ON public.automation_rules TO service_role;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automation rules - all own" ON public.automation_rules;
CREATE POLICY "automation rules - all own" ON public.automation_rules FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());
DROP TRIGGER IF EXISTS trg_automation_rules_updated_at ON public.automation_rules;
CREATE TRIGGER trg_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ SAFE VIEWS ============
CREATE OR REPLACE VIEW public.channel_public_view AS
SELECT
  id, company_id, type, provider, name, status, phone_number, phone_number_id, waba_id,
  verify_token, webhook_url, last_error, last_error_code, connected_at, last_sync_at,
  verified_name, quality_rating, ai_enabled, auto_reply_enabled, human_handoff_enabled,
  handoff_when_unknown, greeting_message, out_of_hours_message, business_hours,
  app_secret_present, created_at, updated_at
FROM public.channels;
GRANT SELECT ON public.channel_public_view TO authenticated;

-- ============ DEFAULT AI KNOWLEDGE SEED ON SIGNUP ============
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
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_company_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_company_defaults(uuid) TO service_role;

-- Enhance signup trigger to seed default quick replies/AI knowledge for future users.
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

  RETURN NEW;
END;
$$;
