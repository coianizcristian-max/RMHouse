-- 159 — Compilazione automatica sul portale ASI
-- • tesseramento_ente(): come nel 157, in più si può chiedere una persona sola (p_allievo), anche dallo Sportello.
-- • Il link del portale ASI va alla pagina del tesseramento (prima era la home del sito ASI).
-- Si può rilanciare.

drop function if exists tesseramento_ente(uuid, int);
create or replace function tesseramento_ente(p_palestra uuid, p_stagione int, p_allievo uuid default null)
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
    union
    -- una persona sola (es. dallo Sportello): anche se non ha ancora abbonamenti nella stagione
    select p_allievo where p_allievo is not null
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
   where a.cognome <> 'anonimizzata' and (p_allievo is null or a.id = p_allievo);
  return v;
end $$;
revoke all on function tesseramento_ente(uuid, int, uuid) from public, anon;
grant execute on function tesseramento_ente(uuid, int, uuid) to authenticated;

update palestre set ente = jsonb_set(ente, '{portale}', '"https://tesseramento.asinazionale.it/"')
 where ente ->> 'portale' in ('https://www.asinazionale.it', 'https://www.asinazionale.it/', 'https://asinazionale.it');

notify pgrst, 'reload schema';
