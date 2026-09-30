-- =====================================================================
-- RMHouse — 045 CORREZIONI DAI PRIMI TEST
--
-- 1. Colori per disciplina, sempre uguali: Pole fucsia, Aerea azzurro,
--    danza rosso, Antigravity arancione (gli affitti verdi li disegna il sito).
-- 2. Corsi: archiviare e riattivare, eliminare quelli mai usati.
--    Archiviati subito quelli indicati; Heels e Heels liv. 2 diventano un
--    solo corso "Heels open".
-- 3. Discipline: eliminarle spostando i corsi in un'altra.
-- 4. Promemoria del giorno nella pagina iniziale.
-- 5. Unire due schede della stessa persona (doppioni dell'import).
-- 6. Ente sportivo: ASI.
-- Da eseguire dopo la 042. Si può rieseguire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colori per disciplina
-- ---------------------------------------------------------------------
update discipline set colore = '#ff00ff' where nome ilike 'pole%';
update discipline set colore = '#00bfff' where nome ilike 'aerea%';
update discipline set colore = '#ff8c00' where nome ilike 'antigravity%';
update discipline d set colore = '#ff0000'
  from categorie c where c.id = d.categoria_id and c.nome ilike 'danza%';

-- ogni corso di queste discipline prende il colore della disciplina
update corsi c set colore = d.colore
  from discipline d
 where d.id = c.disciplina_id
   and (d.nome ilike 'pole%' or d.nome ilike 'aerea%' or d.nome ilike 'antigravity%'
        or exists (select 1 from categorie k where k.id = d.categoria_id and k.nome ilike 'danza%'))
   and c.colore is distinct from d.colore;

-- ---------------------------------------------------------------------
-- 2. Corsi: archiviare, riattivare, eliminare
-- ---------------------------------------------------------------------
create or replace function archivia_corso(p_corso uuid, p_archivia boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c corsi; v_tolte int := 0;
begin
  select * into c from corsi where id = p_corso;
  if not found then raise exception 'corso_non_trovato'; end if;
  if not is_gestione(c.palestra_id) then raise exception 'non_autorizzato'; end if;

  update corsi set attivo = not p_archivia where id = c.id;
  update orari set attivo = not p_archivia where corso_id = c.id;
  if p_archivia then
    -- le lezioni future senza nessuno dentro spariscono dal calendario
    with via as (
      delete from lezioni l
       where l.corso_id = c.id and l.inizio > now()
         and not exists (select 1 from presenze x where x.lezione_id = l.id)
         and not exists (select 1 from prove x where x.lezione_id = l.id)
         and not exists (select 1 from prenotazioni x where x.lezione_id = l.id)
      returning 1)
    select count(*) into v_tolte from via;
  else
    perform genera_lezioni(c.palestra_id, current_date, current_date + 90);
  end if;
  return jsonb_build_object('lezioni_tolte', v_tolte,
    'iscritti_attivi', (select count(*) from iscrizioni where corso_id = c.id and stato = 'attiva' and data_fine >= current_date));
end $$;
grant execute on function archivia_corso(uuid, boolean) to authenticated;

-- Eliminare del tutto: solo un corso che non ha mai avuto iscrizioni, prove o incassi
create or replace function elimina_corso(p_corso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c corsi;
begin
  select * into c from corsi where id = p_corso;
  if not found then raise exception 'corso_non_trovato'; end if;
  if not is_gestione(c.palestra_id) then raise exception 'non_autorizzato'; end if;
  if exists (select 1 from iscrizioni where corso_id = c.id)
     or exists (select 1 from prove where corso_id = c.id)
     or exists (select 1 from pagamenti where corso_id = c.id)
     or exists (select 1 from presenze p join lezioni l on l.id = p.lezione_id where l.corso_id = c.id) then
    raise exception 'corso_usato';
  end if;
  delete from lead_eventi where corso_id = c.id;
  delete from corsi where id = c.id;
end $$;
grant execute on function elimina_corso(uuid) to authenticated;

-- Spostare tutto un corso in un altro (orari, lezioni, iscrizioni, prove) e archiviarlo
create or replace function unisci_corsi(p_tenere uuid, p_togliere uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a corsi; b corsi;
begin
  select * into a from corsi where id = p_tenere;
  select * into b from corsi where id = p_togliere;
  if a.id is null or b.id is null or a.id = b.id or a.palestra_id <> b.palestra_id then raise exception 'corsi_non_validi'; end if;
  if not (is_gestione(a.palestra_id) or session_user = 'postgres') then raise exception 'non_autorizzato'; end if;
  update orari set corso_id = a.id where corso_id = b.id;
  update lezioni set corso_id = a.id where corso_id = b.id;
  update iscrizioni set corso_id = a.id where corso_id = b.id;
  update prove set corso_id = a.id where corso_id = b.id;
  update pagamenti set corso_id = a.id where corso_id = b.id;
  update liste_attesa set corso_id = a.id where corso_id = b.id;
  update lead_eventi set corso_id = a.id where corso_id = b.id;
  update materiali set corso_id = a.id where corso_id = b.id;
  update spese set corso_id = a.id where corso_id = b.id;
  insert into corsi_insegnanti (palestra_id, corso_id, staff_id)
    select a.palestra_id, a.id, staff_id from corsi_insegnanti where corso_id = b.id on conflict do nothing;
  insert into tipi_abbonamento_corsi (tipo_abbonamento_id, corso_id)
    select tipo_abbonamento_id, a.id from tipi_abbonamento_corsi where corso_id = b.id on conflict do nothing;
  update corsi set attivo = false where id = b.id;
end $$;
grant execute on function unisci_corsi(uuid, uuid) to authenticated;

-- I corsi indicati da togliere: archiviati (non cancellati: restano lo storico e i pagamenti)
do $$
declare r record;
begin
  for r in select id, nome, palestra_id from corsi
            where attivo and (nome ilike 'aerea cerchio 2' or nome ilike 'aerea young%schio' or nome ilike 'aerial fusion'
                              or nome ilike 'ginnastica posturale' or nome ilike 'hip hop open class'
                              or nome ilike 'hustle dance' or nome ilike 'zumba') loop
    update corsi set attivo = false where id = r.id;
    update orari set attivo = false where corso_id = r.id;
    delete from lezioni l where l.corso_id = r.id and l.inizio > now()
       and not exists (select 1 from presenze x where x.lezione_id = l.id)
       and not exists (select 1 from prove x where x.lezione_id = l.id)
       and not exists (select 1 from prenotazioni x where x.lezione_id = l.id);
    raise notice 'Archiviato: %', r.nome;
  end loop;
end $$;

-- Heels e Heels liv. 2 → un solo corso "Heels open", aperto a tutti i livelli
do $$
declare h1 uuid; h2 uuid; v_livello uuid;
begin
  select id into h1 from corsi where nome ilike 'heels' or nome ilike 'heels liv. 1' or nome ilike 'heels 1' or nome ilike 'heels open'
   order by (nome ilike 'heels open') desc limit 1;
  select id into h2 from corsi where (nome ilike 'heels liv. 2' or nome ilike 'heels 2') and attivo limit 1;
  if h1 is null then raise notice 'Heels non trovato: niente da unire'; return; end if;
  select id into v_livello from livelli where palestra_id = (select palestra_id from corsi where id = h1)
     and (nome ilike 'aperto%' or nome ilike '%tutti%') limit 1;
  update corsi set nome = 'Heels open', livello_id = coalesce(v_livello, livello_id), attivo = true where id = h1;
  if h2 is not null then
    perform unisci_corsi(h1, h2);
    raise notice 'Heels liv. 2 unito in Heels open';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Discipline: eliminare spostando i corsi
-- ---------------------------------------------------------------------
create or replace function elimina_disciplina(p_disciplina uuid, p_sposta_a uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare d discipline; n int;
begin
  select * into d from discipline where id = p_disciplina;
  if not found then raise exception 'disciplina_non_trovata'; end if;
  if not is_gestione(d.palestra_id) then raise exception 'non_autorizzato'; end if;
  select count(*) into n from corsi where disciplina_id = d.id;
  if n > 0 and p_sposta_a is null then raise exception 'disciplina_usata'; end if;
  if p_sposta_a is not null then
    if not exists (select 1 from discipline where id = p_sposta_a and palestra_id = d.palestra_id and id <> d.id) then
      raise exception 'destinazione_non_valida';
    end if;
    update corsi set disciplina_id = p_sposta_a where disciplina_id = d.id;
  end if;
  delete from discipline where id = d.id;
  return n;
end $$;
grant execute on function elimina_disciplina(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Promemoria del giorno
-- ---------------------------------------------------------------------
create table if not exists promemoria (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  data        date not null default current_date,
  testo       text not null,
  fatto       boolean not null default false,
  fatto_at    timestamptz,
  fatto_da    text,
  creato_da   text,
  created_at  timestamptz not null default now()
);
create index if not exists promemoria_giorno on promemoria (palestra_id, data);
alter table promemoria enable row level security;
drop policy if exists staff_tutto on promemoria;
create policy staff_tutto on promemoria for all to authenticated
  using (is_staff(palestra_id)) with check (is_staff(palestra_id));

-- ---------------------------------------------------------------------
-- 5. Unire due schede della stessa persona
-- ---------------------------------------------------------------------
create or replace function unisci_persone(p_tenere uuid, p_togliere uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a allievi; b allievi;
begin
  select * into a from allievi where id = p_tenere;
  select * into b from allievi where id = p_togliere;
  if a.id is null or b.id is null or a.id = b.id or a.palestra_id <> b.palestra_id then raise exception 'persone_non_valide'; end if;
  if not is_gestione(a.palestra_id) then raise exception 'non_autorizzato'; end if;

  -- dove una riga esiste già per la scheda tenuta, quella del doppione si toglie
  delete from presenze x where x.allievo_id = b.id and exists (select 1 from presenze y where y.allievo_id = a.id and y.lezione_id = x.lezione_id);
  delete from prenotazioni x where x.allievo_id = b.id and exists (select 1 from prenotazioni y where y.allievo_id = a.id and y.lezione_id = x.lezione_id);
  delete from quote_iscrizione x where x.allievo_id = b.id and exists (select 1 from quote_iscrizione y where y.allievo_id = a.id and y.stagione = x.stagione);
  delete from tesseramenti x where x.allievo_id = b.id and exists (select 1 from tesseramenti y where y.allievo_id = a.id and y.stagione = x.stagione);
  delete from allievi_etichette x where x.allievo_id = b.id and exists (select 1 from allievi_etichette y where y.allievo_id = a.id and y.etichetta_id = x.etichetta_id);
  delete from scadenze_gestite where allievo_id = b.id;

  update iscrizioni set allievo_id = a.id where allievo_id = b.id;
  update presenze set allievo_id = a.id where allievo_id = b.id;
  update prenotazioni set allievo_id = a.id where allievo_id = b.id;
  update prove set allievo_id = a.id where allievo_id = b.id;
  update certificati set allievo_id = a.id where allievo_id = b.id;
  update quote_iscrizione set allievo_id = a.id where allievo_id = b.id;
  update tesseramenti set allievo_id = a.id where allievo_id = b.id;
  update allievi_etichette set allievo_id = a.id where allievo_id = b.id;
  update storico_abbonamenti set allievo_id = a.id where allievo_id = b.id;
  update crediti_recupero set allievo_id = a.id where allievo_id = b.id;
  update contatti_lead set allievo_id = a.id where allievo_id = b.id;
  update lead_eventi set allievo_id = a.id where allievo_id = b.id;
  update liste_attesa set allievo_id = a.id where allievo_id = b.id;
  update firme set allievo_id = a.id where allievo_id = b.id;
  update ingressi set allievo_id = a.id where allievo_id = b.id;
  update pagamenti set allievo_id = a.id where allievo_id = b.id;
  update ricevute set allievo_id = a.id where allievo_id = b.id;
  update rate set allievo_id = a.id where allievo_id = b.id;
  update iscrizioni_evento set allievo_id = a.id where allievo_id = b.id;
  update abbonamenti_ricorrenti set allievo_id = a.id where allievo_id = b.id;
  update acquisti_online set allievo_id = a.id where allievo_id = b.id;
  update assegnazioni_postazione set allievo_id = a.id where allievo_id = b.id;
  update sondaggi_inviti set allievo_id = a.id where allievo_id = b.id;
  update messaggi_coda set allievo_id = a.id where allievo_id = b.id;

  -- i dati che mancano alla scheda tenuta si prendono dal doppione
  update allievi set
    data_nascita = coalesce(data_nascita, b.data_nascita), codice_fiscale = coalesce(codice_fiscale, b.codice_fiscale),
    luogo_nascita = coalesce(luogo_nascita, b.luogo_nascita), sesso = coalesce(sesso, b.sesso),
    tessera = coalesce(tessera, b.tessera), foto_url = coalesce(foto_url, b.foto_url),
    certificato_scadenza = greatest(certificato_scadenza, b.certificato_scadenza),
    note = nullif(concat_ws(E'\n', note, b.note), ''), codice_esterno = coalesce(codice_esterno, b.codice_esterno)
  where id = a.id;

  delete from allievi where id = b.id;
end $$;
grant execute on function unisci_persone(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Ente sportivo
-- ---------------------------------------------------------------------
update palestre set ente = jsonb_set(coalesce(ente, '{}'::jsonb), '{nome}', '"ASI"')
 where coalesce(ente ->> 'nome', '') = '';

select 'corsi attivi' as cosa, count(*) from corsi where attivo
union all select 'corsi archiviati', count(*) from corsi where not attivo;
