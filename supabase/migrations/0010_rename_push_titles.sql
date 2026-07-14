-- Letsdo — ajuste de marca: o nome de exibição do app passou a ser "Let's Do!".
-- Atualiza o título do resumo diário (único push que citava "Letsdo").
-- Recria run_daily_digest idêntica à 0009, mudando apenas o 'title'.

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
        'title', 'Seu dia no Let''s Do!',
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
