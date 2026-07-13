-- Letsdo — Fase 2.1: ícone (emoji) por categoria, deixando a UI mais interativa.

alter table public.categories
  add column if not exists icon text;

-- Backfill dos ícones nas categorias padrão já existentes.
update public.categories c
set icon = d.icon
from (values
  ('Casa', '🏠'),
  ('Igreja', '⛪'),
  ('Mercado', '🛒'),
  ('Financeiro', '💰'),
  ('Outro', '📌')
) as d(name, icon)
where c.name = d.name and c.icon is null;

-- Atualiza create_household para semear os ícones dos novos lares.
create or replace function public.create_household(household_name text)
returns public.households
language plpgsql security definer set search_path = public as $$
declare
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  insert into public.households (name) values (household_name) returning * into h;
  insert into public.household_members (household_id, profile_id, role)
    values (h.id, auth.uid(), 'owner');
  insert into public.categories (household_id, name, color, icon) values
    (h.id, 'Casa', '#4f46e5', '🏠'),
    (h.id, 'Igreja', '#0ea5e9', '⛪'),
    (h.id, 'Mercado', '#16a34a', '🛒'),
    (h.id, 'Financeiro', '#f59e0b', '💰'),
    (h.id, 'Outro', '#6b7280', '📌');
  return h;
end;
$$;
