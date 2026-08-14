
create or replace function public.validate_channel_agent_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  agent_matches boolean;
begin
  if new.agent_id is null then
    return new;
  end if;

  if to_regclass('public.ai_agent_settings') is null then
    raise exception 'Configuração de agente indisponível para vincular ao canal.'
      using errcode = '23514';
  end if;

  execute
    'select exists (
       select 1
       from public.ai_agent_settings
       where id = $1 and company_id = $2
     )'
    into agent_matches
    using new.agent_id, new.company_id;

  if not agent_matches then
    raise exception 'O agente do canal deve pertencer à mesma empresa.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
