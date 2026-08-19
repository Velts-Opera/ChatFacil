-- Phase 1: account activation gate + platform-admin privacy hardening.
-- Intentionally does not change WhatsApp/Meta/Stella functions or existing tenant RLS.

CREATE TABLE IF NOT EXISTS public.account_access (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  requested_company_name TEXT,
  requested_segment TEXT,
  requested_phone TEXT,
  requested_contact_name TEXT,
  requested_business_hours TEXT,
  requested_services_description TEXT,
  requested_communication_tone TEXT,
  authorized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  authorized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_access TO service_role;

DROP TRIGGER IF EXISTS trg_account_access_updated_at ON public.account_access;
CREATE TRIGGER trg_account_access_updated_at
  BEFORE UPDATE ON public.account_access
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Preserve all existing users exactly as they are. Users already attached to a
-- company become active; orphan users become pending. No company is created here.
INSERT INTO public.account_access (
  user_id,
  status,
  company_id,
  requested_company_name,
  requested_segment,
  requested_phone,
  requested_contact_name,
  requested_business_hours,
  requested_services_description,
  requested_communication_tone,
  authorized_at
)
SELECT
  u.id,
  CASE WHEN p.company_id IS NOT NULL THEN 'active' ELSE 'pending' END,
  p.company_id,
  NULLIF(TRIM(u.raw_user_meta_data->>'company_name'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'segment'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'phone'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'contact_name'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'business_hours'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'services_description'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'communication_tone'), ''),
  CASE WHEN p.company_id IS NOT NULL THEN now() ELSE NULL END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ON CONFLICT (user_id) DO NOTHING;

-- Ordinary signup now creates only the auth user + a pending authorization
-- request. It no longer creates companies, profiles, roles, tags, channels or AI.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.account_access (
    user_id,
    status,
    requested_company_name,
    requested_segment,
    requested_phone,
    requested_contact_name,
    requested_business_hours,
    requested_services_description,
    requested_communication_tone
  ) VALUES (
    NEW.id,
    'pending',
    NULLIF(TRIM(meta->>'company_name'), ''),
    NULLIF(TRIM(meta->>'segment'), ''),
    NULLIF(TRIM(meta->>'phone'), ''),
    NULLIF(TRIM(meta->>'contact_name'), ''),
    NULLIF(TRIM(meta->>'business_hours'), ''),
    NULLIF(TRIM(meta->>'services_description'), ''),
    NULLIF(TRIM(meta->>'communication_tone'), '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Browser-safe self lookup. A disabled company is exposed as suspended without
-- changing account_access, so the existing company active switch remains useful.
CREATE OR REPLACE FUNCTION public.get_account_activation_state()
RETURNS TABLE(
  status TEXT,
  company_id UUID,
  company_name TEXT,
  company_is_active BOOLEAN,
  is_super_admin BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN aa.status = 'active' AND c.id IS NOT NULL AND NOT c.is_active THEN 'suspended'
      ELSE COALESCE(aa.status, CASE WHEN p.company_id IS NOT NULL THEN 'active' ELSE 'pending' END)
    END AS status,
    COALESCE(aa.company_id, p.company_id) AS company_id,
    c.name AS company_name,
    c.is_active AS company_is_active,
    public.is_super_admin() AS is_super_admin
  FROM (SELECT auth.uid() AS user_id) me
  LEFT JOIN public.account_access aa ON aa.user_id = me.user_id
  LEFT JOIN public.profiles p ON p.id = me.user_id
  LEFT JOIN public.companies c ON c.id = COALESCE(aa.company_id, p.company_id)
  WHERE me.user_id IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_account_activation_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_account_activation_state() TO authenticated, service_role;

-- Platform-only list of account authorization requests. This exposes account
-- metadata to the platform admin but never conversation/message content.
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
  ORDER BY
    CASE WHEN COALESCE(aa.status, CASE WHEN p.company_id IS NOT NULL THEN 'active' ELSE 'pending' END) = 'pending' THEN 0 ELSE 1 END,
    u.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_account_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_account_overview() TO authenticated, service_role;

-- The only supported path for creating a new customer tenant after this migration.
CREATE OR REPLACE FUNCTION public.admin_activate_account(
  _user_id UUID,
  _company_name TEXT DEFAULT NULL,
  _plan TEXT DEFAULT 'start'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.account_access%ROWTYPE;
  v_meta JSONB;
  v_email TEXT;
  v_company_id UUID;
  v_company_name TEXT;
  v_plan TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT u.raw_user_meta_data, u.email::text
    INTO v_meta, v_email
  FROM auth.users u
  WHERE u.id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  SELECT * INTO v_account
  FROM public.account_access
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.account_access (
      user_id,
      status,
      requested_company_name,
      requested_segment,
      requested_phone,
      requested_contact_name,
      requested_business_hours,
      requested_services_description,
      requested_communication_tone
    ) VALUES (
      _user_id,
      'pending',
      NULLIF(TRIM(v_meta->>'company_name'), ''),
      NULLIF(TRIM(v_meta->>'segment'), ''),
      NULLIF(TRIM(v_meta->>'phone'), ''),
      NULLIF(TRIM(v_meta->>'contact_name'), ''),
      NULLIF(TRIM(v_meta->>'business_hours'), ''),
      NULLIF(TRIM(v_meta->>'services_description'), ''),
      NULLIF(TRIM(v_meta->>'communication_tone'), '')
    );

    SELECT * INTO v_account
    FROM public.account_access
    WHERE user_id = _user_id
    FOR UPDATE;
  END IF;

  -- Legacy users that already own a tenant are associated rather than duplicated.
  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = _user_id AND p.company_id IS NOT NULL;

  IF v_company_id IS NOT NULL THEN
    UPDATE public.account_access
    SET status = 'active',
        company_id = v_company_id,
        authorized_by = auth.uid(),
        authorized_at = COALESCE(authorized_at, now())
    WHERE user_id = _user_id;
    RETURN v_company_id;
  END IF;

  IF v_account.status = 'active' AND v_account.company_id IS NOT NULL THEN
    RETURN v_account.company_id;
  END IF;

  v_company_name := COALESCE(
    NULLIF(TRIM(_company_name), ''),
    NULLIF(TRIM(v_account.requested_company_name), ''),
    NULLIF(TRIM(v_meta->>'company_name'), '')
  );

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Nome da empresa é obrigatório para ativação';
  END IF;

  v_plan := CASE WHEN _plan IN ('start', 'pro', 'business') THEN _plan ELSE 'start' END;

  INSERT INTO public.companies (
    owner_id,
    name,
    segment,
    phone,
    email,
    contact_name,
    business_hours,
    services_description,
    communication_tone,
    plan,
    is_active
  ) VALUES (
    _user_id,
    v_company_name,
    NULLIF(TRIM(COALESCE(v_account.requested_segment, v_meta->>'segment')), ''),
    NULLIF(TRIM(COALESCE(v_account.requested_phone, v_meta->>'phone')), ''),
    v_email,
    NULLIF(TRIM(COALESCE(v_account.requested_contact_name, v_meta->>'contact_name', v_email)), ''),
    NULLIF(TRIM(COALESCE(v_account.requested_business_hours, v_meta->>'business_hours')), ''),
    NULLIF(TRIM(COALESCE(v_account.requested_services_description, v_meta->>'services_description')), ''),
    COALESCE(NULLIF(TRIM(COALESCE(v_account.requested_communication_tone, v_meta->>'communication_tone')), ''), 'profissional'),
    v_plan,
    true
  )
  RETURNING id INTO v_company_id;

  INSERT INTO public.profiles (id, company_id, full_name, email)
  VALUES (
    _user_id,
    v_company_id,
    NULLIF(TRIM(COALESCE(v_account.requested_contact_name, v_meta->>'contact_name', v_email)), ''),
    v_email
  )
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        email = COALESCE(public.profiles.email, EXCLUDED.email);

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (_user_id, v_company_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- Bot-only defaults. No WhatsApp channel is created here; the customer must
  -- connect the official Meta channel through Embedded Signup during onboarding.
  PERFORM public.seed_company_defaults(v_company_id);

  UPDATE public.account_access
  SET status = 'active',
      company_id = v_company_id,
      authorized_by = auth.uid(),
      authorized_at = now()
  WHERE user_id = _user_id;

  RETURN v_company_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_activate_account(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activate_account(UUID, TEXT, TEXT) TO authenticated, service_role;

-- Close both provisioning and privacy bypasses. New companies must originate
-- from admin_activate_account; platform admins can no longer swap their profile
-- into another customer's tenant.
DROP FUNCTION IF EXISTS public.admin_enter_company(UUID);
DROP FUNCTION IF EXISTS public.admin_return_to_company(UUID);
DROP FUNCTION IF EXISTS public.admin_create_company(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- Remove privileged audit residue now because leaving a test superadmin is a P0,
-- while keeping the underlying audit user/company for the later cleanup phase.
DELETE FROM public.platform_admins pa
USING auth.users u
WHERE pa.user_id = u.id
  AND u.email LIKE 'audit-admin-%@example.invalid';
