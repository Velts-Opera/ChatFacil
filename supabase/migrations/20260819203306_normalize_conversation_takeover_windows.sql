create or replace function public.normalize_conversation_takeover_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- When the application explicitly resumes AI, clear any stale human-takeover
  -- state so the next inbound message is not silently suppressed.
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

  -- The Inbox "assume human" action historically changed only ai_handling/status.
  -- Normalize it into the same takeover state consumed by the webhook.
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

  -- A normal human reply from WhatsApp Business or from the ChatFacil Inbox
  -- should prevent a double reply, but must not disable Stella for the full
  -- explicit-handoff window. Cap only these reply-driven pauses at 15 minutes.
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
    new.ai_paused_until := pg_catalog.least(
      pg_catalog.coalesce(
        new.ai_paused_until,
        pg_catalog.clock_timestamp() + interval '15 minutes'
      ),
      pg_catalog.clock_timestamp() + interval '15 minutes'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_conversation_takeover_state on public.conversations;
create trigger trg_normalize_conversation_takeover_state
before update on public.conversations
for each row
execute function public.normalize_conversation_takeover_state();
