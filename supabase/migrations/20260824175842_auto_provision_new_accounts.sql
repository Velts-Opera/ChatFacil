-- Keep Git history aligned with the production migration applied during the P0 onboarding incident.
-- New authenticated users self-provision a tenant on first activation-state check.

create or replace function public.ensure_current_account_provisioned()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_meta jsonb;
  v_email text;
  v_account public.account_access%rowtype;
  v_company_id uuid;
  v_company_name text;
begin
  if v_user_id is null then
    return null;
  end if;

  select u.raw_user_meta_data, u.email::text
    into v_meta, v_email
  from auth.users u
  where u.id = v_user_id;

  if not found then
    return null;
  end if;

  insert into public.account_access (
    user_id,
    status,
    requested_company_name,
    requested_segment,
    requested_phone,
    requested_contact_name,
    requested_business_hours,
    requested_services_description,
    requested_communication_tone
  ) values (
    v_user_id,
    'pending',
    nullif(trim(v_meta->>'company_name'), ''),
    nullif(trim(v_meta->>'segment'), ''),
    nullif(trim(v_meta->>'phone'), ''),
    nullif(trim(v_meta->>'contact_name'), ''),
    nullif(trim(v_meta->>'business_hours'), ''),
    nullif(trim(v_meta->>'services_description'), ''),
    nullif(trim(v_meta->>'communication_tone'), '')
  )
  on conflict (user_id) do nothing;

  select * into v_account
  from public.account_access
  where user_id = v_user_id
  for update;

  select p.company_id into v_company_id
  from public.profiles p
  where p.id = v_user_id
    and p.company_id is not null;

  if v_company_id is not null then
    update public.account_access
    set status = 'active',
        company_id = v_company_id,
        authorized_at = coalesce(authorized_at, now()),
        updated_at = now()
    where user_id = v_user_id;
    return v_company_id;
  end if;

  if v_account.status = 'active' and v_account.company_id is not null then
    return v_account.company_id;
  end if;

  v_company_name := coalesce(
    nullif(trim(v_account.requested_company_name), ''),
    nullif(trim(v_meta->>'company_name'), ''),
    nullif(trim(v_meta->>'contact_name'), ''),
    nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
    'Minha empresa'
  );

  insert into public.companies (
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
  ) values (
    v_user_id,
    v_company_name,
    nullif(trim(coalesce(v_account.requested_segment, v_meta->>'segment')), ''),
    nullif(trim(coalesce(v_account.requested_phone, v_meta->>'phone')), ''),
    v_email,
    nullif(trim(coalesce(v_account.requested_contact_name, v_meta->>'contact_name', v_email)), ''),
    nullif(trim(coalesce(v_account.requested_business_hours, v_meta->>'business_hours')), ''),
    nullif(trim(coalesce(v_account.requested_services_description, v_meta->>'services_description')), ''),
    coalesce(nullif(trim(coalesce(v_account.requested_communication_tone, v_meta->>'communication_tone')), ''), 'profissional'),
    'start',
    true
  )
  returning id into v_company_id;

  insert into public.profiles (id, company_id, full_name, email)
  values (
    v_user_id,
    v_company_id,
    nullif(trim(coalesce(v_account.requested_contact_name, v_meta->>'contact_name', v_email)), ''),
    v_email
  )
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        email = coalesce(public.profiles.email, excluded.email);

  insert into public.user_roles (user_id, company_id, role)
  values (v_user_id, v_company_id, 'owner')
  on conflict do nothing;

  perform public.seed_company_defaults(v_company_id);

  update public.account_access
  set status = 'active',
      company_id = v_company_id,
      authorized_at = now(),
      updated_at = now()
  where user_id = v_user_id;

  return v_company_id;
end;
$function$;

revoke all on function public.ensure_current_account_provisioned() from public, anon;
grant execute on function public.ensure_current_account_provisioned() to authenticated, service_role;

create or replace function public.get_account_activation_state()
returns table(status text, company_id uuid, company_name text, company_is_active boolean, is_super_admin boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
begin
  if v_user_id is null then
    return;
  end if;

  v_company_id := public.ensure_current_account_provisioned();

  return query
  select
    case
      when aa.status = 'active' and c.id is not null and not c.is_active then 'suspended'
      else coalesce(aa.status, case when p.company_id is not null then 'active' else 'pending' end)
    end as status,
    coalesce(aa.company_id, p.company_id) as company_id,
    c.name as company_name,
    c.is_active as company_is_active,
    public.is_super_admin() as is_super_admin
  from public.account_access aa
  left join public.profiles p on p.id = v_user_id
  left join public.companies c on c.id = coalesce(aa.company_id, p.company_id)
  where aa.user_id = v_user_id;
end;
$function$;

revoke all on function public.get_account_activation_state() from public, anon;
grant execute on function public.get_account_activation_state() to authenticated, service_role;
