-- Configuração do bridge de WhatsApp: linha única, acessível apenas via service role.
-- O bridge (Railway) e as Edge Functions leem daqui — nenhum secret manual é necessário.
CREATE TABLE IF NOT EXISTS public.bridge_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bridge_url text NOT NULL,
  bridge_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bridge_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bridge_settings FROM anon, authenticated;

-- Gera um segredo forte na primeira instalação; ajuste bridge_url para a URL
-- pública do seu bridge (Railway/Render/VPS).
INSERT INTO public.bridge_settings (id, bridge_url, bridge_secret)
VALUES (1, 'https://chatfacil-production.up.railway.app', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;
