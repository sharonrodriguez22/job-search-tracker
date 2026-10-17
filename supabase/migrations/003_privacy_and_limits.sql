-- Privacy and abuse protection for an app that other people can sign up to.
-- Run after 002_user_settings.sql.
--   1. consents: append-only log of accepted privacy-notice versions
--   2. delete_my_account(): lets a signed-in user erase their account and all their data
--   3. length checks and per-user row limits so one account cannot fill the database

-- ---------------------------------------------------------------- consents

create table if not exists public.consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  policy_version text not null check (char_length(policy_version) between 1 and 32),
  accepted_at    timestamptz not null default now()
);

create index if not exists consents_user_idx on public.consents (user_id, accepted_at desc);

alter table public.consents enable row level security;

-- Users can read and add their own consent records. There is no update or delete policy on purpose:
-- the log is append-only and disappears only when the account is deleted (cascade).
drop policy if exists "read own consents" on public.consents;
create policy "read own consents" on public.consents
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "add own consents" on public.consents;
create policy "add own consents" on public.consents
  for insert to authenticated
  with check (auth.uid() = user_id);

-- When someone signs up through the app, the form sends the accepted version in the user metadata.
-- Record it here, because with email confirmation on there is no session yet to write it from the browser.
create or replace function public.record_signup_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ? 'policy_version' then
    insert into public.consents (user_id, policy_version)
    values (new.id, left(new.raw_user_meta_data ->> 'policy_version', 32));
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_record_consent on auth.users;
create trigger on_auth_user_created_record_consent
  after insert on auth.users
  for each row execute function public.record_signup_consent();

-- ---------------------------------------------------------------- delete my account

-- Deleting the auth user cascades to every table that references auth.users with on delete cascade.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------- length checks

alter table public.applications
  add constraint applications_company_len check (char_length(company) between 1 and 200),
  add constraint applications_role_len    check (char_length(role) between 1 and 200),
  add constraint applications_channel_len check (char_length(channel) <= 60),
  add constraint applications_url_len     check (url is null or char_length(url) <= 2000),
  add constraint applications_cv_len      check (cv is null or char_length(cv) <= 60),
  add constraint applications_status_len  check (char_length(status) <= 40),
  add constraint applications_notes_len   check (notes is null or char_length(notes) <= 2000);

alter table public.templates
  add constraint templates_name_len    check (char_length(name) between 1 and 100),
  add constraint templates_subject_len check (subject is null or char_length(subject) <= 300),
  add constraint templates_body_len    check (char_length(body) between 1 and 5000);

alter table public.alert_keywords
  add constraint alert_keywords_keyword_len check (char_length(keyword) between 1 and 100),
  add constraint alert_keywords_reason_len  check (reason is null or char_length(reason) <= 300);

alter table public.user_settings
  add constraint user_settings_channels_size check (char_length(array_to_string(channels, ',')) <= 1200),
  add constraint user_settings_cv_size       check (char_length(array_to_string(cv_options, ',')) <= 1200);

-- ---------------------------------------------------------------- per-user row limits

create or replace function public.enforce_row_limit()
returns trigger
language plpgsql
as $$
declare
  max_rows     int := tg_argv[0]::int;
  current_rows int;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into current_rows
    using new.user_id;
  if current_rows >= max_rows then
    raise exception 'Row limit reached for %: maximum % per account', tg_table_name, max_rows
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_row_limit on public.applications;
create trigger applications_row_limit
  before insert on public.applications
  for each row execute function public.enforce_row_limit(2000);

drop trigger if exists templates_row_limit on public.templates;
create trigger templates_row_limit
  before insert on public.templates
  for each row execute function public.enforce_row_limit(100);

drop trigger if exists alert_keywords_row_limit on public.alert_keywords;
create trigger alert_keywords_row_limit
  before insert on public.alert_keywords
  for each row execute function public.enforce_row_limit(300);
