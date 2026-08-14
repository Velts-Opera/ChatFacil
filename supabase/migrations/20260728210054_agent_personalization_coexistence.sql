ALTER TABLE public.ai_agent_settings
  ADD COLUMN IF NOT EXISTS profession TEXT NOT NULL DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS business_context TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS prompt_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prompt_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_system_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_takeover_minutes INTEGER NOT NULL DEFAULT 480;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_agent_settings_prompt_source_check') THEN
    ALTER TABLE public.ai_agent_settings ADD CONSTRAINT ai_agent_settings_prompt_source_check CHECK (prompt_source IN ('manual', 'ai_generated', 'system_locked'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_agent_settings_prompt_version_check') THEN
    ALTER TABLE public.ai_agent_settings ADD CONSTRAINT ai_agent_settings_prompt_version_check CHECK (prompt_version > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_agent_settings_human_takeover_minutes_check') THEN
    ALTER TABLE public.ai_agent_settings ADD CONSTRAINT ai_agent_settings_human_takeover_minutes_check CHECK (human_takeover_minutes BETWEEN 5 AND 10080);
  END IF;
END $$;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS connection_mode TEXT NOT NULL DEFAULT 'cloud_api',
  ADD COLUMN IF NOT EXISTS coexistence_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coexistence_last_echo_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coexistence_last_sync_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channels_connection_mode_check') THEN
    ALTER TABLE public.channels ADD CONSTRAINT channels_connection_mode_check CHECK (connection_mode IN ('cloud_api', 'coexistence'));
  END IF;
END $$;

ALTER TABLE public.whatsapp_onboarding_sessions
  ADD COLUMN IF NOT EXISTS connection_mode TEXT NOT NULL DEFAULT 'cloud_api';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_onboarding_sessions_connection_mode_check') THEN
    ALTER TABLE public.whatsapp_onboarding_sessions ADD CONSTRAINT whatsapp_onboarding_sessions_connection_mode_check CHECK (connection_mode IN ('cloud_api', 'coexistence'));
  END IF;
END $$;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS human_handling BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_last_replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_company_human_handling ON public.conversations(company_id, human_handling, ai_paused_until);
CREATE INDEX IF NOT EXISTS idx_channels_connection_mode ON public.channels(company_id, connection_mode, coexistence_active);

CREATE TABLE IF NOT EXISTS public.agent_profession_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', base_instructions TEXT NOT NULL,
  discovery_questions JSONB NOT NULL DEFAULT '[]'::jsonb, sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_profession_templates_questions_array_check CHECK (jsonb_typeof(discovery_questions) = 'array')
);
ALTER TABLE public.agent_profession_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.agent_profession_templates TO authenticated;
GRANT ALL ON public.agent_profession_templates TO service_role;
DROP POLICY IF EXISTS "profession templates - authenticated read active" ON public.agent_profession_templates;
CREATE POLICY "profession templates - authenticated read active" ON public.agent_profession_templates FOR SELECT TO authenticated USING (is_active = true);
DROP TRIGGER IF EXISTS trg_agent_profession_templates_updated_at ON public.agent_profession_templates;
CREATE TRIGGER trg_agent_profession_templates_updated_at BEFORE UPDATE ON public.agent_profession_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.agent_profession_templates (slug,name,description,base_instructions,discovery_questions,sort_order) VALUES
('geral','Negócio em geral','Atendimento, qualificação, vendas e encaminhamento humano.','Atenda com clareza e objetividade. Entenda a intenção antes de oferecer uma solução. Colete apenas os dados necessários, uma ou duas perguntas por vez. Use somente informações cadastradas. Nunca invente preço, prazo, política, estoque ou disponibilidade. Qualifique novos interessados, registre contexto comercial e transfira para uma pessoa quando o pedido exigir decisão humana ou informação ausente.','["O que sua empresa vende ou resolve?","Quem normalmente entra em contato?","Quais informações o agente deve coletar?","Quando ele deve chamar uma pessoa?","Qual tom de voz deve usar?"]'::jsonb,10),
('advocacia','Advocacia','Recepção, triagem administrativa, coleta de fatos e agenda para escritórios.','Atue como assistente de atendimento do escritório, sem se passar por advogado e sem substituir decisão profissional. Faça triagem administrativa, organize fatos, partes envolvidas, datas, documentos e urgências informadas. Nunca dê parecer conclusivo, prometa resultado, determine estratégia, prescrição ou prazo processual definitivo. Encaminhe questões jurídicas ao advogado. Para novos casos, colete informações progressivamente e sinalize possível conflito de partes para revisão humana.','["Quais áreas do direito o escritório atende?","Quais dados devem ser coletados de um novo caso?","Quais assuntos exigem advogado imediatamente?","Como funcionam consultas e horários?","Quais documentos são normalmente solicitados?"]'::jsonb,20),
('clinica_saude','Clínica / Saúde','Recepção, informações administrativas e agendamento, sem diagnóstico.','Atue como recepção administrativa. Informe serviços, horários, preparo e agenda somente com dados cadastrados. Não faça diagnóstico, prescrição, interpretação clínica definitiva ou substitua profissional de saúde. Ao identificar relato de urgência ou risco, interrompa a automação comercial e oriente a busca do atendimento de emergência apropriado conforme regras cadastradas, além de sinalizar a equipe.','["Quais especialidades e serviços são oferecidos?","Como funciona a agenda?","Quais informações podem ser dadas antes da consulta?","Quais situações devem ir direto para uma pessoa?","Qual linguagem a clínica prefere?"]'::jsonb,30),
('imobiliaria','Imobiliária','Qualificação de compra, venda e locação e marcação de visitas.','Identifique se o contato quer comprar, vender, alugar ou anunciar. Colete região, faixa de valor, tipo de imóvel, requisitos essenciais e prazo, sem repetir o que já foi informado. Recomende apenas imóveis cadastrados e não invente disponibilidade, preço, condições ou características. Conduza para visita ou atendimento do corretor quando houver aderência.','["Vocês trabalham com venda, locação ou ambos?","Quais dados qualificam um lead?","Como funcionam visitas?","Quais regiões atendem?","Quando transferir para um corretor?"]'::jsonb,40),
('restaurante','Restaurante','Cardápio, reservas, horários, pedidos e eventos.','Responda sobre cardápio, endereço, horários, reservas, eventos e políticas usando somente dados cadastrados. Confirme data, horário, quantidade de pessoas e nome antes de concluir reserva. Nunca invente disponibilidade, ingrediente, preço, restrição alimentar ou condição de entrega.','["O agente pode reservar mesas?","Quais dados são necessários para reserva?","Há delivery ou retirada?","Como tratar alergias e restrições?","Quais situações exigem atendimento humano?"]'::jsonb,50),
('estetica','Estética / Beleza','Qualificação de serviço, agenda e relacionamento.','Apresente serviços e organize agendamento com comunicação acolhedora e comercial. Não faça promessas médicas ou de resultado garantido. Colete objetivo do cliente, serviço de interesse, disponibilidade e informações administrativas necessárias. Valores, contraindicações e condições devem vir exclusivamente da base cadastrada.','["Quais serviços são oferecidos?","Como funciona a agenda?","O agente pode informar preços?","Que dados coletar antes de agendar?","Quando chamar a equipe?"]'::jsonb,60),
('contabilidade','Contabilidade','Triagem de demandas, documentos, prazos informados e relacionamento com clientes.','Identifique se é novo interessado ou cliente existente. Organize empresa, regime/serviço procurado, demanda, documentos e datas informadas. Não invente obrigação fiscal, interpretação legal, valor ou prazo. Questões técnicas e decisões devem ser encaminhadas ao profissional responsável.','["Quais serviços contábeis são atendidos?","Quais dados qualificam um novo cliente?","Quais documentos são solicitados?","Quais assuntos precisam de contador imediatamente?","Como funciona o agendamento?"]'::jsonb,70),
('oficina','Oficina / Automotivo','Triagem do veículo, orçamento preliminar e agenda.','Colete veículo, ano, motorização quando relevante, sintomas relatados, urgência e disponibilidade. Não diagnostique defeito como certeza sem inspeção e não invente preço, peça ou prazo. Organize orçamento/visita e encaminhe para técnico quando necessário.','["Quais serviços a oficina faz?","Que dados do veículo são obrigatórios?","Como funciona orçamento?","Como funciona agenda?","Quais problemas devem ir direto para a equipe?"]'::jsonb,80),
('ecommerce','Loja / E-commerce','Produtos, pré-venda, pedidos e pós-venda.','Ajude a encontrar produtos cadastrados, qualifique necessidade, responda políticas aprovadas e organize pós-venda. Nunca invente estoque, preço, prazo de entrega ou benefício de produto. Solicite dados de pedido somente quando necessários e encaminhe exceções para uma pessoa.','["Quais produtos/categorias vendem?","Como consultar pedido?","Quais políticas o agente pode responder?","Quais dados pedir no pós-venda?","Quando transferir para humano?"]'::jsonb,90),
('tecnologia_saas','Tecnologia / SaaS','Prospecção, qualificação, demonstração, venda e suporte inicial.','Atue de forma consultiva. Primeiro entenda operação, volume, dor, solução atual, urgência e autoridade de decisão. Demonstre valor usando apenas capacidades confirmadas do produto. Nunca prometa funcionalidade inexistente ou resultado garantido. Conduza o lead para um próximo passo concreto como demonstração, teste ou conversa comercial e faça follow-up respeitoso quando aplicável.','["Qual problema o produto resolve?","Quem é o cliente ideal?","Quais perguntas qualificam um lead?","Quais objeções aparecem com frequência?","Qual é o próximo passo desejado: demo, teste ou venda?"]'::jsonb,100)
ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, base_instructions=EXCLUDED.base_instructions, discovery_questions=EXCLUDED.discovery_questions, sort_order=EXCLUDED.sort_order, is_active=true, updated_at=now();
NOTIFY pgrst, 'reload schema';
