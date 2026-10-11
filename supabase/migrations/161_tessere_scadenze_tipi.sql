-- 161 — Tessere ASI: tipo (A/B) per disciplina, scadenze vere, numero lasciato ad ASI
-- • La tessera ASI vale un anno da quando si fa: ora conta la SCADENZA (non più solo la stagione). Chi ha la tessera
--   scaduta torna fra quelli "senza tessera"; chi scade entro 30 giorni è "in scadenza".
-- • importa_scadenze_tessere(): le scadenze dal vostro file (es. "A 1413763 08/10/2026"), abbinate per numero di tessera.
-- • Tipo tessera per disciplina (impostazioni ASI, "mappa_tipo"): la prima volta lo deduco dalle tessere che avete già
--   (es. Aerea → B, Hip Hop → A). Ordine: valore della persona → tipo della sua disciplina → la sua ultima tessera →
--   predefinito.
-- • Nel file per ASI la colonna CODICE TESSERA resta vuota (il numero lo dà ASI).
-- Si può rilanciare.

-- il tipo di tessera per una persona
create or replace function tipo_tessera_di(p_palestra uuid, p_allievo uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(a.tessera_tipo, ''),
    (select nullif(p.ente -> 'mappa_tipo' ->> c.disciplina_id::text, '')
       from iscrizioni i join corsi c on c.id = i.corso_id
      where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa', 'scaduta') and c.disciplina_id is not null
        and nullif(p.ente -> 'mappa_tipo' ->> c.disciplina_id::text, '') is not null
      order by i.data_fine desc limit 1),
    (select t.tipo_tessera from tesseramenti t where t.allievo_id = a.id and t.tipo_tessera is not null order by t.scadenza desc nulls last limit 1),
    tipo_da_tessera(a.tessera),
    nullif(p.ente ->> 'tipo_tessera', ''))
  from allievi a join palestre p on p.id = a.palestra_id
  where a.id = p_allievo and a.palestra_id = p_palestra
$$;
revoke all on function tipo_tessera_di(uuid, uuid) from public, anon, authenticated;

