-- Job Search Tracker: database schema.
-- Run this whole file once in the Supabase SQL editor.
-- Every table is protected by Row Level Security: a signed-in user can only
-- read and write their own rows, so the public anon key is safe to ship.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists public.applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company        text not null,
  role           text not null,
  channel        text not null default 'Otro',
  url            text,
  cv             text,
  status         text not null default 'Pendiente',
  applied_on     date,
  next_follow_up date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_status    text,
  to_status      text not null,
  created_at     timestamptz not null default now()
);

create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  subject    text,
  body       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.alert_keywords (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('search', 'review')),
  keyword    text not null,
  reason     text,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists applications_user_idx on public.applications (user_id, created_at desc);
create index if not exists events_application_idx on public.application_events (application_id, created_at desc);

-- ---------------------------------------------------------------- triggers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Keep a history row every time an application is created or changes status.
create or replace function public.log_status_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, user_id, from_status, to_status)
    values (new.id, new.user_id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.application_events (application_id, user_id, from_status, to_status)
    values (new.id, new.user_id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists applications_log_status on public.applications;
create trigger applications_log_status
  after insert or update on public.applications
  for each row execute function public.log_status_change();

-- ---------------------------------------------------------------- row level security

alter table public.applications       enable row level security;
alter table public.application_events enable row level security;
alter table public.templates          enable row level security;
alter table public.alert_keywords     enable row level security;

drop policy if exists "own rows" on public.applications;
create policy "own rows" on public.applications
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.application_events;
create policy "own rows" on public.application_events
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.templates;
create policy "own rows" on public.templates
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.alert_keywords;
create policy "own rows" on public.alert_keywords
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
