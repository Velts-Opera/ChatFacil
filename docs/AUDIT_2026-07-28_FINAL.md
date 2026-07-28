# Auditoria final ChatFacil — 2026-07-28

Este arquivo substitui o status operacional de `AUDIT_2026-07-28.md` quando houver divergência.

## APROVADO COM EVIDÊNCIA

### Auth e senha
- login com senha correta passou;
- senha incorreta foi rejeitada;
- cadastro e reset no frontend exigem 12+ caracteres, maiúscula, minúscula, número e símbolo;
- dois tenants sintéticos foram autenticados e isolados;
- usuários temporários de auditoria foram removidos.

### Multitenancy / segurança
- tenant A não lê perfil/contato do tenant B;
- usuário comum não troca `company_id`;
- usuário comum não cria empresa direto;
- usuário comum não executa RPCs de superadmin;
- tenant desativado perde acesso a banco e Edge Functions autenticadas;
- `channel_secrets` não é legível pelo cliente;
- triggers impedem inconsistência de tenant entre mensagem, conversa, contato e canal;
- índice único impede múltiplas conversas ativas do mesmo contato no mesmo canal/tenant.

### Superadmin
Teste sintético autenticado passou para:
- `admin_create_company`;
- `admin_company_overview`;
- provisionamento de defaults;
- agente/base inicial;
- `admin_enter_company`.

A migration `assert_admin_audit_passed` só foi aplicada após resposta `ok=true` do teste.

### Agente personalizado
- templates por profissão/segmento disponíveis;
- tenant fornece contexto em linguagem natural;
- `generate-agent-prompt` chama o provider real, persiste prompt e incrementa versão;
- teste de saúde do provider real passou (`assert_ai_provider_audit_passed`);
- E2E sintético do gerador passou (`assert_agent_generator_v2_passed`): HTTP 200, prompt persistido, profissão salva, versão incrementada;
- agente `system_locked` recusou regeneração com HTTP 409;
- dados sintéticos foram limpos.

### Agente444
- único agente tratado como operação especial;
- `profession=tecnologia_saas`;
- `prompt_source=system_locked`;
- `is_system_locked=true`;
- instruções de QA/testes preservadas;
- base reforçada para prospecção, qualificação, vendas, objeções, follow-up e handoff comercial.

### WhatsApp oficial Meta
- canal oficial existente já teve E2E real: inbound → webhook → IA → Meta → delivered;
- webhook atual exige assinatura HMAC em POST;
- POST sem assinatura retornou 403;
- GET de verificação com token incorreto retornou 403;
- GET com o token salvo retornou 200 + challenge;
- WABA está inscrita no app Veltsystem;
- app está inscrito nos campos `messages`, `smb_message_echoes`, `smb_app_state_sync` e `history`;
- tokens/App Secret ficam criptografados e não são expostos na interface comum.

### Handoff humano / Coexistence backend
Teste sintético assinado passou:
1. `smb_message_echoes` representou uma resposta humana do WhatsApp Business;
2. mensagem humana foi persistida como `human_app`;
3. conversa mudou para `human_handling=true` e `ai_handling=false`;
4. `ai_paused_until` foi preenchido;
5. inbound seguinte foi persistido;
6. nenhuma interação de IA foi criada para esse inbound;
7. `ai_reply_skipped_human_takeover` foi registrado.

Dados sintéticos foram removidos.

### Inbox
- `Assumir` pausa IA;
- `Devolver à IA` libera o próximo turno;
- resposta humana pelo painel pausa IA;
- resposta humana vinda do WhatsApp Business é identificada como celular/humano;
- takeover é configurável por tenant.

### Legado / mocks
- canais QR não oficiais foram retirados da operação sem apagar histórico;
- `whatsapp-qr-event`, `whatsapp-qr-bridge` e `evolution-webhook` foram neutralizados;
- endpoints diagnósticos temporários foram neutralizados após os testes;
- motor morto Gemini/Bia foi removido da branch;
- tela Canais passou a priorizar Meta Cloud API / Coexistence.

### Performance / estrutura
- objetos ausentes do painel admin foram restaurados;
- índices de FKs relevantes foram adicionados;
- políticas RLS duplicadas foram consolidadas;
- advisor de performance foi reexecutado após as correções.

### Build
- preview Vercel da branch foi consultado após as mudanças de frontend;
- build reportado READY e sem erro de build no relatório `errorsOnly` consultado.

## BLOQUEIOS REAIS RESTANTES

### 1. Coexistence em aparelho físico
Backend, onboarding e subscriptions estão preparados, e a lógica de echo foi validada sinteticamente. Ainda falta executar o fluxo real de Coexistence em um número instalado no WhatsApp Business App e receber um `smb_message_echoes` real do aparelho.

**Não anunciar Coexistence como aprovado em produção até esse teste.**

Número pretendido pelo usuário: `+55 22 99610-7165`.

Quando a Meta pedir verificação por SMS/ligação, parar e pedir ao responsável para inserir o código diretamente no fluxo Meta.

### 2. Regressão real do webhook atual
O E2E real WhatsApp passou antes do último hardening do webhook. Depois do hardening, assinatura, verificação e handoff sintético passaram. Falta apenas uma nova mensagem real para confirmar novamente:

`cliente → webhook atual → IA → Meta → delivered`.

### 3. Leaked Password Protection
O advisor do Supabase ainda aponta a proteção contra senhas vazadas como desativada no Auth. A aplicação impõe complexidade no cadastro/reset, mas a proteção de senha comprometida precisa ser habilitada no nível do Supabase Auth.

### 4. Verify token
O canal atual usa literalmente `Veltystem` como verify token. Funciona e foi testado. Corrigir grafia exige alteração coordenada na Meta e no canal; não trocar isoladamente.

## FUNCIONALIDADES NÃO IMPLEMENTADAS / NÃO APROVADAS

- Instagram Direct;
- e-mail (Gmail/Microsoft/IMAP);
- voz / ElevenLabs.

Esses itens não devem aparecer em venda, onboarding ou demonstração como se estivessem prontos.

## Release gate

Antes de declarar este pacote completamente concluído:
1. repetir uma mensagem real no webhook atual e confirmar `delivered`;
2. executar Coexistence real em aparelho físico, caso entre neste release;
3. habilitar/decidir Leaked Password Protection no Supabase Auth.

O gerador de agente/provider real e o painel de superadmin já passaram nos testes sintéticos autenticados da auditoria final.
