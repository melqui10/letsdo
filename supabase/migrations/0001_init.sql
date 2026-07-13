-- Letsdo — schema inicial (Fase 1)
-- Entidade central: activities (serve Lista, Calendário e Kanban).

create extension if not exists pgcrypto;

-- Households (famílias / grupos — permite escalar).
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles (extensão de auth.users).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Membros de cada household.
create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);

-- Atividades (núcleo — Lista/Calendário/Kanban).
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'media'
    check (priority in ('baixa', 'media', 'alta', 'urgente')),
  category text not null default 'casa'
    check (category in ('casa', 'igreja', 'mercado', 'financeiro', 'outro')),
  assignee_id uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  is_all_day boolean not null default false,
  kanban_status text not null default 'a_fazer'
    check (kanban_status in ('a_fazer', 'fazendo', 'feito')),
  is_done boolean not null default false,
  recurrence_rule text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_activities_household on public.activities (household_id);
create index if not exists idx_activities_due on public.activities (due_at);

-- Trigger: mantém updated_at em cada UPDATE.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_activities_updated_at on public.activities;
create trigger trg_activities_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- Função auxiliar (security definer evita recursão de RLS em household_members):
-- retorna os households do usuário autenticado.
create or replace function public.current_user_households()
returns setof uuid language sql security definer stable as $$
  select household_id from public.household_members where profile_id = auth.uid();
$$;

-- Cria um lar e adiciona o usuário atual como dono, de forma atômica.
-- security definer: necessário porque, no momento do INSERT, o usuário ainda não é
-- membro do lar recém-criado — sem isso a RLS de SELECT filtraria o RETURNING e o
-- fluxo quebraria. Assim, os dois inserts acontecem na mesma transação.
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
  return h;
end;
$$;

-- Habilita RLS.
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.activities enable row level security;

-- profiles: o próprio + perfis de membros dos mesmos households.
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or id in (
      select hm.profile_id from public.household_members hm
      where hm.household_id in (select public.current_user_households())
    )
  );
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

-- households: apenas os que o usuário pertence.
create policy "households_select_member" on public.households
  for select using (id in (select public.current_user_households()));
-- Qualquer usuário autenticado pode criar um novo lar.
create policy "households_insert_authenticated" on public.households
  for insert with check (auth.uid() is not null);

-- household_members: registros do próprio usuário ou dos seus households.
create policy "members_select" on public.household_members
  for select using (
    profile_id = auth.uid()
    or household_id in (select public.current_user_households())
  );
-- O usuário só pode adicionar a si mesmo como MEMBER (entrar por código).
-- O papel 'owner' é atribuído apenas na criação do lar (função create_household).
create policy "members_insert_self" on public.household_members
  for insert with check (profile_id = auth.uid() and role = 'member');
-- Permitir sair do lar (remover a própria associação).
create policy "members_delete_self" on public.household_members
  for delete using (profile_id = auth.uid());

-- activities: CRUD restrito aos households do usuário.
create policy "activities_select" on public.activities
  for select using (household_id in (select public.current_user_households()));
create policy "activities_insert" on public.activities
  for insert with check (household_id in (select public.current_user_households()));
create policy "activities_update" on public.activities
  for update using (household_id in (select public.current_user_households()));
create policy "activities_delete" on public.activities
  for delete using (household_id in (select public.current_user_households()));
