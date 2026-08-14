-- Move worker credentials out of public tables and cron command text.
-- Tokens are generated in the database, hashed for verification, and only
-- decrypted by privileged code through Supabase Vault at request time.

-- A fresh rebuild may not have the production-only cron history that preceded
-- this migration. Establish the scheduler contract before rotating its token.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'chatfacil-business-automation'
       OR command ILIKE '%functions/v1/business-automation-worker%'
  ) THEN
    PERFORM cron.schedule(
      'chatfacil-business-automation',
      '*/5 * * * *',
      $cron$
        SELECT net.http_post(
          url := rtrim(config.value, '/') || '/business-automation-worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-chatfacil-worker-token',
            (SELECT token
             FROM public.internal_worker_secrets
             WHERE name = 'business-automation-cron')
          ),
          body := '{"limit":20}'::jsonb
        )
        FROM public.internal_runtime_config AS config
        WHERE config.key = 'edge_function_base_url';
      $cron$
    );
  END IF;
END;
$$;

DO $$
DECLARE
  cron_token text := encode(extensions.gen_random_bytes(48), 'hex');
  conversation_token text := encode(extensions.gen_random_bytes(48), 'hex');
  cron_job_id bigint;
BEGIN
  SELECT jobid INTO cron_job_id
  FROM cron.job
  WHERE jobname = 'chatfacil-business-automation'
     OR command ILIKE '%functions/v1/business-automation-worker%'
  LIMIT 1;

  IF cron_job_id IS NULL THEN
    RAISE EXCEPTION 'business-automation-worker cron job not found';
  END IF;

  PERFORM vault.create_secret(
    cron_token,
    'chatfacil_business_automation_cron_token',
    'Credential for the scheduled business automation worker',
    NULL
  );
  PERFORM vault.create_secret(
    conversation_token,
    'chatfacil_business_conversation_worker_token',
    'Credential for the business conversation worker',
    NULL
  );

  UPDATE public.internal_worker_tokens
  SET enabled = false
  WHERE name IN ('business-automation-cron', 'business-conversation-worker')
    AND enabled;

  INSERT INTO public.internal_worker_tokens(token_hash, name, enabled)
  VALUES
    (encode(extensions.digest(cron_token, 'sha256'), 'hex'), 'business-automation-cron', true),
    (encode(extensions.digest(conversation_token, 'sha256'), 'hex'), 'business-conversation-worker', true);

  PERFORM cron.alter_job(
    job_id := cron_job_id,
    command := $cron$
      SELECT net.http_post(
        url := rtrim(config.value, '/') || '/business-automation-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-chatfacil-worker-token',
          (select decrypted_secret
           from vault.decrypted_secrets
           where name = 'chatfacil_business_automation_cron_token')
        ),
        body := '{"limit":20}'::jsonb
      )
      FROM public.internal_runtime_config AS config
      WHERE config.key = 'edge_function_base_url';
    $cron$
  );
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
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  queue_id uuid;
  worker_token text;
  edge_base_url text;
BEGIN
  IF NULLIF(trim(_message), '') IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.outbound_queue(
    company_id, channel_id, conversation_id, contact_id, to_phone, kind, payload,
    status, next_attempt_at, source_message_id
  ) VALUES (
    _company_id, _channel_id, _conversation_id, _contact_id,
    regexp_replace(COALESCE(_to_phone, ''), '\\D', '', 'g'), 'text',
    jsonb_build_object('message', trim(_message), 'source', 'business_conversation'),
    'queued', now(), _source_message_id
  )
  ON CONFLICT (source_message_id) WHERE source_message_id IS NOT NULL
  DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
  RETURNING id INTO queue_id;

  SELECT decrypted_secret INTO worker_token
  FROM vault.decrypted_secrets
  WHERE name = 'chatfacil_business_conversation_worker_token';

  SELECT rtrim(value, '/') INTO edge_base_url
  FROM public.internal_runtime_config
  WHERE key = 'edge_function_base_url';

  IF worker_token IS NOT NULL AND edge_base_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := edge_base_url || '/business-automation-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-chatfacil-worker-token', worker_token
      ),
      body := jsonb_build_object('job_id', queue_id)
    );
  END IF;

  RETURN queue_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.business_queue_conversation_reply(uuid, uuid, uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_queue_conversation_reply(uuid, uuid, uuid, uuid, text, text, uuid)
  TO service_role;

DROP TABLE public.internal_worker_secrets;
