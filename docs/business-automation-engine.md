# Business Automation Engine

Este módulo transforma conversas do WhatsApp em operações reais de agenda e recuperação de receita. Ele não usa dados simulados e não altera o webhook principal: o roteador funciona no banco, antes da decisão de resposta da IA.

## O que funciona

- Cadastro real de serviços, duração, preço e recorrência.
- Profissionais/recursos e relação entre recurso e serviço.
- Horário de funcionamento por dia da semana.
- Cálculo de disponibilidade com fuso, antecedência e horizonte.
- Reserva atômica com `pg_advisory_xact_lock`, impedindo dupla reserva concorrente.
- Conclusão, cancelamento e confirmação de agendamentos.
- Atualização de recorrência, retorno esperado e valor acumulado do cliente.
- Fluxo conversacional: serviço → data → horário → reserva.
- Comandos de confirmação e cancelamento pelo WhatsApp.
- Detecção de clientes inativos, horários ociosos e lembretes.
- Fila com `FOR UPDATE SKIP LOCKED`, repetição exponencial e idempotência.
- Envio de campanhas somente por templates oficiais aprovados pela Meta.
- Métricas de receita agendada e recuperada.

## Ordem de implantação

```bash
supabase db push
supabase functions deploy business-automation-worker --no-verify-jwt
```

A função não aceita chamadas públicas apesar de usar `verify_jwt=false`. Ela exige `x-chatfacil-worker-token`, validado por SHA-256 em `internal_worker_tokens`.

## Configuração interna do worker

Execute uma vez por ambiente. O token é gerado dentro do banco e não aparece no terminal.

```sql
do $$
declare
  worker_token text;
  worker_hash text;
begin
  worker_token := encode(gen_random_bytes(48), 'hex');
  worker_hash := encode(digest(worker_token, 'sha256'), 'hex');

  insert into public.internal_worker_tokens(token_hash,name,enabled)
  values(worker_hash,'business-conversation-worker',true)
  on conflict(token_hash) do update set enabled=true;

  insert into public.internal_worker_secrets(name,token,rotated_at)
  values('business-conversation-worker',worker_token,now())
  on conflict(name) do update
    set token=excluded.token,rotated_at=now();
end $$;
```

Configure a URL-base do ambiente:

```sql
insert into public.internal_runtime_config(key,value,updated_at)
values(
  'edge_function_base_url',
  'https://SEU_PROJECT_REF.supabase.co/functions/v1',
  now()
)
on conflict(key) do update
  set value=excluded.value,updated_at=now();
```

## Executor periódico

O envio conversacional é acionado imediatamente por `pg_net`. O cron abaixo recupera tentativas que falharam e executa detecção de oportunidades.

```sql
do $$
declare
  worker_token text;
  command_sql text;
  existing_job bigint;
begin
  select token into worker_token
  from public.internal_worker_secrets
  where name='business-conversation-worker';

  if worker_token is null then
    raise exception 'Worker token não configurado';
  end if;

  select jobid into existing_job
  from cron.job
  where jobname='chatfacil-business-automation'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  command_sql := format(
    'select net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'',''application/json'',''x-chatfacil-worker-token'',%L), body := ''{"limit":20}''::jsonb);',
    rtrim((select value from public.internal_runtime_config where key='edge_function_base_url'),'/') || '/business-automation-worker',
    worker_token
  );

  perform cron.schedule(
    'chatfacil-business-automation',
    '*/5 * * * *',
    command_sql
  );
end $$;
```

## Configuração mínima de uma empresa

Cada empresa recebe automaticamente um recurso chamado `Atendimento`, horário de segunda a sexta das 09:00 às 18:00 e configurações seguras. Nenhum serviço fictício é criado.

Exemplo de configuração real:

```sql
insert into public.business_services(
  company_id,name,duration_minutes,price_cents,recurrence_days
)
values(
  'COMPANY_UUID',
  'Corte masculino',
  30,
  5000,
  21
);
```

Ajuste os horários antes de abrir a agenda:

```sql
delete from public.business_hours where company_id='COMPANY_UUID';

insert into public.business_hours(company_id,weekday,opens_at,closes_at)
values
  ('COMPANY_UUID',1,'09:00','18:00'),
  ('COMPANY_UUID',2,'09:00','18:00'),
  ('COMPANY_UUID',3,'09:00','18:00'),
  ('COMPANY_UUID',4,'09:00','18:00'),
  ('COMPANY_UUID',5,'09:00','18:00'),
  ('COMPANY_UUID',6,'09:00','14:00');
```

## Conversa suportada

Exemplo:

```text
Cliente: Quero agendar um corte
ChatFácil: Para qual dia você quer agendar Corte masculino?
Cliente: sexta
ChatFácil: 1. 09:00 — João ...
Cliente: 1
ChatFácil: Agendamento confirmado: Corte masculino em 07/08/2026 às 09:00.
```

Também são reconhecidos:

- `cancelar agendamento` / `desmarcar`;
- `confirmar agendamento`;
- `hoje`, `amanhã`, `depois de amanhã`;
- dias da semana;
- datas `DD/MM` e `DD/MM/AAAA`;
- seleção de serviço e horário por número ou nome.

Depois de uma resposta operacional, a IA fica bloqueada somente para aquela mensagem. A mensagem seguinte libera automaticamente o agente normal.

## Templates oficiais

Reativação e preenchimento de horário normalmente acontecem fora da janela de atendimento de 24 horas. Por isso o motor exige templates aprovados em `whatsapp_templates`.

Variáveis esperadas:

| Uso | Parâmetros de corpo |
| --- | --- |
| Reativação | nome do cliente |
| Horário ocioso | nome, serviço, data, hora |
| Lembrete | nome, serviço, data, hora |

Após a aprovação, associe os nomes reais:

```sql
update public.business_automation_settings
set
  reactivation_template_name='chatfacil_reativacao',
  empty_slot_template_name='chatfacil_horario_disponivel',
  reminder_template_name='chatfacil_lembrete_agendamento',
  template_language='pt_BR'
where company_id='COMPANY_UUID';
```

Ative somente depois de validar público, consentimento e templates:

```sql
update public.business_automation_settings
set
  reactivation_enabled=true,
  empty_slot_enabled=true,
  reminders_enabled=true,
  max_daily_outreach=20,
  max_contacts_per_slot=3
where company_id='COMPANY_UUID';
```

Reativação e horários ociosos ficam desativados por padrão. Isso impede disparos acidentais em uma empresa recém-criada.

## Operações principais

```sql
-- Disponibilidade
select * from public.business_available_slots(
  'COMPANY_UUID',
  'SERVICE_UUID',
  now(),
  now()+interval '7 days',
  null
);

-- Reserva atômica
select * from public.business_book_appointment(
  'COMPANY_UUID',
  'CONTACT_UUID',
  'SERVICE_UUID',
  'RESOURCE_UUID',
  '2026-08-03T12:00:00Z',
  'admin',
  null
);

-- Métricas
select public.business_metrics('COMPANY_UUID');
```

## Critérios de segurança

- RLS por empresa nas novas tabelas de negócio.
- Segredos e configuração interna sem acesso de `anon` ou `authenticated`.
- Templates aprovados obrigatórios para campanhas externas à janela de 24 horas.
- Opt-out em `contacts.automation_opt_out`.
- Limite diário por empresa.
- Idempotência por oportunidade e mensagem de origem.
- Reserva revalidada dentro de lock transacional.
