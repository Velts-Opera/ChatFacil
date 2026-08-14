CREATE TABLE IF NOT EXISTS public.internal_runtime_config(
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_runtime_config FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.internal_runtime_config TO service_role;
INSERT INTO public.internal_runtime_config(key,value,updated_at)
VALUES('edge_function_base_url','https://ncosftsthrzznevzkvbi.supabase.co/functions/v1',now())
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now();

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
  edge_base_url text;
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
  SELECT rtrim(value,'/') INTO edge_base_url
  FROM public.internal_runtime_config
  WHERE key='edge_function_base_url';

  IF worker_token IS NOT NULL AND edge_base_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := edge_base_url || '/business-automation-worker',
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
