CREATE OR REPLACE FUNCTION public.business_enqueue_due_outreach(_company_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer:=0;
BEGIN
 IF _company_id IS NOT NULL AND NOT public.business_can_access_company(_company_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 WITH eligible AS(
  SELECT o.*,c.name contact_name,COALESCE(NULLIF(c.wa_id,''),NULLIF(regexp_replace(c.phone,'\D','','g'),'')) phone,svc.name service_name,
   cfg.timezone,cfg.template_language,cfg.max_daily_outreach,
   CASE o.opportunity_type WHEN 'inactive_customer' THEN cfg.reactivation_template_name WHEN 'empty_slot' THEN cfg.empty_slot_template_name ELSE cfg.reminder_template_name END template_name,
   ch.id channel_id,row_number() OVER(PARTITION BY o.company_id ORDER BY o.score DESC,o.detected_at) daily_rank
  FROM public.business_opportunities o JOIN public.contacts c ON c.id=o.contact_id
  JOIN public.business_automation_settings cfg ON cfg.company_id=o.company_id LEFT JOIN public.business_services svc ON svc.id=o.service_id
  JOIN LATERAL(SELECT id FROM public.channels WHERE company_id=o.company_id AND type='whatsapp' AND provider='meta_cloud_api' AND status='connected' ORDER BY updated_at DESC LIMIT 1) ch ON true
  WHERE o.status='detected' AND (_company_id IS NULL OR o.company_id=_company_id) AND NOT c.automation_opt_out
 ),approved AS(
  SELECT e.* FROM eligible e JOIN public.whatsapp_templates wt ON wt.channel_id=e.channel_id AND wt.name=e.template_name AND wt.language=e.template_language AND upper(COALESCE(wt.status,''))='APPROVED'
  WHERE e.template_name IS NOT NULL AND e.phone IS NOT NULL AND e.daily_rank<=e.max_daily_outreach
 ),ins AS(
  INSERT INTO public.outbound_queue(company_id,channel_id,contact_id,to_phone,kind,payload,business_opportunity_id,status,next_attempt_at)
  SELECT a.company_id,a.channel_id,a.contact_id,a.phone,'template',
   jsonb_build_object('template_name',a.template_name,'language',a.template_language,
    'body_parameters',CASE a.opportunity_type WHEN 'inactive_customer' THEN jsonb_build_array(split_part(a.contact_name,' ',1))
      WHEN 'empty_slot' THEN jsonb_build_array(split_part(a.contact_name,' ',1),COALESCE(a.service_name,'atendimento'),to_char(a.slot_start AT TIME ZONE a.timezone,'DD/MM'),to_char(a.slot_start AT TIME ZONE a.timezone,'HH24:MI'))
      ELSE jsonb_build_array(split_part(a.contact_name,' ',1),COALESCE(a.service_name,'atendimento'),to_char(a.slot_start AT TIME ZONE a.timezone,'DD/MM/YYYY'),to_char(a.slot_start AT TIME ZONE a.timezone,'HH24:MI')) END,
    'preview',CASE a.opportunity_type WHEN 'inactive_customer' THEN 'Reativação de cliente' WHEN 'empty_slot' THEN 'Oferta de horário disponível' ELSE 'Lembrete de agendamento' END),
   a.id,'queued',now() FROM approved a
  ON CONFLICT (business_opportunity_id) WHERE business_opportunity_id IS NOT NULL DO NOTHING
  RETURNING business_opportunity_id
 )
 UPDATE public.business_opportunities o SET status='queued',queued_at=now() FROM ins i WHERE o.id=i.business_opportunity_id;
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END;$$;
REVOKE EXECUTE ON FUNCTION public.business_enqueue_due_outreach(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_enqueue_due_outreach(uuid) TO authenticated,service_role;
