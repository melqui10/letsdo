-- Letsdo — Alerta de tarefas atrasadas.
--
-- Pedido: avisar de tempos em tempos quando uma tarefa passou do prazo, não
-- só uma vez. Segue o mesmo desenho dos jobs de 0008 (before_event/daily):
-- pg_cron varre o banco, deduplica via push_log e chama a Edge Function.
--
-- A cadência é por usuário (overdue_interval_hours). Em vez de guardar "a
-- última vez que avisei", o dedup usa um BALDE de tempo — floor(epoch /
-- intervalo) — como chave. Enquanto o balde não muda, o unique de push_log
-- impede reenvio; quando muda, a tarefa (se continuar atrasada) alerta de
-- novo. Autolimpa junto com o resto do push_log (job de 0008, 30 dias).

-- ---------------------------------------------------------------------------
-- 1. Preferência: ligar/desligar + intervalo entre lembretes.
-- ---------------------------------------------------------------------------
alter table public.notification_prefs
  add column if not exists overdue_enabled boolean not null default false,
  add column if not exists overdue_interval_hours int not null default 24;

-- ---------------------------------------------------------------------------
-- 2. push_log precisa aceitar o novo "kind".
-- ---------------------------------------------------------------------------
alter table public.push_log drop constraint if exists push_log_kind_check;
alter table public.push_log
  add constraint push_log_kind_check
  check (kind in ('before_event', 'daily', 'overdue'));

-- ---------------------------------------------------------------------------
-- 3. Job — Tarefas atrasadas (overdue).
-- Para cada tarefa vencida e não concluída, avisa quem é responsável por ela
-- (ou, sem responsável definido, cada membro do lar que ativou o alerta),
-- respeitando o intervalo escolhido pela pessoa. `is_done` já reflete a
-- ocorrência corrente (mantido pelo trigger de 0012 + reopenForNewOccurrence
-- no cliente), então recorrentes atrasadas também caem aqui.
-- ---------------------------------------------------------------------------
create or replace function public.run_overdue_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  edge_url text;
  service_key text;
  rec record;
  bucket text;
begin
  select decrypted_secret into edge_url
  from vault.decrypted_secrets where name = 'edge_url';
  select decrypted_secret into service_key
  from vault.decrypted_secrets where name = 'service_role_key';
  if edge_url is null or service_key is null then
    return;
  end if;

  for rec in
    select a.id as activity_id, a.title, a.due_at, hm.profile_id,
           np.overdue_interval_hours
    from public.activities a
    join public.household_members hm on hm.household_id = a.household_id
    join public.notification_prefs np on np.profile_id = hm.profile_id
    where a.due_at is not null
      and a.is_done = false
      and a.kind = 'tarefa'
      and a.due_at < now()
      and np.overdue_enabled = true
      -- só o responsável é avisado quando a tarefa tem um; sem responsável,
      -- todo o lar que ativou o alerta recebe
      and (a.assignee_id is null or a.assignee_id = hm.profile_id)
  loop
    bucket := floor(
      extract(epoch from now()) / (rec.overdue_interval_hours * 3600)
    )::text;

    insert into public.push_log (kind, profile_id, activity_id, dedup_key)
    values (
      'overdue', rec.profile_id, rec.activity_id,
      'overdue:' || rec.activity_id || ':' || rec.profile_id || ':' || bucket
    )
    on conflict (dedup_key) do nothing;
    if not found then
      continue;
    end if;

    perform net.http_post(
      url := edge_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'profile_id', rec.profile_id,
        'type', 'overdue',
        'title', 'Tarefa atrasada',
        'body', '"' || rec.title || '" venceu ' ||
                to_char(rec.due_at at time zone 'America/Sao_Paulo', 'dd/MM às HH24:MI'),
        'url', '/',
        'tag', 'overdue-' || rec.activity_id
      )
    );
  end loop;
end;
$$;

revoke execute on function public.run_overdue_alerts()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Agendamento. A cada 15 min: granularidade suficiente para intervalos em
--    horas sem sobrecarregar o cron.
-- ---------------------------------------------------------------------------
select cron.unschedule('letsdo-overdue-alerts')
  where exists (select 1 from cron.job where jobname = 'letsdo-overdue-alerts');

select cron.schedule(
  'letsdo-overdue-alerts', '*/15 * * * *',
  $$select public.run_overdue_alerts()$$
);
