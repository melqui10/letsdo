# Letsdo — Hub Doméstico Compartilhado

> App web (PWA) para organizar tarefas, calendário e quadro Kanban de casa e da igreja,
> compartilhado entre casal (escalável para mais pessoas/famílias no futuro).

**Início do projeto:** 2026-07-13
**Responsável:** Melquisedeque (+ esposa como usuária)
**Idioma da aplicação:** pt-BR

---

> ⚠️ **LEMBRETE — ler ao reabrir o projeto:** antes de retomar o desenvolvimento,
> **desligar o hook GateGuard** para este build (ele barra cada criação/edição de arquivo
> e atrasa o trabalho greenfield). Rodar na sessão `export ECC_GATEGUARD=off`, ou adicionar
> ao `~/.claude/settings.json` o bloco:
> `"env": { "ECC_DISABLED_HOOKS": "pre:bash:gateguard-fact-force,pre:edit-write:gateguard-fact-force" }`
> e reiniciar a sessão. Reativar quando o projeto estiver maduro.

---

## 1. Visão

Um lugar único onde o casal registra e acompanha a rotina da casa. Três formas de ver a
mesma informação:

- **Lista** — tarefas diárias com prioridade, recorrência e dono.
- **Calendário** — eventos e atividades de casa e da igreja.
- **Kanban** — post-its visuais arrastáveis (A fazer / Fazendo / Feito).

Uso majoritário no **celular**, então tudo é **mobile-first e responsivo**, instalável como
PWA na tela inicial.

---

## 2. Decisões tomadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Frontend | **React + Vite + TypeScript** (PWA) | Rápido, leve, ideal para Cloudflare Pages |
| Estilo | **Tailwind CSS** | Mobile-first de verdade, responsivo sem atrito |
| Backend | **Supabase** (Postgres + Auth + Realtime) | Login e sincronização em tempo real prontos |
| Hospedagem do app | **Cloudflare Pages** | Mesmo fluxo de deploy que o usuário já domina (`wrangler`) |
| Versionamento | **GitHub** | Repositório do projeto |
| Estratégia de build | **Núcleo primeiro** | Lista funcionando antes de Calendário e Kanban |
| Calendário | **Próprio agora, Google depois** | Evita OAuth na v1; sync com Google Calendar é fase futura |
| Modelo de dados | **Entidade única `activities`** | Lista, Calendário e Kanban são visões da mesma coisa |

### Por que uma entidade única?
Uma "atividade" tem título, prioridade, dono, categoria, data e um status de Kanban.
Cada tela é apenas uma **visão** dela — a Lista filtra por data/prioridade, o Calendário
posiciona por data, o Kanban agrupa por status. Isso evita construir três apps colados
com fita e mantém tudo em sincronia automaticamente.

---

## 3. Modelo de dados (Fase 1)

```
households            # famílias / grupos (permite escalar)
  id, name, created_at

profiles              # extensão de auth.users (perfil de cada pessoa)
  id (=auth.users.id), display_name, avatar_url, created_at

household_members     # quem pertence a qual household
  household_id, profile_id, role (owner|member), joined_at

activities            # A ENTIDADE CENTRAL — serve Lista, Calendário e Kanban
  id, household_id
  title, description
  priority            # baixa | media | alta | urgente
  category            # casa | igreja | mercado | financeiro | outro
  assignee_id         # profiles.id (dono da tarefa) — nullable = "de ambos"
  due_at              # data/hora (Lista e Calendário)
  is_all_day          # evento de dia inteiro (Calendário)
  kanban_status       # a_fazer | fazendo | feito
  is_done             # concluída
  recurrence_rule     # RRULE (recorrência) — nullable
  created_by, created_at, updated_at
```

Segurança: **RLS (Row Level Security)** — cada pessoa só enxerga atividades dos households
a que pertence.

---

## 4. Roadmap por fases

### ✅ Fase 0 — Fundação (em andamento)
Scaffolding, dependências, git, documentação, configuração de deploy.

