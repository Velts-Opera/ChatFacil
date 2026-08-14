-- FIX: _shared/ai.ts e _shared/gateway.ts consultam public.integration_settings,
-- mas nenhuma migration a criava. maybeSingle() engolia o erro e todo tenant caía
-- no fallback da env var — a chave Gemini/gateway por empresa nunca era usada.
CREATE TABLE IF NOT EXISTS public.integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  gemini_api_key_enc TEXT,
  gemini_key_hint TEXT,
  gemini_model TEXT,
  gateway_url TEXT,
  gateway_key_enc TEXT,
  gateway_key_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_settings_company
  ON public.integration_settings(company_id);

-- Ciphertext nunca chega ao browser: só service_role lê a tabela.
REVOKE ALL ON public.integration_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_settings TO service_role;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_integration_settings_updated_at ON public.integration_settings;
CREATE TRIGGER trg_integration_settings_updated_at
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Projeção segura para o painel: só os hints, nunca o ciphertext.
CREATE OR REPLACE VIEW public.integration_settings_public_view
WITH (security_invoker = true) AS
SELECT
  company_id,
  gemini_key_hint,
  gemini_model,
  gateway_url,
  gateway_key_hint,
  (gemini_api_key_enc IS NOT NULL) AS gemini_key_present,
  (gateway_key_enc IS NOT NULL) AS gateway_key_present,
  updated_at
FROM public.integration_settings
WHERE company_id = public.get_user_company_id();

REVOKE ALL ON public.integration_settings_public_view FROM PUBLIC, anon;
GRANT SELECT ON public.integration_settings_public_view TO authenticated;
