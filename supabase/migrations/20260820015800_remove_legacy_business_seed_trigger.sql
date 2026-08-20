-- Phase 4: after removing Agenda/CRM/business automation tables, no company
-- creation path may call the retired business defaults seeder.

DROP TRIGGER IF EXISTS trg_companies_seed_business_defaults ON public.companies;
DROP FUNCTION IF EXISTS public.tg_seed_business_defaults();
DROP FUNCTION IF EXISTS public.seed_business_defaults(uuid);
