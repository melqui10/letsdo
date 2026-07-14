-- Ajuste: no Supabase hospedado não é permitido `alter database ... set`,
-- então a função passa a ler a URL da Edge Function e a service key do Vault.
--
-- Os segredos são cadastrados uma vez (fora do git), no SQL Editor:
--   select vault.create_secret('https://<ref>.supabase.co', 'edge_url');
--   select vault.create_secret('<service_role/secret key>', 'service_role_key');

create or replace function public.notify_activity_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  edge_url text;
  service_key text;
  creator_name text;
begin
  select decrypted_secret into edge_url
  from vault.decrypted_secrets where name = 'edge_url';
  select decrypted_secret into service_key
  from vault.decrypted_secrets where name = 'service_role_key';

  -- Sem segredos cadastrados, não faz nada (evita erro).
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
