CREATE OR REPLACE VIEW public.channel_public_view
WITH (security_invoker = true) AS
SELECT
  id, company_id, type, provider, name, status, phone_number, phone_number_id, waba_id,
  verify_token, webhook_url, last_error, last_error_code, connected_at, last_sync_at,
  verified_name, quality_rating, ai_enabled, auto_reply_enabled, human_handoff_enabled,
  handoff_when_unknown, greeting_message, out_of_hours_message, business_hours,
  app_secret_present, created_at, updated_at, agent_id, business_portfolio_id,
  meta_business_agent_status, meta_business_agent_eligible, meta_business_agent_enabled,
  meta_business_agent_last_checked_at, meta_business_agent_last_error,
  connection_mode, coexistence_active, coexistence_last_echo_at, coexistence_last_sync_at
FROM public.channels;

REVOKE ALL ON public.channel_public_view FROM PUBLIC, anon;
GRANT SELECT ON public.channel_public_view TO authenticated;
