-- Índices de suporte para as FKs restauradas em ai_agent_settings.
CREATE INDEX IF NOT EXISTS idx_channels_agent_id_fk
  ON public.channels(agent_id);

CREATE INDEX IF NOT EXISTS idx_messages_agent_id_fk
  ON public.messages(agent_id);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_agent_id_fk
  ON public.ai_interactions(agent_id);
