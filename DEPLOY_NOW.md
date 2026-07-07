# Deploy rápido — ChatFácil AI Production

## 1) Instalar dependências

```bash
npm ci
npm run build
```

## 2) Supabase

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

## 3) Secrets obrigatórios

```bash
supabase secrets set APP_ENCRYPTION_KEY="gere-uma-chave-forte-com-mais-de-32-caracteres"
supabase secrets set OPENAI_API_KEY="sk-..."
supabase secrets set OPENAI_MODEL="gpt-4o-mini"
supabase secrets set META_GRAPH_VERSION="v20.0"
```

## 4) Deploy das funções

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-test-connection
supabase functions deploy whatsapp-send-message
supabase functions deploy whatsapp-sync-templates
supabase functions deploy whatsapp-send-template
supabase functions deploy whatsapp-disconnect-channel
supabase functions deploy whatsapp-health-check
```

## 5) Meta Developers

Callback URL:

```txt
https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook
```

Webhook field:

```txt
messages
```

Use o Verify Token exibido em `Canais > WhatsApp`.
