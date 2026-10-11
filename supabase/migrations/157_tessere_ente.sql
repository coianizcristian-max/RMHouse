-- 157 — Tessere dell'ente (ASI): file per il caricamento, valori per persona, tipo e scadenza della tessera
-- • allievi: tessera_tipo / tessera_qualifica / tessera_disciplina = valori solo per quella persona
--   (vuoti = quelli predefiniti nelle impostazioni dell'ente, Persone → Tesseramento → Ente).
-- • tesseramenti: tipo_tessera, scadenza, disciplina e qualifica con cui è stata fatta.
-- • tesseramento_ente(): l'elenco della stagione con tutto quello che serve al file dell'ente.
-- • aggiorna_tesseramenti(): uguale a prima, in più scrive tipo e scadenza; il numero in anagrafica diventa "A 1234567"
--   (come quelli importati).
-- Si può rilanciare.

alter table allievi add column if not exists tessera_tipo text;
alter table allievi add column if not exists tessera_qualifica text;
alter table allievi add column if not exists tessera_disciplina text;
alter table tesseramenti add column if not exists tipo_tessera text;
alter table tesseramenti add column if not exists scadenza date;
alter table tesseramenti add column if not exists disciplina text;
alter table tesseramenti add column if not exists qualifica text;

-- tipo della tessera già fatta, da "A 1234567" → "A"
create or replace function tipo_da_tessera(p text) returns text
language sql immutable as $$
  select nullif(substring(btrim(coalesce(p, '')) from '^([A-Za-z][A-Za-z0-9_]*)\s+\d'), '')
$$;
-- numero della tessera già fatta, da "A 1234567 08/10/2026" → "1234567"
create or replace function numero_da_tessera(p text) returns text
language sql immutable as $$
  select coalesce(substring(btrim(coalesce(p, '')) from '^[A-Za-z][A-Za-z0-9_]*\s+(\d+)'), nullif(substring(btrim(coalesce(p, '')) from '^(\d+)$'), ''))
$$;

create or replace function tesseramento_ente(p_palestra uuid, p_stagione int)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb; dal date; al date; corrente int;
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
      'tessera_anagrafica', a.tessera, 'tipo_precedente', tipo_da_tessera(a.tessera), 'numero_precedente', numero_da_tessera(a.tessera),
      'o_tipo', a.tessera_tipo, 'o_qualifica', a.tessera_qualifica, 'o_disciplina', a.tessera_disciplina,
      -- la tessera scritta in anagrafica (es. importata) vale per la stagione in corso
      'tesseramento_id', t.id,
      'numero', coalesce(t.numero, case when t.id is null and p_stagione = corrente then numero_da_tessera(a.tessera) end),
      'stato', coalesce(t.stato, case when a.tessera is not null and p_stagione = corrente then 'tesserato' end),
      'inviato_at', t.inviato_at, 'tipo_tessera', t.tipo_tessera, 'scadenza', t.scadenza,
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
   where a.cognome <> 'anonimizzata';
  return v;
end $$;
revoke all on function tesseramento_ente(uuid, int) from public, anon;
grant execute on function tesseramento_ente(uuid, int) to authenticated;

-- stessa firma di prima (la usa anche lo Sportello): in più tipo e scadenza
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
    v_tipo := coalesce(nullif(a.tessera_tipo, ''), tipo_da_tessera(a.tessera), nullif(v_ente ->> 'tipo_tessera', ''));
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

-- il numero (e il tipo) scritto a mano su una persona: "A 1234567", "1234567" o "VI-12345"
create or replace function scrivi_numero_tessera(p_palestra uuid, p_stagione int, p_allievo uuid, p_testo text, p_scadenza date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ente jsonb; a allievi; v_tipo text; v_num text; t text := btrim(coalesce(p_testo, ''));
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = p_allievo and palestra_id = p_palestra;
  if not found then raise exception 'persona_non_trovata'; end if;
  select coalesce(ente, '{}'::jsonb) into v_ente from palestre where id = p_palestra;
  if t = '' then
    update tesseramenti set numero = null where allievo_id = p_allievo and stagione = p_stagione;
    return jsonb_build_object('numero', null);
  end if;
  v_tipo := coalesce(tipo_da_tessera(t), nullif(a.tessera_tipo, ''), tipo_da_tessera(a.tessera), nullif(v_ente ->> 'tipo_tessera', ''));
  v_num := coalesce(numero_da_tessera(t), t);
  perform aggiorna_tesseramenti(p_palestra, p_stagione, array[p_allievo], 'tesserato', null);
  update tesseramenti set numero = v_num, tipo_tessera = v_tipo, scadenza = coalesce(p_scadenza, scadenza)
   where allievo_id = p_allievo and stagione = p_stagione;
  update allievi set tessera = case when v_num ~ '^\d+$' and v_tipo is not null then v_tipo || ' ' || v_num else v_num end where id = p_allievo;
  return jsonb_build_object('numero', v_num, 'tipo', v_tipo);
end $$;
revoke all on function scrivi_numero_tessera(uuid, int, uuid, text, date) from public, anon;
grant execute on function scrivi_numero_tessera(uuid, int, uuid, text, date) to authenticated;

-- nome e cognome scritti al contrario (molti dall'import): lo dice il codice fiscale (3 lettere del cognome, 3 del nome)
create or replace function cf_lettere(t text) returns text
language sql immutable as $$
  select regexp_replace(upper(translate(coalesce(t, ''), 'àáâäèéêëìíîïòóôöùúûüÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜçÇñÑ',
                                                      'aaaaeeeeiiiioooouuuuAAAAEEEEIIIIOOOOUUUUcCnN')), '[^A-Z]', '', 'g')
$$;
create or replace function cf_parte_cognome(t text) returns text
language sql immutable as $$
  select left(regexp_replace(cf_lettere(t), '[AEIOU]', '', 'g') || regexp_replace(cf_lettere(t), '[^AEIOU]', '', 'g') || 'XXX', 3)
$$;
create or replace function cf_parte_nome(t text) returns text
language sql immutable as $$
  select case when length(regexp_replace(cf_lettere(t), '[AEIOU]', '', 'g')) >= 4
              then substr(regexp_replace(cf_lettere(t), '[AEIOU]', '', 'g'), 1, 1) || substr(regexp_replace(cf_lettere(t), '[AEIOU]', '', 'g'), 3, 2)
              else left(regexp_replace(cf_lettere(t), '[AEIOU]', '', 'g') || regexp_replace(cf_lettere(t), '[^AEIOU]', '', 'g') || 'XXX', 3) end
$$;

create or replace function nomi_invertiti(p_palestra uuid)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'cognome', a.cognome) order by a.cognome, a.nome), '[]'::jsonb) into v
    from allievi a
   where a.palestra_id = p_palestra and length(regexp_replace(upper(coalesce(a.codice_fiscale, '')), '[^A-Z0-9]', '', 'g')) = 16
     and coalesce(a.nome, '') <> '' and coalesce(a.cognome, '') <> '' and a.cognome <> 'anonimizzata'
     and not (cf_parte_cognome(a.cognome) = substr(upper(a.codice_fiscale), 1, 3) and cf_parte_nome(a.nome) = substr(upper(a.codice_fiscale), 4, 3))
     and cf_parte_cognome(a.nome) = substr(upper(a.codice_fiscale), 1, 3) and cf_parte_nome(a.cognome) = substr(upper(a.codice_fiscale), 4, 3);
  return v;
end $$;
revoke all on function nomi_invertiti(uuid) from public, anon;
grant execute on function nomi_invertiti(uuid) to authenticated;

-- li rimette giusti (anche il profilo di chi paga per sé, se ha gli stessi nomi al contrario)
create or replace function scambia_nome_cognome(p_palestra uuid, p_allievi uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  update account ac set nome = ac.cognome, cognome = ac.nome
    from allievi a
   where a.id = any(p_allievi) and a.palestra_id = p_palestra and a.is_titolare and a.account_id = ac.id
     and ac.nome is not distinct from a.nome and ac.cognome is not distinct from a.cognome and coalesce(ac.cognome, '') <> '';
  update allievi set nome = cognome, cognome = nome
   where id = any(p_allievi) and palestra_id = p_palestra and coalesce(nome, '') <> '' and coalesce(cognome, '') <> '';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function scambia_nome_cognome(uuid, uuid[]) from public, anon;
grant execute on function scambia_nome_cognome(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