### 🔜 Fase 1 — Núcleo: Lista de Tarefas
O coração do app, utilizável no celular:
- Modelo de dados + RLS no Supabase
- Autenticação (login dos dois)
- CRUD de atividades (criar, editar, concluir, excluir)
- Prioridade (com cores)
- Recorrência (diária / semanal / mensal / personalizada — RRULE)
- Atribuição de dono + filtros (minhas / da esposa / de ambos)
- Categorias (casa, igreja, etc.)
- Sincronização em tempo real entre celulares
- PWA instalável

### ✅ Fase 2 — Calendário
- [x] Visão de mês reusando a entidade `activities` (grade dom–sáb, navegação de meses, "Hoje")
- [x] Criar/editar eventos direto no calendário (toque no dia → painel + FAB)
- [x] Cores por categoria (dots no dia, cor da categoria)
- [x] Eventos de dia inteiro (toggle no formulário)
- [x] Recorrentes aparecem em cada ocorrência do mês (diária/semanal/mensal)
- [x] Sincronização em tempo real (mesmo canal Realtime da Lista)

### 🔜 Fase 3 — Kanban
- Colunas: A fazer / Fazendo / Feito
- Post-its visuais arrastáveis (drag-and-drop)
- Cor do post-it por prioridade/categoria
- Sincroniza com Lista e Calendário automaticamente

### 💡 Fase 4+ — Ideias futuras
- **Notificações push / lembretes** (evento da igreja, tarefa do dia)
- **Resumo mensal de atividades** — painel para acompanhar o que foi executado
  num período (ex.: por mês), com contagem por categoria/responsável e
  histórico das tarefas concluídas. *(pedido em 2026-07-14)*
- **Lista de compras compartilhada**
- **Sincronização com Google Calendar** (reusa OAuth do projeto Mari AI)
- **Feed de atividades** ("esposa concluiu X")
- **Modo claro/escuro**
- Escalar para múltiplos households (outras famílias / grupos da igreja)

---

## 5. Log de atividades

### 2026-07-13
- [x] Definição de visão, escopo e stack (React+Vite / Supabase / Cloudflare Pages)
- [x] Decisões de arquitetura (entidade única, núcleo primeiro, calendário próprio)
- [x] Scaffolding do projeto Vite (React + TypeScript)
- [x] Instalação de dependências (Supabase, Tailwind, PWA, router, date-fns, rrule)
- [x] Inicialização do git (branch `main`) e `.gitignore` reforçado (segredos protegidos)
- [x] Documento-mestre do projeto (`PROJETO.md`)
- [x] Configuração do Tailwind + PWA no Vite
- [x] Estrutura de pastas e cliente Supabase (`src/lib/supabase.ts`, `src/types.ts`)
- [x] Schema SQL + RLS + função atômica `create_household` (migration `0001_init.sql`)
- [x] Autenticação (`AuthContext`, tela de `Login`)
- [x] Onboarding de lar (criar / entrar por código) + compartilhamento
- [x] Tela de Lista: CRUD, prioridade, categoria, dono, recorrência (RRULE), filtros
- [x] Sincronização em tempo real (Supabase Realtime)
- [x] Revisão de código (revisor) + correção do bug crítico de onboarding e tratamento de erros
- [x] Build de produção validado (`npm run build` ✅)
- [ ] Criar projeto no Supabase e preencher `.env` (você)
- [ ] Aplicar migration (`npx supabase db push`)
- [ ] Publicação no GitHub (commit local feito; falta `git push` para o remoto)

### 2026-07-13 (Fase 2 — Calendário)
- [x] Helpers de calendário (`src/lib/calendar.ts`): grade do mês + expansão de ocorrências recorrentes por dia (date-fns)
- [x] Página `src/pages/Calendario.tsx`: visão de mês, painel do dia, criação/edição via `ActivityForm`, realtime
- [x] `ActivityForm`: toggle "Dia inteiro" (`is_all_day`) + data pré-preenchida (`defaultDueAt`) ao criar pelo calendário
- [x] `ActivityCard`: eventos de dia inteiro exibidos sem horário
- [x] Ligado ao `App.tsx` (aba Agenda) e build de produção validado (`npm run build` ✅)

