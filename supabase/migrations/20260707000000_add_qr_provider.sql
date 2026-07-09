-- Suporte ao provider QR Code no canal WhatsApp

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'meta_cloud_api',
  ADD COLUMN IF NOT EXISTS bridge_url TEXT DEFAULT 'http://localhost:3001';

-- Índice para buscar canais QR rapidamente
CREATE INDEX IF NOT EXISTS idx_channels_provider ON public.channels (provider);

COMMENT ON COLUMN public.channels.provider IS 'meta_cloud_api | qr_code';
COMMENT ON COLUMN public.channels.bridge_url IS 'URL do bridge server para provider qr_code';
