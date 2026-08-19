create or replace function public.normalize_conversation_takeover_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ai_handling is true then
    new.human_handling := false;
    new.ai_paused_until := null;
    if new.handoff_reason in (
      'Atendimento assumido pelo WhatsApp Business',
      'Atendimento assumido por uma pessoa',
      'Atendimento assumido manualmente'
    ) then
      new.handoff_reason := null;
    end if;
    return new;
  end if;

  if new.handoff_reason = 'Atendimento assumido manualmente'
     and new.ai_handling is false
     and (
       old.handoff_reason is distinct from new.handoff_reason
       or old.ai_handling is distinct from new.ai_handling
       or old.human_handling is distinct from true
     ) then
    new.human_handling := true;
    new.ai_paused_until := pg_catalog.clock_timestamp() + interval '8 hours';
    return new;
  end if;

  if new.human_handling is true
     and new.handoff_reason in (
       'Atendimento assumido pelo WhatsApp Business',
       'Atendimento assumido por uma pessoa'
     )
     and (
       old.human_handling is distinct from new.human_handling
       or old.handoff_reason is distinct from new.handoff_reason
       or old.ai_paused_until is distinct from new.ai_paused_until
     ) then
    new.ai_paused_until := least(
      coalesce(
        new.ai_paused_until,
        pg_catalog.clock_timestamp() + interval '15 minutes'
      ),
      pg_catalog.clock_timestamp() + interval '15 minutes'
    );
  end if;

  return new;
end;
$$;
