-- Ingest tokens: let an automated job (for example a daily search run) add
-- applications to ONE user's account and read back their statuses, without
-- ever holding that user's password or session.
--
-- Design:
--  * The user creates a token in Settings. It is shown once; only its SHA-256
--    hash is stored, so a database leak does not expose usable tokens.
--  * The token can only call the two functions below: it can insert new
--    applications (always as 'Pendiente') and list the user's applications.
--    It cannot edit, delete or read anything else.
--  * Tokens can be revoked at any time.

create table if not exists public.ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 60),
  token_hash   bytea not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists ingest_tokens_user_idx on public.ingest_tokens (user_id, created_at desc);

alter table public.ingest_tokens enable row level security;

-- Users can see their own tokens (the hash is useless without the secret) but
-- every change goes through the functions below.
drop policy if exists "ingest_tokens_select_own" on public.ingest_tokens;
create policy "ingest_tokens_select_own" on public.ingest_tokens
  for select to authenticated using (auth.uid() = user_id);

drop trigger if exists ingest_tokens_row_limit on public.ingest_tokens;
create trigger ingest_tokens_row_limit
  before insert on public.ingest_tokens
  for each row execute function public.enforce_row_limit(10);

-- ------------------------------------------------------------ token management

create or replace function public.create_ingest_token(p_label text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_label text := btrim(coalesce(p_label, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if char_length(v_label) not between 1 and 60 then
    raise exception 'Label must be 1 to 60 characters' using errcode = 'check_violation';
  end if;
  v_token := 'jst_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.ingest_tokens (user_id, label, token_hash)
  values (auth.uid(), v_label, sha256(convert_to(v_token, 'utf8')));
  return v_token;
end;
$$;

create or replace function public.revoke_ingest_token(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  update public.ingest_tokens
     set revoked_at = now()
   where id = p_id and user_id = auth.uid() and revoked_at is null;
end;
$$;

-- Resolves a token to its owner and records the use. Raises on bad tokens.
create or replace function public.resolve_ingest_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if p_token is null or char_length(p_token) not between 20 and 200 then
    raise exception 'Invalid token' using errcode = '28000';
  end if;
  update public.ingest_tokens
     set last_used_at = now()
   where token_hash = sha256(convert_to(p_token, 'utf8')) and revoked_at is null
  returning user_id into v_user;
  if v_user is null then
    raise exception 'Invalid token' using errcode = '28000';
  end if;
  return v_user;
end;
$$;

-- ------------------------------------------------------------------- ingest

create or replace function public.ingest_applications(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := public.resolve_ingest_token(p_token);
  v_row      jsonb;
  v_company  text;
  v_role     text;
  v_channel  text;
  v_url      text;
  v_notes    text;
  v_inserted int := 0;
  v_skipped  jsonb := '[]'::jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_rows) > 50 then
    raise exception 'At most 50 rows per call' using errcode = 'invalid_parameter_value';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_company := left(btrim(coalesce(v_row ->> 'company', '')), 200);
    v_role    := left(btrim(coalesce(v_row ->> 'role', '')), 200);
    v_channel := left(btrim(coalesce(nullif(v_row ->> 'channel', ''), 'Otro')), 60);
    v_url     := nullif(left(btrim(coalesce(v_row ->> 'url', '')), 2000), '');
    v_notes   := nullif(left(btrim(coalesce(v_row ->> 'notes', '')), 2000), '');

    if v_company = '' or v_role = '' then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', 'missing company or role');
      continue;
    end if;
    if v_url is not null and v_url !~* '^https?://' then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', 'url must start with http(s)://');
      continue;
    end if;

    -- Duplicate: same company + role, or same URL, in ANY status.
    if exists (
      select 1 from public.applications a
       where a.user_id = v_user
         and ((lower(a.company) = lower(v_company) and lower(a.role) = lower(v_role))
              or (v_url is not null and a.url = v_url))
    ) then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', 'duplicate');
      continue;
    end if;

    begin
      insert into public.applications (user_id, company, role, channel, url, status, notes)
      values (v_user, v_company, v_role, v_channel, v_url, 'Pendiente', v_notes);
      v_inserted := v_inserted + 1;
    exception when check_violation then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

-- --------------------------------------------------------------------- sync

-- Read-only view of the user's applications so the job can respect the
-- statuses the user sets in the app (no re-adding, follow what is marked).
create or replace function public.list_applications_for_sync(p_token text)
returns table (company text, role text, url text, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.resolve_ingest_token(p_token);
begin
  return query
    select a.company, a.role, a.url, a.status, a.updated_at
      from public.applications a
     where a.user_id = v_user
     order by a.updated_at desc
     limit 2000;
end;
$$;

-- ------------------------------------------------------------------- grants

revoke all on function public.create_ingest_token(text)         from public;
revoke all on function public.revoke_ingest_token(uuid)         from public;
revoke all on function public.resolve_ingest_token(text)        from public;
revoke all on function public.ingest_applications(text, jsonb)  from public;
revoke all on function public.list_applications_for_sync(text)  from public;

grant execute on function public.create_ingest_token(text)        to authenticated;
grant execute on function public.revoke_ingest_token(uuid)        to authenticated;
grant execute on function public.ingest_applications(text, jsonb) to anon, authenticated;
grant execute on function public.list_applications_for_sync(text) to anon, authenticated;
-- resolve_ingest_token is internal: only the functions above (owner) call it.
