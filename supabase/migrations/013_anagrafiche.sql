-- =====================================================================
-- RMHouse — 013 ANAGRAFICHE COMPLETE
-- Dalle schermate dell'app titolare: dati di sede completi, staff con
-- foto, colore e visibilità, sale con foto e descrizione, foto degli
-- allievi, indirizzo pubblico del corso per le campagne.
-- Da eseguire dopo 001…012.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SEDE: tutti i campi che servono davvero
-- ---------------------------------------------------------------------
alter table sedi add column if not exists logo_url text;
alter table sedi add column if not exists tipologia text;              -- scuola di danza, palestra, centro sportivo…
alter table sedi add column if not exists via text;
alter table sedi add column if not exists civico text;
alter table sedi add column if not exists cap text;
alter table sedi add column if not exists provincia text;
alter table sedi add column if not exists regione text;
alter table sedi add column if not exists nazione text not null default 'IT';
alter table sedi add column if not exists email text;
alter table sedi add column if not exists sito_web text;
alter table sedi add column if not exists facebook text;
alter table sedi add column if not exists instagram text;
alter table sedi add column if not exists note text;

-- ---------------------------------------------------------------------
-- 2. STAFF: foto, colore, visibilità, archivio
-- ---------------------------------------------------------------------
alter table staff add column if not exists colore text;
alter table staff add column if not exists visibilita visibilita not null default 'pubblico';

-- Colori d'esempio a chi non ne ha (si cambiano dalla scheda)
do $$
declare r record; colori text[] := array['#f40000','#000000','#b3001b','#5c5c5c','#8a0303','#2b2b2b'];
begin
  for r in select id, row_number() over (order by nome) n from staff where colore is null loop
    update staff set colore = colori[1 + (r.n % array_length(colori, 1))] where id = r.id;
  end loop;
end $$;

-- Lo staff pubblico si vede anche dal sito (per la pagina dei corsi)
drop policy if exists pubblico_legge on staff;
create policy pubblico_legge on staff for select to anon
  using (visibilita = 'pubblico' and attivo and not archiviato);

