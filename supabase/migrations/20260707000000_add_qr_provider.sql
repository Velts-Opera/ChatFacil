-- Suporte ao provider QR Code no canal WhatsApp

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'meta_cloud_api';

-- Índice para buscar canais QR rapidamente
CREATE INDEX IF NOT EXISTS idx_channels_provider ON public.channels (provider);

COMMENT ON COLUMN public.channels.provider IS 'meta_cloud_api | qr_code';
