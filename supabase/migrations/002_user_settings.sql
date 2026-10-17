-- Per-user settings: customizable channels, CV types and follow-up interval.
-- Run after 001_initial.sql (it reuses public.set_updated_at()).

create table if not exists public.user_settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  channels        text[] not null
    default array['Computrabajo', 'LinkedIn', 'Referido', 'Portal de la empresa', 'Mail directo', 'Consultora', 'Otro'],
  cv_options      text[] not null default array['Administrativo', 'Farmacia', 'QA', 'Otro'],
  follow_up_days  int not null default 5 check (follow_up_days between 1 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (cardinality(channels) between 1 and 30),
  check (cardinality(cv_options) between 1 and 30)
);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "own rows" on public.user_settings;
create policy "own rows" on public.user_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
