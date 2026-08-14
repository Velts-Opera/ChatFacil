CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

ALTER TABLE public.outbound_queue
  ADD COLUMN IF NOT EXISTS source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_outbound_queue_source_message
  ON public.outbound_queue(source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.internal_worker_secrets(
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_worker_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_worker_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.internal_worker_secrets TO service_role;

CREATE OR REPLACE FUNCTION public.business_normalize_text(_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,extensions AS $$
  SELECT trim(regexp_replace(lower(extensions.unaccent(COALESCE(_value,''))), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.business_parse_local_date(_value text, _timezone text DEFAULT 'America/Sao_Paulo')
RETURNS date LANGUAGE plpgsql STABLE SET search_path=public,extensions AS $$
DECLARE
  normalized text := public.business_normalize_text(_value);
  local_today date := (now() AT TIME ZONE COALESCE(NULLIF(_timezone,''),'America/Sao_Paulo'))::date;
  parts text[];
  day_value integer;
  month_value integer;
  year_value integer;
  target_dow integer;
  delta integer;
BEGIN
  IF normalized ~ 'depois de amanha' THEN RETURN local_today + 2; END IF;
  IF normalized ~ '(^|\W)amanha(\W|$)' THEN RETURN local_today + 1; END IF;
  IF normalized ~ '(^|\W)hoje(\W|$)' THEN RETURN local_today; END IF;

  parts := regexp_match(normalized, '(^|\D)([0-3]?\d)[/-]([01]?\d)(?:[/-](\d{2,4}))?(\D|$)');
  IF parts IS NOT NULL THEN
    day_value := parts[2]::integer;
    month_value := parts[3]::integer;
    year_value := CASE
      WHEN parts[4] IS NULL THEN extract(year FROM local_today)::integer
      WHEN length(parts[4]) = 2 THEN 2000 + parts[4]::integer
      ELSE parts[4]::integer
    END;
    BEGIN
      IF make_date(year_value, month_value, day_value) < local_today AND parts[4] IS NULL THEN
        RETURN make_date(year_value + 1, month_value, day_value);
      END IF;
      RETURN make_date(year_value, month_value, day_value);
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END IF;

  target_dow := CASE
    WHEN normalized ~ '(^|\W)domingo(\W|$)' THEN 0
    WHEN normalized ~ '(^|\W)segunda( feira)?(\W|$)' THEN 1
    WHEN normalized ~ '(^|\W)terca( feira)?(\W|$)' THEN 2
    WHEN normalized ~ '(^|\W)quarta( feira)?(\W|$)' THEN 3
    WHEN normalized ~ '(^|\W)quinta( feira)?(\W|$)' THEN 4
    WHEN normalized ~ '(^|\W)sexta( feira)?(\W|$)' THEN 5
    WHEN normalized ~ '(^|\W)sabado(\W|$)' THEN 6
    ELSE NULL
  END;
  IF target_dow IS NOT NULL THEN
    delta := (target_dow - extract(dow FROM local_today)::integer + 7) % 7;
    IF delta = 0 THEN delta := 7; END IF;
    RETURN local_today + delta;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.business_queue_conversation_reply(
  _company_id uuid,
  _channel_id uuid,
  _conversation_id uuid,
  _contact_id uuid,
  _to_phone text,
  _message text,
  _source_message_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
  queue_id uuid;
  worker_token text;
BEGIN
  IF NULLIF(trim(_message),'') IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.outbound_queue(
    company_id, channel_id, conversation_id, contact_id, to_phone, kind, payload,
    status, next_attempt_at, source_message_id
  ) VALUES (
    _company_id, _channel_id, _conversation_id, _contact_id,
    regexp_replace(COALESCE(_to_phone,''),'\D','','g'), 'text',
    jsonb_build_object('message', trim(_message), 'source', 'business_conversation'),
    'queued', now(), _source_message_id
  )
  ON CONFLICT (source_message_id) WHERE source_message_id IS NOT NULL
  DO UPDATE SET payload=EXCLUDED.payload, updated_at=now()
  RETURNING id INTO queue_id;

  SELECT token INTO worker_token
  FROM public.internal_worker_secrets
  WHERE name='business-conversation-worker';

  IF worker_token IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://ncosftsthrzznevzkvbi.supabase.co/functions/v1/business-automation-worker',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-chatfacil-worker-token',worker_token
      ),
      body := jsonb_build_object('job_id',queue_id)
    );
  END IF;
  RETURN queue_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_queue_conversation_reply(uuid,uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_queue_conversation_reply(uuid,uuid,uuid,uuid,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.business_claim_outbound_job(_job_id uuid)
RETURNS SETOF public.outbound_queue
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE public.outbound_queue
  SET status='processing', attempts=attempts+1, updated_at=now()
  WHERE id=_job_id
    AND status='queued'
    AND next_attempt_at<=now()
    AND (business_opportunity_id IS NOT NULL OR payload->>'source'='business_conversation')
  RETURNING *;
$$;
REVOKE EXECUTE ON FUNCTION public.business_claim_outbound_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_claim_outbound_job(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.business_claim_outbound_queue(_limit integer DEFAULT 20)
RETURNS SETOF public.outbound_queue LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH picked AS(
   SELECT id FROM public.outbound_queue
   WHERE status='queued' AND next_attempt_at<=now()
     AND (business_opportunity_id IS NOT NULL OR payload->>'source'='business_conversation')
   ORDER BY next_attempt_at,created_at
   FOR UPDATE SKIP LOCKED
   LIMIT LEAST(GREATEST(_limit,1),100)
 )
 UPDATE public.outbound_queue q
 SET status='processing',attempts=attempts+1,updated_at=now()
 FROM picked p WHERE q.id=p.id RETURNING q.*;
$$;
REVOKE EXECUTE ON FUNCTION public.business_claim_outbound_queue(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_claim_outbound_queue(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.business_format_slot(_starts_at timestamptz, _timezone text)
RETURNS text LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT to_char(_starts_at AT TIME ZONE COALESCE(NULLIF(_timezone,''),'America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI');
$$;

CREATE OR REPLACE FUNCTION public.business_route_inbound_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
  conversation_row public.conversations%ROWTYPE;
  settings_row public.business_automation_settings%ROWTYPE;
  normalized text;
  state jsonb;
  step text;
  reply text;
  selected_service public.business_services%ROWTYPE;
  service_count integer;
  requested_date date;
  choice integer;
  slots_json jsonb;
  slots_text text;
  selected_slot jsonb;
  booked public.appointments%ROWTYPE;
  upcoming public.appointments%ROWTYPE;
  local_from timestamptz;
  local_to timestamptz;
BEGIN
  IF NEW.direction <> 'inbound'
    OR NEW.message_type NOT IN ('text','button','interactive')
    OR NULLIF(trim(NEW.content),'') IS NULL
    OR NEW.content LIKE '[%' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO conversation_row
  FROM public.conversations
  WHERE id=NEW.conversation_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.business_services
    WHERE company_id=NEW.company_id AND active
  ) THEN RETURN NEW; END IF;

  SELECT * INTO settings_row
  FROM public.business_automation_settings
  WHERE company_id=NEW.company_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  normalized := public.business_normalize_text(NEW.content);
  state := COALESCE(conversation_row.automation_state,'{}'::jsonb);
  step := COALESCE(state->>'step','');

  IF step <> '' AND normalized ~ '^(sair|parar|recomecar|cancelar conversa|encerrar)$' THEN
    state := '{}'::jsonb;
    reply := 'Tudo bem, encerrei este processo. Quando precisar, é só pedir para agendar.';

  ELSIF step = 'confirm_cancel' THEN
    IF normalized ~ '^(sim|s|confirmo|pode cancelar|cancelar)$' THEN
      SELECT * INTO upcoming FROM public.business_cancel_appointment((state->>'appointment_id')::uuid,'Cancelado pelo cliente no WhatsApp');
      state := '{}'::jsonb;
      reply := 'Agendamento cancelado: ' || upcoming.title || ' em ' || public.business_format_slot(upcoming.starts_at,settings_row.timezone) || '.';
    ELSIF normalized ~ '^(nao|n|manter|voltar)$' THEN
      state := '{}'::jsonb;
      reply := 'Certo, o agendamento foi mantido.';
    ELSE
      reply := 'Responda SIM para cancelar ou NÃO para manter o agendamento.';
    END IF;

  ELSIF step = 'choose_service' THEN
    IF normalized ~ '^\d{1,2}$' THEN
      choice := normalized::integer;
      SELECT s.* INTO selected_service
      FROM (
        SELECT bs.*,row_number() OVER(ORDER BY bs.name)::integer AS option_number
        FROM public.business_services bs
        WHERE bs.company_id=NEW.company_id AND bs.active
      ) s
      WHERE s.option_number=choice;
    ELSE
      SELECT bs.* INTO selected_service
      FROM public.business_services bs
      WHERE bs.company_id=NEW.company_id AND bs.active
        AND normalized LIKE '%' || public.business_normalize_text(bs.name) || '%'
      ORDER BY length(bs.name) DESC LIMIT 1;
    END IF;
    IF selected_service.id IS NULL THEN
      SELECT string_agg(option_number || '. ' || name,E'\n' ORDER BY option_number)
      INTO slots_text
      FROM (
        SELECT name,row_number() OVER(ORDER BY name)::integer option_number
        FROM public.business_services WHERE company_id=NEW.company_id AND active LIMIT 9
      ) listed;
      reply := 'Não identifiquei o serviço. Responda com o número ou nome:' || E'\n' || slots_text;
    ELSE
      requested_date := public.business_parse_local_date(NEW.content,settings_row.timezone);
      state := jsonb_build_object('flow','booking','step','choose_date','service_id',selected_service.id);
      reply := 'Ótimo. Para qual dia você quer agendar ' || selected_service.name || '? Pode responder, por exemplo: amanhã, sexta ou 15/08.';
    END IF;

  ELSIF step = 'choose_date' THEN
    SELECT * INTO selected_service FROM public.business_services
    WHERE id=(state->>'service_id')::uuid AND company_id=NEW.company_id AND active;
    IF NOT FOUND THEN
      state := '{}'::jsonb;
      reply := 'Esse serviço não está mais disponível. Envie “agendar” para começar novamente.';
    ELSE
      requested_date := public.business_parse_local_date(NEW.content,settings_row.timezone);
      IF requested_date IS NULL THEN
        reply := 'Não consegui identificar a data. Responda com amanhã, um dia da semana ou uma data como 15/08.';
      ELSE
        local_from := requested_date::timestamp AT TIME ZONE settings_row.timezone;
        local_to := (requested_date + 1)::timestamp AT TIME ZONE settings_row.timezone;
        SELECT jsonb_agg(jsonb_build_object(
                 'option',option_number,
                 'starts_at',slot_start,
                 'resource_id',resource_id,
                 'resource_name',resource_name
               ) ORDER BY option_number),
               string_agg(option_number || '. ' || to_char(slot_start AT TIME ZONE settings_row.timezone,'HH24:MI') ||
                 CASE WHEN resource_name IS NULL THEN '' ELSE ' — ' || resource_name END,
                 E'\n' ORDER BY option_number)
        INTO slots_json,slots_text
        FROM (
          SELECT slot_start,resource_id,resource_name,
                 row_number() OVER(ORDER BY slot_start,resource_name)::integer option_number
          FROM public.business_available_slots(
            NEW.company_id,selected_service.id,local_from,local_to,NULL
          )
          LIMIT 8
        ) available;
        IF slots_json IS NULL THEN
          reply := 'Não há horário disponível nesse dia. Envie outra data para eu consultar.';
        ELSE
          state := jsonb_build_object(
            'flow','booking','step','choose_slot','service_id',selected_service.id,
            'requested_date',requested_date,'slots',slots_json
          );
          reply := 'Horários disponíveis para ' || selected_service.name || ' em ' || to_char(requested_date,'DD/MM') || ':' || E'\n' || slots_text || E'\n' || 'Responda com o número do horário.';
        END IF;
      END IF;
    END IF;

  ELSIF step = 'choose_slot' THEN
    IF normalized !~ '^\d{1,2}$' THEN
      reply := 'Responda somente com o número de um dos horários apresentados.';
    ELSE
      choice := normalized::integer;
      SELECT value INTO selected_slot
      FROM jsonb_array_elements(COALESCE(state->'slots','[]'::jsonb)) item(value)
      WHERE (value->>'option')::integer=choice LIMIT 1;
      IF selected_slot IS NULL THEN
        reply := 'Essa opção não existe. Escolha um dos números apresentados.';
      ELSE
        SELECT * INTO selected_service FROM public.business_services
        WHERE id=(state->>'service_id')::uuid AND company_id=NEW.company_id AND active;
        BEGIN
          SELECT * INTO booked FROM public.business_book_appointment(
            NEW.company_id,NEW.contact_id,selected_service.id,
            (selected_slot->>'resource_id')::uuid,
            (selected_slot->>'starts_at')::timestamptz,
            'whatsapp_automation',NULL
          );
          state := '{}'::jsonb;
          reply := 'Agendamento confirmado: ' || booked.title || ' em ' || public.business_format_slot(booked.starts_at,settings_row.timezone) || '.' ||
            CASE WHEN booked.price_cents>0 THEN ' Valor: R$ ' || to_char(booked.price_cents/100.0,'FM999G999G990D00') || '.' ELSE '' END;
        EXCEPTION WHEN others THEN
          state := jsonb_build_object('flow','booking','step','choose_date','service_id',selected_service.id);
          reply := 'Esse horário acabou de ficar indisponível. Envie outra data para eu consultar novos horários.';
        END;
      END IF;
    END IF;

  ELSIF normalized ~ '(^|\W)(desmarcar|cancelar agendamento|cancelar horario)(\W|$)' THEN
    SELECT * INTO upcoming
    FROM public.appointments
    WHERE company_id=NEW.company_id AND contact_id=NEW.contact_id
      AND status IN('agendado','confirmado') AND starts_at>now()
    ORDER BY starts_at LIMIT 1;
    IF NOT FOUND THEN
      state := '{}'::jsonb;
      reply := 'Você não possui agendamento futuro para cancelar.';
    ELSE
      state := jsonb_build_object('flow','cancel','step','confirm_cancel','appointment_id',upcoming.id);
      reply := 'Encontrei ' || upcoming.title || ' em ' || public.business_format_slot(upcoming.starts_at,settings_row.timezone) || '. Responda SIM para cancelar ou NÃO para manter.';
    END IF;

  ELSIF normalized ~ '(^|\W)(confirmar agendamento|confirmar horario)(\W|$)' THEN
    SELECT * INTO upcoming
    FROM public.appointments
    WHERE company_id=NEW.company_id AND contact_id=NEW.contact_id
      AND status='agendado' AND starts_at>now()
    ORDER BY starts_at LIMIT 1;
    IF NOT FOUND THEN
      reply := 'Não encontrei agendamento pendente de confirmação.';
    ELSE
      UPDATE public.appointments SET status='confirmado',updated_at=now()
      WHERE id=upcoming.id RETURNING * INTO upcoming;
      state := '{}'::jsonb;
      reply := 'Agendamento confirmado: ' || upcoming.title || ' em ' || public.business_format_slot(upcoming.starts_at,settings_row.timezone) || '.';
    END IF;

  ELSIF normalized ~ '(^|\W)(agendar|marcar|reservar|ver horario|ver horarios|horario disponivel|horarios disponiveis)(\W|$)' THEN
    SELECT count(*) INTO service_count
    FROM public.business_services WHERE company_id=NEW.company_id AND active;

    SELECT bs.* INTO selected_service
    FROM public.business_services bs
    WHERE bs.company_id=NEW.company_id AND bs.active
      AND normalized LIKE '%' || public.business_normalize_text(bs.name) || '%'
    ORDER BY length(bs.name) DESC LIMIT 1;

    IF selected_service.id IS NULL AND service_count=1 THEN
      SELECT * INTO selected_service FROM public.business_services
      WHERE company_id=NEW.company_id AND active LIMIT 1;
    END IF;

    IF selected_service.id IS NULL THEN
      SELECT string_agg(option_number || '. ' || name,E'\n' ORDER BY option_number)
      INTO slots_text
      FROM (
        SELECT name,row_number() OVER(ORDER BY name)::integer option_number
        FROM public.business_services WHERE company_id=NEW.company_id AND active LIMIT 9
      ) listed;
      state := jsonb_build_object('flow','booking','step','choose_service');
      reply := 'Qual serviço você quer agendar?' || E'\n' || slots_text || E'\n' || 'Responda com o número ou nome.';
    ELSE
      requested_date := public.business_parse_local_date(NEW.content,settings_row.timezone);
      state := jsonb_build_object('flow','booking','step','choose_date','service_id',selected_service.id);
      IF requested_date IS NULL THEN
        reply := 'Para qual dia você quer agendar ' || selected_service.name || '? Pode responder: amanhã, sexta ou 15/08.';
      ELSE
        reply := 'Certo. Envie novamente a data ' || to_char(requested_date,'DD/MM') || ' para eu listar os horários disponíveis.';
      END IF;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.conversations
  SET automation_state=state,
      ai_handling=false,
      human_handling=true,
      ai_paused_until=now()+interval '30 minutes',
      handoff_reason='Fluxo automático de agenda em andamento',
      updated_at=now()
  WHERE id=NEW.conversation_id;

  PERFORM public.business_queue_conversation_reply(
    NEW.company_id,NEW.channel_id,NEW.conversation_id,NEW.contact_id,
    COALESCE((SELECT NULLIF(wa_id,'') FROM public.contacts WHERE id=NEW.contact_id),
             (SELECT phone FROM public.contacts WHERE id=NEW.contact_id)),
    reply,NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_route_inbound_message ON public.messages;
CREATE TRIGGER trg_business_route_inbound_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.business_route_inbound_message();
