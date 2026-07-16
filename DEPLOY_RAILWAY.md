# Deploy da API do WhatsApp no Railway

O `railway.toml` usa `server/Dockerfile`, publica o processo Node permanente e verifica `GET /health`. O servidor lê `process.env.PORT` e escuta em `0.0.0.0`.

## Variáveis exatas do Railway

Configure manualmente:

```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
GEMINI_API_KEY=SUA_GEMINI_API_KEY
ALLOWED_ORIGINS=https://SEU_FRONTEND.vercel.app
SESSION_DATA_PATH=/data
```

`PORT` é injetada automaticamente pelo Railway. Não crie variáveis de segredo compartilhado para o fluxo QR.

Crie um volume persistente montado em `/data`. Sem o volume, as credenciais Baileys desaparecem no próximo deploy e todos os canais precisarão de um novo QR.

## Variável exata do Vercel

Além das variáveis públicas do Supabase já usadas pelo app, configure:

```env
VITE_WA_API_URL=https://SEU_SERVICO.up.railway.app
```

Não coloque no Vercel nem em qualquer variável `VITE_*`:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

## Banco

Aplique as migrações antes do deploy do servidor:

```bash
npx supabase db push
```

A migração `railway_whatsapp_api` remove o campo de URL por canal, adiciona `channels.agent_id`, protege o vínculo agente/empresa e atualiza a view de canais para `security_invoker`.

## Validação

Depois do deploy:

```bash
npm run typecheck
npm test
npm run build
```

Valide também:

1. `GET /health` retorna `200` sem expor chaves.
2. Uma rota de canal sem Bearer token retorna `401`.
3. Um usuário da empresa A consultando canal da empresa B recebe `403`.
4. Um canal inexistente recebe `404`.
5. O QR de dois canais é diferente e não muda de dono.
6. Um redeploy preserva a sessão no volume `/data`.

## Edge Functions removíveis

Após publicar o frontend e o Railway desta versão, podem ser excluídas do projeto Supabase:

- `whatsapp-qr-bridge` (proxy antigo de QR);
- `whatsapp-qr-event` (callback antigo de eventos QR).

`whatsapp-send-message` permanece enquanto os canais Meta continuarem usando o transporte oficial existente. Ela rejeita canais `qr_code`; o Railway é o único caminho Baileys.
