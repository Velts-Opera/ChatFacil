-- Etapa 2: toda empresa nasce com agente + canal WhatsApp (qr_code) prontos.

WITH ranked AS (
  SELECT id, company_id,
         row_number() OVER (
           PARTITION BY company_id
           ORDER BY (status='connected') DESC, updated_at DESC
         ) rn
  FROM public.channels WHERE provider='qr_code' AND type='whatsapp'
)
DELETE FROM public.channels ch
USING ranked r
WHERE ch.id = r.id AND r.rn > 1
  AND NOT EXISTS (SELECT 1 FROM public.conversations v WHERE v.channel_id = ch.id);

CREATE OR REPLACE FUNCTION public.seed_company_defaults(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.quick_replies (company_id, title, message, category)
  VALUES
    (_company_id, 'Saudação', 'Olá! Como posso te ajudar hoje?', 'atendimento'),
    (_company_id, 'Transferir para humano', 'Vou chamar uma pessoa da equipe para te ajudar melhor.', 'atendimento'),
    (_company_id, 'Fora do horário', 'Estamos fora do horário de atendimento, mas já recebemos sua mensagem.', 'atendimento')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.ai_knowledge_items (company_id, title, content)
  VALUES
    (_company_id, 'Regra de segurança', 'Responda apenas com base nas informações cadastradas. Se não souber, diga que vai transferir para um atendente humano.'),
    (_company_id, 'Tom de atendimento', 'Seja claro, educado, objetivo e comercial. Não prometa o que a empresa não cadastrou.')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.ai_agent_settings (company_id)
  VALUES (_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO public.channels (company_id, type, provider, name, status, ai_enabled, auto_reply_enabled)
  SELECT _company_id, 'whatsapp', 'qr_code', 'WhatsApp', 'disconnected', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.channels
    WHERE company_id = _company_id AND type = 'whatsapp' AND provider = 'qr_code'
  );
END;
$function$;

INSERT INTO public.channels (company_id, type, provider, name, status, ai_enabled, auto_reply_enabled)
SELECT c.id, 'whatsapp', 'qr_code', 'WhatsApp', 'disconnected', true, true
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.channels ch
  WHERE ch.company_id = c.id AND ch.type = 'whatsapp' AND ch.provider = 'qr_code'
);

INSERT INTO public.ai_agent_settings (company_id)
SELECT c.id FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.ai_agent_settings s WHERE s.company_id = c.id)
ON CONFLICT (company_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_channels_company_qr
  ON public.channels (company_id) WHERE provider = 'qr_code' AND type = 'whatsapp';
