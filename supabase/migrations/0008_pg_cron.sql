-- Letsdo — Fase 4.2: agendamento de notificações com pg_cron.
--
-- O trigger de "nova tarefa no lar" (0005/0006) cobre o push imediato. Faltava
-- o "relógio" para os pushes com HORA MARCADA:
--   1) Lembrete de compromisso  — X minutos antes do due_at (before_event_minutes)
--   2) Resumo diário            — no daily_time de cada usuário
--
-- pg_cron roda SQL periodicamente; cada função varre o banco, deduplica os
-- envios (tabela push_log) e chama a Edge Function send-push via pg_net —
-- exatamente o mesmo caminho do trigger. Os segredos (edge_url, service_role_key)
-- vêm do Vault, como em 0006.
--
-- Fuso de referência para horários: America/Sao_Paulo.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Log de envios agendados: garante idempotência (cada lembrete sai uma vez só).
-- dedup_key é único e codifica o "assunto" do envio:
--   before_event:<activity_id>:<profile_id>
--   daily:<profile_id>:<data-local>
-- ---------------------------------------------------------------------------
create table if not exists public.push_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('before_event', 'daily')),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  dedup_key text not null unique,
  sent_at timestamptz not null default now()
);

create index if not exists idx_push_log_sent_at on public.push_log (sent_at);

-- Tabela interna: nenhum cliente precisa ler. RLS habilitada sem policies =
-- negado para anon/authenticated; as funções (security definer) e a service
-- role continuam acessando normalmente.
alter table public.push_log enable row level security;

-- ---------------------------------------------------------------------------
-- Job 1 — Lembrete de compromisso (before_event).
-- Para cada atividade com hora marcada, ainda não concluída, dispara o push
-- quando entramos na janela "due_at - before_event_minutes" de CADA membro do
-- lar que ativou o lembrete. Envia por profile_id (a preferência já foi filtrada
-- aqui no SQL), uma vez por (atividade, pessoa).
-- ---------------------------------------------------------------------------
create or replace function public.run_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  edge_url text;
  service_key text;
  rec record;
begin
  select decrypted_secret into edge_url
  from vault.decrypted_secrets where name = 'edge_url';
  select decrypted_secret into service_key
  from vault.decrypted_secrets where name = 'service_role_key';
  if edge_url is null or service_key is null then
    return;
  end if;

  for rec in
    select a.id as activity_id, a.title, a.due_at, hm.profile_id
    from public.activities a
    join public.household_members hm on hm.household_id = a.household_id
    join public.notification_prefs np on np.profile_id = hm.profile_id
    where a.due_at is not null
      and a.is_done = false
      -- compromissos sempre; tarefas só se o usuário pediu para vê-las na agenda
      and (a.kind = 'compromisso' or a.show_in_agenda = true)
      and np.before_event_enabled = true
      -- já entramos na janela de antecedência e ainda não passou da hora
      and now() >= a.due_at - make_interval(mins => np.before_event_minutes)
      and now() < a.due_at
      and not exists (
        select 1 from public.push_log l
        where l.dedup_key = 'before_event:' || a.id || ':' || hm.profile_id
      )
  loop
    -- Marca ANTES de enviar. Se outro tick sobreposto já inseriu esta chave, o
    -- insert não afeta linha nenhuma (FOUND = false) e pulamos o envio — assim o
    -- unique de fato impede push duplicado.
    insert into public.push_log (kind, profile_id, activity_id, dedup_key)
    values ('before_event', rec.profile_id, rec.activity_id,
            'before_event:' || rec.activity_id || ':' || rec.profile_id)
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
        'type', 'before_event',
        'title', 'Lembrete: ' || rec.title,
        'body', 'Começa às ' ||
                to_char(rec.due_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'url', '/agenda',
        'tag', 'ev-' || rec.activity_id
      )
    );
  end loop;
end;
$$;

-- Rotina interna: só o pg_cron/owner executa. Sem isto, o PostgREST exporia
-- /rest/v1/rpc/run_event_reminders para anon/authenticated.
revoke execute on function public.run_event_reminders()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Job 2 — Resumo diário (daily).
-- No horário escolhido por cada usuário (daily_time, fuso America/Sao_Paulo),
-- envia uma contagem das atividades pendentes que vencem HOJE. Uma vez por dia.
-- A janela de 5 min casa com a frequência do cron (*/5).
-- ---------------------------------------------------------------------------
create or replace function public.run_daily_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  edge_url text;
  service_key text;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  local_time time := (now() at time zone 'America/Sao_Paulo')::time;
  rec record;
  cnt int;
begin
  select decrypted_secret into edge_url
  from vault.decrypted_secrets where name = 'edge_url';
  select decrypted_secret into service_key
  from vault.decrypted_secrets where name = 'service_role_key';
  if edge_url is null or service_key is null then
    return;
  end if;

  for rec in
    select np.profile_id
    from public.notification_prefs np
    where np.daily_enabled = true
      -- segundos decorridos desde daily_time, com wrap de 24h (mod + 86400
      -- trata o caso perto da meia-noite). Dispara na janela [0, 5min).
      and mod(
            (extract(epoch from local_time)::int
             - extract(epoch from np.daily_time)::int + 86400),
            86400
          ) < 300
      and not exists (
        select 1 from public.push_log l
        where l.dedup_key = 'daily:' || np.profile_id || ':' || today
      )
  loop
    select count(*) into cnt
    from public.activities a
    where a.is_done = false
      and a.due_at is not null
      and (a.due_at at time zone 'America/Sao_Paulo')::date = today
      and a.household_id in (
        select household_id from public.household_members
        where profile_id = rec.profile_id
      );

    insert into public.push_log (kind, profile_id, dedup_key)
    values ('daily', rec.profile_id, 'daily:' || rec.profile_id || ':' || today)
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
        'type', 'daily',
        'title', 'Seu dia no Letsdo',
        'body', case
                  when cnt = 0 then 'Nada agendado para hoje 🎉'
                  when cnt = 1 then '1 item vence hoje'
                  else cnt || ' itens vencem hoje'
                end,
        'url', '/',
        'tag', 'daily-' || today
      )
    );
  end loop;
end;
$$;

-- Rotina interna: só o pg_cron/owner executa (ver nota acima).
revoke execute on function public.run_daily_digest()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agendamento no pg_cron. Desagenda antes (idempotência ao reaplicar).
-- ---------------------------------------------------------------------------
select cron.unschedule('letsdo-event-reminders')
  where exists (select 1 from cron.job where jobname = 'letsdo-event-reminders');
select cron.unschedule('letsdo-daily-digest')
  where exists (select 1 from cron.job where jobname = 'letsdo-daily-digest');
select cron.unschedule('letsdo-push-log-cleanup')
  where exists (select 1 from cron.job where jobname = 'letsdo-push-log-cleanup');

-- A cada 5 minutos: lembretes de compromisso e resumo diário.
select cron.schedule(
  'letsdo-event-reminders', '*/5 * * * *',
  $$select public.run_event_reminders()$$
);
select cron.schedule(
  'letsdo-daily-digest', '*/5 * * * *',
  $$select public.run_daily_digest()$$
);

-- Domingo 03:00: limpa registros de envio com mais de 30 dias.
select cron.schedule(
  'letsdo-push-log-cleanup', '0 3 * * 0',
  $$delete from public.push_log where sent_at < now() - interval '30 days'$$
);
