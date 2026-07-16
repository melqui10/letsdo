-- Letsdo — Gamificação: congela o responsável (assignee) no evento de pontuação.
--
-- Motivação: conquista "Herói do outro" (concluir tarefas que estavam
-- atribuídas ao parceiro). Como o ledger congela fatos no momento da
-- conclusão, gravamos aqui quem ERA o responsável — editar a atividade
-- depois não muda a conquista.

alter table public.score_events
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null;

-- Recria o trigger de pontuação incluindo o assignee_id congelado.
-- (Mesma lógica de 0009; única mudança é a coluna nova no INSERT.)
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
        points, priority, on_time, event_day, assignee_id
      ) values (
        new.household_id, recipient, new.id, 'conclusao',
        earned, new.priority, is_on_time,
        (now() at time zone 'America/Sao_Paulo')::date,
        new.assignee_id
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
