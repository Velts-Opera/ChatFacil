begin;

create extension if not exists pgtap with schema extensions;
select plan(55);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'tenant-a@test.invalid', '{"company_name":"Tenant A"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'tenant-b@test.invalid', '{"company_name":"Tenant B"}');

select set_config(
  'test.company_a',
  (select company_id::text from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  true
);
select set_config(
  'test.company_b',
  (select company_id::text from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  true
);

insert into public.contacts (id, company_id, name) values
  ('a0000000-0000-4000-8000-000000000001', current_setting('test.company_a')::uuid, 'Contato A'),
  ('b0000000-0000-4000-8000-000000000001', current_setting('test.company_b')::uuid, 'Contato B');
insert into public.channels (id, company_id, name) values
  ('a0000000-0000-4000-8000-000000000002', current_setting('test.company_a')::uuid, 'Canal A'),
  ('b0000000-0000-4000-8000-000000000002', current_setting('test.company_b')::uuid, 'Canal B');
insert into public.conversations (id, company_id, contact_id, channel_id) values
  ('a0000000-0000-4000-8000-000000000003', current_setting('test.company_a')::uuid, 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000003', current_setting('test.company_b')::uuid, 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002');
insert into public.messages (id, company_id, channel_id, contact_id, conversation_id, content, meta_message_id) values
  ('a0000000-0000-4000-8000-000000000004', current_setting('test.company_a')::uuid, 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'Mensagem A', 'wamid.test-a'),
  ('b0000000-0000-4000-8000-000000000004', current_setting('test.company_b')::uuid, 'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'Mensagem B', 'wamid.test-b');
insert into public.appointments (id, company_id, contact_id, title, starts_at) values
  ('a0000000-0000-4000-8000-000000000005', current_setting('test.company_a')::uuid, 'a0000000-0000-4000-8000-000000000001', 'Agenda A', now() + interval '1 day'),
  ('b0000000-0000-4000-8000-000000000005', current_setting('test.company_b')::uuid, 'b0000000-0000-4000-8000-000000000001', 'Agenda B', now() + interval '1 day');
insert into public.business_services (id, company_id, name) values
  ('a0000000-0000-4000-8000-000000000006', current_setting('test.company_a')::uuid, 'Serviço A'),
  ('b0000000-0000-4000-8000-000000000006', current_setting('test.company_b')::uuid, 'Serviço B');
insert into public.business_resources (id, company_id, name) values
  ('a0000000-0000-4000-8000-000000000007', current_setting('test.company_a')::uuid, 'Profissional A'),
  ('b0000000-0000-4000-8000-000000000007', current_setting('test.company_b')::uuid, 'Profissional B');
insert into public.ai_agent_settings (id, company_id, agent_name) values
  ('a0000000-0000-4000-8000-000000000008', current_setting('test.company_a')::uuid, 'Agente A'),
  ('b0000000-0000-4000-8000-000000000008', current_setting('test.company_b')::uuid, 'Agente B')
on conflict (company_id) do update set agent_name = excluded.agent_name;
insert into public.business_opportunities (id, company_id, opportunity_type, fingerprint) values
  ('a0000000-0000-4000-8000-000000000009', current_setting('test.company_a')::uuid, 'inactive_customer', 'tenant-a-test'),
  ('b0000000-0000-4000-8000-000000000009', current_setting('test.company_b')::uuid, 'inactive_customer', 'tenant-b-test');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local request.jwt.claim.role = 'authenticated';

select ok(
  public.business_can_access_company(current_setting('test.company_a')::uuid),
  'empresa A -> A é permitido'
);
select ok(
  not public.business_can_access_company(current_setting('test.company_b')::uuid),
  'empresa A -> B é negado'
);
select ok(
  not has_function_privilege('authenticated', 'public.business_detect_opportunities(uuid)', 'execute'),
  'authenticated não executa RPC global de oportunidades'
);
select ok(
  not has_function_privilege('authenticated', 'public.business_enqueue_due_outreach(uuid)', 'execute'),
  'authenticated não executa RPC global de outreach'
);
select ok(
  has_function_privilege('service_role', 'public.business_detect_opportunities(uuid)', 'execute'),
  'service_role executa RPC global de oportunidades'
);
select ok(
  has_function_privilege('service_role', 'public.business_enqueue_due_outreach(uuid)', 'execute'),
  'service_role executa RPC global de outreach'
);

select results_eq(
  $$select count(*) from public.contacts where id in ('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001')$$,
  array[1::bigint], 'contacts SELECT isola A de B'
);
select lives_ok(format('insert into public.contacts(company_id,name) values (%L::uuid,%L)', current_setting('test.company_a'), 'Contato A2'), 'contacts INSERT próprio');
select throws_matching(format('insert into public.contacts(company_id,name) values (%L::uuid,%L)', current_setting('test.company_b'), 'Ataque B'), 'row-level security', 'contacts INSERT cruzado negado');
select results_eq($$update public.contacts set name='Ataque' where id='b0000000-0000-4000-8000-000000000001' returning 1$$, $$select 1 where false$$, 'contacts UPDATE cruzado negado');
select results_eq($$delete from public.contacts where id='b0000000-0000-4000-8000-000000000001' returning 1$$, $$select 1 where false$$, 'contacts DELETE cruzado negado');

select results_eq(
  $$select count(*) from public.conversations where id in ('a0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003')$$,
  array[1::bigint], 'conversations SELECT isola A de B'
);
select lives_ok(format('insert into public.conversations(company_id,contact_id) values (%L::uuid,%L::uuid)', current_setting('test.company_a'), 'a0000000-0000-4000-8000-000000000001'), 'conversations INSERT próprio');
select throws_matching(format('insert into public.conversations(company_id,contact_id) values (%L::uuid,%L::uuid)', current_setting('test.company_b'), 'b0000000-0000-4000-8000-000000000001'), '(row-level security|tenant mismatch)', 'conversations INSERT cruzado negado');
select results_eq($$update public.conversations set status='pendente' where id='b0000000-0000-4000-8000-000000000003' returning 1$$, $$select 1 where false$$, 'conversations UPDATE cruzado negado');
select results_eq($$delete from public.conversations where id='b0000000-0000-4000-8000-000000000003' returning 1$$, $$select 1 where false$$, 'conversations DELETE cruzado negado');

select results_eq(
  $$select count(*) from public.messages where id in ('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000004')$$,
  array[1::bigint], 'messages SELECT isola A de B'
);
select lives_ok(format('insert into public.messages(company_id,conversation_id,content) values (%L::uuid,%L::uuid,%L)', current_setting('test.company_a'), 'a0000000-0000-4000-8000-000000000003', 'Mensagem A2'), 'messages INSERT próprio');
select throws_matching(format('insert into public.messages(company_id,conversation_id,content) values (%L::uuid,%L::uuid,%L)', current_setting('test.company_b'), 'b0000000-0000-4000-8000-000000000003', 'Ataque B'), '(row-level security|tenant mismatch)', 'messages INSERT cruzado negado');
select results_eq($$update public.messages set content='Ataque' where id='b0000000-0000-4000-8000-000000000004' returning 1$$, $$select 1 where false$$, 'messages UPDATE cruzado negado');
select results_eq($$delete from public.messages where id='b0000000-0000-4000-8000-000000000004' returning 1$$, $$select 1 where false$$, 'messages DELETE cruzado negado');

select results_eq(
  $$select count(*) from public.channels where id in ('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002')$$,
  array[1::bigint], 'channels SELECT isola A de B'
);
select lives_ok(format('insert into public.channels(company_id,name) values (%L::uuid,%L)', current_setting('test.company_a'), 'Canal A2'), 'channels INSERT próprio');
select throws_matching(format('insert into public.channels(company_id,name) values (%L::uuid,%L)', current_setting('test.company_b'), 'Ataque B'), 'row-level security', 'channels INSERT cruzado negado');
select results_eq($$update public.channels set name='Ataque' where id='b0000000-0000-4000-8000-000000000002' returning 1$$, $$select 1 where false$$, 'channels UPDATE cruzado negado');
select results_eq($$delete from public.channels where id='b0000000-0000-4000-8000-000000000002' returning 1$$, $$select 1 where false$$, 'channels DELETE cruzado negado');

select results_eq(
  $$select count(*) from public.appointments where id in ('a0000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000005')$$,
  array[1::bigint], 'appointments SELECT isola A de B'
);
select lives_ok(format('insert into public.appointments(company_id,title,starts_at) values (%L::uuid,%L,now()+interval ''2 days'')', current_setting('test.company_a'), 'Agenda A2'), 'appointments INSERT próprio');
select throws_matching(format('insert into public.appointments(company_id,title,starts_at) values (%L::uuid,%L,now()+interval ''2 days'')', current_setting('test.company_b'), 'Ataque B'), 'row-level security', 'appointments INSERT cruzado negado');
select results_eq($$update public.appointments set title='Ataque' where id='b0000000-0000-4000-8000-000000000005' returning 1$$, $$select 1 where false$$, 'appointments UPDATE cruzado negado');
select results_eq($$delete from public.appointments where id='b0000000-0000-4000-8000-000000000005' returning 1$$, $$select 1 where false$$, 'appointments DELETE cruzado negado');

select results_eq(
  $$select count(*) from public.business_services where id in ('a0000000-0000-4000-8000-000000000006','b0000000-0000-4000-8000-000000000006')$$,
  array[1::bigint], 'services SELECT isola A de B'
);
select lives_ok(format('insert into public.business_services(company_id,name) values (%L::uuid,%L)', current_setting('test.company_a'), 'Serviço A2'), 'services INSERT próprio');
select throws_matching(format('insert into public.business_services(company_id,name) values (%L::uuid,%L)', current_setting('test.company_b'), 'Ataque B'), 'row-level security', 'services INSERT cruzado negado');
select results_eq($$update public.business_services set name='Ataque' where id='b0000000-0000-4000-8000-000000000006' returning 1$$, $$select 1 where false$$, 'services UPDATE cruzado negado');
select results_eq($$delete from public.business_services where id='b0000000-0000-4000-8000-000000000006' returning 1$$, $$select 1 where false$$, 'services DELETE cruzado negado');

select results_eq(
  $$select count(*) from public.business_resources where id in ('a0000000-0000-4000-8000-000000000007','b0000000-0000-4000-8000-000000000007')$$,
  array[1::bigint], 'professionals SELECT isola A de B'
);
select lives_ok(format('insert into public.business_resources(company_id,name) values (%L::uuid,%L)', current_setting('test.company_a'), 'Profissional A2'), 'professionals INSERT próprio');
select throws_matching(format('insert into public.business_resources(company_id,name) values (%L::uuid,%L)', current_setting('test.company_b'), 'Ataque B'), 'row-level security', 'professionals INSERT cruzado negado');
select results_eq($$update public.business_resources set name='Ataque' where id='b0000000-0000-4000-8000-000000000007' returning 1$$, $$select 1 where false$$, 'professionals UPDATE cruzado negado');
select results_eq($$delete from public.business_resources where id='b0000000-0000-4000-8000-000000000007' returning 1$$, $$select 1 where false$$, 'professionals DELETE cruzado negado');

select results_eq(
  $$select count(*) from public.ai_agent_settings where company_id in (current_setting('test.company_a')::uuid,current_setting('test.company_b')::uuid)$$,
  array[1::bigint], 'settings SELECT isola A de B'
);
select lives_ok(format('insert into public.ai_agent_settings(company_id,agent_name) values (%L::uuid,%L) on conflict(company_id) do update set agent_name=excluded.agent_name', current_setting('test.company_a'), 'Agente A2'), 'settings INSERT/UPSERT próprio');
select throws_matching(format('insert into public.ai_agent_settings(company_id,agent_name) values (%L::uuid,%L) on conflict(company_id) do update set agent_name=excluded.agent_name', current_setting('test.company_b'), 'Ataque B'), 'row-level security', 'settings INSERT cruzado negado');
select results_eq(format('update public.ai_agent_settings set agent_name=%L where company_id=%L::uuid returning 1', 'Ataque', current_setting('test.company_b')), $$select 1 where false$$, 'settings UPDATE cruzado negado');
select results_eq(format('delete from public.ai_agent_settings where company_id=%L::uuid returning 1', current_setting('test.company_b')), $$select 1 where false$$, 'settings DELETE cruzado negado');

select results_eq(
  $$select count(*) from public.business_opportunities where id in ('a0000000-0000-4000-8000-000000000009','b0000000-0000-4000-8000-000000000009')$$,
  array[1::bigint], 'opportunities SELECT isola A de B'
);
select lives_ok(format('insert into public.business_opportunities(company_id,opportunity_type,fingerprint) values (%L::uuid,%L,%L)', current_setting('test.company_a'), 'inactive_customer', 'tenant-a-test-2'), 'opportunities INSERT próprio');
select throws_matching(format('insert into public.business_opportunities(company_id,opportunity_type,fingerprint) values (%L::uuid,%L,%L)', current_setting('test.company_b'), 'inactive_customer', 'tenant-b-attack'), 'row-level security', 'opportunities INSERT cruzado negado');
select results_eq($$update public.business_opportunities set status='dismissed' where id='b0000000-0000-4000-8000-000000000009' returning 1$$, $$select 1 where false$$, 'opportunities UPDATE cruzado negado');
select results_eq($$delete from public.business_opportunities where id='b0000000-0000-4000-8000-000000000009' returning 1$$, $$select 1 where false$$, 'opportunities DELETE cruzado negado');

select ok(
  not has_table_privilege('authenticated', 'public.integration_settings', 'select,insert,update,delete'),
  'credenciais de integração não são expostas diretamente a authenticated'
);
select throws_matching(
  $$insert into public.messages(company_id,conversation_id,content,meta_message_id) values (current_setting('test.company_a')::uuid,'a0000000-0000-4000-8000-000000000003','Retry','wamid.test-a')$$,
  'duplicate key value',
  'retry/duplicação não persiste a mesma mensagem Meta duas vezes'
);
select lives_ok(
  format('select public.business_metrics(%L::uuid,now()-interval ''30 days'',now())', current_setting('test.company_a')),
  'metrics permite empresa A -> A'
);
select throws_matching(
  format('select public.business_metrics(%L::uuid,now()-interval ''30 days'',now())', current_setting('test.company_b')),
  'Acesso negado',
  'metrics nega empresa A -> B'
);

select * from finish();
rollback;
