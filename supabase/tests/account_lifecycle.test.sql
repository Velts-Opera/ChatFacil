begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f4000000-0000-4000-8000-000000000001', 'phase4-admin@test.invalid', '{}'),
  ('f4000000-0000-4000-8000-000000000002', 'phase4-a@test.invalid', '{"company_name":"Phase 4 Tenant A","contact_name":"Tenant A"}'),
  ('f4000000-0000-4000-8000-000000000003', 'phase4-b@test.invalid', '{"company_name":"Phase 4 Tenant B","contact_name":"Tenant B"}');

insert into public.platform_admins (user_id)
values ('f4000000-0000-4000-8000-000000000001')
on conflict (user_id) do nothing;

select ok(exists(select 1 from public.account_access where user_id='f4000000-0000-4000-8000-000000000002' and status='active' and company_id is not null and archived_at is null),'signup válido ativa account_access automaticamente');
select ok(exists(select 1 from public.profiles where id='f4000000-0000-4000-8000-000000000002' and company_id is not null),'signup válido cria profile isolado automaticamente');
select ok(exists(select 1 from public.companies where owner_id='f4000000-0000-4000-8000-000000000002'),'signup válido cria empresa própria automaticamente');

set local role authenticated;
set local request.jwt.claim.sub = 'f4000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
select results_eq($$select status::text from public.get_account_activation_state()$$,array['active'::text],'primeiro acesso confirma usuário já provisionado como active');
select results_eq($$select count(*) from public.companies$$,array[1::bigint],'usuário auto-provisionado enxerga somente a própria empresa');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'f4000000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';
select results_eq($$select status::text from public.get_account_activation_state()$$,array['active'::text],'segundo usuário também está provisionado sem intervenção administrativa');
reset role;

select set_config('test.phase4_company_a',(select company_id::text from public.profiles where id='f4000000-0000-4000-8000-000000000002'),true);
select set_config('test.phase4_company_b',(select company_id::text from public.profiles where id='f4000000-0000-4000-8000-000000000003'),true);

select ok(exists(select 1 from public.profiles where id='f4000000-0000-4000-8000-000000000002' and company_id=current_setting('test.phase4_company_a')::uuid),'auto-provisionamento associa profile ao tenant');
select ok(exists(select 1 from public.user_roles where user_id='f4000000-0000-4000-8000-000000000002' and company_id=current_setting('test.phase4_company_a')::uuid and role='owner'),'auto-provisionamento cria role owner');
select ok(exists(select 1 from public.ai_agent_settings where company_id=current_setting('test.phase4_company_a')::uuid),'auto-provisionamento cria agente IA');
select results_eq(format('select count(*) from public.channels where company_id=%L::uuid',current_setting('test.phase4_company_a')),array[0::bigint],'auto-provisionamento não cria canal antes do Embedded Signup');

insert into public.contacts(id,company_id,name) values ('f4000000-0000-4000-8000-000000000010',current_setting('test.phase4_company_b')::uuid,'Contato B');
insert into public.conversations(id,company_id,contact_id,status) values ('f4000000-0000-4000-8000-000000000011',current_setting('test.phase4_company_b')::uuid,'f4000000-0000-4000-8000-000000000010','aberta');
insert into public.messages(id,company_id,conversation_id,contact_id,content) values ('f4000000-0000-4000-8000-000000000012',current_setting('test.phase4_company_b')::uuid,'f4000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000010','Mensagem privada B');

set local role authenticated;
set local request.jwt.claim.sub = 'f4000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
select results_eq($$select status::text from public.get_account_activation_state()$$,array['active'::text],'usuário autorizado enxerga estado active');
select results_eq($$select count(*) from public.companies$$,array[1::bigint],'cliente ativo enxerga apenas a própria empresa');
select results_eq($$select count(*) from public.conversations where id='f4000000-0000-4000-8000-000000000011'$$,array[0::bigint],'cliente A não enxerga conversa do cliente B');
select results_eq($$select count(*) from public.messages where id='f4000000-0000-4000-8000-000000000012'$$,array[0::bigint],'cliente A não enxerga mensagem do cliente B');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'f4000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
select ok(public.is_super_admin(),'usuário de plataforma é superadmin');
select results_eq(format('select count(*) from public.companies where id=%L::uuid',current_setting('test.phase4_company_b')),array[1::bigint],'superadmin enxerga metadado da empresa B');
select results_eq($$select count(*) from public.contacts where id='f4000000-0000-4000-8000-000000000010'$$,array[0::bigint],'superadmin não enxerga contato do cliente B');
select results_eq($$select count(*) from public.conversations where id='f4000000-0000-4000-8000-000000000011'$$,array[0::bigint],'superadmin não enxerga conversa do cliente B');
select results_eq($$select count(*) from public.messages where id='f4000000-0000-4000-8000-000000000012'$$,array[0::bigint],'superadmin não enxerga mensagem do cliente B');
reset role;

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select results_eq($$select count(*) from public.messages where id='f4000000-0000-4000-8000-000000000012'$$,array[1::bigint],'service_role mantém acesso backend ao tenant B');
reset role;

update public.companies set is_active=false where id=current_setting('test.phase4_company_a')::uuid;

set local role authenticated;
set local request.jwt.claim.sub = 'f4000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
select results_eq($$select status::text from public.get_account_activation_state()$$,array['suspended'::text],'empresa desativada muda conta para suspended');
select ok(public.get_user_company_id() is null,'suspensão revoga company_id operacional');
select results_eq($$select count(*) from public.companies$$,array[0::bigint],'cliente suspenso não enxerga tenant');
reset role;

select ok(to_regprocedure('public.admin_enter_company(uuid)') is null,'RPC de impersonation permanece removida');
select ok(to_regprocedure('public.admin_create_company(text,text,text,text,text,text)') is null,'RPC antiga de criação órfã permanece removida');
select ok(not has_table_privilege('authenticated','public.account_access','select'),'authenticated não lê account_access diretamente');
select throws_matching(format('insert into public.channels(company_id,name,type,provider) values (%L::uuid,%L,%L,%L)',current_setting('test.phase4_company_b'),'Legacy QR','whatsapp','qr_code'),'channels_supported_whatsapp_provider_check','banco rejeita recriação de canal QR/Evolution');

select * from finish();
rollback;
