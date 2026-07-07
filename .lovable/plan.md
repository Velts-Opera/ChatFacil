
# Comunica AI — MVP núcleo

Plataforma SaaS de atendimento, CRM e automação para WhatsApp/Instagram. Nesta primeira versão entrego o núcleo funcional; automações, campanhas, KB da IA, integrações, planos e admin ficam para próximas iterações (com estrutura já preparada).

## Escopo desta entrega

**Páginas públicas**
- Landing (`/`) — hero com headline/subheadline em PT-BR, CTAs "Começar agora" e "Ver demonstração", seções: Como funciona, Inbox multiatendente, IA treinada, Automações, CRM, Campanhas, Relatórios, Planos, CTA final e footer.
- Auth (`/auth`) — abas Login / Cadastro. Cadastro captura: nome da empresa, segmento, telefone, e-mail, nome do responsável, horário de atendimento, descrição dos serviços, tom de comunicação. Login: email/senha + Google.

**App autenticado (`/_authenticated/*`)**
- Shell com sidebar (Dashboard, Inbox, Contatos, Respostas rápidas, Configurações da empresa) + topbar com usuário/logout.
- `/dashboard` — cards: conversas abertas, leads novos, atendimentos pendentes, mensagens respondidas pela IA, taxa de resposta, conversas convertidas, campanhas enviadas. Dados mockados por enquanto (queries retornam contagens reais quando existirem, senão zero).
- `/inbox` — layout 3 colunas responsivo (mobile: uma coluna por vez com navegação):
  - Esquerda: lista de conversas, busca, filtros (abertas / pendentes / resolvidas / IA / humano).
  - Central: histórico, campo de resposta, botões enviar / resposta rápida / assumir / encerrar.
  - Direita: contato, tags, etapa do funil, observações, origem, responsável.
- `/contatos` — tabela: nome, telefone, origem, tags, última interação, etapa do funil, valor potencial, ação "ver conversa". Criar/editar tags (com as tags padrão pré-populadas: lead quente, orçamento enviado, aguardando pagamento, cliente ativo, cliente inativo, suporte, pós-venda).
- `/respostas-rapidas` — CRUD de respostas (título, mensagem, categoria).
- `/configuracoes` — dados da empresa + horário + tom (editáveis).

## Estilo visual

- Cores: azul escuro `#0B1E3F` (primary), branco, cinza claro `#F4F6F9` (surface), verde `#16A34A` (sucesso/ações positivas), cinza texto `#475569`.
- Tipografia: Inter (via @fontsource/inter) — display e body.
- Mobile-first, cantos suaves (radius 12px), sombras leves, densidade tipo Intercom/HubSpot.
- Tokens definidos em `src/styles.css` (@theme inline com oklch); componentes shadcn adaptados; nada de cores hardcoded.

## Backend (Lovable Cloud)

Ativo o Cloud e crio o schema base:

- `companies` (id, owner_id, name, segment, phone, email, contact_name, business_hours, services_description, communication_tone, plan default 'start', created_at)
- `profiles` (id ↔ auth.users, company_id, full_name, email)
- `user_roles` + enum `app_role` (owner/admin/agent) + `has_role()` (padrão Lovable)
- `contacts` (id, company_id, name, phone, source, funnel_stage, potential_value, last_interaction_at, notes)
- `tags` (id, company_id, name, color) + `contact_tags` (contact_id, tag_id)
- `conversations` (id, company_id, contact_id, channel, status, assigned_to, ai_handling, last_message_at)
- `messages` (id, conversation_id, sender_type, content, created_at)
- `quick_replies` (id, company_id, title, message, category)

Regras:
- RLS ligado em todas as tabelas + GRANT para `authenticated` e `service_role`. Escopo por `company_id` via helper `get_user_company_id()` SECURITY DEFINER.
- Trigger `handle_new_user()`: cria `profile` + `company` (usando dados do metadata do signUp) + role `owner`.
- Tags padrão semeadas via migration para novas empresas (função + trigger `after insert on companies`).
- Auth: email/senha + Google (via `supabase--configure_social_auth`). Reset de senha (`/reset-password`).

## Notas técnicas

- Rotas TanStack file-based: `src/routes/index.tsx`, `auth.tsx`, `reset-password.tsx`, `_authenticated/route.tsx` (gate gerenciado), `_authenticated/dashboard.tsx`, `_authenticated/inbox.tsx`, `_authenticated/contatos.tsx`, `_authenticated/respostas-rapidas.tsx`, `_authenticated/configuracoes.tsx`.
- Head metadata (title, description, og) real em cada rota — sem os placeholders "Lovable App".
- Server functions (`createServerFn` + `requireSupabaseAuth`) para leituras/mutações do app; hooks do cliente usam TanStack Query.
- Dados iniciais: seed mínimo (contatos/conversas de exemplo) só se o usuário pedir — por padrão a conta começa vazia com estado "sem dados" bem desenhado.
- Rotas para o restante (automações, campanhas, KB IA, integrações, planos, admin) NÃO entram agora; ficam no backlog visível no menu como "em breve" só se quiser (posso omitir).

## Fora do escopo desta entrega

- Automações, Campanhas, Base de conhecimento da IA, Integrações (WhatsApp/Instagram/Messenger/Webchat), Planos, Painel admin.
- Envio real de mensagens via WhatsApp Cloud API / Instagram API (estrutura de canais fica preparada).

Confirma que posso seguir assim? Se sim, ativo o Cloud e construo.
