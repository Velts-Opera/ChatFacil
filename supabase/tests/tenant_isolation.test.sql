begin;

create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('99999999-9999-4999-8999-999999999999', 'platform-admin@test.invalid', '{}'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'tenant-a@test.invalid', '{"company_name":"Tenant A"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'tenant-b@test.invalid', '{"company_name":"Tenant B"}');

insert into public.platform_admins(user_id)
values ('99999999-9999-4999-8999-999999999999');

set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
set local request.jwt.claim.role = 'authenticated';
select public.admin_activate_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'start');
select public.admin_activate_account('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, 'start');
reset role;

select set_config('test.company_a',(select company_id::text from public.profiles where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),true);
select set_config('test.company_b',(select company_id::text from public.profiles where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),true);

insert into public.contacts(id,company_id,name) values
('a0000000-0000-4000-8000-000000000001',current_setting('test.company_a')::uuid,'Contato A'),
('b0000000-0000-4000-8000-000000000001',current_setting('test.company_b')::uuid,'Contato B');

insert into public.channels(id,company_id,name,type,provider) values
('a0000000-0000-4000-8000-000000000002',current_setting('test.company_a')::uuid,'Meta A','whatsapp','meta_cloud_api'),
('b0000000-0000-4000-8000-000000000002',current_setting('test.company_b')::uuid,'Meta B','whatsapp','meta_cloud_api');

insert into public.conversations(id,company_id,contact_id,channel_id) values
('a0000000-0000-4000-8000-000000000003',current_setting('test.company_a')::uuid,'a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002'),
('b0000000-0000-4000-8000-000000000003',current_setting('test.company_b')::uuid,'b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002');

insert into public.messages(id,company_id,channel_id,contact_id,conversation_id,content,meta_message_id) values
('a0000000-0000-4000-8000-000000000004',current_setting('test.company_a')::uuid,'a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','Mensagem A','wamid.test-a'),
('b0000000-0000-4000-8000-000000000004',current_setting('test.company_b')::uuid,'b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000003','Mensagem B','wamid.test-b');

insert into public.ai_knowledge_items(id,company_id,title,content) values
('a0000000-0000-4000-8000-000000000005',current_setting('test.company_a')::uuid,'KB A','Conteúdo A'),
('b0000000-0000-4000-8000-000000000005',current_setting('test.company_b')::uuid,'KB B','Conteúdo B');

insert into public.quick_replies(id,company_id,title,message) values
('a0000000-0000-4000-8000-000000000006',current_setting('test.company_a')::uuid,'QR A','Resposta A'),
('b0000000-0000-4000-8000-000000000006',current_setting('test.company_b')::uuid,'QR B','Resposta B');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local request.jwt.claim.role = 'authenticated';

select ok(public.business_can_access_company(current_setting('test.company_a')::uuid),'empresa A -> A é permitido');
select ok(not public.business_can_access_company(current_setting('test.company_b')::uuid),'empresa A -> B é negado');
select results_eq($$select count(*) from public.companies$$,array[1::bigint],'companies SELECT mostra só a própria empresa');

select results_eq($$select count(*) from public.contacts where id in ('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001')$$,array[1::bigint],'contacts SELECT isola A de B');
select lives_ok(format('insert into public.contacts(company_id,name) values (%L::uuid,%L)',current_setting('test.company_a'),'Contato A2'),'contacts INSERT próprio');
select throws_matching(format('insert into public.contacts(company_id,name) values (%L::uuid,%L)',current_setting('test.company_b'),'Ataque B'),'row-level security','contacts INSERT cruzado negado');
select results_eq($$update public.contacts set name='Ataque' where id='b0000000-0000-4000-8000-000000000001' returning 1$$,$$select 1 where false$$,'contacts UPDATE cruzado negado');
select results_eq($$delete from public.contacts where id='b0000000-0000-4000-8000-000000000001' returning 1$$,$$select 1 where false$$,'contacts DELETE cruzado negado');

select results_eq($$select count(*) from public.channels where id in ('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002')$$,array[1::bigint],'channels SELECT isola A de B');
select lives_ok(format('insert into public.channels(company_id,name) values (%L::uuid,%L)',current_setting('test.company_a'),'Meta A2'),'channels INSERT próprio');
select throws_matching(format('insert into public.channels(company_id,name) values (%L::uuid,%L)',current_setting('test.company_b'),'Ataque B'),'row-level security','channels INSERT cruzado negado');
select results_eq($$update public.channels set name='Ataque' where id='b0000000-0000-4000-8000-000000000002' returning 1$$,$$select 1 where false$$,'channels UPDATE cruzado negado');
select results_eq($$delete from public.channels where id='b0000000-0000-4000-8000-000000000002' returning 1$$,$$select 1 where false$$,'channels DELETE cruzado negado');

select results_eq($$select count(*) from public.conversations where id in ('a0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003')$$,array[1::bigint],'conversations SELECT isola A de B');
select lives_ok(format('insert into public.conversations(company_id,contact_id) values (%L::uuid,%L::uuid)',current_setting('test.company_a'),'a0000000-0000-4000-8000-000000000001'),'conversations INSERT próprio');
select throws_matching(format('insert into public.conversations(company_id,contact_id) values (%L::uuid,%L::uuid)',current_setting('test.company_b'),'b0000000-0000-4000-8000-000000000001'),'(row-level security|tenant mismatch)','conversations INSERT cruzado negado');
select results_eq($$update public.conversations set status='pendente' where id='b0000000-0000-4000-8000-000000000003' returning 1$$,$$select 1 where false$$,'conversations UPDATE cruzado negado');
select results_eq($$delete from public.conversations where id='b0000000-0000-4000-8000-000000000003' returning 1$$,$$select 1 where false$$,'conversations DELETE cruzado negado');

select results_eq($$select count(*) from public.messages where id in ('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000004')$$,array[1::bigint],'messages SELECT isola A de B');
select lives_ok(format('insert into public.messages(company_id,conversation_id,content) values (%L::uuid,%L::uuid,%L)',current_setting('test.company_a'),'a0000000-0000-4000-8000-000000000003','Mensagem A2'),'messages INSERT próprio');
select throws_matching(format('insert into public.messages(company_id,conversation_id,content) values (%L::uuid,%L::uuid,%L)',current_setting('test.company_b'),'b0000000-0000-4000-8000-000000000003','Ataque B'),'(row-level security|tenant mismatch)','messages INSERT cruzado negado');
select results_eq($$update public.messages set content='Ataque' where id='b0000000-0000-4000-8000-000000000004' returning 1$$,$$select 1 where false$$,'messages UPDATE cruzado negado');
select results_eq($$delete from public.messages where id='b0000000-0000-4000-8000-000000000004' returning 1$$,$$select 1 where false$$,'messages DELETE cruzado negado');

select results_eq(format('select count(*) from public.ai_agent_settings where company_id in (%L::uuid,%L::uuid)',current_setting('test.company_a'),current_setting('test.company_b')),array[1::bigint],'agent settings SELECT isola A de B');
select results_eq(format('update public.ai_agent_settings set agent_name=%L where company_id=%L::uuid returning 1','Ataque',current_setting('test.company_b')),$$select 1 where false$$,'agent settings UPDATE cruzado negado');

select results_eq($$select count(*) from public.ai_knowledge_items where id in ('a0000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000005')$$,array[1::bigint],'knowledge SELECT isola A de B');
select lives_ok(format('insert into public.ai_knowledge_items(company_id,title,content) values (%L::uuid,%L,%L)',current_setting('test.company_a'),'KB A2','Conteúdo A2'),'knowledge INSERT próprio');
select throws_matching(format('insert into public.ai_knowledge_items(company_id,title,content) values (%L::uuid,%L,%L)',current_setting('test.company_b'),'Ataque','Ataque'),'row-level security','knowledge INSERT cruzado negado');
select results_eq($$update public.ai_knowledge_items set title='Ataque' where id='b0000000-0000-4000-8000-000000000005' returning 1$$,$$select 1 where false$$,'knowledge UPDATE cruzado negado');
select results_eq($$delete from public.ai_knowledge_items where id='b0000000-0000-4000-8000-000000000005' returning 1$$,$$select 1 where false$$,'knowledge DELETE cruzado negado');

select results_eq($$select count(*) from public.quick_replies where id in ('a0000000-0000-4000-8000-000000000006','b0000000-0000-4000-8000-000000000006')$$,array[1::bigint],'quick replies SELECT isola A de B');
select lives_ok(format('insert into public.quick_replies(company_id,title,message) values (%L::uuid,%L,%L)',current_setting('test.company_a'),'QR A2','Resposta A2'),'quick replies INSERT próprio');
select throws_matching(format('insert into public.quick_replies(company_id,title,message) values (%L::uuid,%L,%L)',current_setting('test.company_b'),'Ataque','Ataque'),'row-level security','quick replies INSERT cruzado negado');
select results_eq($$update public.quick_replies set title='Ataque' where id='b0000000-0000-4000-8000-000000000006' returning 1$$,$$select 1 where false$$,'quick replies UPDATE cruzado negado');
select results_eq($$delete from public.quick_replies where id='b0000000-0000-4000-8000-000000000006' returning 1$$,$$select 1 where false$$,'quick replies DELETE cruzado negado');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
set local request.jwt.claim.role = 'authenticated';
select results_eq(format('select count(*) from public.companies where id=%L::uuid',current_setting('test.company_b')),array[1::bigint],'superadmin vê metadado da empresa B');
select results_eq($$select count(*) from public.contacts where id='b0000000-0000-4000-8000-000000000001'$$,array[0::bigint],'superadmin não vê contatos do cliente B');
select results_eq($$select count(*) from public.conversations where id='b0000000-0000-4000-8000-000000000003'$$,array[0::bigint],'superadmin não vê conversas do cliente B');
select results_eq($$select count(*) from public.messages where id='b0000000-0000-4000-8000-000000000004'$$,array[0::bigint],'superadmin não vê mensagens do cliente B');
select ok(not public.business_can_access_company(current_setting('test.company_b')::uuid),'superadmin não recebe acesso operacional ao cliente B');
reset role;

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select ok(public.business_can_access_company(current_setting('test.company_b')::uuid),'service_role mantém acesso backend ao tenant B');
reset role;

select throws_matching(format('insert into public.channels(company_id,name,type,provider) values (%L::uuid,%L,%L,%L)',current_setting('test.company_a'),'Legacy QR','whatsapp','qr_code'),'channels_supported_whatsapp_provider_check','provider legado é bloqueado no banco');
select ok(not has_table_privilege('authenticated','public.account_access','select'),'authenticated não lê account_access diretamente');
select ok(to_regprocedure('public.admin_enter_company(uuid)') is null,'impersonation continua removida');
select ok(to_regprocedure('public.admin_create_company(text,text,text,text,text,text)') is null,'criação órfã antiga continua removida');

select * from finish();
rollback;
