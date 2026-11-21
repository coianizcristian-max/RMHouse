-- 180 — Elenco allievi: file "a blocchi" (come quello della segreteria) e allievi in più gruppi
-- • Un allievo può essere in più gruppi: si salva una volta sola (stessi posti) con i gruppi separati da « | »;
--   nella pagina pubblica compare in ognuno dei suoi gruppi.
-- • «Sostituisci l'elenco» toglie solo gli allievi degli spettacoli presenti nel file (si può caricare un file per
--   spettacolo senza cancellare gli altri).
-- Va dopo la 170–179. Si può rilanciare.

-- lo spettacolo da un testo: numero (ordine), ora (15:30) o una parola del titolo; anche l'id
create or replace function biglietteria_spettacolo_da_testo(p_biglietteria uuid, p_testo text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_t text := lower(btrim(coalesce(p_testo, ''))); v uuid;
begin
  if v_t ~ '^[0-9a-f-]{36}$' then
    select id into v from biglietteria_spettacoli where biglietteria_id = p_biglietteria and id = v_t::uuid;
  elsif v_t ~ '^\d+$' then
    select id into v from biglietteria_spettacoli where biglietteria_id = p_biglietteria and con_allievi and ordine = v_t::int limit 1;
  elsif v_t ~ '^\d{1,2}[:.]\d{2}$' then
    select id into v from biglietteria_spettacoli where biglietteria_id = p_biglietteria and con_allievi
       and to_char(inizio at time zone 'Europe/Rome', 'HH24:MI') = lpad(replace(v_t, '.', ':'), 5, '0') limit 1;
  elsif v_t <> '' then
    select id into v from biglietteria_spettacoli where biglietteria_id = p_biglietteria and con_allievi and lower(titolo) like '%' || v_t || '%'
     order by ordine limit 1;
  end if;
  return v;
end $$;

create or replace function biglietteria_gruppi(p_spettacolo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('gruppo', g, 'allievi', n) order by g), '[]'::jsonb)
    from (select btrim(g) g, count(*) n from biglietteria_allievi a,
            unnest(string_to_array(coalesce(nullif(a.gruppo, ''), 'Altri'), ' | ')) g
           where a.spettacolo_id = p_spettacolo group by 1) x;
$$;
revoke all on function biglietteria_gruppi(uuid) from public, anon, authenticated;

grant execute on function biglietteria_gruppi(uuid) to service_role;

create or replace function biglietteria_elenco(p_spettacolo uuid, p_gruppo text)
returns jsonb language sql stable security definer set search_path = public as $$
  with g as (
    select a.id, a.nome, a.cognome, lower(btrim(a.nome)) n, lower(btrim(a.cognome)) c
      from biglietteria_allievi a
     where a.spettacolo_id = p_spettacolo and p_gruppo = any(string_to_array(coalesce(nullif(a.gruppo, ''), 'Altri'), ' | '))
  ), l as (
    -- quante lettere del cognome servono perché nessun altro con lo stesso nome abbia lo stesso inizio
    select g.*,
           coalesce((select min(k) from generate_series(1, greatest(length(g.c), 1)) k
                      where not exists (select 1 from g x where x.id <> g.id and x.n = g.n and left(x.c, k) = left(g.c, k))), length(g.c) + 1) as lettere,
           row_number() over (partition by g.n, g.c order by g.cognome, g.id) as num,
           count(*) over (partition by g.n, g.c) as uguali
      from g
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome,
           'cognome', case
             when length(l.cognome) = 0 then case when l.uguali > 1 then '(' || l.num || ')' else '' end
             when l.uguali > 1 then l.cognome || ' (' || l.num || ')'                                   -- stesso nome e cognome
             when l.lettere >= length(l.cognome) then l.cognome                                        -- serve tutto il cognome
             else left(l.cognome, greatest(l.lettere, 1)) || '.' end)
         order by l.nome, l.cognome, l.num), '[]'::jsonb)
    from l;
$$;
revoke all on function biglietteria_elenco(uuid, text) from public, anon, authenticated;
grant execute on function biglietteria_elenco(uuid, text) to service_role;

