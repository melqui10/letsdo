-- Letsdo — Ocorrências: conclusão POR OCORRÊNCIA para tarefas recorrentes.
--
-- Problema: `activities.is_done` é um booleano único na linha. Uma tarefa
-- mensal concluída em agosto ficava concluída para sempre — nunca reaparecia
-- em setembro, porque não havia onde registrar "a de agosto foi feita, a de
-- setembro não". Na prática, tarefa recorrente na Lista repetia zero vezes.
--
-- Modelo: `activity_completions` guarda UMA linha por ocorrência concluída,
-- com chave (activity_id, occurrence_date). Quem calcula a ocorrência corrente
-- é o cliente — a recorrência é uma RRULE, que o banco não interpreta —, e o
-- cliente consulta esta tabela para saber se aquela ocorrência já foi feita.
--
-- `activities.is_done` continua existindo e é mantido pelo trigger como espelho
-- da ocorrência corrente: kanban, queries de push, contador de pendentes e o
-- Placar seguem lendo exatamente o que sempre leram.

-- ---------------------------------------------------------------------------
-- 1. Conclusões por ocorrência
-- ---------------------------------------------------------------------------
create table if not exists public.activity_completions (
  activity_id     uuid not null references public.activities(id) on delete cascade,
  occurrence_date date not null,
  completed_by    uuid references public.profiles(id) on delete set null,
  completed_at    timestamptz not null default now(),
  -- A invariante central: uma conclusão por ocorrência, no nível do schema.
  primary key (activity_id, occurrence_date)
);

alter table public.activity_completions enable row level security;

-- Membros do lar leem e escrevem as conclusões das atividades daquele lar.
-- (`create policy` não aceita `if not exists`; o drop mantém a migration
-- reexecutável, como o resto do diretório.)
drop policy if exists "activity_completions_select" on public.activity_completions;
drop policy if exists "activity_completions_insert" on public.activity_completions;
drop policy if exists "activity_completions_delete" on public.activity_completions;

create policy "activity_completions_select" on public.activity_completions
  for select using (
    activity_id in (
      select id from public.activities
      where household_id in (select public.current_user_households())
    )
  );
create policy "activity_completions_insert" on public.activity_completions
  for insert with check (
    activity_id in (
      select id from public.activities
      where household_id in (select public.current_user_households())
    )
  );
create policy "activity_completions_delete" on public.activity_completions
  for delete using (
    activity_id in (
      select id from public.activities
      where household_id in (select public.current_user_households())
    )
  );

grant select, insert, delete on public.activity_completions to authenticated;

-- ---------------------------------------------------------------------------
-- 2. score_events por ocorrência
--
-- O índice de 0009 era `unique (activity_id) where event_type = 'conclusao'`:
-- proibia uma atividade pontuar duas vezes. Com recorrência, a mesma atividade
-- pontua uma vez POR OCORRÊNCIA, então a unicidade passa a ser pelo par.
-- ---------------------------------------------------------------------------
alter table public.score_events
  add column if not exists occurrence_date date;

-- Backfill: até aqui cada atividade pontuou no máximo uma vez, então o dia do
-- evento serve de ocorrência para as linhas históricas.
update public.score_events
   set occurrence_date = event_day
 where occurrence_date is null;

drop index if exists public.uq_score_conclusao_activity;
create unique index if not exists uq_score_conclusao_occurrence
  on public.score_events (activity_id, occurrence_date)
  where event_type = 'conclusao';

-- ---------------------------------------------------------------------------
-- 3. Backfill das conclusões já existentes
--
-- Preserva o que já estava concluído. Para tarefas recorrentes o dia gravado é
-- o da conclusão, que pode não coincidir com o dia da ocorrência — nesse caso a
-- tarefa reaparece uma vez como pendente. É o comportamento desejado: hoje elas
-- estão desaparecidas para sempre, e voltar a aparecer é a correção.
-- ---------------------------------------------------------------------------
insert into public.activity_completions (activity_id, occurrence_date, completed_at)
select a.id,
       (coalesce(a.completed_at, now()) at time zone 'America/Sao_Paulo')::date,
       coalesce(a.completed_at, now())
  from public.activities a
 where a.is_done
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Pontuação: sai do UPDATE de activities.is_done, entra na conclusão da
--    ocorrência. O trigger antigo apagava TODOS os score_events da atividade
--    ao reabrir (`where activity_id = new.id`, sem recorte de ocorrência) —
--    com recorrência isso apagaria o histórico inteiro.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_award_score on public.activities;

create or replace function public.award_score_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act public.activities;
  recipient uuid;
  base int;
  factor numeric;
  earned int;
  is_on_time boolean;
begin
  if tg_op = 'INSERT' then
    select * into act from public.activities where id = new.activity_id;
    if not found then return new; end if;

    -- Espelha a ocorrência corrente na linha da atividade.
    update public.activities
       set is_done = true,
           completed_at = new.completed_at,
           kanban_status = 'feito'
     where id = new.activity_id;

    -- Gamificação vale só para TAREFAS (compromissos marcam conclusão mas não
    -- pontuam). Sem usuário no contexto (cron/service role) também não pontua.
    recipient := coalesce(new.completed_by, auth.uid());
    if act.kind = 'tarefa' and recipient is not null then
      base := case act.priority
        when 'urgente' then 30
        when 'alta'    then 20
        when 'media'   then 10
        else 5                     -- baixa
      end;

      -- Recorrente: o prazo é o DIA da ocorrência. Não-recorrente: mantém a
      -- regra de 0009/0011, comparando com o instante exato do due_at.
      if act.recurrence_rule is not null then
        is_on_time :=
          (new.completed_at at time zone 'America/Sao_Paulo')::date
            <= new.occurrence_date;
      else
        is_on_time := act.due_at is not null and new.completed_at <= act.due_at;
      end if;

      factor := case
        when act.due_at is null then 1.0      -- sem prazo: base pura
        when is_on_time then 1.5              -- no prazo: bônus
        else 0.5                              -- atrasada: reduzida
      end;

      earned := round(base * factor);

      insert into public.score_events (
        household_id, profile_id, activity_id, event_type,
        points, priority, on_time, event_day, assignee_id, occurrence_date
      ) values (
        act.household_id, recipient, act.id, 'conclusao',
        earned, act.priority, is_on_time,
        (new.completed_at at time zone 'America/Sao_Paulo')::date,
        act.assignee_id, new.occurrence_date
      )
      on conflict do nothing;
    end if;

    return new;

  else -- DELETE: reabrir a ocorrência
    update public.activities
       set is_done = false,
           completed_at = null,
           kanban_status = 'a_fazer'
     where id = old.activity_id;

    -- Recorte por ocorrência: reabrir setembro não mexe nos pontos de agosto.
    delete from public.score_events
     where activity_id = old.activity_id
       and event_type = 'conclusao'
       and occurrence_date = old.occurrence_date;

    return old;
  end if;
end;
$$;

drop trigger if exists trg_award_score_occurrence on public.activity_completions;
create trigger trg_award_score_occurrence
  after insert or delete on public.activity_completions
  for each row execute function public.award_score_occurrence();
