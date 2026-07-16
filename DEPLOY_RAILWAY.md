# Deploy do ChatFácil Bridge no Railway

## Arquitetura

```
Navegador → Vercel (frontend)
          → Supabase Edge Functions (auth, DB, lógica)
               └─ whatsapp-qr-bridge  →  Railway Bridge (Baileys)
               └─ whatsapp-qr-event   ←  Railway Bridge (callbacks)
               └─ whatsapp-send-message → Railway Bridge (QR) | Meta API (cloud)
```

O **BRIDGE_SECRET** nunca toca o frontend. Somente as Edge Functions o conhecem.

---

## 1. Variáveis obrigatórias no Railway

| Variável | Valor |
|---|---|
| `PORT` | _Railway injeta automaticamente_ |
| `BRIDGE_HOST` | `0.0.0.0` |
| `BRIDGE_SECRET` | **Você define** — gere com `openssl rand -hex 32` |
| `SUPABASE_URL` | `https://SEU_PROJETO.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Painel Supabase → Settings → API → service_role |
| `SESSION_DATA_PATH` | `/data` |
| `QR_EVENT_MODE` | `webhook` |
| `ALLOWED_ORIGINS` | `https://SEU_PROJETO.supabase.co` |
| `GEMINI_API_KEY` | Sua chave Google AI (se usar IA direta no bridge) |

> **Nunca** coloque `BRIDGE_SECRET` ou `SUPABASE_SERVICE_ROLE_KEY` no Vercel ou no frontend.

---

## 2. Secrets obrigatórios no Supabase (Edge Functions)

Configure via `supabase secrets set` ou pelo painel em Settings → Edge Functions:

| Secret | Onde usar |
|---|---|
| `BRIDGE_URL` | `https://chatfacil-production.up.railway.app` |
| `BRIDGE_SECRET` | **Mesmo valor** configurado no Railway |
| `GEMINI_API_KEY` | whatsapp-qr-event |
| `GEMINI_MODEL` | `gemini-1.5-flash` (opcional) |

Comando para setar todos de uma vez:
```bash
supabase secrets set \
  BRIDGE_URL=https://chatfacil-production.up.railway.app \
  BRIDGE_SECRET=SEU_SEGREDO_AQUI \
  GEMINI_API_KEY=SUA_CHAVE_AQUI \
  GEMINI_MODEL=gemini-1.5-flash
```

---

## 3. Variáveis que NÃO devem estar no Vercel

- `BRIDGE_SECRET`
- `BRIDGE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `SESSION_DATA_PATH`

O Vercel só precisa das variáveis públicas do Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).

---

## 4. Configuração do Railway

### Root Directory
```
server
```
(configure em Settings → Source → Root Directory)

### Dockerfile detection
O Railway detecta o `Dockerfile` automaticamente quando ele está no Root Directory.
Não é necessário configurar `RAILWAY_DOCKERFILE_PATH`.

### Start command
Já definido no `CMD` do Dockerfile:
```
node whatsapp-bridge.js
```
Não é necessário configurar no Railway.

### Volume (persistência de sessões)
1. Railway → seu serviço → Volumes → Add Volume
2. **Mount Path:** `/data`
3. O Railway cria e mantém o volume automaticamente entre deploys.

### Gerar domínio público
Railway → seu serviço → Settings → Networking → Generate Domain
O domínio gerado será: `chatfacil-production.up.railway.app`

---

## 5. Deploy das Edge Functions no Supabase

```bash
# Login (uma vez)
supabase login

# Linkar ao projeto
supabase link --project-ref SEU_PROJECT_REF

# Deploy de todas as funções
supabase functions deploy whatsapp-qr-bridge
supabase functions deploy whatsapp-qr-event
supabase functions deploy whatsapp-send-message

# Ou todas de uma vez
supabase functions deploy
```

---

## 6. Testar /health

```bash
curl https://chatfacil-production.up.railway.app/health
```

Resposta esperada:
```json
{"ok":true,"sessions":0,"uptime":42.5,"eventMode":"webhook","tenantAgent":{...}}
```

---

## 7. Checklist de teste multitenant (2 clientes, 2 números)

### Pré-requisitos
- Dois usuários cadastrados em empresas diferentes (company_id distintos)
- Dois canais criados com `provider = qr_code`
- Bridge Railway rodando e saudável (`/health`)

### Passo a passo

**Cliente A (Empresa A — Canal A):**
1. Login como usuário da Empresa A
2. Acesse Canais → selecione o Canal A → Conectar via QR
3. A Edge Function `whatsapp-qr-bridge` é chamada com `action=start`
4. O bridge inicia sessão isolada em `/data/<channel_id_A>/`
5. Escaneie o QR Code com o WhatsApp do Número 1
6. Status muda para `connected`

**Cliente B (Empresa B — Canal B):**
1. Login como usuário da Empresa B
2. Acesse Canais → selecione o Canal B → Conectar via QR
3. O bridge inicia sessão isolada em `/data/<channel_id_B>/`
4. Escaneie o QR Code com o WhatsApp do Número 2
5. Status muda para `connected`

**Testes de isolamento:**
- Envie mensagem pelo Canal A → aparece apenas na caixa da Empresa A ✓
- Envie mensagem pelo Canal B → aparece apenas na caixa da Empresa B ✓
- Tente acessar `/session/<channel_id_A>/qr` sem `x-bridge-secret` → HTTP 401 ✓
- Tente chamar `whatsapp-qr-bridge` com token JWT da Empresa A e `channel_id` da Empresa B → HTTP 404 ✓

**Teste de persistência:**
- Reinicie o serviço no Railway (Deploy → Redeploy)
- Aguarde ~30s
- Acesse `/health` → `sessions: 2` (ambas restauradas automaticamente) ✓
- Envie mensagem de fora → recebida normalmente ✓

---

## 8. Verificação de saúde contínua

O Railway usa a rota `/health` como health check.
Configure em Settings → Health Check Path: `/health`
