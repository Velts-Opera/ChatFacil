-- ChatFacil AI — production hardening layer
-- Adds encrypted secret columns, audit logs, WhatsApp templates, outbound queue,
-- rate limits and operational health tables. Additive and safe over prior MVP migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Secrets are encrypted by Edge Functions with APP_ENCRYPTION_KEY before storage.
ALTER TABLE public.channel_secrets
  ADD COLUMN IF NOT EXISTS access_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS app_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS encryption_version TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.channel_secrets ALTER COLUMN access_token DROP NOT NULL;

COMMENT ON COLUMN public.channel_secrets.access_token IS 'LEGACY fallback only. New connections use access_token_enc encrypted by APP_ENCRYPTION_KEY.';
COMMENT ON COLUMN public.channel_secrets.access_token_enc IS 'AES-GCM encrypted WhatsApp Cloud API access token. Edge Functions only.';
COMMENT ON COLUMN public.channel_secrets.app_secret_enc IS 'AES-GCM encrypted Meta app secret. Edge Functions only.';

-- Admin audit trail.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON public.audit_logs(company_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit logs - select own" ON public.audit_logs;
CREATE POLICY "audit logs - select own" ON public.audit_logs FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

-- WhatsApp template catalog synced from Meta.
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  meta_template_id TEXT,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT,
  status TEXT,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, name, language)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_company_status ON public.whatsapp_templates(company_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whatsapp templates - all own" ON public.whatsapp_templates;
CREATE POLICY "whatsapp templates - all own" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());
DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER trg_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Durable outbound queue. Sends can be immediate or queued for retry.
CREATE TABLE IF NOT EXISTS public.outbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  to_phone TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  sent_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_due ON public.outbound_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_company_created ON public.outbound_queue(company_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_queue TO authenticated;
GRANT ALL ON public.outbound_queue TO service_role;
ALTER TABLE public.outbound_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "outbound queue - all own" ON public.outbound_queue;
CREATE POLICY "outbound queue - all own" ON public.outbound_queue FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());
DROP TRIGGER IF EXISTS trg_outbound_queue_updated_at ON public.outbound_queue;
CREATE TRIGGER trg_outbound_queue_updated_at
  BEFORE UPDATE ON public.outbound_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Rate limit buckets controlled by Edge Functions.
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, bucket_key, window_start)
);
GRANT ALL ON public.rate_limit_buckets TO service_role;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_buckets FROM anon, authenticated;

-- Operational health snapshots for admin/debug UI.
CREATE TABLE IF NOT EXISTS public.integration_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_health_channel_created ON public.integration_health_checks(channel_id, created_at DESC);
GRANT SELECT ON public.integration_health_checks TO authenticated;
GRANT ALL ON public.integration_health_checks TO service_role;
ALTER TABLE public.integration_health_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "health checks - select own" ON public.integration_health_checks;
CREATE POLICY "health checks - select own" ON public.integration_health_checks FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

-- Internal notes for human handoff.
CREATE TABLE IF NOT EXISTS public.conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation_created ON public.conversation_notes(conversation_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_notes TO authenticated;
GRANT ALL ON public.conversation_notes TO service_role;
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversation notes - all own" ON public.conversation_notes;
CREATE POLICY "conversation notes - all own" ON public.conversation_notes FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- Local builder for simple no-code automations, preserving old keyword table.
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;

-- Make channel_public_view expose only safe fields and production flags.
CREATE OR REPLACE VIEW public.channel_public_view AS
SELECT
  id, company_id, type, provider, name, status, phone_number, phone_number_id, waba_id,
  verify_token, webhook_url, last_error, last_error_code, connected_at, last_sync_at,
  verified_name, quality_rating, ai_enabled, auto_reply_enabled, human_handoff_enabled,
  handoff_when_unknown, greeting_message, out_of_hours_message, business_hours,
  app_secret_present, created_at, updated_at
FROM public.channels;
GRANT SELECT ON public.channel_public_view TO authenticated;
