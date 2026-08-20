-- Phase 2: prevent retired QR/Evolution code from recreating unsupported channels.

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_supported_whatsapp_provider_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_supported_whatsapp_provider_check
  CHECK (type <> 'whatsapp' OR provider = 'meta_cloud_api');
