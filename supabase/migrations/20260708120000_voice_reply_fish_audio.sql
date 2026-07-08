-- Voz feminina de atendimento via Fish Audio TTS.
-- A chave da API fica em secret de Edge Function (FISH_AUDIO_API_KEY), nunca no banco.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS voice_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_reference_id TEXT;

COMMENT ON COLUMN public.channels.voice_reply_enabled IS 'Quando true, respostas automáticas da IA são enviadas também como áudio (voz feminina via Fish Audio).';
COMMENT ON COLUMN public.channels.voice_reference_id IS 'ID do modelo de voz da Fish Audio (reference_id). Vazio usa FISH_AUDIO_VOICE_ID do ambiente.';

CREATE OR REPLACE VIEW public.channel_public_view AS
SELECT
  id, company_id, type, provider, name, status, phone_number, phone_number_id, waba_id,
  verify_token, webhook_url, last_error, last_error_code, connected_at, last_sync_at,
  verified_name, quality_rating, ai_enabled, auto_reply_enabled, human_handoff_enabled,
  handoff_when_unknown, greeting_message, out_of_hours_message, business_hours,
  voice_reply_enabled, voice_reference_id,
  app_secret_present, created_at, updated_at
FROM public.channels;
GRANT SELECT ON public.channel_public_view TO authenticated;
