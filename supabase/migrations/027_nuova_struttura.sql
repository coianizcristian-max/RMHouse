-- =====================================================================
-- RMHouse — 027 NUOVA STRUTTURA: staff, sale, sedi, corsi e orari reali
--
-- Sostituisce il palinsesto d'esempio con quello di Ritmo Metropolitano
-- trascritto da APP Palestre (25 persone di staff, 4 sale + Schio e
-- Bolzano Vicentino, 62 corsi).
--
-- Cosa fa, in quest'ordine, tutto in un colpo solo (se un passaggio
-- fallisce non cambia niente):
--   1. crea le sedi di Schio e Bolzano Vicentino e le sale;
--   2. crea o aggiorna lo staff (chi esiste già con lo stesso nome viene
--      aggiornato, così non perde l'accesso al gestionale);
--   3. crea discipline, corsi, insegnanti abilitati per corso e orari;
--   4. RICOLLEGA LE PERSONE: ogni allievo che era su un vecchio corso passa
--      a un corso nuovo adatto alla sua età, con iscrizioni, prove,
--      pagamenti e storico del funnel;
--   5. cancella i vecchi corsi, i vecchi insegnanti, le sale non più usate
--      e le discipline rimaste vuote;
--   6. ricalcola colori e indirizzi pubblici dei corsi e annulla le email
--      che i passaggi precedenti avessero messo in coda.
--
-- ATTENZIONE: gli ORARI sono PROVVISORI (APP Palestre non li mostrava nella
-- lista corsi). Un orario per corso, senza sovrapposizioni di sala o di
-- insegnante. Si correggono dalla scheda del corso, o si sostituiscono in
-- blocco con il palinsesto vero in una migrazione successiva.
--
-- Non tocca: account e allievi, abbonamenti, incassi, ricevute, fatture,
-- banca, costi, admin e segreteria che non sono in elenco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Insegnanti abilitati su ogni corso
--    In APP Palestre un corso ha più istruttori possibili; da noi ogni
--    orario ne ha uno. Qui si ricorda chi può tenere il corso.
-- ---------------------------------------------------------------------
create table if not exists corsi_insegnanti (
  corso_id     uuid not null references corsi(id) on delete cascade,
  staff_id     uuid not null references staff(id) on delete cascade,
  palestra_id  uuid not null references palestre(id) on delete cascade,
  primary key (corso_id, staff_id)
);
create index if not exists corsi_insegnanti_staff on corsi_insegnanti (staff_id);

alter table corsi_insegnanti enable row level security;
drop policy if exists staff_legge on corsi_insegnanti;
create policy staff_legge on corsi_insegnanti for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on corsi_insegnanti;
create policy gestione_scrive on corsi_insegnanti for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- ---------------------------------------------------------------------
-- 1-6. La sostituzione vera e propria
-- ---------------------------------------------------------------------
do $$
declare
  p           palestre;
  v_inizio    timestamptz := now();
  sede_v      uuid; sede_s uuid; sede_b uuid;
  r           record;
  v_id        uuid;
  n_vecchi_corsi int; n_vecchi_staff int; n_sale int; n_persone int;
begin
  select * into p from palestre where slug = 'rmhouse';
  if not found then raise exception 'Palestra rmhouse non trovata'; end if;

  -- Fotografia di ciò che c'è adesso: tutto questo verrà sostituito
  create temp table _vecchi_corsi on commit drop as
    select id from corsi where palestra_id = p.id;
  create temp table _vecchie_lezioni on commit drop as
    select id, corso_id, data from lezioni where palestra_id = p.id;
  select count(*) into n_vecchi_corsi from _vecchi_corsi;

  -- i vecchi corsi cambiano nome per il tempo dello spostamento, così un
  -- corso nuovo può chiamarsi come uno vecchio (il nome è unico per scuola)
  update corsi set nome = nome || ' [da sostituire ' || left(id::text, 8) || ']'
   where id in (select id from _vecchi_corsi);

  -- ===================================================================
  -- 1. SEDI E SALE
  -- ===================================================================
  select id into sede_v from sedi where palestra_id = p.id and principale order by ordine limit 1;
  if sede_v is null then
    insert into sedi (palestra_id, nome, principale, indirizzo, citta, ordine)
    values (p.id, 'Vicenza', true, 'Via Artigianato 24', 'Vicenza', 1)
    on conflict (palestra_id, nome) do update set principale = true
    returning id into sede_v;
  end if;
  insert into sedi (palestra_id, nome, citta, ordine) values (p.id, 'Schio', 'Schio', 2)
  on conflict (palestra_id, nome) do nothing;
  insert into sedi (palestra_id, nome, citta, ordine) values (p.id, 'Bolzano Vicentino', 'Bolzano Vicentino', 3)
  on conflict (palestra_id, nome) do nothing;
  select id into sede_s from sedi where palestra_id = p.id and nome = 'Schio';
  select id into sede_b from sedi where palestra_id = p.id and nome = 'Bolzano Vicentino';

  create temp table _sale_nuove (nome text, sede text, capienza int) on commit drop;
  insert into _sale_nuove values
    ('Sala Aerea', 'v', 10), ('Sala Pole', 'v', 10), ('Sala Danza', 'v', 20), ('Sala Yoga', 'v', 14),
    ('Sala Schio', 's', 10), ('Sala Bolzano Vicentino', 'b', 10);

  insert into sale (palestra_id, nome, capienza, sede_id)
  select p.id, sn.nome, sn.capienza, case sn.sede when 'v' then sede_v when 's' then sede_s else sede_b end
  from _sale_nuove sn
  on conflict (palestra_id, nome) do update
    set sede_id = excluded.sede_id,
        capienza = coalesce(sale.capienza, excluded.capienza);   -- una capienza già inserita a mano resta

  -- ===================================================================
  -- 2. STAFF
  -- ===================================================================
  create temp table _staff_nuovo (
    chiave text, nome text, cognome text, specialita text, colore text,
    ruolo text, collaboratore boolean, visibilita text, alias text[]
  ) on commit drop;
  insert into _staff_nuovo values
      ('Alessia Pauletto', 'Alessia', 'Pauletto', 'Hip Hop', '#e3122b', 'insegnante', false, 'pubblico', array['alessia pauletto']::text[]),
      ('Alice Palazzin', 'Alice', 'Palazzin', 'Aerea', '#22c7e0', 'insegnante', false, 'pubblico', array['alice palazzin']::text[]),
      ('Annalisa Bannino', 'Annalisa', 'Bannino', 'Danza contemporanea', '#e3122b', 'insegnante', false, 'pubblico', array['annalisa bannino']::text[]),
      ('Arlette Sandrini', 'Arlette', 'Sandrini', 'Aerea e Acrobatica', '#22c7e0', 'insegnante', false, 'pubblico', array['arlette sandrini']::text[]),
      ('Chiara Bau', 'Chiara', 'Bau', 'Segreteria', '#f5d90a', 'segreteria', false, 'nascosto', array['chiara bau']::text[]),
      ('Chiara Boscolo', 'Chiara', 'Boscolo', 'Zumba', '#e3122b', 'insegnante', false, 'pubblico', array['chiara boscolo']::text[]),
      ('Cristina Tommaselli', 'Cristina', 'Tommaselli', 'Danza classica', '#e3122b', 'insegnante', false, 'pubblico', array['cristina tommaselli']::text[]),
      ('Elena Penzo', 'Elena', 'Penzo', 'Aerea', '#22c7e0', 'insegnante', false, 'pubblico', array['elena penzo']::text[]),
      ('Eloise Andrade', 'Eloise', 'Andrade', 'Pole Dance e Amaca', '#e11d9c', 'insegnante', false, 'pubblico', array['eloise andrade']::text[]),
      ('Erika Bonfanti', 'Erika', 'Bonfanti', 'Direzione e Antigravity', '#f59e0b', 'admin', false, 'pubblico', array['erika bonfanti']::text[]),
      ('Francesca Brunello', 'Francesca', 'Brunello', 'Aerea — sedi di Vicenza e Schio', '#0ea5e9', 'insegnante', false, 'pubblico', array['francesca brunello']::text[]),
      ('Gaia Tibaldo', 'Gaia', 'Tibaldo', 'Pilates', '#22c55e', 'insegnante', false, 'pubblico', array['gaia tibaldo', 'gaia']::text[]),
      ('Giada Vivian', 'Giada', 'Vivian', 'Aerea — sede di Schio', '#e11d9c', 'insegnante', false, 'pubblico', array['giada vivian']::text[]),
      ('Gianfranco Mezzalira', 'Gianfranco', 'Mezzalira', 'Tai Chi e Shaolin', '#15803d', 'insegnante', false, 'pubblico', array['gianfranco mezzalira']::text[]),
      ('Giulia Menti', 'Giulia', 'Menti', 'Danza moderna', '#e3122b', 'insegnante', false, 'pubblico', array['giulia menti']::text[]),
      ('Giuseppe D''Isanto', 'Giuseppe', 'D''Isanto', 'Breakdance', '#e3122b', 'insegnante', false, 'pubblico', array['giuseppe d''isanto']::text[]),
      ('John Cedar Momo', 'John Cedar', 'Momo', 'Hip Hop e Afro', '#e3122b', 'insegnante', false, 'pubblico', array['john cedar momo']::text[]),
      ('Joseph Scarabello', 'Joseph', 'Scarabello', 'Heels e Hip Hop', '#e3122b', 'insegnante', false, 'pubblico', array['joseph scarabello']::text[]),
      ('Liuda Kostetska', 'Liuda', 'Kostetska', 'Hip Hop, Heels e Pole Dance', '#e3122b', 'insegnante', false, 'pubblico', array['liuda kostetska']::text[]),
      ('Marta Sandri', 'Marta', 'Sandri', 'Yoga', '#a3e635', 'insegnante', false, 'pubblico', array['marta sandri']::text[]),
      ('Sara Kolkaku', 'Sara', 'Kolkaku', 'K Pop', '#e3122b', 'insegnante', false, 'pubblico', array['sara kolkaku']::text[]),
      ('Sara Zanin', 'Sara', 'Zanin', 'Partner', '#e3122b', 'insegnante', true, 'nascosto', array['sara zanin']::text[]),
      ('Silvia Fontanari', 'Silvia "Pocket Girl"', 'Fontanari', 'Burlesque', '#f9a8d4', 'insegnante', false, 'pubblico', array['silvia fontanari', 'silvia "pocket girl" fontanari']::text[]),
      ('Silvia Mussolin', 'Silvia', 'Mussolin', 'Ginnastica posturale', '#22c55e', 'insegnante', false, 'pubblico', array['silvia mussolin']::text[]),
      ('Silvia Passaggi', 'Silvia', 'Passaggi', 'Antigravity, Flexy, AcroDance e Aerea — sedi di Vicenza e Bolzano Vicentino', '#f59e0b', 'insegnante', false, 'pubblico', array['silvia passaggi']::text[]);

  create temp table _staff_map (chiave text primary key, id uuid) on commit drop;

  for r in select * from _staff_nuovo loop
    -- stessa persona già presente? (confronto sul nome completo, senza maiuscole)
    select s.id into v_id from staff s
     where s.palestra_id = p.id
       and lower(regexp_replace(trim(s.nome || ' ' || coalesce(s.cognome, '')), '\s+', ' ', 'g')) = any (r.alias)
       and s.id not in (select id from _staff_map)
     order by (s.user_id is not null) desc, s.created_at
     limit 1;

    if v_id is not null then
      update staff set
        nome = r.nome, cognome = r.cognome, specialita = r.specialita, colore = r.colore,
        collaboratore = r.collaboratore, visibilita = r.visibilita::visibilita,
        attivo = true, archiviato = false,
        -- un admin resta admin; gli altri prendono il ruolo dell'elenco
        ruolo = case when ruolo = 'admin' then 'admin'::ruolo_staff else r.ruolo::ruolo_staff end
      where id = v_id;
    else
      insert into staff (palestra_id, ruolo, nome, cognome, specialita, colore, collaboratore, visibilita)
      values (p.id, r.ruolo::ruolo_staff, r.nome, r.cognome, r.specialita, r.colore, r.collaboratore,
              r.visibilita::visibilita)
      returning id into v_id;
    end if;
    insert into _staff_map values (r.chiave, v_id);
  end loop;

  -- ===================================================================
  -- 3. DISCIPLINE, CORSI, INSEGNANTI ABILITATI, ORARI
  -- ===================================================================
  create temp table _discipline (nome text, categoria text, ordine int) on commit drop;
  insert into _discipline values
      ('Aerea', 'Acrobatica', 1),
      ('Acrodance', 'Acrobatica', 2),
      ('Antigravity', 'Acrobatica', 3),
      ('Pole Dance', 'Acrobatica', 4),
      ('Open Training', 'Acrobatica', 5),
      ('Hip Hop', 'Danza', 10),
      ('Heels', 'Danza', 11),
      ('Breakdance', 'Danza', 12),
      ('Afro', 'Danza', 13),
      ('K Pop', 'Danza', 14),
      ('Burlesque', 'Danza', 15),
      ('Danza Classica', 'Danza', 16),
      ('Danza Contemporanea', 'Danza', 17),
      ('Danza Moderna', 'Danza', 18),
      ('Country Dance', 'Danza', 19),
      ('Hustle Dance', 'Danza', 20),
      ('Pilates', 'Benessere', 30),
      ('Yoga', 'Benessere', 31),
      ('Ginnastica Posturale', 'Benessere', 32),
      ('Zumba', 'Benessere', 33),
      ('Flexy', 'Benessere', 34),
      ('Tai Chi', 'Benessere', 35),
      ('Shaolin Kung Fu', 'Benessere', 36),
      ('Lezione privata', null, 99);

  insert into discipline (palestra_id, nome, categoria_id, ordine, attiva)
  select p.id, d.nome, (select id from categorie c where c.palestra_id = p.id and c.nome = d.categoria), d.ordine, true
  from _discipline d
  on conflict (palestra_id, nome) do update
    set categoria_id = excluded.categoria_id, ordine = excluded.ordine, attiva = true;

  create temp table _corsi (
    nome text, disciplina text, fascia text, livello text, sede text,
    prenotabile boolean, prova boolean, visibilita text, ordine int
  ) on commit drop;
  insert into _corsi values
      ('Aerea adulti 1', 'Aerea', 'Adulti', 'Base', 'v', true, true, 'pubblico', 1),
      ('Aerea adulti 2', 'Aerea', 'Adulti', 'Intermedio', 'v', true, true, 'pubblico', 2),
      ('Aerea adulti 3', 'Aerea', 'Adulti', 'Avanzato', 'v', true, true, 'pubblico', 3),
      ('Aerea Agonismo', 'Aerea', 'Adulti', 'Avanzato', 'v', true, false, 'pubblico', 4),
      ('Aerea Performance Team', 'Aerea', 'Adulti', 'Avanzato', 'v', false, false, 'pubblico', 5),
      ('Aerea Cerchio', 'Aerea', 'Adulti', 'Base', 'v', true, false, 'pubblico', 6),
      ('Aerea Cerchio 2', 'Aerea', 'Adulti', 'Intermedio', 'v', true, false, 'pubblico', 7),
      ('Aerial Fusion', 'Aerea', 'Adulti', null, 'v', true, false, 'pubblico', 8),
      ('Aerea Kids 1', 'Aerea', 'Kids', 'Base', 'v', true, true, 'pubblico', 9),
      ('Aerea Kids 2', 'Aerea', 'Kids', 'Intermedio', 'v', true, false, 'pubblico', 10),
      ('Aerea Mini 5-6', 'Aerea', 'Kids', null, 'v', true, true, 'nascosto', 11),
      ('Aerea Teen 1', 'Aerea', 'Ragazzi', 'Base', 'v', true, true, 'pubblico', 12),
      ('Aerea Teen 2', 'Aerea', 'Ragazzi', 'Intermedio', 'v', true, false, 'pubblico', 13),
      ('Aerea Teen 3', 'Aerea', 'Ragazzi', 'Avanzato', 'v', true, false, 'pubblico', 14),
      ('Aerea 1 Schio', 'Aerea', 'Adulti', 'Base', 's', true, false, 'pubblico', 15),
      ('Aerea 2 Schio', 'Aerea', 'Adulti', 'Intermedio', 's', true, false, 'pubblico', 16),
      ('Aerea Young 1 Schio', 'Aerea', 'Ragazzi', 'Base', 's', true, false, 'pubblico', 17),
      ('Aerea Kids Bolzano Vicentino', 'Aerea', 'Kids', null, 'b', true, false, 'pubblico', 18),
      ('Aerea Teen Bolzano Vicentino', 'Aerea', 'Ragazzi', null, 'b', true, false, 'pubblico', 19),
      ('Acrodance / Acrobatica', 'Acrodance', 'Ragazzi', null, 'v', true, false, 'pubblico', 20),
      ('Antigravity® Liv.1', 'Antigravity', 'Adulti', 'Base', 'v', true, true, 'pubblico', 21),
      ('Antigravity® Liv.2', 'Antigravity', 'Adulti', 'Intermedio', 'v', true, false, 'pubblico', 22),
      ('Antigravity 3', 'Antigravity', 'Adulti', 'Avanzato', 'v', true, false, 'pubblico', 23),
      ('Antigravity® Pausa Pranzo', 'Antigravity', 'Adulti', null, 'v', true, false, 'pubblico', 24),
      ('Antigravity Restorative', 'Antigravity', 'Adulti', null, 'v', false, false, 'pubblico', 25),
      ('Antigravity Bolzano Vicentino', 'Antigravity', 'Adulti', null, 'b', true, false, 'pubblico', 26),
      ('Pole Dance Liv.1', 'Pole Dance', 'Adulti', 'Base', 'v', true, false, 'pubblico', 27),
      ('Pole Dance Liv.2', 'Pole Dance', 'Adulti', 'Intermedio', 'v', true, true, 'pubblico', 28),
      ('Pole Dance Liv.3', 'Pole Dance', 'Adulti', 'Avanzato', 'v', true, true, 'pubblico', 29),
      ('Exotic Pole Open Level', 'Pole Dance', 'Adulti', null, 'v', true, false, 'pubblico', 30),
      ('Pole Young 1', 'Pole Dance', 'Ragazzi', 'Base', 'v', true, true, 'pubblico', 31),
      ('Pole Young 2', 'Pole Dance', 'Ragazzi', 'Intermedio', 'v', true, false, 'pubblico', 32),
      ('Open Training', 'Open Training', 'Adulti', null, 'v', true, false, 'pubblico', 33),
      ('Hip Hop adulti', 'Hip Hop', 'Adulti', null, 'v', true, true, 'pubblico', 34),
      ('Hip Hop 2', 'Hip Hop', 'Adulti', 'Intermedio', 'v', true, false, 'pubblico', 35),
      ('Hip Hop Open Class', 'Hip Hop', 'Adulti', null, 'v', true, false, 'pubblico', 36),
      ('Hip Hop Teen', 'Hip Hop', 'Ragazzi', null, 'v', true, true, 'pubblico', 37),
      ('Hip Hop Kids', 'Hip Hop', 'Kids', null, 'v', true, true, 'pubblico', 38),
      ('Hip Hop Mini 5-6 anni', 'Hip Hop', 'Kids', null, 'v', false, false, 'pubblico', 39),
      ('Heels', 'Heels', 'Adulti', 'Base', 'v', true, false, 'pubblico', 40),
      ('Heels liv. 2', 'Heels', 'Adulti', 'Intermedio', 'v', true, false, 'pubblico', 41),
      ('Breakdance 1', 'Breakdance', 'Ragazzi', 'Base', 'v', true, true, 'pubblico', 42),
      ('Breakdance 2', 'Breakdance', 'Ragazzi', 'Intermedio', 'v', true, true, 'pubblico', 43),
      ('Afro', 'Afro', 'Adulti', null, 'v', true, true, 'pubblico', 44),
      ('K Pop', 'K Pop', 'Ragazzi', null, 'v', true, false, 'pubblico', 45),
      ('Burlesque Liv.1', 'Burlesque', 'Adulti', 'Base', 'v', true, true, 'pubblico', 46),
      ('Burlesque Liv.2', 'Burlesque', 'Adulti', 'Intermedio', 'v', true, true, 'pubblico', 47),
      ('Danza classica amatoriale', 'Danza Classica', 'Adulti', null, 'v', false, false, 'pubblico', 48),
      ('Danza classica young', 'Danza Classica', 'Ragazzi', null, 'v', false, false, 'pubblico', 49),
      ('Danza contemporanea amatoriale', 'Danza Contemporanea', 'Adulti', null, 'v', false, false, 'pubblico', 50),
      ('Danza moderna', 'Danza Moderna', 'Adulti', null, 'v', false, false, 'pubblico', 51),
      ('Country Dance', 'Country Dance', 'Adulti', null, 'v', true, false, 'pubblico', 52),
      ('Hustle Dance', 'Hustle Dance', 'Adulti', null, 'v', true, false, 'pubblico', 53),
      ('Zumba', 'Zumba', 'Adulti', null, 'v', true, false, 'pubblico', 54),
      ('Pilates', 'Pilates', 'Adulti', null, 'v', true, false, 'pubblico', 55),
      ('Yoga', 'Yoga', 'Adulti', null, 'v', true, true, 'pubblico', 56),
      ('Ginnastica posturale', 'Ginnastica Posturale', 'Adulti', null, 'v', false, false, 'pubblico', 57),
      ('Flexy', 'Flexy', 'Adulti', null, 'v', true, true, 'pubblico', 58),
      ('Tai Chi', 'Tai Chi', 'Adulti', null, 'v', true, false, 'pubblico', 59),
      ('Shaolin Kung Fu 1', 'Shaolin Kung Fu', 'Adulti', 'Base', 'v', true, false, 'pubblico', 60),
      ('Shaolin Kung Fu 2', 'Shaolin Kung Fu', 'Adulti', 'Intermedio', 'v', true, false, 'pubblico', 61),
      ('Lezione privata', 'Lezione privata', 'Adulti', null, 'v', false, false, 'nascosto', 62);

  -- controlli: se manca una fascia, un livello o una categoria ci si ferma qui
  if exists (select 1 from _corsi c where not exists
             (select 1 from fasce_eta f where f.palestra_id = p.id and f.nome = c.fascia)) then
    raise exception 'Manca una fascia d''età (Kids, Ragazzi o Adulti): controlla Struttura → Categorie, livelli e chiusure';
  end if;
  if exists (select 1 from _corsi c where c.livello is not null and not exists
             (select 1 from livelli l where l.palestra_id = p.id and l.nome = c.livello)) then
    raise exception 'Manca un livello (Base, Intermedio o Avanzato)';
  end if;

  create temp table _corsi_map (nome text primary key, id uuid) on commit drop;

  for r in select * from _corsi order by ordine loop
    insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, sede_id,
                       prenotabile, prova_abilitata, prezzo_prova_cent, visibilita, colore_automatico, attivo)
    values (p.id,
            (select id from discipline where palestra_id = p.id and nome = r.disciplina),
            (select id from fasce_eta  where palestra_id = p.id and nome = r.fascia),
            (select id from livelli    where palestra_id = p.id and nome = r.livello),
            r.nome,
            case r.sede when 'v' then sede_v when 's' then sede_s else sede_b end,
            r.prenotabile, r.prova, 0, r.visibilita::visibilita, true, true)
    returning id into v_id;
    insert into _corsi_map values (r.nome, v_id);
  end loop;

  create temp table _corsi_insegnanti (corso text, chiave text) on commit drop;
  insert into _corsi_insegnanti values
      ('Aerea adulti 1', 'Alice Palazzin'),
      ('Aerea adulti 1', 'Arlette Sandrini'),
      ('Aerea adulti 1', 'Francesca Brunello'),
      ('Aerea adulti 1', 'Giada Vivian'),
      ('Aerea adulti 1', 'Silvia Passaggi'),
      ('Aerea adulti 2', 'Alice Palazzin'),
      ('Aerea adulti 2', 'Arlette Sandrini'),
      ('Aerea adulti 2', 'Elena Penzo'),
      ('Aerea adulti 2', 'Francesca Brunello'),
      ('Aerea adulti 2', 'Giada Vivian'),
      ('Aerea adulti 2', 'Silvia Passaggi'),
      ('Aerea adulti 3', 'Alice Palazzin'),
      ('Aerea adulti 3', 'Arlette Sandrini'),
      ('Aerea adulti 3', 'Francesca Brunello'),
      ('Aerea adulti 3', 'Giada Vivian'),
      ('Aerea adulti 3', 'Silvia Passaggi'),
      ('Aerea Agonismo', 'Arlette Sandrini'),
      ('Aerea Performance Team', 'Francesca Brunello'),
      ('Aerea Cerchio', 'Alice Palazzin'),
      ('Aerea Cerchio', 'Arlette Sandrini'),
      ('Aerea Cerchio', 'Francesca Brunello'),
      ('Aerea Cerchio', 'Giada Vivian'),
      ('Aerea Cerchio 2', 'Francesca Brunello'),
      ('Aerea Kids 1', 'Arlette Sandrini'),
      ('Aerea Kids 1', 'Elena Penzo'),
      ('Aerea Kids 1', 'Francesca Brunello'),
      ('Aerea Kids 1', 'Giada Vivian'),
      ('Aerea Kids 2', 'Arlette Sandrini'),
      ('Aerea Kids 2', 'Francesca Brunello'),
      ('Aerea Kids 2', 'Giada Vivian'),
      ('Aerea Mini 5-6', 'Elena Penzo'),
      ('Aerea Teen 1', 'Arlette Sandrini'),
      ('Aerea Teen 1', 'Elena Penzo'),
      ('Aerea Teen 1', 'Francesca Brunello'),
      ('Aerea Teen 1', 'Giada Vivian'),
      ('Aerea Teen 2', 'Arlette Sandrini'),
      ('Aerea Teen 2', 'Francesca Brunello'),
      ('Aerea Teen 2', 'Giada Vivian'),
      ('Aerea Teen 3', 'Arlette Sandrini'),
      ('Aerea Teen 3', 'Francesca Brunello'),
      ('Aerea 1 Schio', 'Francesca Brunello'),
      ('Aerea 1 Schio', 'Giada Vivian'),
      ('Aerea 2 Schio', 'Francesca Brunello'),
      ('Aerea 2 Schio', 'Giada Vivian'),
      ('Aerea Young 1 Schio', 'Francesca Brunello'),
      ('Aerea Young 1 Schio', 'Giada Vivian'),
      ('Aerea Kids Bolzano Vicentino', 'Silvia Passaggi'),
      ('Aerea Teen Bolzano Vicentino', 'Silvia Passaggi'),
      ('Acrodance / Acrobatica', 'Arlette Sandrini'),
      ('Acrodance / Acrobatica', 'Giuseppe D''Isanto'),
      ('Acrodance / Acrobatica', 'Silvia Passaggi'),
      ('Antigravity® Liv.1', 'Eloise Andrade'),
      ('Antigravity® Liv.1', 'Erika Bonfanti'),
      ('Antigravity® Liv.1', 'Silvia Passaggi'),
      ('Antigravity® Liv.2', 'Erika Bonfanti'),
      ('Antigravity® Liv.2', 'Silvia Passaggi'),
      ('Antigravity 3', 'Erika Bonfanti'),
      ('Antigravity 3', 'Silvia Passaggi'),
      ('Antigravity® Pausa Pranzo', 'Eloise Andrade'),
      ('Antigravity® Pausa Pranzo', 'Erika Bonfanti'),
      ('Antigravity Restorative', 'Silvia Passaggi'),
      ('Antigravity Bolzano Vicentino', 'Silvia Passaggi'),
      ('Pole Dance Liv.1', 'Eloise Andrade'),
      ('Pole Dance Liv.1', 'Liuda Kostetska'),
      ('Pole Dance Liv.2', 'Eloise Andrade'),
      ('Pole Dance Liv.2', 'Liuda Kostetska'),
      ('Pole Dance Liv.3', 'Eloise Andrade'),
      ('Pole Dance Liv.3', 'Liuda Kostetska'),
      ('Exotic Pole Open Level', 'Eloise Andrade'),
      ('Pole Young 1', 'Eloise Andrade'),
      ('Pole Young 2', 'Liuda Kostetska'),
      ('Hip Hop adulti', 'Alessia Pauletto'),
      ('Hip Hop adulti', 'John Cedar Momo'),
      ('Hip Hop adulti', 'Joseph Scarabello'),
      ('Hip Hop adulti', 'Liuda Kostetska'),
      ('Hip Hop 2', 'John Cedar Momo'),
      ('Hip Hop 2', 'Joseph Scarabello'),
      ('Hip Hop 2', 'Liuda Kostetska'),
      ('Hip Hop Teen', 'Alessia Pauletto'),
      ('Hip Hop Teen', 'Liuda Kostetska'),
      ('Hip Hop Kids', 'Alessia Pauletto'),
      ('Hip Hop Kids', 'Liuda Kostetska'),
      ('Hip Hop Mini 5-6 anni', 'Alessia Pauletto'),
      ('Heels', 'Joseph Scarabello'),
      ('Heels', 'Liuda Kostetska'),
      ('Heels liv. 2', 'Joseph Scarabello'),
      ('Heels liv. 2', 'Liuda Kostetska'),
      ('Breakdance 1', 'Giuseppe D''Isanto'),
      ('Breakdance 2', 'Giuseppe D''Isanto'),
      ('Afro', 'John Cedar Momo'),
      ('K Pop', 'Sara Kolkaku'),
      ('Burlesque Liv.1', 'Silvia Fontanari'),
      ('Burlesque Liv.2', 'Silvia Fontanari'),
      ('Danza classica amatoriale', 'Cristina Tommaselli'),
      ('Danza classica young', 'Cristina Tommaselli'),
      ('Danza contemporanea amatoriale', 'Annalisa Bannino'),
      ('Danza moderna', 'Giulia Menti'),
      ('Zumba', 'Chiara Boscolo'),
      ('Pilates', 'Gaia Tibaldo'),
      ('Yoga', 'Marta Sandri'),
      ('Ginnastica posturale', 'Silvia Mussolin'),
      ('Flexy', 'Eloise Andrade'),
      ('Flexy', 'Francesca Brunello'),
      ('Flexy', 'Liuda Kostetska'),
      ('Flexy', 'Silvia Passaggi'),
      ('Tai Chi', 'Gianfranco Mezzalira'),
      ('Shaolin Kung Fu 1', 'Gianfranco Mezzalira'),
      ('Shaolin Kung Fu 2', 'Gianfranco Mezzalira'),
      ('Lezione privata', 'Alice Palazzin'),
      ('Lezione privata', 'Arlette Sandrini'),
      ('Lezione privata', 'Eloise Andrade'),
      ('Lezione privata', 'Erika Bonfanti'),
      ('Lezione privata', 'Francesca Brunello'),
      ('Lezione privata', 'Giada Vivian'),
      ('Lezione privata', 'Gianfranco Mezzalira'),
      ('Lezione privata', 'Giuseppe D''Isanto'),
      ('Lezione privata', 'John Cedar Momo'),
      ('Lezione privata', 'Joseph Scarabello'),
      ('Lezione privata', 'Liuda Kostetska'),
      ('Lezione privata', 'Silvia Fontanari'),
      ('Lezione privata', 'Silvia Passaggi');

  insert into corsi_insegnanti (corso_id, staff_id, palestra_id)
  select cm.id, sm.id, p.id
  from _corsi_insegnanti ci
  join _corsi_map cm on cm.nome = ci.corso
  join _staff_map sm on sm.chiave = ci.chiave
  on conflict do nothing;

  create temp table _orari (corso text, giorno int, ora text, durata int, sala text, chiave text) on commit drop;
  insert into _orari values
      ('Aerea Kids 1', 1, '16:30', 60, 'Sala Aerea', 'Arlette Sandrini'),
      ('Aerea Kids 2', 2, '16:30', 60, 'Sala Aerea', 'Francesca Brunello'),
      ('Aerea Mini 5-6', 3, '16:30', 45, 'Sala Aerea', 'Elena Penzo'),
      ('Hip Hop Kids', 4, '16:30', 60, 'Sala Danza', 'Alessia Pauletto'),
      ('Hip Hop Mini 5-6 anni', 5, '16:30', 45, 'Sala Danza', 'Alessia Pauletto'),
      ('Acrodance / Acrobatica', 1, '17:00', 75, 'Sala Danza', 'Giuseppe D''Isanto'),
      ('Aerea Teen 1', 2, '17:30', 75, 'Sala Aerea', 'Giada Vivian'),
      ('Aerea Teen 2', 3, '17:15', 75, 'Sala Aerea', 'Arlette Sandrini'),
      ('Aerea Teen 3', 4, '17:00', 75, 'Sala Aerea', 'Francesca Brunello'),
      ('Breakdance 1', 5, '17:15', 60, 'Sala Danza', 'Giuseppe D''Isanto'),
      ('Breakdance 2', 1, '18:15', 60, 'Sala Danza', 'Giuseppe D''Isanto'),
      ('Danza classica young', 2, '17:00', 75, 'Sala Danza', 'Cristina Tommaselli'),
      ('Hip Hop Teen', 3, '17:00', 60, 'Sala Danza', 'Liuda Kostetska'),
      ('K Pop', 4, '17:30', 60, 'Sala Danza', 'Sara Kolkaku'),
      ('Pole Young 1', 5, '17:00', 60, 'Sala Pole', 'Eloise Andrade'),
      ('Pole Young 2', 1, '17:00', 60, 'Sala Pole', 'Liuda Kostetska'),
      ('Aerea Agonismo', 2, '18:45', 120, 'Sala Aerea', 'Arlette Sandrini'),
      ('Aerea Cerchio', 3, '18:30', 75, 'Sala Aerea', 'Alice Palazzin'),
      ('Aerea Cerchio 2', 4, '18:30', 75, 'Sala Aerea', 'Francesca Brunello'),
      ('Aerea Performance Team', 6, '09:30', 120, 'Sala Aerea', 'Francesca Brunello'),
      ('Aerea adulti 1', 1, '18:30', 90, 'Sala Aerea', 'Silvia Passaggi'),
      ('Aerea adulti 2', 2, '20:45', 90, 'Sala Aerea', 'Alice Palazzin'),
      ('Aerea adulti 3', 3, '19:45', 90, 'Sala Aerea', 'Giada Vivian'),
      ('Afro', 4, '18:30', 60, 'Sala Danza', 'John Cedar Momo'),
      ('Antigravity 3', 5, '18:30', 60, 'Sala Yoga', 'Erika Bonfanti'),
      ('Antigravity Restorative', 1, '20:00', 60, 'Sala Yoga', 'Silvia Passaggi'),
      ('Antigravity® Liv.1', 2, '18:30', 60, 'Sala Yoga', 'Eloise Andrade'),
      ('Antigravity® Liv.2', 3, '18:30', 60, 'Sala Yoga', 'Erika Bonfanti'),
      ('Antigravity® Pausa Pranzo', 4, '13:00', 60, 'Sala Yoga', 'Eloise Andrade'),
      ('Burlesque Liv.1', 5, '18:30', 60, 'Sala Pole', 'Silvia Fontanari'),
      ('Burlesque Liv.2', 1, '18:30', 60, 'Sala Pole', 'Silvia Fontanari'),
      ('Danza classica amatoriale', 2, '18:30', 75, 'Sala Danza', 'Cristina Tommaselli'),
      ('Danza contemporanea amatoriale', 3, '18:30', 75, 'Sala Danza', 'Annalisa Bannino'),
      ('Danza moderna', 4, '19:30', 75, 'Sala Danza', 'Giulia Menti'),
      ('Exotic Pole Open Level', 5, '19:30', 75, 'Sala Pole', 'Eloise Andrade'),
      ('Flexy', 1, '18:30', 60, 'Sala Yoga', 'Liuda Kostetska'),
      ('Ginnastica posturale', 2, '09:00', 60, 'Sala Yoga', 'Silvia Mussolin'),
      ('Heels', 3, '19:45', 60, 'Sala Danza', 'Joseph Scarabello'),
      ('Heels liv. 2', 4, '20:45', 60, 'Sala Danza', 'Joseph Scarabello'),
      ('Hip Hop 2', 5, '18:30', 60, 'Sala Danza', 'John Cedar Momo'),
      ('Hip Hop adulti', 1, '19:15', 60, 'Sala Danza', 'Alessia Pauletto'),
      ('Pilates', 2, '10:00', 60, 'Sala Yoga', 'Gaia Tibaldo'),
      ('Pole Dance Liv.1', 3, '18:30', 75, 'Sala Pole', 'Liuda Kostetska'),
      ('Pole Dance Liv.2', 4, '18:30', 75, 'Sala Pole', 'Eloise Andrade'),
      ('Pole Dance Liv.3', 5, '20:45', 75, 'Sala Pole', 'Liuda Kostetska'),
      ('Shaolin Kung Fu 1', 6, '09:30', 60, 'Sala Yoga', 'Gianfranco Mezzalira'),
      ('Shaolin Kung Fu 2', 6, '10:30', 60, 'Sala Yoga', 'Gianfranco Mezzalira'),
      ('Tai Chi', 6, '11:30', 60, 'Sala Yoga', 'Gianfranco Mezzalira'),
      ('Yoga', 4, '18:30', 75, 'Sala Yoga', 'Marta Sandri'),
      ('Zumba', 5, '19:30', 60, 'Sala Danza', 'Chiara Boscolo'),
      ('Aerial Fusion', 1, '20:00', 75, 'Sala Aerea', null),
      ('Country Dance', 2, '19:45', 60, 'Sala Danza', null),
      ('Hip Hop Open Class', 3, '20:45', 60, 'Sala Danza', null),
      ('Hustle Dance', 5, '20:30', 60, 'Sala Danza', null),
      ('Open Training', 6, '11:30', 90, 'Sala Aerea', null),
      ('Aerea Kids Bolzano Vicentino', 4, '16:30', 60, 'Sala Bolzano Vicentino', 'Silvia Passaggi'),
      ('Aerea Teen Bolzano Vicentino', 4, '17:30', 75, 'Sala Bolzano Vicentino', 'Silvia Passaggi'),
      ('Aerea Young 1 Schio', 3, '17:00', 75, 'Sala Schio', 'Giada Vivian'),
      ('Aerea 1 Schio', 3, '18:30', 90, 'Sala Schio', 'Francesca Brunello'),
      ('Aerea 2 Schio', 3, '20:00', 90, 'Sala Schio', 'Francesca Brunello'),
      ('Antigravity Bolzano Vicentino', 4, '18:45', 60, 'Sala Bolzano Vicentino', 'Silvia Passaggi');

  -- valido da tre mesi fa: così le lezioni passate esistono e lo storico
  -- (presenze, prove, statistiche) si può ricollegare
  insert into orari (palestra_id, corso_id, giorno_settimana, ora_inizio, durata_min, sala_id, insegnante_id, valido_dal)
  select p.id, cm.id, o.giorno, o.ora::time, o.durata,
         (select id from sale where palestra_id = p.id and nome = o.sala),
         sm.id, current_date - 90
  from _orari o
  join _corsi_map cm on cm.nome = o.corso
  left join _staff_map sm on sm.chiave = o.chiave;

  perform genera_lezioni(p.id, current_date - 90, current_date + 90);

  -- ===================================================================
  -- 4. RICOLLEGAMENTO DELLE PERSONE
  -- ===================================================================
  -- Chi era legato in qualunque modo ai vecchi corsi
  create temp table _mappa on commit drop as
  with coinvolti as (
    select allievo_id from iscrizioni where corso_id in (select id from _vecchi_corsi)
    union select allievo_id from prove where corso_id in (select id from _vecchi_corsi)
    union select allievo_id from lead_eventi where corso_id in (select id from _vecchi_corsi)
  ),
  candidati as (
    select c.id, f.eta_min, coalesce(f.eta_max, 200) as eta_max
    from corsi c join fasce_eta f on f.id = c.fascia_eta_id
    where c.id in (select id from _corsi_map)
      and c.visibilita = 'pubblico' and c.sede_id = sede_v
      and exists (select 1 from orari o where o.corso_id = c.id)
  )
  select a.id as allievo_id,
         coalesce(
           (select c.id from candidati c
             where extract(year from age(current_date, a.data_nascita)) between c.eta_min and c.eta_max
             order by md5(c.id::text || a.id::text) limit 1),
           (select c.id from candidati c order by md5(c.id::text || a.id::text) limit 1)
         ) as corso_id
  from allievi a
  where a.id in (select allievo_id from coinvolti);
  select count(*) into n_persone from _mappa;

  -- memorie prima di spostare
  create temp table _iscr_con_orari on commit drop as
    select distinct io.iscrizione_id from iscrizioni_orari io
    join iscrizioni i on i.id = io.iscrizione_id
    where i.corso_id in (select id from _vecchi_corsi);
  create temp table _presenze_prove on commit drop as
    select pr.id as prova_id, ps.presente
    from prove pr join presenze ps on ps.lezione_id = pr.lezione_id and ps.allievo_id = pr.allievo_id
    where pr.corso_id in (select id from _vecchi_corsi);
  create temp table _con_presenze on commit drop as
    select distinct ps.allievo_id from presenze ps
    where ps.lezione_id in (select id from _vecchie_lezioni);

  -- iscrizioni: stesso allievo, stesse date, corso nuovo
  update iscrizioni i set corso_id = m.corso_id
  from _mappa m
  where i.allievo_id = m.allievo_id and i.corso_id in (select id from _vecchi_corsi);

  -- orari frequentati: quelli del corso nuovo (i vecchi spariscono con i vecchi orari)
  insert into iscrizioni_orari (iscrizione_id, orario_id)
  select i.id, o.id
  from iscrizioni i join orari o on o.corso_id = i.corso_id and o.attivo
  where i.id in (select iscrizione_id from _iscr_con_orari)
  on conflict do nothing;

  -- prove: corso nuovo e la sua lezione più vicina alla data originale
  update prove pr set
    corso_id = m.corso_id,
    lezione_id = (select l.id from lezioni l
                   where l.corso_id = m.corso_id
                   order by abs(l.data - vl.data), l.data limit 1)
  from _mappa m, _vecchie_lezioni vl
  where pr.allievo_id = m.allievo_id
    and pr.corso_id in (select id from _vecchi_corsi)
    and vl.id = pr.lezione_id;

  -- pagamenti: seguono l'iscrizione o la prova a cui appartengono
  update pagamenti pg set corso_id = i.corso_id
  from iscrizioni i
  where i.pagamento_id = pg.id and pg.corso_id in (select id from _vecchi_corsi);
  update pagamenti pg set corso_id = pr.corso_id
  from prove pr
  where pr.pagamento_id = pg.id and pg.corso_id in (select id from _vecchi_corsi);
  update pagamenti set corso_id = null where corso_id in (select id from _vecchi_corsi);

  -- storico del funnel, con le date originali
  insert into lead_eventi (palestra_id, allievo_id, corso_id, evento, created_at)
  select le.palestra_id, le.allievo_id, m.corso_id, le.evento, le.created_at
  from lead_eventi le join _mappa m on m.allievo_id = le.allievo_id
  where le.corso_id in (select id from _vecchi_corsi)
  on conflict do nothing;
  delete from lead_eventi where corso_id in (select id from _vecchi_corsi);

  -- presenze delle prove già fatte, sulla lezione nuova
  insert into presenze (palestra_id, lezione_id, allievo_id, presente)
  select pr.palestra_id, pr.lezione_id, pr.allievo_id, pp.presente
  from _presenze_prove pp join prove pr on pr.id = pp.prova_id
  on conflict do nothing;

  -- presenze degli iscritti nelle lezioni già passate (solo per chi ne aveva),
  -- con qualche assenza sparsa come nello storico dimostrativo
  insert into presenze (palestra_id, lezione_id, allievo_id, presente)
  select l.palestra_id, l.id, i.allievo_id, not (md5(l.id::text || i.allievo_id::text) like 'a%')
  from iscrizioni i
  join iscrizioni_orari io on io.iscrizione_id = i.id
  join lezioni l on l.orario_id = io.orario_id
  where i.stato = 'attiva'
    and i.allievo_id in (select allievo_id from _con_presenze)
    and l.stato = 'programmata' and l.inizio < now()
    and l.data >= greatest(i.data_inizio, current_date - 60)
  on conflict do nothing;

  -- ===================================================================
  -- 5. VIA IL VECCHIO
  -- ===================================================================
  -- corsi: portano con sé orari, lezioni, presenze e prenotazioni su quelle
  -- lezioni, liste d'attesa, regole dei recuperi, materiali
  delete from corsi where id in (select id from _vecchi_corsi);

  -- insegnanti che non sono nell'elenco (admin e segreteria restano)
  select count(*) into n_vecchi_staff from staff
   where palestra_id = p.id and ruolo = 'insegnante' and id not in (select id from _staff_map);
  delete from staff
   where palestra_id = p.id and ruolo = 'insegnante' and id not in (select id from _staff_map);

  -- sale non più usate: prenotazioni di affitto e listino passano alla Sala Danza
  update prenotazioni_spazi set sala_id = (select id from sale where palestra_id = p.id and nome = 'Sala Danza')
   where palestra_id = p.id and sala_id in
     (select id from sale where palestra_id = p.id and nome not in (select nome from _sale_nuove));
  update tariffe_spazi set sala_id = (select id from sale where palestra_id = p.id and nome = 'Sala Danza')
   where palestra_id = p.id and sala_id in
     (select id from sale where palestra_id = p.id and nome not in (select nome from _sale_nuove));
  select count(*) into n_sale from sale where palestra_id = p.id and nome not in (select nome from _sale_nuove);
  delete from sale where palestra_id = p.id and nome not in (select nome from _sale_nuove);

  -- discipline rimaste senza corsi
  delete from discipline d where d.palestra_id = p.id
    and not exists (select 1 from corsi c where c.disciplina_id = d.id);

  -- ===================================================================
  -- 6. RIFINITURE
  -- ===================================================================
  -- indirizzi pubblici puliti (senza il "-2" dovuto ai vecchi corsi omonimi)
  update corsi set slug = null, nome = nome where id in (select id from _corsi_map);
  -- colori a gradazione per disciplina
  perform ricolora_corsi(p.id, true);
  -- nessuna email deve partire per effetto di questo spostamento
  update messaggi_coda set stato = 'annullato'
   where palestra_id = p.id and stato = 'in_coda' and created_at >= v_inizio;

  raise notice 'Fatto: % corsi vecchi sostituiti da %, % insegnanti rimossi, % sale rimosse, % persone ricollegate.',
    n_vecchi_corsi, (select count(*) from _corsi_map), n_vecchi_staff, n_sale, n_persone;
end $$;

-- Riepilogo
select 'corsi' as cosa, count(*) as quanti from corsi where palestra_id = (select id from palestre where slug = 'rmhouse')
union all select 'orari', count(*) from orari where palestra_id = (select id from palestre where slug = 'rmhouse')
union all select 'lezioni', count(*) from lezioni where palestra_id = (select id from palestre where slug = 'rmhouse')
union all select 'staff', count(*) from staff where palestra_id = (select id from palestre where slug = 'rmhouse')
union all select 'sale', count(*) from sale where palestra_id = (select id from palestre where slug = 'rmhouse')
union all select 'iscrizioni attive', count(*) from iscrizioni where stato = 'attiva'
  and palestra_id = (select id from palestre where slug = 'rmhouse');
