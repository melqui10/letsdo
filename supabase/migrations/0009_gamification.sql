-- Letsdo — Fase 5: gamificação (pontos, placar, níveis, conquistas, streak).
--
-- Ideia: cada conclusão de atividade vale pontos, ponderados por prioridade e
-- pontualidade. O casal compete num placar semanal (+ total histórico).
--
-- Princípios de projeto:
--   * Ledger imutável (score_events): cada conclusão grava UMA linha com os
--     fatos CONGELADOS no momento (pontos, prioridade, no-prazo). Assim, editar
--     a prioridade/prazo da tarefa depois não altera o placar, e não há como
--     trapacear pelo app.
--   * Pontuação no SERVIDOR (trigger), nunca no cliente.
--   * Toda conclusão passa por UPDATE de activities.is_done (Lista/Kanban/Agenda),
--     então um único trigger cobre tudo.
--   * Desfazer conclusão APAGA o evento — contadores de conquista ficam honestos.
--
-- Quem pontua: quem CONCLUI (auth.uid()), não o responsável (assignee_id).

-- Momento da conclusão (útil para histórico e para o cálculo no-prazo).
alter table public.activities
  add column if not exists completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Livro-razão de pontos.
-- ---------------------------------------------------------------------------
create table if not exists public.score_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  event_type text not null default 'conclusao'
    check (event_type in ('conclusao', 'bonus')),
  points int not null,
  -- Fatos congelados (evitam JOIN e edições posteriores da atividade).
  priority text,
  on_time boolean,
  event_day date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_score_events_household on public.score_events (household_id);
create index if not exists idx_score_events_profile on public.score_events (profile_id);
create index if not exists idx_score_events_activity on public.score_events (activity_id);
create index if not exists idx_score_events_day on public.score_events (event_day);

-- Defesa extra contra duas conclusões para a mesma atividade (o lock de linha
-- do UPDATE já evita na prática; isto garante no nível do schema).
create unique index if not exists uq_score_conclusao_activity
  on public.score_events (activity_id)
  where event_type = 'conclusao';

alter table public.score_events enable row level security;

-- Membros do lar leem o placar um do outro (é compartilhado). Nenhuma policy de
-- escrita: só o trigger (security definer) grava. Defesa extra: sem grant de
-- INSERT/UPDATE/DELETE para os roles do cliente.
create policy "score_events_select" on public.score_events
  for select using (household_id in (select public.current_user_households()));

grant select on public.score_events to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger de pontuação: dispara quando is_done muda.
-- ---------------------------------------------------------------------------
create or replace function public.award_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid := auth.uid();
  base int;
  factor numeric;
  earned int;
  is_on_time boolean;
begin
  -- Concluindo (false -> true).
  if new.is_done and not old.is_done then
    new.completed_at := now();

    -- Gamificação vale só para TAREFAS (compromissos são eventos de agenda:
    -- marcam completed_at, mas não pontuam). Sem usuário no contexto
    -- (ex.: cron/service role) também não pontua.
    if new.kind = 'tarefa' and recipient is not null then
      base := case new.priority
        when 'urgente' then 30
        when 'alta'    then 20
        when 'media'   then 10
        else 5                     -- baixa
      end;

      -- No prazo só se havia prazo e a conclusão veio até ele.
      is_on_time := new.due_at is not null and now() <= new.due_at;
      factor := case
        when new.due_at is null then 1.0      -- sem prazo: base pura
        when is_on_time then 1.5              -- no prazo: bônus
        else 0.5                              -- atrasada: reduzida
      end;

      earned := round(base * factor);

      insert into public.score_events (
        household_id, profile_id, activity_id, event_type,
        points, priority, on_time, event_day
      ) values (
        new.household_id, recipient, new.id, 'conclusao',
        earned, new.priority, is_on_time,
        (now() at time zone 'America/Sao_Paulo')::date
      );
    end if;

  -- Desfazendo (true -> false): remove os pontos daquela conclusão. Sem filtro
  -- de kind: se a tarefa foi reclassificada após pontuar, ainda limpa certo.
  elsif not new.is_done and old.is_done then
    new.completed_at := null;
    delete from public.score_events
    where activity_id = new.id and event_type = 'conclusao';
  end if;

  return new;
end;
$$;

-- BEFORE UPDATE: pode ajustar new.completed_at na própria linha sem recursão.
drop trigger if exists trg_award_score on public.activities;
create trigger trg_award_score
  before update of is_done on public.activities
  for each row execute function public.award_score();
