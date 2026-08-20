-- Phase 4: make tenant access predicate return a strict boolean.
-- NULL already behaves as denied inside RLS, but callers/tests should receive false.

CREATE OR REPLACE FUNCTION public.business_can_access_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR COALESCE(_company_id = public.get_user_company_id(), false);
$$;

REVOKE EXECUTE ON FUNCTION public.business_can_access_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_can_access_company(uuid) TO authenticated, service_role;
