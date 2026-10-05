-- =====================================================================
-- RMHouse — 110 VELOCITÀ: LE REGOLE DI ACCESSO SI CALCOLANO UNA VOLTA SOLA
-- Ogni tabella ha la regola "lo staff della scuola legge/scrive". Era scritta come
-- is_staff(palestra_id): una funzione chiamata riga per riga, cioè 37.000 volte per
-- leggere le presenze di una stagione. Con l'archivio di una scuola vera (2.500 persone)
-- le pagine Persone, Calendario e Statistiche ci mettevano da 4 secondi a più di un minuto.
-- Ora la regola è "palestra_id in (le scuole dove sono staff)": la lista si calcola una
-- volta per query. Chi vede cosa non cambia.
-- Si può eseguire più volte. Va dopo la 109.
-- =====================================================================

-- le scuole dove chi è collegato ha un certo ruolo (una lista, calcolata una volta per query)
create or replace function palestre_con_ruolo(p_ruoli text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select palestra_id from staff where user_id = auth.uid() and attivo and ruolo::text = any (p_ruoli);
$$;
create or replace function palestre_staff() returns setof uuid language sql stable security definer set search_path = public as $$
  select palestre_con_ruolo(array['admin', 'segreteria', 'insegnante']);
$$;
create or replace function palestre_gestione() returns setof uuid language sql stable security definer set search_path = public as $$
  select palestre_con_ruolo(array['admin', 'segreteria']);
$$;
create or replace function palestre_admin() returns setof uuid language sql stable security definer set search_path = public as $$
  select palestre_con_ruolo(array['admin']);
$$;
-- i miei ruoli e la mia scheda staff (per le notifiche)
create or replace function miei_ruoli() returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(ruolo::text), '{}') from staff where user_id = auth.uid() and attivo;
$$;
create or replace function mie_schede_staff() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from staff where user_id = auth.uid();
$$;
grant execute on function palestre_con_ruolo(text[]), palestre_staff(), palestre_gestione(), palestre_admin(), miei_ruoli(), mie_schede_staff() to authenticated;

-- le funzioni usate nel codice restano, ma passano dalla stessa lista
create or replace function ha_ruolo(p_palestra uuid, p_ruoli text[])
returns boolean language sql stable security definer set search_path = public as $$
  select p_palestra in (select palestre_con_ruolo(p_ruoli));
$$;

-- tutte le regole che chiamano is_staff / is_gestione / is_admin / ha_ruolo riga per riga
do $$
declare r record; v_q text; v_c text; v_sql text; n int := 0;
begin
  for r in select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
            where schemaname = 'public'
              and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(is_staff|is_gestione|is_admin|ha_ruolo)\(' loop
    v_q := r.qual; v_c := r.with_check;
    v_q := regexp_replace(v_q, 'is_staff\(([a-z_.]+)\)', '(\1 in (select palestre_staff()))', 'g');
    v_q := regexp_replace(v_q, 'is_gestione\(([a-z_.]+)\)', '(\1 in (select palestre_gestione()))', 'g');
    v_q := regexp_replace(v_q, 'is_admin\(([a-z_.]+)\)', '(\1 in (select palestre_admin()))', 'g');
    v_q := regexp_replace(v_q, 'ha_ruolo\(([a-z_.]+), ARRAY\[''admin''::text\]\)', '(\1 in (select palestre_admin()))', 'g');
    v_c := regexp_replace(v_c, 'is_staff\(([a-z_.]+)\)', '(\1 in (select palestre_staff()))', 'g');
    v_c := regexp_replace(v_c, 'is_gestione\(([a-z_.]+)\)', '(\1 in (select palestre_gestione()))', 'g');
    v_c := regexp_replace(v_c, 'is_admin\(([a-z_.]+)\)', '(\1 in (select palestre_admin()))', 'g');
    v_c := regexp_replace(v_c, 'ha_ruolo\(([a-z_.]+), ARRAY\[''admin''::text\]\)', '(\1 in (select palestre_admin()))', 'g');
    if (v_q is distinct from r.qual) or (v_c is distinct from r.with_check) then
      v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      if v_q is not null then v_sql := v_sql || ' using (' || v_q || ')'; end if;
      if v_c is not null then v_sql := v_sql || ' with check (' || v_c || ')'; end if;
      execute v_sql; n := n + 1;
    end if;
  end loop;
  raise notice 'regole riscritte: %', n;
end $$;

-- le notifiche dello staff: la regola era un controllo riga per riga sulla tabella staff (su ogni pagina)
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'notifiche_staff' and policyname = 'staff_legge') then
    alter policy staff_legge on notifiche_staff using (
      palestra_id in (select palestre_staff())
      and (staff_id in (select mie_schede_staff())
           or (staff_id is null and (ruoli is null or ruoli && (select miei_ruoli()))))
    );
  end if;
end $$;

-- i figli dell'abbonamento (giorni, righe fattura, corsi del listino, promemoria fatti): stessa idea
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'iscrizioni_orari' and policyname = 'staff_legge') then
    alter policy staff_legge on iscrizioni_orari using (exists (select 1 from iscrizioni i where i.id = iscrizioni_orari.iscrizione_id
      and (i.palestra_id in (select palestre_staff()) or i.allievo_id in (select miei_allievi()))));
  end if;
end $$;