create or replace function tesseramento_ente(p_palestra uuid, p_stagione int, p_allievo uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb; dal date; al date; corrente int; oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select make_date(p_stagione, coalesce(mese_inizio_stagione, 9), 1),
         case when extract(month from now() at time zone 'Europe/Rome') >= coalesce(mese_inizio_stagione, 9)
              then extract(year from now() at time zone 'Europe/Rome')::int else extract(year from now() at time zone 'Europe/Rome')::int - 1 end
    into dal, corrente from palestre where id = p_palestra;
  al := (dal + interval '1 year' - interval '1 day')::date;
  with attivi as (
    select distinct i.allievo_id from iscrizioni i
     where i.palestra_id = p_palestra and i.stato in ('attiva', 'scaduta', 'sospesa') and i.data_inizio <= al and i.data_fine >= dal
    union
    select t.allievo_id from tesseramenti t where t.palestra_id = p_palestra and t.stagione = p_stagione
    union
    -- una persona sola (es. dallo Sportello): anche se non ha ancora abbonamenti nella stagione
    select p_allievo where p_allievo is not null
  ),
  ultima as (
    -- l'ultima tessera con la scadenza (di qualunque stagione): dice se è ancora valida, in scadenza o scaduta
    select distinct on (t.allievo_id) t.allievo_id, t.numero, t.tipo_tessera, t.scadenza
      from tesseramenti t where t.palestra_id = p_palestra and t.scadenza is not null and t.numero is not null
     order by t.allievo_id, t.scadenza desc
  ),
  disc as (
    -- le discipline dei corsi della stagione, dalla più recente
    select i.allievo_id, array_agg(c.disciplina_id order by i.data_inizio desc) filter (where c.disciplina_id is not null) as ids,
           string_agg(distinct c.nome, ', ') as corsi
      from iscrizioni i join corsi c on c.id = i.corso_id
     where i.palestra_id = p_palestra and i.stato in ('attiva', 'scaduta', 'sospesa') and i.data_inizio <= al and i.data_fine >= dal
     group by i.allievo_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'allievo_id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'sesso', a.sesso, 'data_nascita', a.data_nascita,
      'luogo_nascita', a.luogo_nascita, 'codice_fiscale', upper(a.codice_fiscale),
      'indirizzo', coalesce(a.indirizzo, acc.indirizzo), 'cap', acc.cap, 'citta', acc.citta, 'provincia', acc.provincia,
      'email', acc.email, 'telefono', acc.telefono, 'minore', not a.is_titolare,
      'corsi', d.corsi, 'discipline', coalesce(to_jsonb(d.ids), '[]'::jsonb), 'certificato', a.certificato_scadenza,
      'tessera_anagrafica', a.tessera,
      'tipo_precedente', coalesce(u.tipo_tessera, tipo_da_tessera(a.tessera)), 'numero_precedente', coalesce(u.numero, numero_da_tessera(a.tessera)),
      'o_tipo', a.tessera_tipo, 'o_qualifica', a.tessera_qualifica, 'o_disciplina', a.tessera_disciplina,
      -- la tessera vale un anno da quando si fa: conta la scadenza. Senza data (es. importata) vale per la stagione in corso.
      'tesseramento_id', t.id,
      'numero', coalesce(t.numero, case when t.id is null and u.scadenza >= oggi then u.numero end,
                         case when t.id is null and u.allievo_id is null and p_stagione = corrente then numero_da_tessera(a.tessera) end),
      'stato', coalesce(t.stato, case when t.id is null and u.scadenza >= oggi then 'tesserato' end,
                        case when t.id is null and u.allievo_id is null and a.tessera is not null and p_stagione = corrente then 'tesserato' end),
      'inviato_at', t.inviato_at,
      'tipo_tessera', coalesce(t.tipo_tessera, case when t.id is null and u.scadenza >= oggi then u.tipo_tessera end),
      'scadenza', coalesce(t.scadenza, case when t.id is null and u.scadenza >= oggi then u.scadenza end),
      'scaduta_il', case when t.id is null and u.scadenza < oggi then u.scadenza end,
      'scadenza_sconosciuta', t.id is null and u.allievo_id is null and a.tessera is not null and p_stagione = corrente,
      'mancano', to_jsonb(array_remove(array[
         case when a.codice_fiscale is null then 'codice fiscale' end,
         case when a.data_nascita is null then 'data di nascita' end,
         case when coalesce(a.indirizzo, acc.indirizzo) is null then 'indirizzo' end,
         case when acc.citta is null then 'comune' end,
         case when acc.cap is null then 'CAP' end,
         case when a.certificato_scadenza is null then 'certificato' end
      ], null))
    ) order by a.cognome, a.nome), '[]'::jsonb) into v
    from attivi x
    join allievi a on a.id = x.allievo_id
    join account acc on acc.id = a.account_id
    left join disc d on d.allievo_id = a.id
    left join tesseramenti t on t.allievo_id = a.id and t.stagione = p_stagione
    left join ultima u on u.allievo_id = a.id
   where a.cognome <> 'anonimizzata' and (p_allievo is null or a.id = p_allievo);
  return v;
end $$;
revoke all on function tesseramento_ente(uuid, int, uuid) from public, anon;
grant execute on function tesseramento_ente(uuid, int, uuid) to authenticated;

