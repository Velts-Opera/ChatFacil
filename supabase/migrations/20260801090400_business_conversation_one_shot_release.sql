-- Suppress the generic AI reply only for the inbound message handled by the
-- scheduling router. The next inbound message releases the conversation first,
-- allowing either a new deterministic flow or the normal AI agent to respond.

CREATE OR REPLACE FUNCTION public.business_release_previous_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  UPDATE public.conversations
  SET automation_state='{}'::jsonb,
      ai_handling=false,
      human_handling=false,
      ai_paused_until=NULL,
      handoff_reason=NULL,
      updated_at=now()
  WHERE id=NEW.conversation_id
    AND automation_state->>'step'='release';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.business_mark_completed_flow_for_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM public.outbound_queue
    WHERE source_message_id=NEW.id
      AND payload->>'source'='business_conversation'
  ) THEN
    UPDATE public.conversations
    SET automation_state=jsonb_build_object(
          'flow','business',
          'step','release'
        ),
        updated_at=now()
    WHERE id=NEW.conversation_id
      AND automation_state='{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aa_business_release_previous_flow ON public.messages;
CREATE TRIGGER trg_aa_business_release_previous_flow
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.direction='inbound')
  EXECUTE FUNCTION public.business_release_previous_flow();

DROP TRIGGER IF EXISTS trg_zz_business_mark_completed_flow ON public.messages;
CREATE TRIGGER trg_zz_business_mark_completed_flow
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.direction='inbound')
  EXECUTE FUNCTION public.business_mark_completed_flow_for_release();
