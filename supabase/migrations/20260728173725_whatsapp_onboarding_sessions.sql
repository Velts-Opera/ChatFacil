create table if not exists public.whatsapp_onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','authorizing','completed','expired','error')),
  waba_id text,
  phone_number_id text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_onboarding_sessions_company_created
  on public.whatsapp_onboarding_sessions(company_id, created_at desc);
create index if not exists idx_whatsapp_onboarding_sessions_status_expires
  on public.whatsapp_onboarding_sessions(status, expires_at);

alter table public.whatsapp_onboarding_sessions enable row level security;
revoke all on public.whatsapp_onboarding_sessions from anon, authenticated;
grant all on public.whatsapp_onboarding_sessions to service_role;

drop trigger if exists trg_whatsapp_onboarding_sessions_updated_at on public.whatsapp_onboarding_sessions;
create trigger trg_whatsapp_onboarding_sessions_updated_at
  before update on public.whatsapp_onboarding_sessions
  for each row execute function public.tg_set_updated_at();
