# ChatFácil AI PRODUCTION — WhatsApp Cloud API + IA + Supabase

Este pacote entrega a versão endurecida do Comunica AI / ChatFácil AI para operação real com WhatsApp Cloud API oficial.

## Entregue nesta versão

- Frontend React/TanStack no Vercel e API permanente de WhatsApp QR/Baileys no Railway.
- Supabase Auth + RLS por empresa.
- Banco multiempresa com contatos, conversas, mensagens, canais, eventos, IA, templates, auditoria e health checks.
- Conexão real com WhatsApp Cloud API pelo Meta Embedded Signup, com QR de onboarding temporário e alternativa manual por `Phone Number ID`, `WABA ID`, `Access Token`, `Verify Token` e `App Secret`.
- Sessões de onboarding isoladas por empresa, token de uso único armazenado somente como hash SHA-256 e expiração automática.
- Credenciais salvas em tabela service-role only e criptografadas pela Edge Function usando `APP_ENCRYPTION_KEY`.
- Webhook real com verificação `GET`, recebimento `POST`, assinatura HMAC `x-hub-signature-256` quando App Secret existir, idempotência por `meta_message_id` e persistência do payload.
- Inbox real: contatos, conversas e mensagens vindas do banco.
- Envio real de mensagem de texto pela Cloud API.
- Templates oficiais: sincronizar templates aprovados na Meta e enviar template real.
- IA real via OpenAI: usa base de conhecimento da empresa, respostas rápidas e histórico recente.
- Regras de automação por palavra-chave antes da IA.
- Handoff humano quando IA está desligada, sem chave OpenAI ou sem segurança para responder.
- Health check real contra API da Meta.
- Auditoria de conexão, desconexão, sync de templates e envio de templates.

## Separação entre os dois tipos de QR

- Não usa n8n.
- Não usa Make.
- O QR oficial apenas abre `/onboarding/:token`; a autorização acontece no Embedded Signup da Meta e cria um canal `meta_cloud_api`.
- O provider `qr_code` usa a API Railway autenticada por JWT, com sessão Baileys persistente e exclusiva por `channel_id`. Ele não é usado pelo Embedded Signup e não oferece Calling API.
- Não depende de dados mockados para WhatsApp, webhook, inbox, eventos, mensagens ou IA.

## Variáveis do frontend

No Vercel/Railway:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_WA_API_URL=https://SEU-SERVICO.up.railway.app
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_PROJECT_ID=...
```

## Secrets das Supabase Edge Functions

Obrigatórios para produção:

```bash
supabase secrets set APP_ENCRYPTION_KEY="gere-uma-chave-forte-com-mais-de-32-caracteres"
supabase secrets set OPENAI_API_KEY="sk-..."
supabase secrets set OPENAI_MODEL="gpt-4o-mini"
supabase secrets set META_GRAPH_VERSION="v25.0"
supabase secrets set META_APP_ID="..."
supabase secrets set META_APP_SECRET="..."
supabase secrets set META_EMBEDDED_SIGNUP_CONFIG_ID="..."
supabase secrets set META_WEBHOOK_VERIFY_TOKEN="gere-um-token-forte"
```

`APP_ENCRYPTION_KEY` é obrigatória para novas conexões porque o token da Meta é criptografado antes de salvar.

## Aplicar banco

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

## Deploy das Edge Functions

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-test-connection --no-verify-jwt
supabase functions deploy whatsapp-send-message --no-verify-jwt
supabase functions deploy whatsapp-sync-templates --no-verify-jwt
supabase functions deploy whatsapp-send-template --no-verify-jwt
supabase functions deploy whatsapp-disconnect-channel --no-verify-jwt
supabase functions deploy whatsapp-health-check --no-verify-jwt
supabase functions deploy whatsapp-embedded-signup --no-verify-jwt
```

## Configurar webhook na Meta

No Meta Developers / WhatsApp:

```txt
Callback URL:
https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook

Verify Token:
No Embedded Signup, use o mesmo valor de META_WEBHOOK_VERIFY_TOKEN.
Na configuração manual, use exatamente o token salvo em Canais > WhatsApp.

Webhook Field:
messages
```

## Fluxo real

```txt
Cliente envia mensagem no WhatsApp
        ↓
Meta chama whatsapp-webhook
        ↓
Webhook valida assinatura, salva evento e evita duplicidade
        ↓
Cria/atualiza contato
        ↓
Cria/atualiza conversa
        ↓
Salva mensagem inbound
        ↓
Executa regra de automação ou IA
        ↓
Envia resposta pela Cloud API
        ↓
Atualiza Inbox, eventos, IA e métricas
```

## Teste de produção

1. Suba migrations no Supabase.
2. Configure os secrets.
3. Publique todas as Edge Functions.
4. Faça login no app.
5. Vá em `Canais > WhatsApp`.
6. Gere o QR de onboarding e abra o link como responsável da conta Meta.
7. Clique em `Conectar WhatsApp` e conclua o Embedded Signup oficial.
8. Confirme que o canal aparece como conectado; a configuração manual continua disponível como contingência.
9. Envie mensagem real para o número.
10. Acompanhe em Inbox, Eventos, Últimas mensagens, Processos da IA e Health Check.

## Limites atuais

- Texto pela Cloud API, base de conhecimento e handoff humano estão implementados.
- Download e transcrição de áudio recebido, resposta em áudio pela ElevenLabs, agenda e Calling API ainda não estão implementados.
- A Meta exige app configurado, HTTPS, permissões e aprovações adequadas para liberar o Embedded Signup a empresas externas.

## Observação comercial importante

O código está pronto para operação técnica real. Para vender publicamente, você ainda precisa ter:

- Conta Meta Business aprovada.
- Número apto para WhatsApp Cloud API.
- Templates aprovados para mensagens iniciadas pela empresa.
- Política de privacidade e termos.
- Chaves reais Supabase, Meta e OpenAI.

Sem essas credenciais externas nenhum código consegue enviar/receber WhatsApp real.