-- ---------------------------------------------------------------------
-- 3. SALE: foto e descrizione (la capienza c'era già)
-- ---------------------------------------------------------------------
alter table sale add column if not exists descrizione text;
alter table sale add column if not exists attrezzatura text;           -- pertiche, tessuti, specchi…

-- ---------------------------------------------------------------------
-- 4. ALLIEVI: foto in anagrafica, come nelle liste dell'app titolare
-- ---------------------------------------------------------------------
alter table allievi add column if not exists foto_url text;

-- ---------------------------------------------------------------------
-- 5. CORSO: indirizzo pubblico per le campagne
-- ---------------------------------------------------------------------
alter table corsi add column if not exists slug text;
create unique index if not exists corsi_slug_unico on corsi (palestra_id, slug) where slug is not null;

-- Sostituzione delle lettere accentate senza dipendere da estensioni
create or replace function unaccent_semplice(p_testo text)
returns text language sql immutable as $$
  select translate(p_testo, 'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

-- Genera uno slug leggibile dal nome, una volta sola
create or replace function slug_di(p_testo text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(unaccent_semplice(p_testo)), '[^a-z0-9]+', '-', 'g'));
$$;

do $$
declare c record; base text; finale text; n int;
begin
  for c in select id, palestra_id, nome from corsi where slug is null loop
    base := slug_di(c.nome); finale := base; n := 1;
    while exists (select 1 from corsi where palestra_id = c.palestra_id and slug = finale) loop
      n := n + 1; finale := base || '-' || n;
    end loop;
    update corsi set slug = finale where id = c.id;
  end loop;
end $$;

create or replace function trg_corsi_slug()
returns trigger language plpgsql as $$
declare base text; finale text; n int := 1;
begin
  if new.slug is null then
    base := slug_di(new.nome); finale := base;
    while exists (select 1 from corsi where palestra_id = new.palestra_id and slug = finale and id <> new.id) loop
      n := n + 1; finale := base || '-' || n;
    end loop;
    new.slug := finale;
  end if;
  return new;
end $$;

drop trigger if exists corsi_slug on corsi;
create trigger corsi_slug before insert or update of nome on corsi
  for each row execute function trg_corsi_slug();

-- ---------------------------------------------------------------------
-- 6. VISTE: foto e colore dell'insegnante nel calendario
-- ---------------------------------------------------------------------
drop view if exists v_occupazione;
create view v_occupazione with (security_invoker = true) as
  select l.id as lezione_id, l.palestra_id, l.corso_id, l.data, l.inizio, l.fine, l.stato,
         l.insegnante_id, l.sala_id, l.prenotabile, l.note,
         c.nome as corso_nome, c.colore, c.visibilita, c.foto_url as corso_foto,
         s.nome as sala_nome, st.nome as insegnante_nome, st.foto_url as insegnante_foto,
         st.colore as insegnante_colore,
         coalesce(l.capienza_override, c.capienza, s.capienza) as capienza,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') as iscritti,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo = 'prova') as prove,
         (select count(*) from presenze ps where ps.lezione_id = l.id and ps.presente) as presenti,
         (select count(*) from presenze ps where ps.lezione_id = l.id and not ps.presente) as assenti,
         round(extract(epoch from (l.fine - l.inizio)) / 3600.0, 2) as ore
  from lezioni l
  join corsi c on c.id = l.corso_id
  left join sale s on s.id = l.sala_id
  left join staff st on st.id = l.insegnante_id;

-- Le foto dei partecipanti, per i cerchietti sulle schede delle lezioni
create or replace view v_facce_lezione with (security_invoker = true) as
  select vp.lezione_id, vp.palestra_id, a.id as allievo_id, a.nome, a.cognome, a.foto_url, vp.tipo
  from v_partecipanti_lezione vp
  join allievi a on a.id = vp.allievo_id;

-- Elenco pubblico dei corsi, per la pagina di presentazione
create or replace view v_corsi_pubblici with (security_invoker = true) as
  select c.id, c.palestra_id, c.slug, c.nome, c.descrizione, c.info_prova, c.foto_url, c.colore,
         c.prezzo_prova_cent, c.prova_abilitata, c.prenotabile,
         d.nome as disciplina, cat.nome as categoria, f.nome as fascia, f.eta_min, f.eta_max,
         l.nome as livello, se.nome as sede,
         (select string_agg(distinct st.nome, ', ')
            from orari o left join staff st on st.id = o.insegnante_id
           where o.corso_id = c.id and o.attivo and st.nome is not null) as insegnanti,
         (select jsonb_agg(jsonb_build_object(
                   'giorno', o.giorno_settimana, 'ora', to_char(o.ora_inizio, 'HH24:MI'),
                   'durata', o.durata_min, 'sala', sa.nome, 'insegnante', st.nome)
                 order by o.giorno_settimana, o.ora_inizio)
            from orari o left join sale sa on sa.id = o.sala_id left join staff st on st.id = o.insegnante_id
           where o.corso_id = c.id and o.attivo) as orari
  from corsi c
  join discipline d on d.id = c.disciplina_id
  left join categorie cat on cat.id = d.categoria_id
  join fasce_eta f on f.id = c.fascia_eta_id
  left join livelli l on l.id = c.livello_id
  left join sedi se on se.id = c.sede_id
  where c.attivo and c.visibilita = 'pubblico';


-- ---------------------------------------------------------------------
-- 7. FOTO ANCHE NEGLI ELENCHI DELLE PERSONE
-- ---------------------------------------------------------------------
drop view if exists v_persone;
create view v_persone with (security_invoker = true) as
  select a.id, a.palestra_id, a.nome, a.cognome, a.data_nascita, a.stato_lead, a.certificato_scadenza,
         a.is_titolare, a.token, a.created_at, a.foto_url,
         acc.id as account_id, acc.nome as titolare_nome, acc.cognome as titolare_cognome,
         acc.email, acc.telefono,
         lower(a.nome || ' ' || a.cognome || ' ' || acc.nome || ' ' || acc.cognome || ' ' ||
               acc.email || ' ' || coalesce(acc.telefono, '')) as ricerca,
         (select count(*) from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva') as iscrizioni_attive,
         (a.certificato_scadenza is null or a.certificato_scadenza < current_date) as certificato_da_sistemare
  from allievi a
  join account acc on acc.id = a.account_id;
