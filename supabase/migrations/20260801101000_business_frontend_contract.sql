CREATE OR REPLACE FUNCTION public.business_replace_hours(
  _company_id uuid,
  _hours jsonb
)
RETURNS SETOF public.business_hours
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF NOT public.business_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'Acesso negado à empresa';
  END IF;
  IF jsonb_typeof(COALESCE(_hours,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Horários devem ser enviados como uma lista';
  END IF;

  DELETE FROM public.business_hours WHERE company_id=_company_id;

  INSERT INTO public.business_hours(company_id,weekday,opens_at,closes_at,active)
  SELECT
    _company_id,
    item.weekday,
    item.opens_at,
    item.closes_at,
    COALESCE(item.active,true)
  FROM jsonb_to_recordset(COALESCE(_hours,'[]'::jsonb)) AS item(
    weekday smallint,
    opens_at time,
    closes_at time,
    active boolean
  );

  RETURN QUERY
  SELECT *
  FROM public.business_hours
  WHERE company_id=_company_id
  ORDER BY weekday,opens_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_replace_hours(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_replace_hours(uuid,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.business_set_resource_services(
  _company_id uuid,
  _resource_id uuid,
  _service_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  requested_count integer;
  valid_count integer;
BEGIN
  IF NOT public.business_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'Acesso negado à empresa';
  END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM public.business_resources
    WHERE id=_resource_id AND company_id=_company_id
  ) THEN
    RAISE EXCEPTION 'Recurso não pertence à empresa';
  END IF;

  SELECT count(DISTINCT id) INTO requested_count
  FROM unnest(COALESCE(_service_ids,ARRAY[]::uuid[])) id;

  SELECT count(*) INTO valid_count
  FROM public.business_services
  WHERE company_id=_company_id
    AND id=ANY(COALESCE(_service_ids,ARRAY[]::uuid[]));

  IF requested_count <> valid_count THEN
    RAISE EXCEPTION 'Um ou mais serviços não pertencem à empresa';
  END IF;

  DELETE FROM public.business_resource_services
  WHERE resource_id=_resource_id;

  INSERT INTO public.business_resource_services(resource_id,service_id)
  SELECT _resource_id,id
  FROM unnest(COALESCE(_service_ids,ARRAY[]::uuid[])) id
  GROUP BY id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_set_resource_services(uuid,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_set_resource_services(uuid,uuid,uuid[]) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.business_onboarding_status(_company_id uuid)
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
    RAISE EXCEPTION 'Acesso negado à empresa';
  END IF;

  SELECT jsonb_build_object(
    'services_count',(
      SELECT count(*)
      FROM public.business_services
      WHERE company_id=_company_id AND active
    ),
    'resources_count',(
      SELECT count(*)
      FROM public.business_resources
      WHERE company_id=_company_id AND active
    ),
    'business_hours_count',(
      SELECT count(*)
      FROM public.business_hours
      WHERE company_id=_company_id AND active
    ),
    'connected_whatsapp',(
      SELECT EXISTS(
        SELECT 1
        FROM public.channels
        WHERE company_id=_company_id
          AND type='whatsapp'
          AND provider='meta_cloud_api'
          AND status='connected'
      )
    ),
    'approved_templates_count',(
      SELECT count(*)
      FROM public.whatsapp_templates wt
      JOIN public.channels ch ON ch.id=wt.channel_id
      WHERE wt.company_id=_company_id
        AND ch.provider='meta_cloud_api'
        AND upper(COALESCE(wt.status,''))='APPROVED'
    ),
    'booking_ready',(
      EXISTS(
        SELECT 1 FROM public.business_services
        WHERE company_id=_company_id AND active
      )
      AND EXISTS(
        SELECT 1 FROM public.business_resources
        WHERE company_id=_company_id AND active
      )
      AND EXISTS(
        SELECT 1 FROM public.business_hours
        WHERE company_id=_company_id AND active
      )
      AND EXISTS(
        SELECT 1 FROM public.channels
        WHERE company_id=_company_id
          AND type='whatsapp'
          AND provider='meta_cloud_api'
          AND status='connected'
      )
    ),
    'outreach_ready',(
      EXISTS(
        SELECT 1 FROM public.business_services
        WHERE company_id=_company_id AND active
      )
      AND EXISTS(
        SELECT 1 FROM public.channels
        WHERE company_id=_company_id
          AND type='whatsapp'
          AND provider='meta_cloud_api'
          AND status='connected'
      )
      AND EXISTS(
        SELECT 1
        FROM public.whatsapp_templates wt
        JOIN public.channels ch ON ch.id=wt.channel_id
        WHERE wt.company_id=_company_id
          AND ch.provider='meta_cloud_api'
          AND upper(COALESCE(wt.status,''))='APPROVED'
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_onboarding_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_onboarding_status(uuid) TO authenticated,service_role;
