-- Letsdo — Fase 1.1: categorias personalizáveis por lar.
-- Substitui o enum fixo de `category` por uma tabela `categories` com cor.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create index if not exists idx_categories_household on public.categories (household_id);

alter table public.categories enable row level security;

create policy "categories_select" on public.categories
  for select using (household_id in (select public.current_user_households()));
create policy "categories_insert" on public.categories
  for insert with check (household_id in (select public.current_user_households()));
create policy "categories_update" on public.categories
  for update using (household_id in (select public.current_user_households()));
create policy "categories_delete" on public.categories
  for delete using (household_id in (select public.current_user_households()));

-- Nova referência em activities.
alter table public.activities
  add column if not exists category_id uuid references public.categories(id) on delete set null;

-- Semeia as categorias padrão para households existentes que ainda não têm nenhuma.
insert into public.categories (household_id, name, color)
select h.id, d.name, d.color
from public.households h
cross join (values
  ('Casa', '#4f46e5'),
  ('Igreja', '#0ea5e9'),
  ('Mercado', '#16a34a'),
  ('Financeiro', '#f59e0b'),
  ('Outro', '#6b7280')
) as d(name, color)
where not exists (select 1 from public.categories c where c.household_id = h.id)
on conflict (household_id, name) do nothing;

-- Backfill: mapeia o texto antigo de `category` para o novo `category_id`.
update public.activities a
set category_id = c.id
from public.categories c
where c.household_id = a.household_id
  and a.category_id is null
  and lower(c.name) = lower(
    case a.category
      when 'casa' then 'Casa'
      when 'igreja' then 'Igreja'
      when 'mercado' then 'Mercado'
      when 'financeiro' then 'Financeiro'
      else 'Outro'
    end
  );

-- Remove a coluna antiga de texto (enum fixo).
alter table public.activities drop column if exists category;

-- Atualiza create_household para também semear as categorias padrão do novo lar.
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
  insert into public.categories (household_id, name, color) values
    (h.id, 'Casa', '#4f46e5'),
    (h.id, 'Igreja', '#0ea5e9'),
    (h.id, 'Mercado', '#16a34a'),
    (h.id, 'Financeiro', '#f59e0b'),
    (h.id, 'Outro', '#6b7280');
  return h;
end;
$$;
