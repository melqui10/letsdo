-- Disparo automático de push: quando alguém cria uma atividade, os demais
-- membros do lar recebem uma notificação ("atividade do lar").
--
-- A URL da Edge Function e a service_role key NÃO ficam aqui (são segredos).
-- Elas são lidas de GUCs definidas fora do versionamento com:
--   alter database postgres set app.edge_url = 'https://<ref>.supabase.co';
--   alter database postgres set app.service_role_key = '<service_role_key>';

create extension if not exists pg_net;

create or replace function public.notify_activity_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  edge_url text := current_setting('app.edge_url', true);
  service_key text := current_setting('app.service_role_key', true);
  creator_name text;
begin
  -- Sem configuração de segredos, não faz nada (evita erro em ambiente local).
  if edge_url is null or service_key is null then
    return new;
  end if;

  select display_name into creator_name
  from public.profiles
  where id = new.created_by;

  perform net.http_post(
    url := edge_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'household_id', new.household_id,
      'exclude_profile_id', new.created_by,
      'type', 'feed',
      'title', 'Nova tarefa no lar',
      'body', coalesce(creator_name, 'Alguém') || ' adicionou "' || new.title || '"',
      'url', '/'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_activity_push on public.activities;
create trigger trg_activity_push
  after insert on public.activities
  for each row execute function public.notify_activity_push();
