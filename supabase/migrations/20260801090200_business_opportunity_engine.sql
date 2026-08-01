-- ChatFacil — opportunity detection, approved-template queue and metrics.

CREATE OR REPLACE FUNCTION public.business_detect_opportunities(_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  total integer:=0;
  affected integer;
BEGIN
  IF _company_id IS NOT NULL AND NOT public.business_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  INSERT INTO public.business_opportunities(
    company_id,opportunity_type,contact_id,service_id,score,fingerprint,payload
  )
  SELECT
    c.company_id,
    'inactive_customer',
    c.id,
    last_service.service_id,
    LEAST(
      100,
      40+GREATEST(
        0,
        extract(day FROM now()-COALESCE(
          c.expected_return_at,c.last_service_at,c.last_interaction_at,c.created_at
        ))
      )
    )::numeric,
    'inactive:'||c.company_id||':'||c.id||':'||to_char(
      COALESCE(c.expected_return_at,c.last_service_at,c.last_interaction_at,c.created_at),
      'YYYYMMDD'
    ),
    jsonb_build_object(
      'last_service_at',c.last_service_at,
      'expected_return_at',c.expected_return_at
    )
  FROM public.contacts c
  JOIN public.business_automation_settings cfg
    ON cfg.company_id=c.company_id AND cfg.reactivation_enabled
  LEFT JOIN LATERAL(
    SELECT a.service_id
    FROM public.appointments a
    WHERE a.company_id=c.company_id
      AND a.contact_id=c.id
      AND a.status='concluido'
    ORDER BY COALESCE(a.completed_at,a.starts_at) DESC
    LIMIT 1
  ) last_service ON true
  WHERE (_company_id IS NULL OR c.company_id=_company_id)
    AND NOT c.automation_opt_out
    AND COALESCE(
      NULLIF(c.wa_id,''),
      NULLIF(regexp_replace(c.phone,'\D','','g'),'')
    ) IS NOT NULL
    AND COALESCE(
      c.expected_return_at,
      c.last_service_at+make_interval(days=>cfg.inactive_after_days),
      c.last_interaction_at+make_interval(days=>cfg.inactive_after_days),
      c.created_at+make_interval(days=>cfg.inactive_after_days)
    )<=now()
    AND (c.last_reactivation_at IS NULL OR c.last_reactivation_at<now()-interval '14 days')
    AND NOT EXISTS(
      SELECT 1 FROM public.appointments f
      WHERE f.company_id=c.company_id
        AND f.contact_id=c.id
        AND f.status IN('agendado','confirmado')
        AND f.starts_at>now()
    )
  ON CONFLICT(fingerprint) DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;
  total:=total+affected;

  INSERT INTO public.business_opportunities(
    company_id,opportunity_type,contact_id,service_id,resource_id,
    slot_start,slot_end,score,fingerprint,payload
  )
  SELECT
    cfg.company_id,
    'empty_slot',
    target.contact_id,
    svc.id,
    slot.resource_id,
    slot.slot_start,
    slot.slot_end,
    80,
    'slot:'||cfg.company_id||':'||target.contact_id||':'||svc.id||':'||
      slot.resource_id||':'||to_char(
        slot.slot_start AT TIME ZONE cfg.timezone,
        'YYYYMMDDHH24MI'
      ),
    jsonb_build_object(
      'resource_name',slot.resource_name,
      'service_name',svc.name
    )
  FROM public.business_automation_settings cfg
  JOIN public.business_services svc
    ON svc.company_id=cfg.company_id AND svc.active
  CROSS JOIN LATERAL(
    SELECT *
    FROM public.business_available_slots(
      cfg.company_id,
      svc.id,
      now(),
      now()+make_interval(days=>cfg.lookahead_days),
      NULL
    )
    LIMIT 30
  ) slot
  CROSS JOIN LATERAL(
    SELECT c.id contact_id
    FROM public.contacts c
    WHERE c.company_id=cfg.company_id
      AND NOT c.automation_opt_out
      AND COALESCE(
        NULLIF(c.wa_id,''),
        NULLIF(regexp_replace(c.phone,'\D','','g'),'')
      ) IS NOT NULL
      AND (c.last_reactivation_at IS NULL OR c.last_reactivation_at<now()-interval '14 days')
      AND EXISTS(
        SELECT 1 FROM public.appointments p
        WHERE p.company_id=cfg.company_id
          AND p.contact_id=c.id
          AND p.service_id=svc.id
          AND p.status='concluido'
      )
      AND NOT EXISTS(
        SELECT 1 FROM public.appointments f
        WHERE f.company_id=cfg.company_id
          AND f.contact_id=c.id
          AND f.status IN('agendado','confirmado')
          AND f.starts_at>now()
      )
    ORDER BY c.last_service_at NULLS FIRST,c.potential_value DESC NULLS LAST
    LIMIT cfg.max_contacts_per_slot
  ) target
  WHERE cfg.empty_slot_enabled
    AND (_company_id IS NULL OR cfg.company_id=_company_id)
  ON CONFLICT(fingerprint) DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;
  total:=total+affected;

  INSERT INTO public.business_opportunities(
    company_id,opportunity_type,contact_id,service_id,resource_id,
    appointment_id,slot_start,slot_end,score,fingerprint,payload
  )
  SELECT
    a.company_id,
    'appointment_reminder',
    a.contact_id,
    a.service_id,
    a.resource_id,
    a.id,
    a.starts_at,
    a.ends_at,
    100,
    'reminder24:'||a.id,
    jsonb_build_object('reminder_window','24h','title',a.title)
  FROM public.appointments a
  JOIN public.business_automation_settings cfg
    ON cfg.company_id=a.company_id AND cfg.reminders_enabled
  JOIN public.contacts c
    ON c.id=a.contact_id AND NOT c.automation_opt_out
  WHERE (_company_id IS NULL OR a.company_id=_company_id)
    AND a.status IN('agendado','confirmado')
    AND a.reminder_24h_sent_at IS NULL
    AND a.starts_at BETWEEN now()+interval '23 hours' AND now()+interval '25 hours'
  ON CONFLICT(fingerprint) DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;
  total:=total+affected;

  RETURN total;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_detect_opportunities(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_detect_opportunities(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.business_enqueue_due_outreach(_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  affected integer:=0;
BEGIN
  IF _company_id IS NOT NULL AND NOT public.business_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  WITH eligible AS(
    SELECT
      o.*,
      c.name contact_name,
      COALESCE(NULLIF(c.wa_id,''),NULLIF(regexp_replace(c.phone,'\D','','g'),'')) phone,
      svc.name service_name,
      cfg.timezone,
      cfg.template_language,
      cfg.max_daily_outreach,
      CASE o.opportunity_type
        WHEN 'inactive_customer' THEN cfg.reactivation_template_name
        WHEN 'empty_slot' THEN cfg.empty_slot_template_name
        ELSE cfg.reminder_template_name
      END template_name,
      ch.id channel_id,
      row_number() OVER(
        PARTITION BY o.company_id
        ORDER BY o.score DESC,o.detected_at
      ) daily_rank
    FROM public.business_opportunities o
    JOIN public.contacts c ON c.id=o.contact_id
    JOIN public.business_automation_settings cfg ON cfg.company_id=o.company_id
    LEFT JOIN public.business_services svc ON svc.id=o.service_id
    JOIN LATERAL(
      SELECT id
      FROM public.channels
      WHERE company_id=o.company_id
        AND type='whatsapp'
        AND provider='meta_cloud_api'
        AND status='connected'
      ORDER BY updated_at DESC
      LIMIT 1
    ) ch ON true
    WHERE o.status='detected'
      AND (_company_id IS NULL OR o.company_id=_company_id)
      AND NOT c.automation_opt_out
  ), approved AS(
    SELECT e.*
    FROM eligible e
    JOIN public.whatsapp_templates wt
      ON wt.channel_id=e.channel_id
     AND wt.name=e.template_name
     AND wt.language=e.template_language
     AND upper(COALESCE(wt.status,''))='APPROVED'
    WHERE e.template_name IS NOT NULL
      AND e.phone IS NOT NULL
      AND e.daily_rank<=e.max_daily_outreach
  ), ins AS(
    INSERT INTO public.outbound_queue(
      company_id,channel_id,contact_id,to_phone,kind,payload,
      business_opportunity_id,status,next_attempt_at
    )
    SELECT
      a.company_id,
      a.channel_id,
      a.contact_id,
      a.phone,
      'template',
      jsonb_build_object(
        'template_name',a.template_name,
        'language',a.template_language,
        'body_parameters',CASE a.opportunity_type
          WHEN 'inactive_customer' THEN
            jsonb_build_array(split_part(a.contact_name,' ',1))
          WHEN 'empty_slot' THEN
            jsonb_build_array(
              split_part(a.contact_name,' ',1),
              COALESCE(a.service_name,'atendimento'),
              to_char(a.slot_start AT TIME ZONE a.timezone,'DD/MM'),
              to_char(a.slot_start AT TIME ZONE a.timezone,'HH24:MI')
            )
          ELSE
            jsonb_build_array(
              split_part(a.contact_name,' ',1),
              COALESCE(a.service_name,'atendimento'),
              to_char(a.slot_start AT TIME ZONE a.timezone,'DD/MM/YYYY'),
              to_char(a.slot_start AT TIME ZONE a.timezone,'HH24:MI')
            )
        END,
        'preview',CASE a.opportunity_type
          WHEN 'inactive_customer' THEN 'Reativação de cliente'
          WHEN 'empty_slot' THEN 'Oferta de horário disponível'
          ELSE 'Lembrete de agendamento'
        END
      ),
      a.id,
      'queued',
      now()
    FROM approved a
    ON CONFLICT (business_opportunity_id)
      WHERE business_opportunity_id IS NOT NULL
      DO NOTHING
    RETURNING business_opportunity_id
  )
  UPDATE public.business_opportunities o
  SET status='queued',queued_at=now()
  FROM ins i
  WHERE o.id=i.business_opportunity_id;

  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_enqueue_due_outreach(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_enqueue_due_outreach(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.business_claim_outbound_queue(_limit integer DEFAULT 20)
RETURNS SETOF public.outbound_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path=public
AS $$
  WITH picked AS(
    SELECT id
    FROM public.outbound_queue
    WHERE status='queued'
      AND next_attempt_at<=now()
      AND business_opportunity_id IS NOT NULL
    ORDER BY next_attempt_at,created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(_limit,1),100)
  )
  UPDATE public.outbound_queue q
  SET status='processing',attempts=attempts+1,updated_at=now()
  FROM picked p
  WHERE q.id=p.id
  RETURNING q.*;
$$;
REVOKE EXECUTE ON FUNCTION public.business_claim_outbound_queue(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_claim_outbound_queue(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.business_metrics(
  _company_id uuid,
  _from timestamptz DEFAULT date_trunc('month',now()),
  _to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.business_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT jsonb_build_object(
    'appointments',count(*) FILTER(WHERE a.starts_at BETWEEN _from AND _to),
    'completed',count(*) FILTER(
      WHERE a.status='concluido'
        AND COALESCE(a.completed_at,a.starts_at) BETWEEN _from AND _to
    ),
    'cancelled',count(*) FILTER(
      WHERE a.status='cancelado' AND a.starts_at BETWEEN _from AND _to
    ),
    'scheduled_revenue_cents',COALESCE(sum(a.price_cents) FILTER(
      WHERE a.status IN('agendado','confirmado','concluido')
        AND a.starts_at BETWEEN _from AND _to
    ),0),
    'recovered_revenue_cents',COALESCE(sum(a.price_cents) FILTER(
      WHERE EXISTS(
        SELECT 1 FROM public.business_opportunities o
        WHERE o.converted_appointment_id=a.id
      )
      AND a.status='concluido'
    ),0),
    'open_opportunities',(
      SELECT count(*)
      FROM public.business_opportunities o
      WHERE o.company_id=_company_id
        AND o.status IN('detected','queued','contacted')
    ),
    'reactivated_customers',(
      SELECT count(DISTINCT o.contact_id)
      FROM public.business_opportunities o
      WHERE o.company_id=_company_id
        AND o.status='converted'
        AND o.converted_at BETWEEN _from AND _to
    )
  ) INTO result
  FROM public.appointments a
  WHERE a.company_id=_company_id;

  RETURN result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_metrics(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_metrics(uuid,timestamptz,timestamptz) TO authenticated,service_role;
