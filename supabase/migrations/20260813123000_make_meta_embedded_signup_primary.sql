-- A API oficial da Meta passa a ser o único fluxo provisionado para novos clientes.
-- O canal é criado somente depois que o proprietário autoriza o número pelo
-- WhatsApp Embedded Signup; não criamos mais sessões QR/Baileys por padrão.

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
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.seed_company_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_company_defaults(uuid) TO service_role;

COMMENT ON FUNCTION public.seed_company_defaults(uuid) IS
  'Provisiona dados iniciais do tenant. O canal WhatsApp oficial é criado após o Embedded Signup da Meta.';
