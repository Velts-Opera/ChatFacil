-- Phase 3: preserve legacy auth identities without polluting the activation queue.
-- Accounts created before the Phase 1 activation gate and left without a tenant
-- after the controlled tenant cleanup are administrative archives, not new leads.

ALTER TABLE public.account_access
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

UPDATE public.account_access
SET archived_at = now(),
    archived_reason = 'phase3_legacy_tenant_cleanup'
WHERE status = 'pending'
  AND company_id IS NULL
  AND archived_at IS NULL
  AND created_at < TIMESTAMPTZ '2026-08-19 21:45:00+00';

CREATE OR REPLACE FUNCTION public.admin_account_overview()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  requested_company_name TEXT,
  status TEXT,
  company_id UUID,
  company_name TEXT,
  company_is_active BOOLEAN,
  account_created_at TIMESTAMPTZ,
  authorized_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email::text,
    COALESCE(aa.requested_company_name, NULLIF(TRIM(u.raw_user_meta_data->>'company_name'), '')),
    CASE
      WHEN aa.status = 'active' AND c.id IS NOT NULL AND NOT c.is_active THEN 'suspended'
      ELSE COALESCE(aa.status, CASE WHEN p.company_id IS NOT NULL THEN 'active' ELSE 'pending' END)
    END,
    COALESCE(aa.company_id, p.company_id),
    c.name,
    c.is_active,
    u.created_at,
    aa.authorized_at
  FROM auth.users u
  LEFT JOIN public.account_access aa ON aa.user_id = u.id
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.companies c ON c.id = COALESCE(aa.company_id, p.company_id)
  WHERE public.is_super_admin()
    AND aa.archived_at IS NULL
  ORDER BY
    CASE WHEN COALESCE(aa.status, CASE WHEN p.company_id IS NOT NULL THEN 'active' ELSE 'pending' END) = 'pending' THEN 0 ELSE 1 END,
    u.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_account_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_account_overview() TO authenticated, service_role;
