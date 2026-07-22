-- Restaura a configuração de agente por empresa.
-- A migração original consta no histórico remoto, mas a tabela foi removida do schema.

CREATE TABLE IF NOT EXISTS public.ai_agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  agent_name TEXT NOT NULL DEFAULT 'Assistente',
  system_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'claude-sonnet-5',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.4
    CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER NOT NULL DEFAULT 1024
    CHECK (max_tokens > 0 AND max_tokens <= 32768),
  handoff_keywords TEXT[] NOT NULL DEFAULT ARRAY['humano', 'atendente', 'pessoa'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_agent_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_settings TO authenticated;
GRANT ALL ON public.ai_agent_settings TO service_role;

DROP POLICY IF EXISTS "ai agent settings - all own" ON public.ai_agent_settings;
CREATE POLICY "ai agent settings - all own"
  ON public.ai_agent_settings
  FOR ALL
  TO authenticated
  USING (company_id = (SELECT public.get_user_company_id()))
  WITH CHECK (company_id = (SELECT public.get_user_company_id()));

DROP TRIGGER IF EXISTS trg_ai_agent_settings_updated_at ON public.ai_agent_settings;
CREATE TRIGGER trg_ai_agent_settings_updated_at
  BEFORE UPDATE ON public.ai_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.ai_agent_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

-- A migração de agent_id criou colunas sem FKs quando esta tabela estava ausente.
-- Normaliza os vínculos antes de restaurar a integridade referencial.
UPDATE public.channels AS channel
SET agent_id = agent.id
FROM public.ai_agent_settings AS agent
WHERE agent.company_id = channel.company_id
  AND channel.agent_id IS DISTINCT FROM agent.id;

UPDATE public.messages AS message
SET agent_id = agent.id
FROM public.ai_agent_settings AS agent
WHERE agent.company_id = message.company_id
  AND message.agent_id IS DISTINCT FROM agent.id;

UPDATE public.ai_interactions AS interaction
SET agent_id = agent.id
FROM public.ai_agent_settings AS agent
WHERE agent.company_id = interaction.company_id
  AND interaction.agent_id IS DISTINCT FROM agent.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'channels_agent_id_fkey'
      AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES public.ai_agent_settings(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_agent_id_fkey'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES public.ai_agent_settings(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_interactions_agent_id_fkey'
      AND conrelid = 'public.ai_interactions'::regclass
  ) THEN
    ALTER TABLE public.ai_interactions
      ADD CONSTRAINT ai_interactions_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES public.ai_agent_settings(id) ON DELETE SET NULL;
  END IF;
END;
$$;