### 2026-07-13 (Fase 2.1 — ícones + correção de categorias)
- [x] **Causa raiz** do "não há categorias / erro ao criar / Responsável vazio": migration `0002` estava só local; aplicada no remoto (`supabase db push`)
- [x] Migration `0003_category_icon.sql`: coluna `icon` (emoji) + ícones nas categorias padrão + `create_household` atualizado
- [x] Seletor de ícone no formulário de categoria; ícone exibido no dropdown e nos cartões
- [x] `src/lib/errors.ts` (`errMsg`): erros do Supabase (PostgrestError) não são `instanceof Error` — agora a mensagem real aparece em vez de "Não foi possível…"
- [x] Migrations remotas sincronizadas: `0001`, `0002`, `0003` ✅

### 2026-07-14 (Deploy + notificações + UX)
- [x] **Publicado no ar**: front no Cloudflare (Workers static assets, `letsdo.melqui-e.workers.dev`); build automático a cada `git push`. Corrigida tela branca (variáveis `VITE_*` faltando no build).
- [x] **Push notifications (Web Push/VAPID)** funcionando: SW de push, `lib/push.ts`, tela **Ajustes** com tipos (resumo diário, antes de evento, atividade do lar), fluxo iOS (instalar na tela inicial). Secrets VAPID + função `send-push` deployados.
- [x] Migrations `0004_push` (subscriptions + prefs), `0005/0006` (gatilho de "atividade do lar" via `pg_net`, lendo segredos do **Vault** — `alter database` é bloqueado no Supabase hospedado).
- [x] `send-push` filtra destinatários por preferência e exclui quem disparou a ação.
- [x] **Editar nome de exibição** (Ajustes → Perfil).
- [x] **Recorrência mensal por dia da semana** (ex.: 1ª segunda) — RRULE `BYDAY` posicional; dropdown mostra só "Mensal" + seletor de modo (mesmo dia / dia da semana).
- [x] **Filtros** na Lista: por categoria e por prioridade.
- [x] **Tarefa × Compromisso** (migration `0007`): coluna `kind` + `end_at` + `show_in_agenda`. Agenda mostra compromissos + tarefas marcadas; Lista mostra só tarefas; FAB da Agenda cria compromisso.
- [x] **Tema escuro** opcional (Claro/Escuro/Sistema) — `lib/theme.ts` + remapeamento CSS central sob `.dark`; Ajustes → Aparência.
- [x] Toggle das notificações realinhado (layout flex).
- [x] **Aplicar migration `0007` no remoto** (`npx supabase db push`) ✅.
- [x] **Agendador `pg_cron`** para "resumo diário" e "antes de evento" (migration `0008`, ver log de 2026-07-14 abaixo) ✅.

### 2026-07-14 (pg_cron — lembretes agendados)
- [x] Migration `0008_pg_cron.sql`: agendamento dos pushes com **hora marcada** (o trigger de "atividade do lar" só cobria o push imediato).
- [x] Tabela `push_log` (`dedup_key` único) garante idempotência — cada lembrete sai uma vez só.
- [x] `run_event_reminders()` (job `letsdo-event-reminders`, `*/5`): lembrete `before_event` respeitando o `before_event_minutes` de cada pessoa; envia por `profile_id`.
- [x] `run_daily_digest()` (job `letsdo-daily-digest`, `*/5`): resumo diário no `daily_time` (fuso America/Sao_Paulo) com a contagem de itens que vencem hoje.
- [x] `letsdo-push-log-cleanup` (domingo 03h): apaga logs com +30 dias.
- [x] Revisão (revisor) + correções: dedup atômico (`if not found then continue`), `revoke execute` das funções (senão ficariam expostas como RPC no PostgREST), janela do resumo diário à prova de meia-noite.
- [x] `npx supabase db push` aplicado no remoto ✅.
- [ ] **Testar ponta a ponta** (você): ativar toggle, criar compromisso próximo, aguardar o tick. Diagnóstico em `cron.job_run_details` e `net._http_response`.

