-- Keep every QR WhatsApp channel explicitly linked to the agent that belongs
-- to the same tenant. The runtime also validates company_id, but persisting
-- this relationship removes ambiguity during onboarding and reconnection.
UPDATE public.channels AS channel
SET
  agent_id = agent.id,
  updated_at = now()
FROM public.ai_agent_settings AS agent
WHERE channel.provider = 'qr_code'
  AND channel.agent_id IS NULL
  AND agent.company_id = channel.company_id;
