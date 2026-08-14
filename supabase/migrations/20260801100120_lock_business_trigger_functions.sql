REVOKE EXECUTE ON FUNCTION public.tg_seed_business_defaults() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.business_route_inbound_message() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.business_release_previous_flow() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.business_mark_completed_flow_for_release() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tg_seed_business_defaults() TO service_role;
GRANT EXECUTE ON FUNCTION public.business_route_inbound_message() TO service_role;
GRANT EXECUTE ON FUNCTION public.business_release_previous_flow() TO service_role;
GRANT EXECUTE ON FUNCTION public.business_mark_completed_flow_for_release() TO service_role;