### 2026-07-14 (Fase 5 — Gamificação)
- [x] Migration `0009_gamification.sql`: ledger imutável `score_events` + coluna `activities.completed_at` + trigger `award_score` (pontua no servidor a cada conclusão) + RLS + índice único parcial anti-duplicata.
- [x] Fórmula: base por prioridade (baixa5/media10/alta20/urgente30) × fator (no prazo 1,5 · sem prazo 1,0 · atrasada 0,5). **Quem conclui pontua** (`auth.uid()`), não o responsável.
- [x] **Só tarefas pontuam** (compromissos marcam `completed_at`, mas não entram na gamificação) — decisão da revisão; trivial reverter se quiser incluir compromissos.
- [x] `src/lib/score.ts`: agregações puras (pontos semana/total, streak, níveis, conquistas) sobre `score_events`, tudo no fuso America/Sao_Paulo.
- [x] `src/pages/Placar.tsx`: aba 🏆 Placar (5ª no menu) — você vs esposa, pontos da semana, total, nível+barra, streak 🔥, grade de conquistas, Realtime ligado.
- [x] Placar semanal (segunda→domingo) + total histórico; níveis Aprendiz→Lenda; 9 conquistas.
- [x] Revisão (revisor): corrigido rótulo de semana congelado e restrição a `kind='tarefa'`; build (`npm run build`) limpo.
- [x] **Aplicar `0009` no remoto** (`npx supabase db push`) + **deploy do front** (`git push`) — feito em 2026-07-16.

### 2026-07-14 (Ajustes de UX + marca)
- [x] **Lista oculta concluídas de dias anteriores**: usa `activities.completed_at` (fuso America/Sao_Paulo) — tarefa concluída some no dia seguinte; concluídas hoje continuam visíveis (`ListaTarefas.tsx`, reusa `todaySP` de `score.ts`).
- [x] **Nome de exibição → "Let's Do!"** (repo/código seguem `letsdo`): título da aba, manifest PWA (`name`/`short_name`), tela de login, ajuda das Configurações, fallback de push e resumo diário (migration `0010_rename_push_titles.sql`). Chave interna `letsdo:theme` mantida.
- [x] **GateGuard desligado no projeto** via `.claude/settings.json` (`ECC_DISABLED_HOOKS`) — passa a valer ao reiniciar a sessão.
- [ ] PWA já instalado pode manter o nome antigo no ícone até remover/re-adicionar à tela inicial (o SO só relê o manifest numa nova instalação).

### 2026-07-15 (Gamificação — mais conquistas)
- [x] Migration `0011_score_assignee.sql`: congela `assignee_id` em `score_events` (recria `award_score`) — base da conquista "Herói do outro".
- [x] `score.ts`: 9 → 29 conquistas. Novas stats por perfil (horário SP via `created_at`, dia da semana, semana perfeita, mês pontual fechado, sequências p/ Fênix, contador de herói) + `coupleStatsForProfile` (semanas vencidas, dias em dupla, semana equilibrada <10%, virada pós-sexta) — só semanas/meses FECHADOS contam nas conquistas históricas.
- [x] `Placar.tsx`: passa as stats de casal para `earnedBadges`; grade de conquistas exibe as 29.
- [x] Migrations aplicadas no remoto em 2026-07-16 (`npx supabase db push` — `0011`; `0009`/`0010` já estavam) + deploy do front via `git push`.

### Pendências técnicas registradas na revisão (fases futuras)
- Restringir `assignee_id` a membros do mesmo lar (hoje só valida via UI).
- Policies de UPDATE/DELETE em `households` (renomear/excluir lar).
- Código de convite = UUID do lar sem expiração/revogação (evoluir para convites com token).

---

## 6. Como rodar (local)

```bash
npm install
cp .env.example .env      # preencher com as chaves do Supabase
npm run dev               # http://localhost:5173
```

## 7. Deploy

- **App (frontend):** Cloudflare Pages via `npx wrangler pages deploy dist`
- **Backend (schema):** `npx supabase db push`
- Login inicial (uma vez, interativo): `supabase login` e `wrangler login`
