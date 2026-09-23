-- =====================================================================
-- RMHouse — 007 COSTI E STATISTICHE
-- Aggiunge fornitori, spese, compensi e affitti, più le funzioni che
-- alimentano il calendario e il cruscotto statistiche.
-- Da eseguire dopo 001/002/seed/004/005/006.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COSTI
-- ---------------------------------------------------------------------
alter table staff add column if not exists compenso_ora_cent int;   -- quanto costa un'ora di lezione
alter table sale  add column if not exists costo_ora_cent int;      -- affitto/uso imputato all'ora

create table if not exists fornitori (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,
  categoria    text not null default 'altro',
  referente    text,
  email        text,
  telefono     text,
  note         text,
  attivo       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (palestra_id, nome)
);

create table if not exists spese (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  descrizione   text not null,
  categoria     text not null default 'altro'
                check (categoria in ('affitto','utenze','compensi','marketing','materiali','assicurazioni','software','manutenzione','tasse','altro')),
  importo_cent  int  not null check (importo_cent >= 0),
  data          date not null default current_date,
  fornitore_id  uuid references fornitori(id) on delete set null,
  sala_id       uuid references sale(id) on delete set null,
  corso_id      uuid references corsi(id) on delete set null,   -- se il costo è di un corso preciso
  periodicita   text not null default 'una_tantum'
                check (periodicita in ('una_tantum','mensile','bimestrale','trimestrale','annuale')),
  pagata        boolean not null default true,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists spese_periodo_idx on spese (palestra_id, data);

do $$ declare t text;
begin
  foreach t in array array['fornitori','spese'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_legge on %I', t);
    execute format('create policy staff_legge on %I for select to authenticated using (is_gestione(palestra_id))', t);
    execute format('drop policy if exists gestione_scrive on %I', t);
    execute format('create policy gestione_scrive on %I for all to authenticated using (is_gestione(palestra_id)) with check (is_gestione(palestra_id))', t);
  end loop;
end $$;

-- Costo mensile equivalente di una spesa ricorrente
create or replace function costo_mensile(p_importo int, p_periodicita text)
returns numeric language sql immutable as $$
  select case p_periodicita
    when 'mensile' then p_importo::numeric
    when 'bimestrale' then p_importo / 2.0
    when 'trimestrale' then p_importo / 3.0
    when 'annuale' then p_importo / 12.0
    else 0 end;
$$;

-- ---------------------------------------------------------------------
-- 2. OCCUPAZIONE: quanto sono piene le lezioni
-- ---------------------------------------------------------------------
create or replace view v_occupazione with (security_invoker = true) as
  select l.id as lezione_id, l.palestra_id, l.corso_id, l.data, l.inizio, l.fine, l.stato,
         l.insegnante_id, l.sala_id,
         c.nome as corso_nome, coalesce(c.capienza, s.capienza) as capienza,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') as iscritti,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo = 'prova') as prove,
         (select count(*) from presenze ps where ps.lezione_id = l.id and ps.presente) as presenti,
         (select count(*) from presenze ps where ps.lezione_id = l.id and not ps.presente) as assenti,
         round(extract(epoch from (l.fine - l.inizio)) / 3600.0, 2) as ore
  from lezioni l
  join corsi c on c.id = l.corso_id
  left join sale s on s.id = l.sala_id;

-- ---------------------------------------------------------------------
-- 3. ECONOMIA PER CORSO
--    Ricavi = abbonamenti attivi nel periodo (prezzo - sconto) + prove pagate
--    Costi  = ore di lezione × compenso insegnante + ore × costo sala + spese del corso
-- ---------------------------------------------------------------------
create or replace function economia_corsi(p_palestra uuid, p_dal date, p_al date)
returns table (
  corso_id uuid, corso text, categoria text, iscritti bigint,
  ore numeric, riempimento_pct numeric, presenza_pct numeric,
  ricavi_cent bigint, costo_insegnanti_cent bigint, costo_sale_cent bigint,
  altre_spese_cent bigint, margine_cent bigint, margine_pct numeric
) language sql stable security invoker as $$
  with lez as (
    select o.corso_id, o.ore, o.iscritti, o.capienza, o.presenti, o.assenti,
           o.ore * coalesce(st.compenso_ora_cent, 0) as costo_ins,
           o.ore * coalesce(sa.costo_ora_cent, 0) as costo_sala
    from v_occupazione o
    left join staff st on st.id = o.insegnante_id
    left join sale sa on sa.id = o.sala_id
    where o.palestra_id = p_palestra and o.stato = 'programmata' and o.data between p_dal and p_al
  ),
  ric as (
    select i.corso_id,
           sum(greatest(ta.prezzo_cent - i.sconto_cent, 0))::bigint as abbonamenti
    from iscrizioni i join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id
    where i.palestra_id = p_palestra and i.stato <> 'annullata'
      and i.data_inizio <= p_al and i.data_fine >= p_dal
    group by i.corso_id
  ),
  prv as (
    select pr.corso_id, sum(pr.prezzo_cent)::bigint as prove
    from prove pr where pr.palestra_id = p_palestra and pr.stato in ('presente','confermata')
      and pr.created_at::date between p_dal and p_al
    group by pr.corso_id
  ),
  sp as (
    select s.corso_id, sum(s.importo_cent)::bigint as spese
    from spese s where s.palestra_id = p_palestra and s.corso_id is not null and s.data between p_dal and p_al
    group by s.corso_id
  )
  select c.id, c.nome, cat.nome,
         (select count(*) from iscrizioni i2 where i2.corso_id = c.id and i2.stato = 'attiva')::bigint,
         coalesce(round(sum(lez.ore), 1), 0),
         case when sum(lez.capienza) > 0 then round(100.0 * sum(lez.iscritti) / sum(lez.capienza), 1) end,
         case when sum(lez.presenti + lez.assenti) > 0
              then round(100.0 * sum(lez.presenti) / sum(lez.presenti + lez.assenti), 1) end,
         (coalesce(max(ric.abbonamenti), 0) + coalesce(max(prv.prove), 0))::bigint,
         coalesce(round(sum(lez.costo_ins)), 0)::bigint,
         coalesce(round(sum(lez.costo_sala)), 0)::bigint,
         coalesce(max(sp.spese), 0)::bigint,
         (coalesce(max(ric.abbonamenti), 0) + coalesce(max(prv.prove), 0)
          - coalesce(round(sum(lez.costo_ins)), 0) - coalesce(round(sum(lez.costo_sala)), 0)
          - coalesce(max(sp.spese), 0))::bigint,
         case when coalesce(max(ric.abbonamenti), 0) + coalesce(max(prv.prove), 0) > 0
              then round(100.0 * (coalesce(max(ric.abbonamenti), 0) + coalesce(max(prv.prove), 0)
                   - coalesce(round(sum(lez.costo_ins)), 0) - coalesce(round(sum(lez.costo_sala)), 0)
                   - coalesce(max(sp.spese), 0))
                   / (coalesce(max(ric.abbonamenti), 0) + coalesce(max(prv.prove), 0)), 1) end
  from corsi c
  left join discipline d on d.id = c.disciplina_id
  left join categorie cat on cat.id = d.categoria_id
  left join lez on lez.corso_id = c.id
  left join ric on ric.corso_id = c.id
  left join prv on prv.corso_id = c.id
  left join sp  on sp.corso_id = c.id
  where c.palestra_id = p_palestra and c.attivo
  group by c.id, c.nome, cat.nome
  order by 11 desc;
$$;

-- ---------------------------------------------------------------------
-- 4. ANDAMENTO MENSILE: iscritti, nuovi, persi, abbandono, ricavi
-- ---------------------------------------------------------------------
create or replace function andamento_mensile(p_palestra uuid, p_mesi int default 12)
returns table (
  mese date, iscritti_attivi bigint, nuovi bigint, cessati bigint, abbandono_pct numeric,
  ricavi_cent bigint, costi_cent bigint, presenza_pct numeric, riempimento_pct numeric, prove bigint
) language sql stable security invoker as $$
  with mesi as (
    select generate_series(date_trunc('month', current_date) - make_interval(months => p_mesi - 1),
                           date_trunc('month', current_date), interval '1 month')::date as m
  )
  select m.m,
    (select count(distinct i.allievo_id) from iscrizioni i
      where i.palestra_id = p_palestra and i.stato <> 'annullata'
        and i.data_inizio <= (m.m + interval '1 month - 1 day')::date and i.data_fine >= m.m),
    (select count(distinct i.allievo_id) from iscrizioni i
      where i.palestra_id = p_palestra and date_trunc('month', i.data_inizio)::date = m.m
        and not exists (select 1 from iscrizioni i2 where i2.allievo_id = i.allievo_id and i2.data_inizio < i.data_inizio)),
    (select count(distinct i.allievo_id) from iscrizioni i
      where i.palestra_id = p_palestra and i.stato <> 'annullata'
        and date_trunc('month', i.data_fine)::date = m.m
        and not exists (select 1 from iscrizioni i2 where i2.allievo_id = i.allievo_id and i2.data_inizio > i.data_fine)),
    null::numeric,
    (select coalesce(sum(greatest(ta.prezzo_cent - i.sconto_cent, 0)), 0)::bigint
       from iscrizioni i join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id
      where i.palestra_id = p_palestra and i.stato <> 'annullata'
        and date_trunc('month', i.data_inizio)::date = m.m),
    (select coalesce(round(sum(costo_mensile(s.importo_cent, s.periodicita)))
              + coalesce(sum(case when s.periodicita = 'una_tantum'
                                  and date_trunc('month', s.data)::date = m.m then s.importo_cent else 0 end), 0), 0)::bigint
       from spese s where s.palestra_id = p_palestra and s.data <= (m.m + interval '1 month - 1 day')::date),
    (select case when count(*) > 0 then round(100.0 * count(*) filter (where ps.presente) / count(*), 1) end
       from presenze ps join lezioni l on l.id = ps.lezione_id
      where ps.palestra_id = p_palestra and date_trunc('month', l.data)::date = m.m),
    (select case when sum(o.capienza) > 0 then round(100.0 * sum(o.iscritti) / sum(o.capienza), 1) end
       from v_occupazione o
      where o.palestra_id = p_palestra and o.stato = 'programmata' and date_trunc('month', o.data)::date = m.m),
    (select count(*) from prove pr where pr.palestra_id = p_palestra
       and date_trunc('month', pr.created_at)::date = m.m)
  from mesi m order by m.m;
$$;

-- ---------------------------------------------------------------------
-- 5. INSEGNANTI E SALE
-- ---------------------------------------------------------------------
create or replace function statistiche_insegnanti(p_palestra uuid, p_dal date, p_al date)
returns table (
  insegnante_id uuid, insegnante text, lezioni bigint, ore numeric, allievi_medi numeric,
  riempimento_pct numeric, presenza_pct numeric, costo_cent bigint, ricavo_per_ora_cent bigint
) language sql stable security invoker as $$
  select st.id, (st.nome || ' ' || coalesce(st.cognome, '')),
         count(o.lezione_id), round(coalesce(sum(o.ore), 0), 1),
         round(avg(o.iscritti), 1),
         case when sum(o.capienza) > 0 then round(100.0 * sum(o.iscritti) / sum(o.capienza), 1) end,
         case when sum(o.presenti + o.assenti) > 0 then round(100.0 * sum(o.presenti) / sum(o.presenti + o.assenti), 1) end,
         round(coalesce(sum(o.ore * coalesce(st.compenso_ora_cent, 0)), 0))::bigint,
         null::bigint
  from staff st
  left join v_occupazione o on o.insegnante_id = st.id and o.data between p_dal and p_al and o.stato = 'programmata'
  where st.palestra_id = p_palestra and st.ruolo = 'insegnante' and st.attivo
  group by st.id, st.nome, st.cognome
  order by 3 desc;
$$;

create or replace function statistiche_sale(p_palestra uuid, p_dal date, p_al date)
returns table (
  sala_id uuid, sala text, capienza int, lezioni bigint, ore numeric,
  riempimento_pct numeric, costo_cent bigint, ore_settimana numeric
) language sql stable security invoker as $$
  select s.id, s.nome, s.capienza, count(o.lezione_id), round(coalesce(sum(o.ore), 0), 1),
         case when sum(o.capienza) > 0 then round(100.0 * sum(o.iscritti) / sum(o.capienza), 1) end,
         round(coalesce(sum(o.ore * coalesce(s.costo_ora_cent, 0)), 0))::bigint,
         round(coalesce(sum(o.ore), 0) / greatest((p_al - p_dal + 1) / 7.0, 1), 1)
  from sale s
  left join v_occupazione o on o.sala_id = s.id and o.data between p_dal and p_al and o.stato = 'programmata'
  where s.palestra_id = p_palestra
  group by s.id, s.nome, s.capienza
  order by 5 desc;
$$;

-- ---------------------------------------------------------------------
-- 6. CRUSCOTTO: i numeri chiave del periodo
-- ---------------------------------------------------------------------
create or replace function cruscotto(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker as $$
  with
  isc as (select count(*) n, count(distinct allievo_id) persone from iscrizioni
           where palestra_id = p_palestra and stato = 'attiva' and data_fine >= current_date),
  nuovi as (select count(distinct i.allievo_id) n from iscrizioni i
             where i.palestra_id = p_palestra and i.data_inizio between p_dal and p_al
               and not exists (select 1 from iscrizioni i2 where i2.allievo_id = i.allievo_id and i2.data_inizio < i.data_inizio)),
  cess as (select count(distinct i.allievo_id) n from iscrizioni i
            where i.palestra_id = p_palestra and i.stato <> 'annullata' and i.data_fine between p_dal and p_al
              and not exists (select 1 from iscrizioni i2 where i2.allievo_id = i.allievo_id and i2.data_inizio > i.data_fine)),
  occ as (select coalesce(sum(iscritti), 0) i, coalesce(sum(capienza), 0) c, count(*) lezioni, coalesce(sum(ore), 0) ore
           from v_occupazione where palestra_id = p_palestra and stato = 'programmata' and data between p_dal and p_al),
  pres as (select count(*) filter (where ps.presente) si, count(*) tot
            from presenze ps join lezioni l on l.id = ps.lezione_id
           where ps.palestra_id = p_palestra and l.data between p_dal and p_al),
  funnel as (select
      count(distinct allievo_id) filter (where evento = 'richiesta') richieste,
      count(distinct allievo_id) filter (where evento = 'prova_effettuata') prove,
      count(distinct allievo_id) filter (where evento = 'iscritto') iscritti
    from lead_eventi where palestra_id = p_palestra and created_at::date between p_dal and p_al),
  ricavi as (select coalesce(sum(greatest(ta.prezzo_cent - i.sconto_cent, 0)), 0) abb
              from iscrizioni i join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id
             where i.palestra_id = p_palestra and i.stato <> 'annullata' and i.data_inizio between p_dal and p_al),
  quote as (select coalesce(sum(importo_cent), 0) q from quote_iscrizione
             where palestra_id = p_palestra and data between p_dal and p_al),
  costi as (select
      coalesce(sum(case when periodicita = 'una_tantum' and data between p_dal and p_al then importo_cent else 0 end), 0)
      + coalesce(round(sum(case when periodicita <> 'una_tantum' and data <= p_al
                           then costo_mensile(importo_cent, periodicita) * ((p_al - p_dal + 1) / 30.0) else 0 end)), 0) tot,
      coalesce(round(sum(case when categoria = 'affitto' and data <= p_al
                         then costo_mensile(importo_cent, periodicita) * ((p_al - p_dal + 1) / 30.0) else 0 end)), 0) affitto
    from spese where palestra_id = p_palestra),
  compensi as (select coalesce(round(sum(o.ore * coalesce(st.compenso_ora_cent, 0))), 0) tot
                from v_occupazione o join staff st on st.id = o.insegnante_id
               where o.palestra_id = p_palestra and o.stato = 'programmata' and o.data between p_dal and p_al),
  certificati as (select count(*) n from allievi a
                   where a.palestra_id = p_palestra
                     and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva')
                     and (a.certificato_scadenza is null or a.certificato_scadenza < current_date)),
  scadenze as (select count(*) n from iscrizioni
                where palestra_id = p_palestra and stato = 'attiva'
                  and data_fine between current_date and current_date + 14)
  select jsonb_build_object(
    'iscrizioni_attive', (select n from isc),
    'persone_attive', (select persone from isc),
    'nuovi', (select n from nuovi),
    'cessati', (select n from cess),
    'abbandono_pct', case when (select persone from isc) + (select n from cess) > 0
       then round(100.0 * (select n from cess) / ((select persone from isc) + (select n from cess)), 1) end,
    'lezioni', (select lezioni from occ),
    'ore', (select ore from occ),
    'riempimento_pct', case when (select c from occ) > 0 then round(100.0 * (select i from occ) / (select c from occ), 1) end,
    'posti_vuoti', greatest((select c from occ) - (select i from occ), 0),
    'presenza_pct', case when (select tot from pres) > 0 then round(100.0 * (select si from pres) / (select tot from pres), 1) end,
    'richieste', (select richieste from funnel),
    'prove_effettuate', (select prove from funnel),
    'nuovi_iscritti_funnel', (select iscritti from funnel),
    'conversione_pct', case when (select prove from funnel) > 0
       then round(100.0 * (select iscritti from funnel) / (select prove from funnel), 1) end,
    'ricavi_cent', (select abb from ricavi) + (select q from quote),
    'costi_cent', (select tot from costi) + (select tot from compensi),
    'affitto_cent', (select affitto from costi),
    'compensi_cent', (select tot from compensi),
    'margine_cent', (select abb from ricavi) + (select q from quote) - (select tot from costi) - (select tot from compensi),
    'incidenza_affitto_pct', case when (select abb from ricavi) + (select q from quote) > 0
       then round(100.0 * (select affitto from costi) / ((select abb from ricavi) + (select q from quote)), 1) end,
    'incidenza_compensi_pct', case when (select abb from ricavi) + (select q from quote) > 0
       then round(100.0 * (select tot from compensi) / ((select abb from ricavi) + (select q from quote)), 1) end,
    'ricavo_per_persona_cent', case when (select persone from isc) > 0
       then round(((select abb from ricavi) + (select q from quote)) / (select persone from isc)) end,
    'certificati_scaduti', (select n from certificati),
    'in_scadenza_15gg', (select n from scadenze)
  );
$$;

-- Distribuzione degli iscritti per fascia d'età e categoria (per i grafici)
create or replace function distribuzione_iscritti(p_palestra uuid)
returns table (tipo text, etichetta text, valore bigint) language sql stable security invoker as $$
  select 'fascia', f.nome, count(distinct i.allievo_id)
    from iscrizioni i join corsi c on c.id = i.corso_id join fasce_eta f on f.id = c.fascia_eta_id
   where i.palestra_id = p_palestra and i.stato = 'attiva' group by f.nome, f.ordine
  union all
  select 'categoria', coalesce(cat.nome, 'Senza categoria'), count(distinct i.allievo_id)
    from iscrizioni i join corsi c on c.id = i.corso_id
    join discipline d on d.id = c.disciplina_id left join categorie cat on cat.id = d.categoria_id
   where i.palestra_id = p_palestra and i.stato = 'attiva' group by cat.nome
  union all
  select 'fonte', coalesce(acc.fonte, 'non indicata'), count(distinct a.id)
    from allievi a join account acc on acc.id = a.account_id
   where a.palestra_id = p_palestra and a.stato_lead in ('iscritto', 'prova_effettuata') group by acc.fonte;
$$;
