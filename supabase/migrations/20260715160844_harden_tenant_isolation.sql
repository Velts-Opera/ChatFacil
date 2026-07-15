-- Ensure the safe channel projection executes with the caller's RLS context.
-- Without security_invoker, a view owned by postgres can bypass channels RLS.
CREATE OR REPLACE VIEW public.channel_public_view
WITH (security_invoker = true) AS
SELECT
  id, company_id, type, provider, name, status, phone_number, phone_number_id, waba_id,
  verify_token, webhook_url, last_error, last_error_code, connected_at, last_sync_at,
  verified_name, quality_rating, ai_enabled, auto_reply_enabled, human_handoff_enabled,
  handoff_when_unknown, greeting_message, out_of_hours_message, business_hours,
  app_secret_present, created_at, updated_at
FROM public.channels;

REVOKE ALL ON public.channel_public_view FROM PUBLIC, anon;
GRANT SELECT ON public.channel_public_view TO authenticated;

-- This helper is not used by any RLS policy and its previous authenticated grant
-- allowed callers to probe roles belonging to arbitrary user IDs via PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM authenticated;

-- One-time links used by the official Meta Embedded Signup onboarding page.
-- The raw token is never stored; only its SHA-256 digest reaches the database.
CREATE TABLE IF NOT EXISTS public.whatsapp_onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorizing', 'completed', 'expired', 'error')),
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  waba_id TEXT,
  phone_number_id TEXT,
  last_error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_onboarding_company_created
  ON public.whatsapp_onboarding_sessions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_onboarding_pending_expiry
  ON public.whatsapp_onboarding_sessions(expires_at)
  WHERE status IN ('pending', 'authorizing');

ALTER TABLE public.whatsapp_onboarding_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_onboarding_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_onboarding_sessions TO service_role;

DROP TRIGGER IF EXISTS trg_whatsapp_onboarding_updated_at ON public.whatsapp_onboarding_sessions;
CREATE TRIGGER trg_whatsapp_onboarding_updated_at
  BEFORE UPDATE ON public.whatsapp_onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
