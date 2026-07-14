-- Distingue "tarefa" (to-do, vive na Lista) de "compromisso" (evento, vive na
-- Agenda e futuramente sincroniza com o Google Agenda). Uma tabela só, com um
-- discriminador `kind`.
--
--   tarefa      -> Lista/Kanban; aparece na Agenda só se show_in_agenda = true
--   compromisso -> sempre na Agenda; tem início (due_at) e fim (end_at)

alter table public.activities
  add column if not exists kind text not null default 'tarefa'
    check (kind in ('tarefa', 'compromisso')),
  add column if not exists end_at timestamptz,
  add column if not exists show_in_agenda boolean not null default false;

-- Preserva o comportamento atual: o que já tinha data continua visível na
-- Agenda (como tarefa marcada), evitando que "suma" após a migração.
update public.activities
  set show_in_agenda = true
  where due_at is not null and kind = 'tarefa';
