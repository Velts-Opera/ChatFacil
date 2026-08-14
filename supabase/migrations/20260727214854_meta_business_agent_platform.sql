-- Meta Business Agent Platform readiness for official WhatsApp Cloud API channels.
-- Keeps the first-party Meta agent state separate from ChatFacil's own AI agent.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS business_portfolio_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_business_agent_status TEXT NOT NULL DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS meta_business_agent_eligible BOOLEAN,
  ADD COLUMN IF NOT EXISTS meta_business_agent_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS meta_business_agent_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meta_business_agent_last_error TEXT,
  ADD COLUMN IF NOT EXISTS meta_business_agent_previous_ai_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS meta_business_agent_previous_auto_reply_enabled BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'channels_meta_business_agent_status_check'
      AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_meta_business_agent_status_check
      CHECK (meta_business_agent_status IN (
        'not_checked',
        'eligible',
        'ineligible',
        'terms_required',
        'onboarding',
        'configured',
        'enabled',
        'error'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_channels_meta_business_agent
  ON public.channels(company_id, meta_business_agent_status)
  WHERE provider = 'meta_cloud_api';

CREATE OR REPLACE VIEW public.channel_public_view
WITH (security_invoker = true) AS
SELECT
  id, company_id, type, provider, name, status, phone_number, phone_number_id, waba_id,
  verify_token, webhook_url, last_error, last_error_code, connected_at, last_sync_at,
  verified_name, quality_rating, ai_enabled, auto_reply_enabled, human_handoff_enabled,
  handoff_when_unknown, greeting_message, out_of_hours_message, business_hours,
  app_secret_present, created_at, updated_at, agent_id,
  business_portfolio_id,
  meta_business_agent_status,
  meta_business_agent_eligible,
  meta_business_agent_enabled,
  meta_business_agent_last_checked_at,
  meta_business_agent_last_error
FROM public.channels;

GRANT SELECT ON public.channel_public_view TO authenticated;

COMMENT ON COLUMN public.channels.business_portfolio_id IS
  'Meta Business Portfolio ID that owns the WABA, resolved from owner_business_info.';
COMMENT ON COLUMN public.channels.meta_business_agent_status IS
  'Lifecycle state of Meta Business Agent Platform for this official WhatsApp number.';
COMMENT ON COLUMN public.channels.meta_business_agent_enabled IS
  'True only when the native Meta Business Agent rollout is enabled; ChatFacil must not auto-reply in parallel.';
COMMENT ON COLUMN public.channels.meta_business_agent_previous_ai_enabled IS
  'Previous ChatFacil AI switch, restored when native Meta Business Agent rollout is disabled.';
COMMENT ON COLUMN public.channels.meta_business_agent_previous_auto_reply_enabled IS
  'Previous ChatFacil auto-reply switch, restored when native Meta Business Agent rollout is disabled.';
