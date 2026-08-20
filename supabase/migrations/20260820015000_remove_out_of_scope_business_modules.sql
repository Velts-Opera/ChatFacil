-- Final bot-only cleanup discovered during Phase 4 validation.
-- WhatsApp Meta, Stella, inbox, contacts, agent settings and knowledge remain untouched.

DO $$
BEGIN
  IF (SELECT count(*) FROM public.appointments) > 0
     OR (SELECT count(*) FROM public.business_opportunities) > 0
     OR (SELECT count(*) FROM public.business_resource_services) > 0
     OR (SELECT count(*) FROM public.business_services) > 0
     OR (SELECT count(*) FROM public.crm_sales) > 0
     OR (SELECT count(*) FROM public.conflict_checks) > 0
     OR (SELECT count(*) FROM public.document_extractions) > 0
     OR (SELECT count(*) FROM public.email_threads) > 0
     OR (SELECT count(*) FROM public.intake_fields) > 0
     OR (SELECT count(*) FROM public.intakes) > 0
     OR (SELECT count(*) FROM public.law_firm_profiles) > 0
     OR (SELECT count(*) FROM public.legal_documents) > 0
     OR (SELECT count(*) FROM public.matter_parties) > 0
     OR (SELECT count(*) FROM public.matter_timeline) > 0
     OR (SELECT count(*) FROM public.matters) > 0
     OR (SELECT count(*) FROM public.outbound_queue) > 0
     OR (SELECT count(*) FROM public.voice_calls) > 0 THEN
    RAISE EXCEPTION 'Bot-only cleanup blocked: non-default business/legal data exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_resources
    WHERE name <> 'Atendimento' OR kind <> 'professional' OR active IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Bot-only cleanup blocked: custom business resource exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_hours
    WHERE weekday NOT BETWEEN 1 AND 5
       OR opens_at <> time '09:00'
       OR closes_at <> time '18:00'
       OR active IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Bot-only cleanup blocked: custom business hours exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_automation_settings
    WHERE timezone <> 'America/Sao_Paulo'
       OR slot_interval_minutes <> 15
       OR minimum_lead_minutes <> 60
       OR booking_horizon_days <> 60
       OR inactive_after_days <> 30
       OR reactivation_enabled IS DISTINCT FROM false
       OR empty_slot_enabled IS DISTINCT FROM false
       OR reminders_enabled IS DISTINCT FROM true
       OR reactivation_template_name IS NOT NULL
       OR empty_slot_template_name IS NOT NULL
       OR reminder_template_name IS NOT NULL
       OR template_language <> 'pt_BR'
       OR max_daily_outreach <> 20
       OR max_contacts_per_slot <> 3
       OR lookahead_days <> 3
  ) THEN
    RAISE EXCEPTION 'Bot-only cleanup blocked: custom automation settings exist';
  END IF;
END;
$$;

DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'chatfacil-business-automation' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_aa_business_release_previous_flow ON public.messages;
DROP TRIGGER IF EXISTS trg_business_route_inbound_message ON public.messages;
DROP TRIGGER IF EXISTS trg_zz_business_mark_completed_flow ON public.messages;

DROP FUNCTION IF EXISTS public.business_available_slots(uuid,uuid,timestamptz,timestamptz,uuid);
DROP FUNCTION IF EXISTS public.business_book_appointment(uuid,uuid,uuid,uuid,timestamptz,text,text);
DROP FUNCTION IF EXISTS public.business_cancel_appointment(uuid,text);
DROP FUNCTION IF EXISTS public.business_claim_outbound_job(uuid);
DROP FUNCTION IF EXISTS public.business_claim_outbound_queue(integer);
DROP FUNCTION IF EXISTS public.business_complete_appointment(uuid);
DROP FUNCTION IF EXISTS public.business_detect_opportunities(uuid);
DROP FUNCTION IF EXISTS public.business_enqueue_due_outreach(uuid);
DROP FUNCTION IF EXISTS public.business_format_slot(timestamptz,text);
DROP FUNCTION IF EXISTS public.business_mark_completed_flow_for_release();
DROP FUNCTION IF EXISTS public.business_metrics(uuid,timestamptz,timestamptz);
DROP FUNCTION IF EXISTS public.business_normalize_text(text);
DROP FUNCTION IF EXISTS public.business_onboarding_status(uuid);
DROP FUNCTION IF EXISTS public.business_parse_local_date(text,text);
DROP FUNCTION IF EXISTS public.business_queue_conversation_reply(uuid,uuid,uuid,uuid,text,text,uuid);
DROP FUNCTION IF EXISTS public.business_release_previous_flow();
DROP FUNCTION IF EXISTS public.business_replace_hours(uuid,jsonb);
DROP FUNCTION IF EXISTS public.business_route_inbound_message();
DROP FUNCTION IF EXISTS public.business_set_resource_services(uuid,uuid,uuid[]);
DROP FUNCTION IF EXISTS public.complete_crm_post_sale(uuid);
DROP FUNCTION IF EXISTS public.register_crm_sale(uuid,numeric,uuid,timestamptz,date,text);

DROP TABLE IF EXISTS public.business_opportunities CASCADE;
DROP TABLE IF EXISTS public.business_resource_services CASCADE;
DROP TABLE IF EXISTS public.appointments CASCADE;
DROP TABLE IF EXISTS public.business_resources CASCADE;
DROP TABLE IF EXISTS public.business_services CASCADE;
DROP TABLE IF EXISTS public.business_hours CASCADE;
DROP TABLE IF EXISTS public.business_automation_settings CASCADE;
DROP TABLE IF EXISTS public.outbound_queue CASCADE;
DROP TABLE IF EXISTS public.crm_sales CASCADE;
DROP TABLE IF EXISTS public.document_extractions CASCADE;
DROP TABLE IF EXISTS public.legal_documents CASCADE;
DROP TABLE IF EXISTS public.matter_parties CASCADE;
DROP TABLE IF EXISTS public.matter_timeline CASCADE;
DROP TABLE IF EXISTS public.intake_fields CASCADE;
DROP TABLE IF EXISTS public.intakes CASCADE;
DROP TABLE IF EXISTS public.conflict_checks CASCADE;
DROP TABLE IF EXISTS public.law_firm_profiles CASCADE;
DROP TABLE IF EXISTS public.matters CASCADE;
DROP TABLE IF EXISTS public.email_threads CASCADE;
DROP TABLE IF EXISTS public.voice_calls CASCADE;

DROP FUNCTION IF EXISTS public.business_can_access_company(uuid);
