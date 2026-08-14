# Runbook de produção

## Sinais automáticos

O workflow `Production health` executa a cada dez minutos e valida cinco contratos:

1. a aplicação web responde;
2. o webhook Meta rejeita payload sem HMAC com `403`;
3. o worker rejeita chamada sem token com `401`;
4. o health check Meta exige usuário autenticado com `401`;
5. o gerador de IA exige usuário autenticado com `401`.

Uma falha abre ou atualiza uma issue `[alerta] Falha no health check de produção`.
Quando todos os contratos voltam a passar, o workflow comenta a recuperação e fecha a issue.

## Severidade

| Nível | Exemplos | Ação |
| --- | --- | --- |
| P0 | vazamento entre empresas, webhook aceitando evento sem HMAC, credencial exposta | bloquear onboarding e deploy; revogar/rotacionar credenciais; preservar evidências |
| P1 | mensagens não entram ou não saem, worker/Meta/IA indisponível, onboarding travado em escala | interromper novos onboardings; identificar componente; aplicar rollback validado |
| P2 | degradação parcial, latência, integração isolada | limitar impacto, abrir issue e corrigir no fluxo normal |

## Triagem

1. Abra o run do workflow indicado na issue e identifique o primeiro contrato que falhou.
2. Verifique logs das Edge Functions no Supabase para o mesmo intervalo.
3. Verifique o deployment ativo e os logs no Vercel.
4. Para Meta, confirme no WhatsApp Manager o status do número, WABA, webhook e token.
5. Para IA, confirme somente presença/validade da configuração; nunca copie chaves para issue ou log.
6. Para onboarding travado, consulte `whatsapp_onboarding_sessions` por estados `processing` ou `error`, sempre filtrando empresa e horário.

## Contenção

- Vazamento multi-tenant: desabilite imediatamente o fluxo afetado e trate como P0.
- Webhook/HMAC: mantenha o endpoint fechado; não crie bypass temporário.
- Meta: pause novos onboardings e preserve canais já conectados.
- IA: desative resposta automática do canal afetado e mantenha Inbox humana.
- Worker: pause o cron apenas se houver duplicação ou efeito destrutivo; preserve a fila para replay idempotente.

## Rollback

1. Identifique o último commit e deployment comprovadamente saudáveis.
2. Para frontend, reverta/promova o deployment anterior no Vercel.
3. Para Edge Function, redeploy somente a fonte versionada do commit saudável.
4. Para banco, prefira migration corretiva forward-only. Restore point-in-time exige aprovação explícita e validação em branch antes de produção.
5. Reexecute o health check e a suíte de isolamento antes de reabrir onboarding/deploy.

## Evidência para encerrar

- health check automático verde;
- CI com rebuild limpo e pgTAP verde;
- logs sem repetição do erro durante pelo menos dois ciclos de monitoramento;
- se Meta/IA estiver envolvida, mensagem real recebida, resposta automática, resposta humana e nova mensagem após reconexão;
- incidente documentado com causa, contenção, correção e prevenção.

## Gate externo Meta

O GO comercial exige uma conta Meta/WhatsApp Business nova, empresa nova e usuário sem privilégio administrativo. Execute e registre:

`cadastro → empresa → Embedded Signup → autorização → conexão → mensagem recebida → IA responde → Inbox → resposta humana → desconexão → reconexão → nova mensagem`.

A empresa piloto existente não serve como evidência deste gate.
