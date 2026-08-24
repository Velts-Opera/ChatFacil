-- Restore professional self-service signup for real SaaS customers.
-- New users who provide a company name are provisioned into their own isolated tenant
-- automatically. No role/admin value is ever accepted from user metadata.

CREATE OR REPLACE FUNCTION public.provision_signup_account(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_meta JSONB;
  v_company_name TEXT;
  v_company_id UUID;
BEGIN
  SELECT * INTO v_user
  FROM auth.users
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  -- Idempotency: never create a second tenant for the same user.
  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = _user_id
    AND p.company_id IS NOT NULL;

  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.account_access (user_id, status, company_id, authorized_at)
    VALUES (_user_id, 'active', v_company_id, now())
    ON CONFLICT (user_id) DO UPDATE
      SET status = 'active',
          company_id = EXCLUDED.company_id,
          authorized_at = COALESCE(public.account_access.authorized_at, EXCLUDED.authorized_at);
    RETURN v_company_id;
  END IF;

  v_meta := COALESCE(v_user.raw_user_meta_data, '{}'::jsonb);
  v_company_name := NULLIF(TRIM(v_meta->>'company_name'), '');

  -- Keep malformed/legacy signups pending instead of creating an unnamed tenant.
  IF v_company_name IS NULL THEN
    INSERT INTO public.account_access (
      user_id, status, requested_company_name, requested_segment, requested_phone,
      requested_contact_name, requested_business_hours,
      requested_services_description, requested_communication_tone
    ) VALUES (
      _user_id, 'pending', NULL,
      NULLIF(TRIM(v_meta->>'segment'), ''),
      NULLIF(TRIM(v_meta->>'phone'), ''),
      NULLIF(TRIM(v_meta->>'contact_name'), ''),
      NULLIF(TRIM(v_meta->>'business_hours'), ''),
      NULLIF(TRIM(v_meta->>'services_description'), ''),
      NULLIF(TRIM(v_meta->>'communication_tone'), '')
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NULL;
  END IF;

  INSERT INTO public.companies (
    owner_id, name, segment, phone, email, contact_name,
    business_hours, services_description, communication_tone,
    plan, is_active
  ) VALUES (
    _user_id,
    v_company_name,
    NULLIF(TRIM(v_meta->>'segment'), ''),
    NULLIF(TRIM(v_meta->>'phone'), ''),
    v_user.email::text,
    COALESCE(NULLIF(TRIM(v_meta->>'contact_name'), ''), v_user.email::text),
    NULLIF(TRIM(v_meta->>'business_hours'), ''),
    NULLIF(TRIM(v_meta->>'services_description'), ''),
    COALESCE(NULLIF(TRIM(v_meta->>'communication_tone'), ''), 'profissional'),
    'start',
    true
  )
  RETURNING id INTO v_company_id;

  INSERT INTO public.profiles (id, company_id, full_name, email)
  VALUES (
    _user_id,
    v_company_id,
    COALESCE(NULLIF(TRIM(v_meta->>'contact_name'), ''), v_user.email::text),
    v_user.email::text
  )
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        email = COALESCE(public.profiles.email, EXCLUDED.email);

  -- Fixed server-side owner role. Never trust raw_user_meta_data for authorization.
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (_user_id, v_company_id, 'owner')
  ON CONFLICT DO NOTHING;

  PERFORM public.seed_company_defaults(v_company_id);

  INSERT INTO public.account_access (
    user_id, status, company_id,
    requested_company_name, requested_segment, requested_phone,
    requested_contact_name, requested_business_hours,
    requested_services_description, requested_communication_tone,
    authorized_at
  ) VALUES (
    _user_id, 'active', v_company_id,
    v_company_name,
    NULLIF(TRIM(v_meta->>'segment'), ''),
    NULLIF(TRIM(v_meta->>'phone'), ''),
    NULLIF(TRIM(v_meta->>'contact_name'), ''),
    NULLIF(TRIM(v_meta->>'business_hours'), ''),
    NULLIF(TRIM(v_meta->>'services_description'), ''),
    NULLIF(TRIM(v_meta->>'communication_tone'), ''),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'active',
        company_id = EXCLUDED.company_id,
        authorized_at = COALESCE(public.account_access.authorized_at, EXCLUDED.authorized_at),
        archived_at = NULL,
        archived_reason = NULL;

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_signup_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_signup_account(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.provision_signup_account(NEW.id);
  RETURN NEW;
END;
$$;

-- Repair already-confirmed visitors that were stranded by the manual activation gate.
-- Only accounts that supplied a company name are provisioned automatically.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT aa.user_id
    FROM public.account_access aa
    JOIN auth.users u ON u.id = aa.user_id
    WHERE aa.status = 'pending'
      AND aa.company_id IS NULL
      AND u.email_confirmed_at IS NOT NULL
      AND NULLIF(TRIM(COALESCE(aa.requested_company_name, u.raw_user_meta_data->>'company_name')), '') IS NOT NULL
  LOOP
    PERFORM public.provision_signup_account(r.user_id);
  END LOOP;
END;
$$;
