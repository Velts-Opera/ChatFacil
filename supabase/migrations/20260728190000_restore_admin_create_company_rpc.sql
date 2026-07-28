-- Restore admin tenant provisioning RPCs if they were dropped by later schema changes.

CREATE OR REPLACE FUNCTION public.seed_company_defaults(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.seed_company_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_company_defaults(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_create_company(
  _name TEXT,
  _segment TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _contact_name TEXT DEFAULT NULL,
  _plan TEXT DEFAULT 'start'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador da plataforma pode cadastrar empresas';
  END IF;

  INSERT INTO public.companies (owner_id, name, segment, phone, email, contact_name, plan)
  VALUES (auth.uid(), _name, _segment, _phone, _email, COALESCE(_contact_name, _name), COALESCE(_plan, 'start'))
  RETURNING id INTO new_company_id;

  INSERT INTO public.tags (company_id, name, color) VALUES
    (new_company_id, 'lead quente', '#EF4444'),
    (new_company_id, 'orçamento enviado', '#F59E0B'),
    (new_company_id, 'aguardando pagamento', '#8B5CF6'),
    (new_company_id, 'cliente ativo', '#16A34A'),
    (new_company_id, 'cliente inativo', '#64748B'),
    (new_company_id, 'suporte', '#0EA5E9'),
    (new_company_id, 'pós-venda', '#14B8A6')
  ON CONFLICT DO NOTHING;

  PERFORM public.seed_company_defaults(new_company_id);

  RETURN new_company_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_company(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_company(text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';