create or replace function biglietteria_cerca(p_spettacolo uuid, p_testo text)
returns jsonb language sql stable security definer set search_path = public as $$
  with g as (
    select a.id, a.nome, a.cognome, replace(coalesce(nullif(a.gruppo, ''), 'Altri'), ' | ', ' · ') gruppo, lower(btrim(a.nome)) n, lower(btrim(a.cognome)) c
      from biglietteria_allievi a where a.spettacolo_id = p_spettacolo
  ), l as (
    select g.*,
           coalesce((select min(k) from generate_series(1, greatest(length(g.c), 1)) k
                      where not exists (select 1 from g x where x.id <> g.id and x.n = g.n and left(x.c, k) = left(g.c, k))), length(g.c) + 1) as lettere,
           row_number() over (partition by g.n, g.c order by g.gruppo, g.id) as num,
           count(*) over (partition by g.n, g.c) as uguali
      from g
  ), t as (select lower(btrim(coalesce(p_testo, ''))) q)
  select coalesce(jsonb_agg(x order by x->>'nome', x->>'cognome'), '[]'::jsonb) from (
    select jsonb_build_object('id', l.id, 'nome', l.nome, 'gruppo', l.gruppo,
             'cognome', case
               when length(l.cognome) = 0 then case when l.uguali > 1 then '(' || l.num || ')' else '' end
               when l.uguali > 1 then l.cognome || ' (' || l.num || ')'
               when l.lettere >= length(l.cognome) then l.cognome
               else left(l.cognome, greatest(l.lettere, 1)) || '.' end) x
      from l, t
     where length(t.q) >= 2
       -- si scrive «nome cognome» o «cognome nome», anche a metà: ogni parola scritta deve essere l'inizio
       -- del nome o del cognome (o di una loro parola). Nel risultato il cognome resta abbreviato.
       and not exists (select 1 from regexp_split_to_table(t.q, '\s+') w
                        where w <> '' and not (l.n like w || '%' or l.c like w || '%' or l.n like '% ' || w || '%' or l.c like '% ' || w || '%'))
     order by l.nome, l.cognome limit 10) z;
$$;
revoke all on function biglietteria_cerca(uuid, text) from public, anon, authenticated;
grant execute on function biglietteria_cerca(uuid, text) to service_role;

create or replace function biglietteria_carica_allievi(p_biglietteria uuid, p_righe jsonb, p_sostituisci boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b biglietterie; x jsonb; v_sp uuid; v_t text; n_nuovi int := 0; n_agg int := 0; n_tolti int := 0;
        v_scartate jsonb := '[]'; v_nome text; v_cogn text; v_id uuid; v_nasc date;
begin
  select * into b from biglietterie where id = p_biglietteria;
  if not found then raise exception 'biglietteria_non_trovata'; end if;
  if not is_gestione(b.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_sostituisci then
    -- si sostituisce solo l'elenco degli spettacoli presenti nel file (un file per spettacolo non cancella gli altri)
    delete from biglietteria_allievi a using biglietteria_spettacoli s
     where s.id = a.spettacolo_id and s.biglietteria_id = b.id
       and s.id in (select biglietteria_spettacolo_da_testo(b.id, e->>'spettacolo') from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) e)
       and not exists (select 1 from biglietteria_prenotazioni pr where pr.allievo_id = a.id);
    get diagnostics n_tolti = row_count;
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    v_nome := left(btrim(coalesce(x->>'nome', '')), 80); v_cogn := left(btrim(coalesce(x->>'cognome', '')), 80);
    v_t := lower(btrim(coalesce(x->>'spettacolo', '')));
    continue when v_nome = '';
    v_sp := biglietteria_spettacolo_da_testo(b.id, v_t);
    if v_sp is null then
      v_scartate := v_scartate || jsonb_build_array(trim(v_nome || ' ' || v_cogn) || coalesce(' (' || nullif(x->>'spettacolo', '') || ')', ' (spettacolo mancante)'));
      continue;
    end if;
    v_nasc := case when coalesce(x->>'nascita', '') ~ '^\d{4}-\d{2}-\d{2}$' then (x->>'nascita')::date end;
    select id into v_id from biglietteria_allievi where spettacolo_id = v_sp and lower(nome) = lower(v_nome) and lower(cognome) = lower(v_cogn);
    if v_id is not null then
      -- già in elenco: se arriva con un altro gruppo, il gruppo si aggiunge (un allievo può essere in più gruppi)
      update biglietteria_allievi set gruppo = case
               when nullif(btrim(coalesce(x->>'gruppo', '')), '') is null then gruppo
               when nullif(gruppo, '') is null then left(btrim(x->>'gruppo'), 80)
               when btrim(x->>'gruppo') = any(string_to_array(gruppo, ' | ')) then gruppo
               else left(gruppo || ' | ' || btrim(x->>'gruppo'), 300) end,
                                      data_nascita = coalesce(v_nasc, data_nascita)
       where id = v_id;
      n_agg := n_agg + 1;
    else
      insert into biglietteria_allievi (spettacolo_id, palestra_id, nome, cognome, gruppo, data_nascita)
      values (v_sp, b.palestra_id, v_nome, v_cogn, left(nullif(btrim(coalesce(x->>'gruppo', '')), ''), 80), v_nasc);
      n_nuovi := n_nuovi + 1;
    end if;
  end loop;
  return jsonb_build_object('nuovi', n_nuovi, 'aggiornati', n_agg, 'tolti', n_tolti, 'scartate', v_scartate,
    'senza_nascita', (select count(*) from biglietteria_allievi a join biglietteria_spettacoli s on s.id = a.spettacolo_id
                       where s.biglietteria_id = b.id and a.data_nascita is null),
    'totale', (select count(*) from biglietteria_allievi a join biglietteria_spettacoli s on s.id = a.spettacolo_id where s.biglietteria_id = b.id));
end $$;
grant execute on function biglietteria_carica_allievi(uuid, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
