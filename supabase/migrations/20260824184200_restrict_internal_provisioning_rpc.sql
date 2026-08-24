-- The browser only needs get_account_activation_state(). The helper runs under
-- that SECURITY DEFINER function and does not need to be directly exposed as RPC.
revoke execute on function public.ensure_current_account_provisioned() from authenticated;
grant execute on function public.ensure_current_account_provisioned() to service_role;
