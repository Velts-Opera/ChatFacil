begin;

create extension if not exists pgtap with schema extensions;
select plan(42);

-- Tables recovered from the migration history stored in production.
select has_table('public', 'agent_profession_templates', 'agent profession templates exists');
select has_table('public', 'conflict_checks', 'conflict checks exists');
select has_table('public', 'consents', 'consents exists');
select has_table('public', 'contact_identities', 'contact identities exists');
select has_table('public', 'crm_sales', 'CRM sales exists');
select has_table('public', 'document_extractions', 'document extractions exists');
select has_table('public', 'email_threads', 'email threads exists');
select has_table('public', 'handoffs', 'handoffs exists');
select has_table('public', 'intake_fields', 'intake fields exists');
select has_table('public', 'intakes', 'intakes exists');
select has_table('public', 'law_firm_profiles', 'law firm profiles exists');
select has_table('public', 'legal_documents', 'legal documents exists');
select has_table('public', 'matter_parties', 'matter parties exists');
select has_table('public', 'matter_timeline', 'matter timeline exists');
select has_table('public', 'matters', 'matters exists');
select has_table('public', 'voice_calls', 'voice calls exists');

-- Product contracts added by the recovered migrations.
select has_column('public', 'channels', 'business_portfolio_id', 'Meta portfolio is versioned');
select has_column('public', 'channels', 'meta_business_agent_status', 'Meta agent state is versioned');
select has_column('public', 'channels', 'connection_mode', 'Meta connection mode is versioned');
select has_column('public', 'channels', 'coexistence_active', 'Meta coexistence state is versioned');
select has_column('public', 'ai_agent_settings', 'profession', 'agent profession is versioned');
select has_column('public', 'contacts', 'closed_value', 'closed sale value is versioned');
select has_column('public', 'contacts', 'normalized_name', 'normalized contact name is versioned');
select has_column('public', 'appointments', 'matter_id', 'legal matter appointment link is versioned');

-- Every recovered tenant table must keep RLS enabled.
select ok(relrowsecurity, 'agent profession templates has RLS') from pg_class where oid = 'public.agent_profession_templates'::regclass;
select ok(relrowsecurity, 'conflict checks has RLS') from pg_class where oid = 'public.conflict_checks'::regclass;
select ok(relrowsecurity, 'consents has RLS') from pg_class where oid = 'public.consents'::regclass;
select ok(relrowsecurity, 'contact identities has RLS') from pg_class where oid = 'public.contact_identities'::regclass;
select ok(relrowsecurity, 'CRM sales has RLS') from pg_class where oid = 'public.crm_sales'::regclass;
select ok(relrowsecurity, 'document extractions has RLS') from pg_class where oid = 'public.document_extractions'::regclass;
select ok(relrowsecurity, 'email threads has RLS') from pg_class where oid = 'public.email_threads'::regclass;
select ok(relrowsecurity, 'handoffs has RLS') from pg_class where oid = 'public.handoffs'::regclass;
select ok(relrowsecurity, 'intake fields has RLS') from pg_class where oid = 'public.intake_fields'::regclass;
select ok(relrowsecurity, 'intakes has RLS') from pg_class where oid = 'public.intakes'::regclass;
select ok(relrowsecurity, 'law firm profiles has RLS') from pg_class where oid = 'public.law_firm_profiles'::regclass;
select ok(relrowsecurity, 'legal documents has RLS') from pg_class where oid = 'public.legal_documents'::regclass;
select ok(relrowsecurity, 'matter parties has RLS') from pg_class where oid = 'public.matter_parties'::regclass;
select ok(relrowsecurity, 'matter timeline has RLS') from pg_class where oid = 'public.matter_timeline'::regclass;
select ok(relrowsecurity, 'matters has RLS') from pg_class where oid = 'public.matters'::regclass;
select ok(relrowsecurity, 'voice calls has RLS') from pg_class where oid = 'public.voice_calls'::regclass;

select ok(
  to_regprocedure('public.register_crm_sale(uuid,numeric,uuid,timestamp with time zone,date,text)') is not null,
  'register CRM sale RPC is versioned'
);
select ok(
  to_regprocedure('public.complete_crm_post_sale(uuid)') is not null,
  'complete CRM post-sale RPC is versioned'
);

select * from finish();
rollback;
