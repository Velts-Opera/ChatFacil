# Arquitetura Multi-tenant — WhatsApp por QR Code

Cada empresa (tenant) conecta **o próprio número de WhatsApp**, tem **a própria sessão**,
**o próprio QR Code** e **o próprio agente de IA**. Nada é compartilhado entre empresas.

## Como funciona

```
Navegador do cliente (Vercel)
        │  supabase.functions.invoke("whatsapp-qr-bridge")  ← JWT do usuário
        ▼
Edge Function whatsapp-qr-bridge (Supabase)
        │  1. valida o login (JWT)
        │  2. confere que o canal pertence à empresa do usuário (company_id)
        │  3. repassa ao bridge com o BRIDGE_SECRET (nunca exposto ao navegador)
        ▼
WhatsApp Bridge (Railway/Render/VPS — processo Node persistente)
        │  1 sessão Baileys POR CANAL (Map channelId → sessão isolada)
        │  credenciais salvas em /data/sessions/<channelId>/ (volume persistente)
        │  restaura TODAS as sessões automaticamente após restart
        ▼
WhatsApp do cliente (número exclusivo dele)
```

Mensagem recebida → o bridge chama o **agente exclusivo do tenant**
(`server/lib/tenant-agent.js`): carrega a base de conhecimento, o tom e os serviços
**apenas da empresa dona do canal** e responde pelo **número daquele canal**.

Resposta humana pelo Inbox → Edge Function `whatsapp-send-message` detecta
`provider = qr_code` e envia pela sessão do canal no bridge (canais Meta Cloud API
continuam indo pela API oficial).

## Garantias de isolamento

| Camada | Mecanismo |
| --- | --- |
| Banco | RLS por `company_id` em todas as tabelas (canais, conversas, mensagens, IA) |
| Edge Function | Só opera canais `qr_code` da empresa do usuário autenticado |
| Bridge | Uma sessão Baileys por canal; diretório de credenciais separado por canal |
| Agente IA | Prompt montado somente com dados (`ai_knowledge_items`, `quick_replies`, empresa) do tenant dono do canal |
| Segredo | `BRIDGE_SECRET` só existe no bridge e nos secrets do Supabase — nunca no navegador |

## Por que o bridge não roda no Vercel

O Vercel executa funções serverless de curta duração. Uma sessão de WhatsApp Web
(Baileys) é um **WebSocket persistente** que precisa ficar aberto 24/7 — igual ao que
ManyChat/Z-API mantêm em servidores próprios. Por isso o bridge roda em um serviço
de processo contínuo (Railway, Render, Fly.io ou VPS), e o Vercel serve apenas o app web.

---

# Deploy definitivo (3 partes)

## 1. Bridge (Railway — recomendado)

1. Crie um serviço novo apontando para a pasta `server/` deste repositório
   (há um `Dockerfile` pronto; Root Directory = `server`).
2. Adicione um **volume persistente** montado em `/data` (sem isso, cada deploy/restart
   apaga as sessões e todos os clientes precisam escanear QR de novo).
3. Variáveis de ambiente:

```env
BRIDGE_HOST=0.0.0.0
PORT=3001
SESSIONS_DIR=/data/sessions
BRIDGE_SECRET=<gere: openssl rand -hex 32>
QR_EVENT_MODE=direct
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
GEMINI_API_KEY=<sua chave Gemini>
GEMINI_MODEL=gemini-1.5-flash
```

4. Anote a URL pública do serviço (ex.: `https://chatfacil-bridge.up.railway.app`).
5. Teste: `curl https://SUA-URL/health` → deve responder `{"ok":true,...}`.

Com `BRIDGE_HOST=0.0.0.0`, **todas** as rotas `/session/*` exigem o header
`x-bridge-secret` — o bridge recusa qualquer chamada sem o segredo.

## 2. Supabase

```bash
supabase secrets set BRIDGE_SECRET="<o mesmo segredo do bridge>"
supabase secrets set WA_BRIDGE_URL="https://SUA-URL-DO-BRIDGE"

supabase functions deploy whatsapp-qr-bridge
supabase functions deploy whatsapp-send-message
supabase functions deploy whatsapp-qr-event --no-verify-jwt
```

(As demais funções e migrations seguem o `DEPLOY_NOW.md`.)

## 3. Frontend (Vercel)

Variáveis de ambiente do projeto:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

**Importante:** NÃO defina `VITE_WA_BRIDGE_URL` em produção. Essa variável liga o
modo de desenvolvimento (navegador → bridge direto). Sem ela, o app usa o fluxo
seguro pela Edge Function.

Build command: `npm run build` (já gera `.vercel/output` no formato Build Output API).

## Teste ponta a ponta

1. Cliente A cria conta → empresa A é criada.
2. Canais → WhatsApp Web (QR) → **Gerar QR Code** → escaneia com o número da empresa A.
3. Envie uma mensagem de outro celular para o número A → a IA da empresa A responde
   usando somente a base de conhecimento da empresa A.
4. Repita com o Cliente B em outra conta: QR próprio, número próprio, agente próprio.
5. No Inbox, a resposta humana sai pelo número do respectivo canal.

## Desenvolvimento local

```bash
# terminal 1 — bridge local
cd server && npm install && node whatsapp-bridge.js

# terminal 2 — app com bridge direto
VITE_WA_BRIDGE_URL=http://127.0.0.1:3001 npm run dev
```
