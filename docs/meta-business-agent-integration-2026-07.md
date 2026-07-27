# Meta Business Agent + ChatFacil — estudo e integração

Atualizado em 27/07/2026.

## Resumo executivo

A Meta lançou em 03/06/2026 o Meta Business Agent e a Meta Business Agent Platform. A proposta é usar um agente de IA operado na infraestrutura da Meta, integrado aos canais de negócio e, no caso do WhatsApp, trabalhando junto da WhatsApp Business Platform.

Para o ChatFacil, a arquitetura correta não é substituir a Cloud API. O fluxo oficial já existente — Embedded Signup, WABA, Phone Number ID, webhooks e envio pela Graph API — continua sendo a camada de canal. O Meta Business Agent passa a ser uma camada opcional de automação nativa sobre o número oficial.

A integração deve coexistir com o inbox, atendimento humano, histórico e automações do ChatFacil, mas nunca permitir que o agente próprio do ChatFacil e o agente nativo da Meta respondam simultaneamente à mesma conversa.

## O que já existia no ChatFacil

- Embedded Signup oficial da Meta.
- Canal `provider = meta_cloud_api` por empresa.
- WABA ID e Phone Number ID persistidos.
- Access token e App Secret criptografados.
- Assinatura do WABA no app da Meta.
- Webhook oficial com validação HMAC.
- Inbox, contatos, mensagens e status de entrega/leitura.
- Agente próprio do ChatFacil e regras determinísticas.
- Handoff para atendimento humano.

Isso reduz bastante o trabalho: o ChatFacil já possui a identidade e as credenciais oficiais necessárias para tentar habilitar o agente da Meta sem voltar para uma conexão por WhatsApp Web/QR.

## Modelo alvo

```text
Cliente
  -> WhatsApp
    -> WhatsApp Business Platform / Cloud API
      -> Meta Business Agent (quando rollout nativo estiver ativo)
      -> Webhooks do ChatFacil
          -> Inbox / histórico / analytics / humano
          -> Agente ChatFacil somente quando Meta Business Agent estiver desligado
```

### Regra crítica de concorrência

Ao ativar o rollout do Meta Business Agent:

1. salvar os valores atuais de `ai_enabled` e `auto_reply_enabled`;
2. desligar ambos no canal;
3. manter webhook, inbox e atendimento humano ativos;
4. ao desativar o agente nativo, restaurar os valores anteriores.

Isso evita dupla resposta e permite rollback imediato.

## Ciclo implementado

O novo endpoint autenticado `meta-business-agent` expõe cinco ações:

### `status`

Retorna o estado local, versão da API usada e link do WhatsApp Manager quando o Business Portfolio ID puder ser resolvido.

### `check_eligibility`

Consulta a elegibilidade do Phone Number ID. O resultado é persistido no canal. Respostas de termos pendentes ficam separadas de erro genérico para orientar o operador ao WhatsApp Manager.

### `onboard`

Verifica elegibilidade e inicia o onboarding do agente nativo para o canal WhatsApp.

### `configure_from_chatfacil`

Sincroniza para o agente nativo as informações já cadastradas no ChatFacil:

- nome da empresa;
- segmento;
- descrição de serviços;
- horário;
- tom de comunicação;
- nome e instruções do agente;
- palavras de handoff.

A primeira configuração deixa o rollout desligado e a audiência em `ALLOWLISTED_ONLY`.

### `set_rollout`

Liga ou desliga o agente nativo. A interface inicial só ativa em allowlist. A expansão para clientes novos ou audiência total deve acontecer depois de validar comportamento, handoff e métricas.

## Banco de dados

Foram adicionados ao canal oficial:

- `business_portfolio_id`;
- `meta_business_agent_status`;
- `meta_business_agent_eligible`;
- `meta_business_agent_enabled`;
- `meta_business_agent_last_checked_at`;
- `meta_business_agent_last_error`;
- estado anterior dos switches de IA/auto reply para rollback.

Estados suportados:

`not_checked`, `eligible`, `ineligible`, `terms_required`, `onboarding`, `configured`, `enabled`, `error`.

## Interface

Nova rota autenticada:

`/meta-business-agent`

Ela permite:

1. verificar elegibilidade;
2. iniciar onboarding;
3. sincronizar configuração do ChatFacil;
4. abrir o WhatsApp Manager;
5. ativar o rollout em allowlist;
6. desativar e restaurar automaticamente a automação anterior.

## Segurança

- O token da Meta continua armazenado criptografado em `channel_secrets`.
- A Edge Function exige usuário autenticado e limita o canal ao `company_id` do usuário.
- O frontend não recebe access token nem App Secret.
- O rollout inicial é deliberadamente limitado a allowlist.
- O mecanismo nativo é opcional por canal e reversível.

## Banimento e restrições

Usar Cloud API, Embedded Signup e o mecanismo nativo da Meta elimina a dependência de automação que simula WhatsApp Web para este caminho e reduz uma classe importante de risco operacional. Isso não significa imunidade a restrições: políticas do WhatsApp, consentimento, qualidade, conteúdo, templates, limites e regras comerciais continuam válidos. Portanto o benefício deve ser tratado como redução de superfície de risco, não como garantia de que uma WABA ou número nunca será restringido.

O conector QR/Baileys pode continuar existindo como legado técnico, mas não deve ser a opção padrão para clientes que podem operar pela plataforma oficial.

## API e compatibilidade

A função deixa configuráveis:

- `META_BUSINESS_AGENT_API_BASE_URL` — default atual: `https://api.facebook.com`;
- `META_BUSINESS_AGENT_API_VERSION` — default atual: `2.0.0`.

A superfície observada em julho de 2026 inclui operações de elegibilidade, onboarding, business info, skills e settings. Como o produto está em rollout e a documentação pode mudar, base e versão ficam separadas do código de negócio para atualização sem refatorar o ChatFacil.

Antes de liberar produção ampla, validar a superfície exata disponível para o Business Portfolio/WABA do ChatFacil e registrar o payload real das respostas da Meta.

## Procedimento de implantação

1. Aplicar a migration `20260727000100_meta_business_agent_platform.sql`.
2. Fazer deploy da Edge Function `meta-business-agent`.
3. Confirmar os segredos já usados pelo Embedded Signup e Cloud API.
4. Abrir `/meta-business-agent` autenticado.
5. Rodar `Verificar elegibilidade`.
6. Se houver termos pendentes, aceitar no WhatsApp Manager e repetir a verificação.
7. Iniciar onboarding.
8. Sincronizar a configuração do ChatFacil.
9. Ativar apenas em allowlist.
10. Testar conversa, handoff, recebimento no inbox, status de mensagens e rollback.
11. Só depois adicionar etapas de audiência `NEW_CUSTOMERS` e `ALL`.

## Próxima camada

Depois do primeiro rollout validado, a integração deve ganhar:

- sincronização de FAQ estruturada;
- websites e arquivos como knowledge sources;
- catálogo/produtos quando disponíveis para a conta;
- métricas de resolução, handoff, conversão e custo;
- auditoria de mudanças da configuração;
- expansão do mesmo modelo para Instagram e Messenger conforme a Meta liberar para a conta;
- detecção de mudanças de elegibilidade/termos sem depender de intervenção manual.
