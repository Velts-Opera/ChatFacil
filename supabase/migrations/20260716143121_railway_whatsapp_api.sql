-- Railway passa a ser a API oficial do WhatsApp QR/Baileys.
-- O vínculo do agente fica explícito e sempre limitado à empresa do canal.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.ai_agent_settings(id) ON DELETE SET NULL;

UPDATE public.channels AS channel
SET agent_id = agent.id
FROM public.ai_agent_settings AS agent
WHERE channel.agent_id IS NULL
  AND agent.company_id = channel.company_id;

CREATE INDEX IF NOT EXISTS idx_channels_company_agent
  ON public.channels(company_id, agent_id);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.ai_agent_settings(id) ON DELETE SET NULL;

ALTER TABLE public.ai_interactions
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.ai_agent_settings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_agent_created
  ON public.messages(agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_interactions_agent_created
  ON public.ai_interactions(agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_channel_agent_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.agent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.ai_agent_settings AS agent
    WHERE agent.id = NEW.agent_id
      AND agent.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'O agente do canal deve pertencer à mesma empresa.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channels_validate_agent_company ON public.channels;
CREATE TRIGGER trg_channels_validate_agent_company
  BEFORE INSERT OR UPDATE OF company_id, agent_id ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.validate_channel_agent_company();

ALTER TABLE public.channels DROP COLUMN IF EXISTS bridge_url;

CREATE OR REPLACE VIEW public.channel_public_view
WITH (security_invoker = true) AS
SELECT
  id, company_id, type, provider, name, status, phone_number, phone_number_id, waba_id,
  verify_token, webhook_url, last_error, last_error_code, connected_at, last_sync_at,
  verified_name, quality_rating, ai_enabled, auto_reply_enabled, human_handoff_enabled,
  handoff_when_unknown, greeting_message, out_of_hours_message, business_hours,
  app_secret_present, created_at, updated_at, agent_id
FROM public.channels;

GRANT SELECT ON public.channel_public_view TO authenticated;

COMMENT ON COLUMN public.channels.agent_id IS
  'Agente da mesma empresa usado por este canal; quando nulo, usa o agente padrão da empresa.';
