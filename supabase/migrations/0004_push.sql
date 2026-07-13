-- Letsdo — Fase 4.1: infraestrutura de notificações push (Web Push / VAPID).

-- Assinaturas de push: uma linha por dispositivo/navegador do usuário.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_sub_profile
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

create policy "push_sub_select" on public.push_subscriptions
  for select using (profile_id = auth.uid());
create policy "push_sub_insert" on public.push_subscriptions
  for insert with check (profile_id = auth.uid());
create policy "push_sub_update" on public.push_subscriptions
  for update using (profile_id = auth.uid());
create policy "push_sub_delete" on public.push_subscriptions
  for delete using (profile_id = auth.uid());

-- Preferências de notificação: uma linha por usuário.
create table if not exists public.notification_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  daily_enabled boolean not null default false,
  daily_time time not null default '08:00',
  before_event_enabled boolean not null default false,
  before_event_minutes int not null default 30,
  feed_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "notif_prefs_select" on public.notification_prefs
  for select using (profile_id = auth.uid());
create policy "notif_prefs_insert" on public.notification_prefs
  for insert with check (profile_id = auth.uid());
create policy "notif_prefs_update" on public.notification_prefs
  for update using (profile_id = auth.uid());
