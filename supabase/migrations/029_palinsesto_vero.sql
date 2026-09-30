-- =====================================================================
-- RMHouse — 029 PALINSESTO VERO
--
-- Sostituisce gli orari provvisori della 027 con il palinsesto reale
-- trascritto da APP Palestre (settimana 21-27 settembre 2026):
-- 73 orari settimanali a Vicenza e Bolzano Vicentino, più gli affitti
-- fissi della Sala Aerea.
--
-- Novità: un orario può essere NON PRENOTABILE (in APP Palestre alcune
-- lezioni lo sono anche se il corso sì). Le lezioni generate da quell'orario
-- nascono non prenotabili, anche quelle che il sistema crea in automatico
-- nei mesi successivi.
--
-- I clienti finti vengono ricollegati: chi era iscritto a un corso che ha
-- ancora orari prende uno o due orari veri (quanti ne prevede il suo
-- abbonamento); chi era su un corso rimasto senza orari passa a un corso
-- adatto alla sua età. Prove, presenze e storico seguono.
-- Tutto in un colpo: se un passaggio fallisce non cambia niente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Orari prenotabili o no
-- ---------------------------------------------------------------------
alter table orari add column if not exists prenotabile boolean not null default true;

-- Le lezioni nascono con la prenotabilità del loro orario
create or replace function genera_lezioni(p_palestra uuid, p_dal date, p_al date, p_orario uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- se chiamata da un utente collegato, deve essere admin/segreteria di quella palestra
  if auth.uid() is not null and not is_gestione(p_palestra) then
    raise exception 'non_autorizzato';
  end if;
  insert into lezioni (palestra_id, orario_id, corso_id, data, inizio, fine, sala_id, insegnante_id, prenotabile)
  select o.palestra_id, o.id, o.corso_id, d::date,
         (d::date + o.ora_inizio) at time zone p.fuso_orario,
         (d::date + o.ora_inizio + make_interval(mins => o.durata_min)) at time zone p.fuso_orario,
         o.sala_id, o.insegnante_id, o.prenotabile
  from orari o
  join corsi c    on c.id = o.corso_id and c.attivo
  join palestre p on p.id = o.palestra_id
  cross join generate_series(greatest(p_dal, o.valido_dal), least(p_al, coalesce(o.valido_al, p_al)), interval '1 day') d
  where o.palestra_id = p_palestra and o.attivo
    and (p_orario is null or o.id = p_orario)
    and extract(isodow from d) = o.giorno_settimana
    and not exists (select 1 from chiusure ch where ch.palestra_id = o.palestra_id and d::date between ch.dal and ch.al)
  on conflict (orario_id, data) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Orario modificato: anche le lezioni future già occupate seguono sala,
-- insegnante e prenotabilità
create or replace function trg_orari_lezioni()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    delete from lezioni l
    where l.orario_id = new.id and l.inizio > now()
      and not exists (select 1 from prove pr where pr.lezione_id = l.id)
      and not exists (select 1 from prenotazioni pn where pn.lezione_id = l.id)
      and not exists (select 1 from presenze ps where ps.lezione_id = l.id);
    update lezioni set insegnante_id = new.insegnante_id, sala_id = new.sala_id, prenotabile = new.prenotabile
    where orario_id = new.id and inizio > now();
  end if;
  if new.attivo then
    perform genera_lezioni(new.palestra_id, current_date, current_date + 90, new.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Il palinsesto
-- ---------------------------------------------------------------------
do $$
declare
  p           palestre;
  v_inizio    timestamptz := now();
  n_vecchi    int; n_persone int; n_affitti int;
  v_mancanti  text;
  v_sala_affitti uuid;
  d           date;
  af          record;
begin
  select * into p from palestre where slug = 'rmhouse';
  if not found then raise exception 'Palestra rmhouse non trovata'; end if;
  if to_regclass('public.corsi_insegnanti') is null then
    raise exception 'Esegui prima la 027_nuova_struttura.sql';
  end if;

  create temp table _orari_veri (giorno int, inizio text, fine text, corso text, sala text,
                                 insegnante text, prenotabile boolean) on commit drop;
  insert into _orari_veri values
      (1, '16:30', '17:30', 'Danza classica young', 'Sala Danza', null, false),
      (1, '17:30', '18:30', 'Hip Hop Teen', 'Sala Danza', 'Liuda Kostetska', true),
      (1, '18:30', '19:30', 'Heels', 'Sala Danza', 'Liuda Kostetska', true),
      (1, '19:30', '20:30', 'Heels liv. 2', 'Sala Danza', 'Liuda Kostetska', true),
      (1, '20:30', '21:30', 'Hip Hop adulti', 'Sala Danza', 'Liuda Kostetska', true),
      (2, '19:00', '19:45', 'Shaolin Kung Fu 1', 'Sala Danza', 'Gianfranco Mezzalira', true),
      (2, '19:45', '20:30', 'Tai Chi', 'Sala Danza', 'Gianfranco Mezzalira', true),
      (2, '20:30', '21:15', 'Shaolin Kung Fu 2', 'Sala Danza', 'Gianfranco Mezzalira', true),
      (3, '16:30', '17:30', 'Hip Hop Kids', 'Sala Danza', 'Alessia Pauletto', true),
      (3, '17:30', '18:30', 'Hip Hop Teen', 'Sala Danza', 'Alessia Pauletto', true),
      (3, '18:30', '19:30', 'Hip Hop adulti', 'Sala Danza', 'Alessia Pauletto', false),
      (3, '19:30', '21:00', 'Afro', 'Sala Danza', 'John Cedar Momo', true),
      (3, '21:00', '22:00', 'Hip Hop 2', 'Sala Danza', 'John Cedar Momo', true),
      (4, '19:00', '19:45', 'Shaolin Kung Fu 1', 'Sala Danza', 'Gianfranco Mezzalira', true),
      (4, '19:45', '20:30', 'Tai Chi', 'Sala Danza', 'Gianfranco Mezzalira', true),
      (4, '20:30', '21:15', 'Shaolin Kung Fu 2', 'Sala Danza', 'Gianfranco Mezzalira', true),
      (5, '17:30', '19:00', 'Breakdance 2', 'Sala Danza', 'Giuseppe D''Isanto', true),
      (5, '19:00', '20:30', 'Heels', 'Sala Danza', 'Joseph Scarabello', true),
      (5, '20:30', '21:30', 'Hip Hop adulti', 'Sala Danza', 'Joseph Scarabello', false),
      (6, '10:00', '11:00', 'Danza contemporanea amatoriale', 'Sala Danza', 'Annalisa Bannino', false),
      (1, '16:45', '17:45', 'Aerea Kids 1', 'Sala Aerea', null, true),
      (1, '17:45', '18:45', 'Aerea Teen 1', 'Sala Aerea', null, true),
      (1, '18:45', '20:15', 'Aerea adulti 3', 'Sala Aerea', 'Alice Palazzin', true),
      (1, '20:15', '21:45', 'Aerea adulti 1', 'Sala Aerea', 'Alice Palazzin', true),
      (2, '16:45', '17:45', 'Aerea Kids 2', 'Sala Aerea', 'Francesca Brunello', true),
      (2, '17:45', '18:45', 'Aerea Teen 2', 'Sala Aerea', 'Francesca Brunello', true),
      (2, '18:45', '19:45', 'Aerea Teen 3', 'Sala Aerea', 'Francesca Brunello', true),
      (2, '19:45', '20:45', 'Aerea Cerchio 2', 'Sala Aerea', 'Francesca Brunello', true),
      (3, '17:30', '18:30', 'Acrodance / Acrobatica', 'Sala Aerea', 'Giuseppe D''Isanto', false),
      (3, '18:30', '19:30', 'Country Dance', 'Sala Aerea', null, false),
      (3, '19:30', '20:30', 'Country Dance', null, null, false),
      (4, '16:15', '17:00', 'Aerea Mini 5-6', 'Sala Aerea', 'Elena Penzo', false),
      (4, '17:00', '18:00', 'Aerea Kids 1', 'Sala Aerea', 'Elena Penzo', true),
      (4, '18:00', '19:00', 'Aerea Agonismo', 'Sala Aerea', null, true),
      (4, '19:00', '20:30', 'Aerea adulti 2', 'Sala Aerea', 'Elena Penzo', true),
      (5, '16:30', '17:30', 'Aerea Kids 2', 'Sala Aerea', 'Arlette Sandrini', true),
      (5, '16:30', '17:30', 'Breakdance 1', 'Sala Aerea', null, true),
      (5, '17:30', '18:30', 'Aerea Teen 2', 'Sala Aerea', 'Arlette Sandrini', true),
      (5, '18:30', '19:30', 'Aerea Teen 3', 'Sala Aerea', 'Arlette Sandrini', true),
      (5, '19:30', '21:00', 'Aerea Agonismo', 'Sala Aerea', 'Arlette Sandrini', true),
      (6, '09:30', '10:30', 'Antigravity® Liv.1', 'Sala Aerea', 'Eloise Andrade', false),
      (1, '18:30', '19:30', 'Pole Dance Liv.1', 'Sala Pole', 'Eloise Andrade', true),
      (1, '19:30', '20:30', 'Pole Dance Liv.2', 'Sala Pole', 'Eloise Andrade', true),
      (1, '20:30', '21:30', 'Pole Dance Liv.1', 'Sala Pole', null, true),
      (2, '13:00', '14:00', 'Pole Dance Liv.1', 'Sala Pole', 'Liuda Kostetska', true),
      (2, '17:45', '18:45', 'Pole Young 2', 'Sala Pole', 'Liuda Kostetska', true),
      (2, '18:45', '19:45', 'Pole Dance Liv.2', 'Sala Pole', 'Liuda Kostetska', true),
      (2, '19:45', '20:45', 'Pole Dance Liv.3', 'Sala Pole', 'Liuda Kostetska', true),
      (3, '18:30', '19:30', 'Pole Dance Liv.1', 'Sala Pole', 'Eloise Andrade', true),
      (3, '19:30', '20:30', 'Pole Dance Liv.2', 'Sala Pole', 'Eloise Andrade', true),
      (3, '20:30', '21:30', 'Pole Dance Liv.1', 'Sala Pole', 'Eloise Andrade', false),
      (4, '13:00', '14:00', 'Pole Dance Liv.1', 'Sala Pole', 'Liuda Kostetska', true),
      (4, '17:45', '18:45', 'Pole Young 2', 'Sala Pole', 'Liuda Kostetska', true),
      (4, '18:45', '19:45', 'Pole Dance Liv.2', 'Sala Pole', 'Liuda Kostetska', true),
      (4, '19:45', '20:45', 'Pole Dance Liv.3', 'Sala Pole', 'Liuda Kostetska', true),
      (4, '20:45', '21:45', 'Pole Dance Liv.1', 'Sala Pole', 'Liuda Kostetska', true),
      (5, '18:30', '19:30', 'Pole Dance Liv.1', 'Sala Pole', 'Liuda Kostetska', false),
      (5, '19:30', '20:30', 'Flexy', 'Sala Pole', 'Liuda Kostetska', false),
      (6, '10:30', '11:30', 'Flexy', 'Sala Pole', 'Eloise Andrade', false),
      (6, '11:30', '12:30', 'Pole Dance Liv.1', 'Sala Pole', 'Eloise Andrade', false),
      (2, '18:30', '19:30', 'Antigravity® Liv.2', 'Sala Yoga', 'Erika Bonfanti', true),
      (2, '19:40', '20:40', 'Antigravity® Liv.1', 'Sala Yoga', 'Erika Bonfanti', true),
      (3, '19:45', '20:45', 'Danza classica amatoriale', 'Sala Yoga', 'Cristina Tommaselli', false),
      (4, '18:30', '19:30', 'Antigravity® Liv.1', 'Sala Yoga', null, true),
      (4, '19:40', '20:40', 'Antigravity® Liv.2', 'Sala Yoga', null, true),
      (4, '21:00', '22:00', 'Burlesque Liv.1', 'Sala Yoga', 'Silvia "Pocket Girl" Fontanari', true),
      (5, '16:30', '17:15', 'Hip Hop Mini 5-6 anni', 'Sala Yoga', 'Alessia Pauletto', false),
      (5, '17:30', '18:30', 'Hip Hop Kids', 'Sala Yoga', null, true),
      (5, '18:30', '19:30', 'K Pop', 'Sala Yoga', 'Sara Kolkaku', false),
      (5, '19:30', '20:30', 'Danza contemporanea amatoriale', 'Sala Yoga', 'Annalisa Bannino', false),
      (5, '17:00', '18:00', 'Pilates', null, null, false),
      (3, '16:30', '17:30', 'Aerea Kids Bolzano Vicentino', 'Sala Bolzano Vicentino', 'Silvia Passaggi', false),
      (3, '17:30', '19:00', 'Aerea Teen Bolzano Vicentino', 'Sala Bolzano Vicentino', 'Silvia Passaggi', false);

  -- controlli: ogni corso, sala e insegnante deve esistere, altrimenti ci si ferma
  select string_agg(distinct corso, ', ') into v_mancanti from _orari_veri ov
   where not exists (select 1 from corsi c where c.palestra_id = p.id and c.nome = ov.corso);
  if v_mancanti is not null then raise exception 'Corsi non trovati: %', v_mancanti; end if;
  select string_agg(distinct sala, ', ') into v_mancanti from _orari_veri ov
   where ov.sala is not null and not exists (select 1 from sale s where s.palestra_id = p.id and s.nome = ov.sala);
  if v_mancanti is not null then raise exception 'Sale non trovate: %', v_mancanti; end if;
  select string_agg(distinct insegnante, ', ') into v_mancanti from _orari_veri ov
   where ov.insegnante is not null and not exists
     (select 1 from staff s where s.palestra_id = p.id and trim(s.nome || ' ' || coalesce(s.cognome, '')) = ov.insegnante);
  if v_mancanti is not null then raise exception 'Insegnanti non trovati: %', v_mancanti; end if;

  -- fotografia di prima
  create temp table _vecchi_orari on commit drop as select id from orari where palestra_id = p.id;
  create temp table _vecchie_lezioni on commit drop as
    select id, corso_id, data from lezioni where palestra_id = p.id and orario_id in (select id from _vecchi_orari);
  select count(*) into n_vecchi from _vecchi_orari;

  -- nuovi orari (validi da tre mesi fa, per poter ricollegare lo storico)
  create temp table _orari_nuovi on commit drop as select id from orari where false;
  with ins as (
    insert into orari (palestra_id, corso_id, giorno_settimana, ora_inizio, durata_min, sala_id,
                       insegnante_id, prenotabile, valido_dal)
    select p.id,
           (select id from corsi c where c.palestra_id = p.id and c.nome = ov.corso),
           ov.giorno, ov.inizio::time,
           (extract(epoch from (ov.fine::time - ov.inizio::time)) / 60)::int,
           (select id from sale s where s.palestra_id = p.id and s.nome = ov.sala),
           (select id from staff s where s.palestra_id = p.id
              and trim(s.nome || ' ' || coalesce(s.cognome, '')) = ov.insegnante limit 1),
           ov.prenotabile, current_date - 90
    from _orari_veri ov
    returning id
  )
  insert into _orari_nuovi select id from ins;

  perform genera_lezioni(p.id, current_date - 90, current_date + 90);

  -- chi insegna davvero un corso diventa abilitato su quel corso
  insert into corsi_insegnanti (corso_id, staff_id, palestra_id)
  select distinct o.corso_id, o.insegnante_id, p.id
  from orari o where o.id in (select id from _orari_nuovi) and o.insegnante_id is not null
  on conflict do nothing;

  -- -------------------------------------------------------------------
  -- Ricollegamento delle persone
  -- -------------------------------------------------------------------
  -- corsi che adesso hanno orari veri
  create temp table _corsi_con_orari on commit drop as
    select distinct corso_id as id from orari where id in (select id from _orari_nuovi);

  -- chi è su un corso rimasto senza orari passa a un corso adatto all'età
  create temp table _mappa on commit drop as
  with coinvolti as (
    select allievo_id, corso_id from iscrizioni
     where palestra_id = p.id and corso_id not in (select id from _corsi_con_orari)
       and id in (select iscrizione_id from iscrizioni_orari)
    union
    select allievo_id, corso_id from prove
     where palestra_id = p.id and corso_id not in (select id from _corsi_con_orari)
  ),
  candidati as (
    select c.id, f.eta_min, coalesce(f.eta_max, 200) as eta_max
    from corsi c join fasce_eta f on f.id = c.fascia_eta_id
    where c.id in (select id from _corsi_con_orari)
      and c.visibilita = 'pubblico'
      and c.sede_id = (select id from sedi where palestra_id = p.id and principale order by ordine limit 1)
  )
  select distinct a.id as allievo_id, co.corso_id as vecchio,
         coalesce(
           (select c.id from candidati c
             where extract(year from age(current_date, a.data_nascita)) between c.eta_min and c.eta_max
             order by md5(c.id::text || a.id::text) limit 1),
           (select c.id from candidati c order by md5(c.id::text || a.id::text) limit 1)
         ) as nuovo
  from coinvolti co join allievi a on a.id = co.allievo_id;
  select count(distinct allievo_id) into n_persone from _mappa;

  -- memorie prima di toccare le lezioni
  create temp table _iscr_con_orari on commit drop as
    select distinct iscrizione_id from iscrizioni_orari
     where orario_id in (select id from _vecchi_orari);
  create temp table _presenze_prove on commit drop as
    select pr.id as prova_id, ps.presente
    from prove pr join presenze ps on ps.lezione_id = pr.lezione_id and ps.allievo_id = pr.allievo_id
    where pr.lezione_id in (select id from _vecchie_lezioni);
  create temp table _con_presenze on commit drop as
    select distinct allievo_id from presenze where lezione_id in (select id from _vecchie_lezioni);

  -- iscrizioni e prove sui corsi rimasti senza orari
  update iscrizioni i set corso_id = m.nuovo
    from _mappa m where i.allievo_id = m.allievo_id and i.corso_id = m.vecchio;
  update prove pr set corso_id = m.nuovo
    from _mappa m where pr.allievo_id = m.allievo_id and pr.corso_id = m.vecchio;
  update pagamenti pg set corso_id = i.corso_id
    from iscrizioni i where i.pagamento_id = pg.id and pg.corso_id is distinct from i.corso_id;
  update pagamenti pg set corso_id = pr.corso_id
    from prove pr where pr.pagamento_id = pg.id and pg.corso_id is distinct from pr.corso_id;
  insert into lead_eventi (palestra_id, allievo_id, corso_id, evento, created_at)
  select le.palestra_id, le.allievo_id, m.nuovo, le.evento, le.created_at
  from lead_eventi le join _mappa m on m.allievo_id = le.allievo_id and le.corso_id = m.vecchio
  on conflict do nothing;
  delete from lead_eventi le using _mappa m where le.allievo_id = m.allievo_id and le.corso_id = m.vecchio;

  -- prove: sulla lezione nuova del loro corso più vicina alla data originale
  update prove pr set lezione_id = (
      select l.id from lezioni l
       where l.corso_id = pr.corso_id and l.orario_id in (select id from _orari_nuovi)
       order by abs(l.data - vl.data), l.data limit 1)
  from _vecchie_lezioni vl
  where vl.id = pr.lezione_id;

  -- orari frequentati: tanti quanti ne prevede l'abbonamento (almeno uno)
  delete from iscrizioni_orari where iscrizione_id in (select iscrizione_id from _iscr_con_orari);
  insert into iscrizioni_orari (iscrizione_id, orario_id)
  select x.iscrizione_id, x.orario_id from (
    select i.id as iscrizione_id, o.id as orario_id,
           row_number() over (partition by i.id order by md5(o.id::text || i.id::text)) as n,
           greatest(coalesce(t.lezioni_settimanali, 1), 1) as quanti
    from iscrizioni i
    join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
    join orari o on o.corso_id = i.corso_id and o.id in (select id from _orari_nuovi)
    where i.id in (select iscrizione_id from _iscr_con_orari)
  ) x where x.n <= x.quanti;

  -- via le vecchie lezioni e i vecchi orari
  delete from lezioni where id in (select id from _vecchie_lezioni);
  delete from orari where id in (select id from _vecchi_orari);

  -- presenze delle prove già fatte, sulla lezione nuova
  insert into presenze (palestra_id, lezione_id, allievo_id, presente)
  select pr.palestra_id, pr.lezione_id, pr.allievo_id, pp.presente
  from _presenze_prove pp join prove pr on pr.id = pp.prova_id
  where pr.lezione_id is not null
  on conflict do nothing;

  -- presenze degli iscritti nelle lezioni già passate (solo per chi ne aveva)
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

  -- -------------------------------------------------------------------
  -- Affitti fissi della Sala Aerea, per le prossime 13 settimane
  -- (si rifanno da capo ogni volta che si esegue questa migrazione)
  -- -------------------------------------------------------------------
  delete from prenotazioni_spazi
   where palestra_id = p.id and note_interne = 'Affitto fisso da APP Palestre' and inizio >= current_date;

  create temp table _affitti (giorno int, inizio text, fine text, sala text) on commit drop;
  insert into _affitti values
      (2, '20:45', '21:45', 'Sala Aerea'),
      (2, '21:45', '22:45', 'Sala Aerea'),
      (3, '20:40', '21:40', 'Sala Aerea'),
      (3, '21:40', '22:40', 'Sala Aerea'),
      (4, '20:40', '21:40', 'Sala Aerea'),
      (4, '21:40', '22:40', 'Sala Aerea');

  for d in select g::date from generate_series(current_date, current_date + 90, interval '1 day') g loop
    for af in select * from _affitti where giorno = extract(isodow from d) loop
      insert into prenotazioni_spazi (palestra_id, sala_id, tipo, titolo, contatto_nome, inizio, fine,
                                      stato, prezzo_cent, note_interne, origine)
      values (p.id, (select id from sale where palestra_id = p.id and nome = af.sala), 'noleggio',
              'Affitto sala', 'Da completare',
              (d + af.inizio::time) at time zone p.fuso_orario,
              (d + af.fine::time) at time zone p.fuso_orario,
              'confermata', 0, 'Affitto fisso da APP Palestre', 'segreteria');
    end loop;
  end loop;
  select count(*) into n_affitti from prenotazioni_spazi
   where palestra_id = p.id and note_interne = 'Affitto fisso da APP Palestre' and inizio >= current_date;

  -- nessuna email deve partire per effetto di questo spostamento
  update messaggi_coda set stato = 'annullato'
   where palestra_id = p.id and stato = 'in_coda' and created_at >= v_inizio;

  raise notice 'Fatto: % orari provvisori sostituiti da %, % persone spostate su un altro corso, % affitti in calendario.',
    n_vecchi, (select count(*) from _orari_nuovi), n_persone, n_affitti;
end $$;

-- Riepilogo per sala
select coalesce(s.nome, '(senza sala)') as sala, count(*) as orari_settimanali,
       count(*) filter (where not o.prenotabile) as non_prenotabili,
       count(*) filter (where o.insegnante_id is null) as senza_insegnante
from orari o left join sale s on s.id = o.sala_id
where o.palestra_id = (select id from palestre where slug = 'rmhouse')
group by 1 order by 1;
