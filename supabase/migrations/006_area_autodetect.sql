-- Adds a third area, 'A confirmar', for postings that cannot be classified
-- with confidence, and a keyword-based classifier used when no area is given.

alter table public.applications drop constraint if exists applications_area_check;
alter table public.applications
  add constraint applications_area_check check (area in ('Tech', 'Farmacia', 'A confirmar'));

-- Classifies free text (company + role + notes).
--   only tech words      -> 'Tech'
--   only pharmacy/admin  -> 'Farmacia'
--   both or neither      -> 'A confirmar'
-- The same rules exist in js/logic.js (guessArea); keep both in sync.
create or replace function public.guess_area(p_text text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  t text := lower(translate(coalesce(p_text, ''), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuaeiouu'));
  is_tech boolean;
  is_pharma boolean;
begin
  is_tech := t ~ '\y(qa|qe|tester|testers|testing|test|sdet|cypress|selenium|playwright|developer|software|datos|data|bi|sql|python|javascript|devops|sistemas|it)\y'
          or t ~ '\y(automati|desarroll|program)';
  is_pharma := t ~ '\y(recepcionista|stock|inventario|deposito|auxiliar|clinica|sanatorio|compras)\y'
            or t ~ '\y(farmaci|droguer|administrativ|facturaci|licitaci|secretari|hospital|medicament|oncolog)';
  if is_tech and not is_pharma then return 'Tech'; end if;
  if is_pharma and not is_tech then return 'Farmacia'; end if;
  return 'A confirmar';
end;
$$;

-- Ingest: when a row has no area, classify it from its text.
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
    v_area    := nullif(v_row ->> 'area', '');

    if v_company = '' or v_role = '' then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', 'missing company or role');
      continue;
    end if;
    if v_area is null then
      v_area := public.guess_area(v_company || ' ' || v_role || ' ' || coalesce(v_notes, ''));
    end if;
    if v_area not in ('Tech', 'Farmacia', 'A confirmar') then
      v_skipped := v_skipped || jsonb_build_object('company', v_company, 'role', v_role, 'reason', 'area must be Tech, Farmacia or A confirmar');
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

revoke all on function public.ingest_applications(text, jsonb) from public;
grant execute on function public.ingest_applications(text, jsonb) to anon, authenticated;
revoke all on function public.guess_area(text) from public;
