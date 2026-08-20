begin;

create extension if not exists pgtap with schema extensions;
select plan(53);

-- Core ChatFacil contract: tenant + official WhatsApp + AI bot.
select has_table('public','companies','companies exists');
select has_table('public','profiles','profiles exists');
select has_table('public','user_roles','user roles exists');
select has_table('public','account_access','account activation state exists');
select has_table('public','platform_admins','platform admins exists');
select has_table('public','channels','WhatsApp channels exists');
select has_table('public','channel_secrets','encrypted channel secrets exists');
select has_table('public','contacts','WhatsApp contacts exists');
select has_table('public','conversations','conversations exists');
select has_table('public','messages','messages exists');
select has_table('public','ai_agent_settings','AI agent settings exists');
select has_table('public','ai_knowledge_items','AI knowledge exists');
select has_table('public','quick_replies','quick replies exists');
select has_table('public','whatsapp_onboarding_sessions','Meta onboarding sessions exists');

select has_column('public','channels','provider','channel provider exists');
select has_column('public','channels','phone_number_id','Meta phone number id exists');
select has_column('public','channels','waba_id','Meta WABA id exists');
select has_column('public','channels','connection_mode','Meta connection mode exists');
select has_column('public','channels','coexistence_active','Meta coexistence state exists');
select has_column('public','channels','ai_enabled','channel AI switch exists');
select has_column('public','channels','auto_reply_enabled','auto reply switch exists');
select has_column('public','channels','agent_id','channel agent binding exists');

select has_column('public','conversations','ai_handling','conversation AI state exists');
select has_column('public','conversations','human_handling','conversation human state exists');
select has_column('public','conversations','ai_paused_until','AI pause window exists');

select ok(relrowsecurity,'companies has RLS') from pg_class where oid='public.companies'::regclass;
select ok(relrowsecurity,'profiles has RLS') from pg_class where oid='public.profiles'::regclass;
select ok(relrowsecurity,'channels has RLS') from pg_class where oid='public.channels'::regclass;
select ok(relrowsecurity,'contacts has RLS') from pg_class where oid='public.contacts'::regclass;
select ok(relrowsecurity,'conversations has RLS') from pg_class where oid='public.conversations'::regclass;
select ok(relrowsecurity,'messages has RLS') from pg_class where oid='public.messages'::regclass;
select ok(relrowsecurity,'ai agent settings has RLS') from pg_class where oid='public.ai_agent_settings'::regclass;
select ok(relrowsecurity,'AI knowledge has RLS') from pg_class where oid='public.ai_knowledge_items'::regclass;

-- Explicitly reject the product surface removed in Phases 2/4.
select hasnt_table('public','appointments','Agenda is absent');
select hasnt_table('public','crm_sales','CRM sales is absent');
select hasnt_table('public','law_firm_profiles','legal firm module is absent');
select hasnt_table('public','legal_documents','legal documents module is absent');
select hasnt_table('public','matters','legal matters module is absent');
select hasnt_table('public','email_threads','email module is absent');
select hasnt_table('public','voice_calls','voice calls module is absent');
select hasnt_table('public','business_automation_settings','business automation settings is absent');
select hasnt_table('public','business_resources','business scheduling resources is absent');
select hasnt_table('public','outbound_queue','business automation outbound queue is absent');

select hasnt_column('public','contacts','funnel_stage','contacts have no sales funnel');
select hasnt_column('public','contacts','potential_value','contacts have no potential sale value');
select hasnt_column('public','contacts','closed_value','contacts have no closed sale value');
select hasnt_column('public','contacts','won_at','contacts have no CRM won timestamp');

select ok(to_regprocedure('public.admin_activate_account(uuid,text,text)') is not null,'controlled activation RPC exists');
select ok(to_regprocedure('public.admin_enter_company(uuid)') is null,'admin impersonation RPC is absent');
select ok(to_regprocedure('public.admin_create_company(text,text,text,text,text,text)') is null,'orphan tenant creation RPC is absent');
select results_eq($$select count(*) from cron.job where jobname='chatfacil-business-automation'$$,array[0::bigint],'business automation cron is absent');
select results_eq(
  $$select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.messages'::regclass and not t.tgisinternal and p.proname like 'business_%'$$,
  array[0::bigint],
  'messages have no business automation triggers'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='public.channels'::regclass and conname='channels_supported_whatsapp_provider_check'),
  'Meta-only WhatsApp provider constraint exists'
);

select * from finish();
rollback;
