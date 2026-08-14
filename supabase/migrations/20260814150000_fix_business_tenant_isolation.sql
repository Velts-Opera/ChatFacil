-- Close tenant-isolation bypass in business automation.
-- SECURITY DEFINER changes current_user to the function owner, so never authorize
-- a request with current_user inside a SECURITY DEFINER function.

CREATE OR REPLACE FUNCTION public.business_can_access_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR _company_id = public.get_user_company_id()
    OR public.is_super_admin();
$$;

-- This helper is invoked by RLS policies, so authenticated users need EXECUTE.
REVOKE EXECUTE ON FUNCTION public.business_can_access_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_can_access_company(uuid) TO authenticated, service_role;

-- These jobs can process every company when _company_id is NULL. They are worker-only
-- operations and must never be exposed through PostgREST to signed-in users.
REVOKE EXECUTE ON FUNCTION public.business_detect_opportunities(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.business_enqueue_due_outreach(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_detect_opportunities(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_enqueue_due_outreach(uuid) TO service_role;
