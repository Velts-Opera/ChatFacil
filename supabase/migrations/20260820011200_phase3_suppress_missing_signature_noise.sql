-- Phase 3: keep unsigned webhook probes out of operational telemetry.
-- The Edge Function already rejects missing Meta signatures with HTTP 403.
-- Legitimate Meta POST webhooks are signed; invalid signatures remain logged.

CREATE OR REPLACE FUNCTION public.suppress_unsigned_webhook_noise()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type = 'signature_missing' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppress_unsigned_webhook_noise ON public.webhook_events;
CREATE TRIGGER trg_suppress_unsigned_webhook_noise
BEFORE INSERT ON public.webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.suppress_unsigned_webhook_noise();
