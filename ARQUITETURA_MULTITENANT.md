# Arquitetura multitenant do WhatsApp

## Fluxo obrigatório

```text
Frontend no Vercel
        |
        | Authorization: Bearer <Supabase access_token>
        v
API do ChatFácil no Railway
        |
        |-- valida o token em /auth/v1/user
        |-- busca profiles.company_id
        |-- busca channels.id
        |-- compara channel.company_id com o company_id autenticado
        |-- mantém uma sessão Baileys por channel_id em /data
        |-- grava status e phone_number no canal
        |-- roteia o envio pelo provider do canal
        v
Supabase: Auth, banco, RLS, empresas, canais, agentes, contatos e mensagens
```

O frontend nunca recebe `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` ou qualquer segredo de provedor. O QR existe somente na memória da sessão identificada pelo `channel_id` e é devolvido apenas depois da autorização multitenant.

## Autorização

Todas as rotas sob `/api/whatsapp` executam a mesma sequência antes da operação:

1. Exigem `Authorization: Bearer <token>`.
2. Validam o token no Supabase Auth e obtêm o usuário.
3. Buscam `profiles.company_id` com credencial exclusiva do servidor.
4. Buscam o canal pelo ID, sem esconder sua existência atrás do filtro da empresa.
5. Retornam `404` se o canal não existe e `403` se ele pertence a outra empresa.

Respostas de erro seguem `{ "error": { "code": "...", "message": "..." } }`. O frontend diferencia `401`, `403`, `404`, `409`, `429` e `500` e preserva a mensagem retornada pela API.

## Rotas Railway

| Método | Rota | Função |
| --- | --- | --- |
| `GET` | `/health` | Health check sem dados sensíveis |
| `POST` | `/api/whatsapp/channels/:channelId/connect` | Cria ou recupera a sessão Baileys |
| `GET` | `/api/whatsapp/channels/:channelId/status` | Estado do canal autorizado |
| `GET` | `/api/whatsapp/channels/:channelId/qr` | QR exclusivo do canal |
| `POST` | `/api/whatsapp/channels/:channelId/disconnect` | Encerra sessão e remove credenciais locais |
| `POST` | `/api/whatsapp/channels/:channelId/send` | Envia pelo provider do canal |

`connect`, `qr` e `disconnect` retornam `409` quando usados em canal que não seja `qr_code`. `send` usa a sessão Baileys do próprio canal para `qr_code`; canais `meta_cloud_api` preservam o transporte oficial da Meta.

## Sessões e agentes

- O diretório persistente é `SESSION_DATA_PATH=/data`.
- Cada subdiretório é o `channel_id`; nenhuma credencial é compartilhada.
- No boot, somente diretórios com `creds.json` e canal `qr_code` ainda existente são restaurados.
- Eventos de conexão atualizam exclusivamente o canal correspondente.
- `channels.agent_id` deve apontar para `ai_agent_settings` da mesma empresa. Um trigger rejeita vínculos cruzados.
- Quando o canal não tem `agent_id`, o servidor usa o agente padrão da empresa.
- Respostas de IA e atendimento humano retornam pelo mesmo provider selecionado pelo canal.

## CORS

`ALLOWED_ORIGINS` é uma lista separada por vírgulas. Apenas origens presentes nela recebem CORS. O preflight aceita `Authorization` e `Content-Type` e responde `204` a `OPTIONS`.

## Componentes removidos

Os antigos proxies de QR no Supabase não fazem parte desta arquitetura. A conexão, o QR, o status, a desconexão e o envio Baileys não passam por Edge Function nem por segredo compartilhado.
