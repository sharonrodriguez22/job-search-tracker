-- Splits applications into two areas shown as separate tabs in the app:
--   'Tech'     -> QA, data and other IT roles
--   'Farmacia' -> pharmacy and pharmacy-related administrative roles

alter table public.applications
  add column if not exists area text not null default 'Tech';

alter table public.applications
  drop constraint if exists applications_area_check;
alter table public.applications
  add constraint applications_area_check check (area in ('Tech', 'Farmacia'));

-- Existing rows: infer the area from the CV that was chosen for them.
-- The user can change the area per row in the app afterwards.
update public.applications
   set area = 'Farmacia'
 where cv in ('Farmacia', 'Administrativo');

-- Ingest: accepts an optional "area" per row (default 'Tech').
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
  v_area     text;
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
    v_area    := coalesce(nullif(v_row ->> 'area', ''), 'Tech');

    if v_company = '' or v_role = '' then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', 'missing company or role');
      continue;
    end if;
    if v_area not in ('Tech', 'Farmacia') then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', 'area must be Tech or Farmacia');
      continue;
    end if;
    if v_url is not null and v_url !~* '^https?://' then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', 'url must start with http(s)://');
      continue;
    end if;

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
      insert into public.applications (user_id, company, role, channel, url, status, notes, area)
      values (v_user, v_company, v_role, v_channel, v_url, 'Pendiente', v_notes, v_area);
      v_inserted := v_inserted + 1;
    exception when check_violation then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

-- Sync: also returns the area. The return type changes, so drop first.
drop function if exists public.list_applications_for_sync(text);
create function public.list_applications_for_sync(p_token text)
returns table (company text, role text, url text, status text, area text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.resolve_ingest_token(p_token);
begin
  return query
    select a.company, a.role, a.url, a.status, a.area, a.updated_at
      from public.applications a
     where a.user_id = v_user
     order by a.updated_at desc
     limit 2000;
end;
$$;

revoke all on function public.list_applications_for_sync(text) from public;
grant execute on function public.list_applications_for_sync(text) to anon, authenticated;
