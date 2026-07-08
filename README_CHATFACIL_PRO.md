# ChatFácil AI PRODUCTION — WhatsApp Cloud API + IA + Supabase

Este pacote entrega a versão endurecida do Comunica AI / ChatFácil AI para operação real com WhatsApp Cloud API oficial.

## Entregue nesta versão

- Frontend React/TanStack pronto para Lovable/Vercel/Railway/Vite.
- Supabase Auth + RLS por empresa.
- Banco multiempresa com contatos, conversas, mensagens, canais, eventos, IA, templates, auditoria e health checks.
- Conexão real com WhatsApp Cloud API por `Phone Number ID`, `WABA ID`, `Access Token`, `Verify Token` e `App Secret`.
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

## O que não existe mais como dependência

- Não usa n8n.
- Não usa Make.
- Não usa QR Code.
- Não usa WhatsApp Web não oficial.
- Não depende de dados mockados para WhatsApp, webhook, inbox, eventos, mensagens ou IA.

## Variáveis do frontend

No Lovable/Vercel/Railway:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_PROJECT_ID=...
```

## Secrets das Supabase Edge Functions

Obrigatórios para produção:

```bash
supabase secrets set APP_ENCRYPTION_KEY="gere-uma-chave-forte-com-mais-de-32-caracteres"
supabase secrets set GEMINI_API_KEY="AIza..."
supabase secrets set META_GRAPH_VERSION="v20.0"
```

Opcionais:

```bash
# IA — Gemini é usado quando GEMINI_API_KEY existe; OpenAI é o fallback.
supabase secrets set GEMINI_MODEL="gemini-2.0-flash"
supabase secrets set OPENAI_API_KEY="sk-..."
supabase secrets set OPENAI_MODEL="gpt-4o-mini"

# Voz feminina de atendimento (respostas da IA em áudio no WhatsApp).
# Crie a chave em https://fish.audio/pt/app/api-keys/
supabase secrets set FISH_AUDIO_API_KEY="sua-chave-fish-audio"
# Escolha um modelo de voz feminina pt-BR em https://fish.audio e copie o ID dele:
supabase secrets set FISH_AUDIO_VOICE_ID="id-do-modelo-de-voz"
# Modelo TTS (padrão: s1):
supabase secrets set FISH_AUDIO_TTS_MODEL="s1"
```

`APP_ENCRYPTION_KEY` é obrigatória para novas conexões porque o token da Meta é criptografado antes de salvar.

## Voz feminina de atendimento (Fish Audio)

1. Configure `FISH_AUDIO_API_KEY` (e opcionalmente `FISH_AUDIO_VOICE_ID`) nos secrets acima.
2. Em `Canais > WhatsApp > IA de atendimento`, ligue **Responder com voz feminina**.
3. Opcional: informe um Voice ID específico por canal (sobrepõe o `FISH_AUDIO_VOICE_ID` global).
4. A IA responde o cliente com um áudio gerado pela Fish Audio. Se a geração ou o upload do áudio falhar, o cliente recebe a mesma resposta em texto (evento `voice_reply_failed_fallback_text` fica registrado em Eventos).

## Aplicar banco

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

## Deploy das Edge Functions

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-test-connection
supabase functions deploy whatsapp-send-message
supabase functions deploy whatsapp-sync-templates
supabase functions deploy whatsapp-send-template
supabase functions deploy whatsapp-disconnect-channel
supabase functions deploy whatsapp-health-check
```

## Configurar webhook na Meta

No Meta Developers / WhatsApp:

```txt
Callback URL:
https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook

Verify Token:
Use exatamente o token gerado/salvo em Canais > WhatsApp.

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
6. Informe Access Token, WABA ID, Phone Number ID, Verify Token e App Secret.
7. Clique em `Conectar e testar API real`.
8. Copie a Callback URL e configure na Meta.
9. Envie mensagem real para o número.
10. Acompanhe em Inbox, Eventos, Últimas mensagens, Processos da IA e Health Check.

## Observação comercial importante

O código está pronto para operação técnica real. Para vender publicamente, você ainda precisa ter:

- Conta Meta Business aprovada.
- Número apto para WhatsApp Cloud API.
- Templates aprovados para mensagens iniciadas pela empresa.
- Política de privacidade e termos.
- Chaves reais Supabase, Meta e OpenAI.

Sem essas credenciais externas nenhum código consegue enviar/receber WhatsApp real.
