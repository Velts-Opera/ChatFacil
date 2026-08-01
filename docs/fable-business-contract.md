# Contrato do Fable com a automação de negócio

A interface não deve escrever diretamente em `appointments` nem calcular horários no navegador. Toda operação crítica passa pelas funções transacionais do banco expostas em `src/lib/business-automation.ts`.

## Importação

```ts
import {
  createBusinessService,
  createBusinessResource,
  replaceBusinessHours,
  setBusinessResourceServices,
  getAvailableBusinessSlots,
  bookBusinessAppointment,
  getBusinessMetrics,
  getBusinessOnboardingStatus,
} from '@/lib/business-automation';
```

## Sequência do onboarding

1. Criar pelo menos um serviço real com duração e preço.
2. Criar ou editar os profissionais/recursos.
3. Vincular os serviços executados por cada profissional.
4. Substituir a grade semanal de horários.
5. Conectar o WhatsApp oficial.
6. Consultar `getBusinessOnboardingStatus(companyId)`.
7. Liberar a agenda quando `booking_ready` for `true`.
8. Liberar reativação somente quando `outreach_ready` for `true` e os templates reais estiverem associados.

## Exemplo de serviço

```ts
await createBusinessService({
  company_id: companyId,
  name: 'Corte masculino',
  duration_minutes: 30,
  price_cents: 5000,
  recurrence_days: 21,
});
```

## Exemplo de profissional

```ts
const professional = await createBusinessResource({
  company_id: companyId,
  name: 'João',
  kind: 'professional',
});

await setBusinessResourceServices(
  companyId,
  professional.id,
  [serviceId],
);
```

## Exemplo de horário semanal

```ts
await replaceBusinessHours(companyId, [
  { weekday: 1, opens_at: '09:00', closes_at: '18:00' },
  { weekday: 2, opens_at: '09:00', closes_at: '18:00' },
  { weekday: 3, opens_at: '09:00', closes_at: '18:00' },
  { weekday: 4, opens_at: '09:00', closes_at: '18:00' },
  { weekday: 5, opens_at: '09:00', closes_at: '18:00' },
  { weekday: 6, opens_at: '09:00', closes_at: '14:00' },
]);
```

`weekday` segue o PostgreSQL: domingo `0`, segunda `1` e sábado `6`.

## Consulta e reserva

```ts
const slots = await getAvailableBusinessSlots({
  companyId,
  serviceId,
  resourceId,
  from: new Date().toISOString(),
  to: new Date(Date.now() + 7 * 86_400_000).toISOString(),
});

const appointment = await bookBusinessAppointment({
  companyId,
  contactId,
  serviceId,
  resourceId: slots[0].resource_id,
  startsAt: slots[0].slot_start,
  bookingSource: 'admin',
});
```

A reserva revalida o horário dentro de um lock no banco. O Fable deve tratar `BusinessAutomationError` e recarregar a disponibilidade quando outro cliente ocupar o mesmo horário.

## Oportunidades e resultado

```ts
const created = await runBusinessOpportunityScan(companyId);
const opportunities = await listBusinessOpportunities(companyId);
const metrics = await getBusinessMetrics(companyId);
```

As campanhas não devem ser habilitadas automaticamente pela interface. O backend só coloca mensagens na fila quando o canal oficial está conectado, o contato não fez opt-out e o template configurado está aprovado pela Meta.

## Regras de interface

- Preços são armazenados em centavos.
- Serviços e profissionais com histórico devem ser arquivados, não excluídos.
- A grade semanal é substituída atomicamente por `replaceBusinessHours`.
- A relação profissional-serviço é substituída atomicamente por `setBusinessResourceServices`.
- `booking_ready` controla a publicação da agenda.
- `outreach_ready` não significa campanha ativada; significa que os pré-requisitos técnicos existem.
- A interface nunca deve inserir uma reserva diretamente na tabela `appointments`.
