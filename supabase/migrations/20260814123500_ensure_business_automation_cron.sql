-- The production cron job existed outside Git. Recreate it deterministically so a
-- fresh database has the same scheduler contract before credentials move to Vault.

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