create or replace function aggiorna_tesseramenti(p_palestra uuid, p_stagione integer, p_allievi uuid[], p_stato text, p_numero_da integer default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int := 0; v_ente jsonb; v_tipo text; v_num text; v_scad date; v_fine date; a allievi;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_stato not in ('da_inviare', 'inviato', 'tesserato') then raise exception 'stato_non_valido'; end if;
  select coalesce(ente, '{}'::jsonb), (make_date(p_stagione, coalesce(mese_inizio_stagione, 9), 1) + interval '1 year' - interval '1 day')::date
    into v_ente, v_fine from palestre where id = p_palestra;
  -- quanto vale la tessera: un anno da quando si fa (predefinito) oppure fino alla fine della stagione
  v_scad := case when v_ente ->> 'validita' = 'stagione' then v_fine
                 else ((now() at time zone 'Europe/Rome')::date + interval '1 year' - interval '1 day')::date end;
  foreach v_id in array p_allievi loop
    select * into a from allievi where id = v_id and palestra_id = p_palestra;
    if not found then continue; end if;
    v_tipo := tipo_tessera_di(p_palestra, v_id);
    v_num := case when p_numero_da is not null then (p_numero_da + n)::text end;
    insert into tesseramenti (palestra_id, allievo_id, stagione, ente, stato, inviato_at, numero, tipo_tessera, scadenza)
    values (p_palestra, v_id, p_stagione, v_ente ->> 'nome', p_stato,
            case when p_stato = 'inviato' then now() end, v_num, v_tipo,
            case when p_stato = 'tesserato' then v_scad end)
    on conflict (allievo_id, stagione) do update
       set stato = excluded.stato,
           inviato_at = coalesce(tesseramenti.inviato_at, excluded.inviato_at),
           numero = coalesce(excluded.numero, tesseramenti.numero),
           tipo_tessera = coalesce(tesseramenti.tipo_tessera, excluded.tipo_tessera),
           scadenza = coalesce(tesseramenti.scadenza, excluded.scadenza);
    if v_num is not null then
      update allievi set tessera = btrim(coalesce(v_tipo || ' ', '') || v_num) where id = v_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function aggiorna_tesseramenti(uuid, integer, uuid[], text, integer) from public, anon;
grant execute on function aggiorna_tesseramenti(uuid, integer, uuid[], text, integer) to authenticated;

-- il numero scritto a mano: "A 1234567", "1234567" o "A 1234567 08/10/2027" (con la scadenza)
create or replace function scrivi_numero_tessera(p_palestra uuid, p_stagione int, p_allievo uuid, p_testo text, p_scadenza date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a allievi; v_tipo text; v_num text; v_scad date; t text := btrim(coalesce(p_testo, '')); d text[];
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = p_allievo and palestra_id = p_palestra;
  if not found then raise exception 'persona_non_trovata'; end if;
  if t = '' then
    update tesseramenti set numero = null where allievo_id = p_allievo and stagione = p_stagione;
    return jsonb_build_object('numero', null);
  end if;
  d := regexp_match(t, '(\d{1,2})/(\d{1,2})/(\d{2,4})');
  if d is not null then
    begin
      v_scad := make_date(case when length(d[3]) = 2 then 2000 + d[3]::int else d[3]::int end, d[2]::int, d[1]::int);
    exception when others then v_scad := null;
    end;
    t := btrim(regexp_replace(t, '\d{1,2}/\d{1,2}/\d{2,4}', ''));
  end if;
  v_tipo := coalesce(tipo_da_tessera(t), tipo_tessera_di(p_palestra, p_allievo));
  v_num := coalesce(numero_da_tessera(t), t);
  perform aggiorna_tesseramenti(p_palestra, p_stagione, array[p_allievo], 'tesserato', null);
  update tesseramenti set numero = v_num, tipo_tessera = v_tipo, scadenza = coalesce(p_scadenza, v_scad, scadenza)
   where allievo_id = p_allievo and stagione = p_stagione;
  update allievi set tessera = case when v_num ~ '^\d+$' and v_tipo is not null then v_tipo || ' ' || v_num else v_num end where id = p_allievo;
  return jsonb_build_object('numero', v_num, 'tipo', v_tipo, 'scadenza', v_scad);
end $$;
revoke all on function scrivi_numero_tessera(uuid, int, uuid, text, date) from public, anon;
grant execute on function scrivi_numero_tessera(uuid, int, uuid, text, date) to authenticated;

-- le scadenze dal vostro file: [{tipo, numero, scadenza}], abbinate per numero di tessera. La tessera va nella stagione
-- in cui è stata fatta (un anno prima della scadenza).
create or replace function importa_scadenze_tessere(p_palestra uuid, p_righe jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_all uuid; v_scad date; v_stag int; v_mese int; v_ente text; ok int := 0; persi text[] := '{}';
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select coalesce(mese_inizio_stagione, 9), ente ->> 'nome' into v_mese, v_ente from palestre where id = p_palestra;
  for r in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    v_scad := nullif(r ->> 'scadenza', '')::date;
    if v_scad is null or coalesce(r ->> 'numero', '') = '' then continue; end if;
    select a.id into v_all from allievi a
     where a.palestra_id = p_palestra and numero_da_tessera(a.tessera) = r ->> 'numero' limit 1;
    if v_all is null then
      select t.allievo_id into v_all from tesseramenti t where t.palestra_id = p_palestra and t.numero = r ->> 'numero' limit 1;
    end if;
    if v_all is null then persi := persi || (coalesce(r ->> 'tipo', '') || ' ' || (r ->> 'numero')); continue; end if;
    -- fatta un anno prima della scadenza → la stagione di quel giorno
    v_stag := extract(year from (v_scad - 364))::int - case when extract(month from (v_scad - 364))::int < v_mese then 1 else 0 end;
    insert into tesseramenti (palestra_id, allievo_id, stagione, ente, stato, numero, tipo_tessera, scadenza)
    values (p_palestra, v_all, v_stag, v_ente, 'tesserato', r ->> 'numero', nullif(r ->> 'tipo', ''), v_scad)
    on conflict (allievo_id, stagione) do update
       set stato = 'tesserato', numero = excluded.numero, tipo_tessera = coalesce(excluded.tipo_tessera, tesseramenti.tipo_tessera),
           scadenza = excluded.scadenza;
    update allievi set tessera = btrim(coalesce(nullif(r ->> 'tipo', '') || ' ', '') || (r ->> 'numero'))
     where id = v_all and (tessera is null or numero_da_tessera(tessera) = r ->> 'numero');
    ok := ok + 1;
  end loop;
  return jsonb_build_object('abbinate', ok, 'non_trovate', to_jsonb(persi));
end $$;
revoke all on function importa_scadenze_tessere(uuid, jsonb) from public, anon;
grant execute on function importa_scadenze_tessere(uuid, jsonb) to authenticated;

-- impostazioni: CODICE TESSERA vuoto nel file; tipo per disciplina dedotto dalle tessere che ci sono già (solo la prima volta)
do $$
declare p record; m jsonb;
begin
  for p in select id, coalesce(ente, '{}'::jsonb) as ente from palestre loop
    if jsonb_typeof(p.ente -> 'colonne') = 'array' then
      update palestre set ente = jsonb_set(ente, '{colonne}', (
        select jsonb_agg(case when c ->> 'titolo' = 'CODICE TESSERA' and c ->> 'campo' = 'numero'
                              then jsonb_set(c, '{campo}', '"vuoto"') else c end order by o)
          from jsonb_array_elements(ente -> 'colonne') with ordinality x(c, o)))
       where id = p.id;
    end if;
    if not (p.ente ? 'mappa_tipo') then
      with t as (
        select c.disciplina_id, tipo_da_tessera(a.tessera) as tipo, count(distinct a.id) as n
          from iscrizioni i join corsi c on c.id = i.corso_id join allievi a on a.id = i.allievo_id
         where i.palestra_id = p.id and i.stato in ('attiva', 'sospesa', 'scaduta') and c.disciplina_id is not null
           and tipo_da_tessera(a.tessera) is not null
         group by 1, 2),
      scelto as (select distinct on (disciplina_id) disciplina_id, tipo from t order by disciplina_id, n desc)
      select coalesce(jsonb_object_agg(disciplina_id::text, tipo), '{}'::jsonb) into m from scelto;
      update palestre set ente = jsonb_set(coalesce(ente, '{}'::jsonb), '{mappa_tipo}', m) where id = p.id;
    end if;
  end loop;
  -- il codice di affiliazione ASI di Ritmo Metropolitano (colonna CODICE AFFILIAZIONE del file), se non è ancora scritto
  update palestre set ente = jsonb_set(coalesce(ente, '{}'::jsonb), '{affiliazione}', '"VEN-VI0421"')
   where fatturazione ->> 'piva' = '03983880240' and coalesce(ente ->> 'affiliazione', '') = '';
end $$;

notify pgrst, 'reload schema';
