-- ChatFacil — atomic scheduling engine

CREATE OR REPLACE FUNCTION public.business_available_slots(
  _company_id uuid,
  _service_id uuid,
  _from timestamptz,
  _to timestamptz,
  _resource_id uuid DEFAULT NULL
)
RETURNS TABLE(
  slot_start timestamptz,
  slot_end timestamptz,
  resource_id uuid,
  resource_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_timezone text;
  v_duration integer;
  v_interval integer;
  v_lead integer;
  v_horizon integer;
BEGIN
  IF NOT public.business_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'Acesso negado à empresa';
  END IF;

  SELECT duration_minutes INTO v_duration
  FROM public.business_services
  WHERE id=_service_id AND company_id=_company_id AND active;
  IF v_duration IS NULL THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  SELECT timezone,slot_interval_minutes,minimum_lead_minutes,booking_horizon_days
  INTO v_timezone,v_interval,v_lead,v_horizon
  FROM public.business_automation_settings
  WHERE company_id=_company_id;

  v_timezone:=COALESCE(v_timezone,'America/Sao_Paulo');
  v_interval:=COALESCE(v_interval,15);
  v_lead:=COALESCE(v_lead,60);
  v_horizon:=COALESCE(v_horizon,60);

  RETURN QUERY
  WITH days AS(
    SELECT generate_series(
      (_from AT TIME ZONE v_timezone)::date,
      (_to AT TIME ZONE v_timezone)::date,
      interval '1 day'
    )::date AS day
  ), windows AS(
    SELECT d.day,h.opens_at,h.closes_at
    FROM days d
    JOIN public.business_hours h
      ON h.company_id=_company_id
     AND h.weekday=extract(dow FROM d.day)::smallint
     AND h.active
  ), resources AS(
    SELECT r.id,r.name
    FROM public.business_resources r
    WHERE r.company_id=_company_id
      AND r.active
      AND (_resource_id IS NULL OR r.id=_resource_id)
      AND (
        NOT EXISTS(
          SELECT 1 FROM public.business_resource_services x
          WHERE x.resource_id=r.id
        )
        OR EXISTS(
          SELECT 1 FROM public.business_resource_services x
          WHERE x.resource_id=r.id AND x.service_id=_service_id
        )
      )
  ), slots AS(
    SELECT
      (g.local_start AT TIME ZONE v_timezone) starts_at,
      ((g.local_start+make_interval(mins=>v_duration)) AT TIME ZONE v_timezone) ends_at,
      r.id rid,
      r.name rname
    FROM windows w
    CROSS JOIN resources r
    CROSS JOIN LATERAL generate_series(
      w.day+w.opens_at,
      w.day+w.closes_at-make_interval(mins=>v_duration),
      make_interval(mins=>v_interval)
    ) g(local_start)
  )
  SELECT s.starts_at,s.ends_at,s.rid,s.rname
  FROM slots s
  WHERE s.starts_at>=GREATEST(_from,now()+make_interval(mins=>v_lead))
    AND s.starts_at<=LEAST(_to,now()+make_interval(days=>v_horizon))
    AND NOT EXISTS(
      SELECT 1
      FROM public.appointments a
      WHERE a.company_id=_company_id
        AND a.status IN('agendado','confirmado')
        AND (a.resource_id=s.rid OR a.resource_id IS NULL)
        AND tstzrange(
              a.starts_at,
              COALESCE(a.ends_at,a.starts_at+interval '30 minutes'),
              '[)'
            ) && tstzrange(s.starts_at,s.ends_at,'[)')
    )
  ORDER BY s.starts_at,s.rname;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_available_slots(uuid,uuid,timestamptz,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_available_slots(uuid,uuid,timestamptz,timestamptz,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.business_book_appointment(
  _company_id uuid,
  _contact_id uuid,
  _service_id uuid,
  _resource_id uuid,
  _starts_at timestamptz,
  _booking_source text DEFAULT 'manual',
  _description text DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_service public.business_services%ROWTYPE;
  v_slot record;
  v_result public.appointments%ROWTYPE;
BEGIN
  IF NOT public.business_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'Acesso negado à empresa';
  END IF;
  IF _contact_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.contacts
    WHERE id=_contact_id AND company_id=_company_id
  ) THEN
    RAISE EXCEPTION 'Contato não pertence à empresa';
  END IF;

  SELECT * INTO v_service
  FROM public.business_services
  WHERE id=_service_id AND company_id=_company_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      _company_id::text||':'||COALESCE(_resource_id::text,'sem-recurso'),
      0
    )
  );

  SELECT * INTO v_slot
  FROM public.business_available_slots(
    _company_id,
    _service_id,
    _starts_at-interval '1 minute',
    _starts_at+interval '1 minute',
    _resource_id
  )
  WHERE slot_start=_starts_at
    AND resource_id IS NOT DISTINCT FROM _resource_id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Horário indisponível';
  END IF;

  INSERT INTO public.appointments(
    company_id,contact_id,service_id,resource_id,title,description,
    starts_at,ends_at,status,price_cents,booking_source,created_by,timezone
  ) VALUES(
    _company_id,_contact_id,_service_id,_resource_id,
    v_service.name,_description,_starts_at,
    _starts_at+make_interval(mins=>v_service.duration_minutes),
    'agendado',v_service.price_cents,
    COALESCE(NULLIF(_booking_source,''),'manual'),
    auth.uid(),
    COALESCE(
      (SELECT timezone FROM public.business_automation_settings WHERE company_id=_company_id),
      'America/Sao_Paulo'
    )
  )
  RETURNING * INTO v_result;

  UPDATE public.business_opportunities
  SET status='converted',
      converted_at=now(),
      converted_appointment_id=v_result.id
  WHERE company_id=_company_id
    AND contact_id=_contact_id
    AND status IN('detected','queued','contacted')
    AND (service_id IS NULL OR service_id=_service_id)
    AND (slot_start IS NULL OR slot_start=_starts_at);

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_book_appointment(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_book_appointment(uuid,uuid,uuid,uuid,timestamptz,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.business_cancel_appointment(
  _appointment_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.appointments WHERE id=_appointment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
  IF NOT public.business_can_access_company(v.company_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  UPDATE public.appointments
  SET status='cancelado',
      cancelled_at=now(),
      description=concat_ws(E'\n',description,NULLIF(_reason,''))
  WHERE id=_appointment_id
  RETURNING * INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_cancel_appointment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_cancel_appointment(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.business_complete_appointment(_appointment_id uuid)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v public.appointments%ROWTYPE;
  recurrence integer;
BEGIN
  SELECT * INTO v FROM public.appointments WHERE id=_appointment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
  IF NOT public.business_can_access_company(v.company_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  UPDATE public.appointments
  SET status='concluido',completed_at=now()
  WHERE id=_appointment_id
  RETURNING * INTO v;

  SELECT recurrence_days INTO recurrence
  FROM public.business_services WHERE id=v.service_id;

  IF v.contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET last_service_at=COALESCE(v.completed_at,now()),
        expected_return_at=CASE
          WHEN recurrence IS NULL THEN NULL
          ELSE COALESCE(v.completed_at,now())+make_interval(days=>recurrence)
        END,
        lifetime_value_cents=lifetime_value_cents+GREATEST(v.price_cents,0),
        funnel_stage='cliente',
        updated_at=now()
    WHERE id=v.contact_id;
  END IF;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_complete_appointment(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_complete_appointment(uuid) TO authenticated,service_role;
