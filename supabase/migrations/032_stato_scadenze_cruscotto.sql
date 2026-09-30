-- =====================================================================
-- RMHouse — 032 STATO DEI CLIENTI, ETICHETTE, SCADENZE, CRUSCOTTO
--
-- 1. Soglie dello stato cliente, regolabili (Conti → Abbonamenti → Impostazioni)
-- 2. Etichette libere sulle persone
-- 3. v_periodi: tutti i periodi di abbonamento di una persona, sia quelli
--    fatti in RMHouse sia lo storico di APP Palestre
-- 4. v_stato_clienti: per ogni persona lo stato calcolato (iscritto, in
--    scadenza, non ha rinnovato, perso, rientrato…) e i campanelli
--    (certificato, quota, compleanno, orari da assegnare)
-- 5. v_scadenze: abbonamenti, ingressi, certificati e quote in scadenza,
--    con il segno "gestito" messo dalla segreteria
-- 6. cruscotto(): i numeri della pagina iniziale in una sola chiamata
-- Non tocca nessun dato esistente. Si può rieseguire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Soglie
-- ---------------------------------------------------------------------
alter table palestre add column if not exists soglie jsonb not null default '{}'::jsonb;

create or replace function soglia(p_soglie jsonb, p_chiave text)
returns int language sql immutable as $$
  select coalesce((p_soglie ->> p_chiave)::int, case p_chiave
    when 'fedele_mesi' then 3            -- iscritto da almeno N mesi
    when 'in_scadenza_giorni' then 10    -- scade entro N giorni
    when 'esaurimento_ingressi' then 2   -- restano N ingressi o meno
    when 'perso_giorni' then 30          -- scaduto da più di N giorni = perso
    when 'inattivo_giorni' then 14       -- nessuna presenza da N giorni
    when 'rientro_giorni' then 60        -- tornato dopo una pausa di N giorni
    else null end);
$$;

-- ---------------------------------------------------------------------
-- 2. Etichette
-- ---------------------------------------------------------------------
create table if not exists etichette (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,
  colore       text,
  created_at   timestamptz not null default now(),
  unique (palestra_id, nome)
);
create table if not exists allievi_etichette (
  allievo_id    uuid not null references allievi(id) on delete cascade,
  etichetta_id  uuid not null references etichette(id) on delete cascade,
  palestra_id   uuid not null references palestre(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (allievo_id, etichetta_id)
);
create index if not exists allievi_etichette_etichetta on allievi_etichette (etichetta_id);

alter table etichette enable row level security;
alter table allievi_etichette enable row level security;
drop policy if exists staff_legge on etichette;
create policy staff_legge on etichette for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on etichette;
create policy gestione_scrive on etichette for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists staff_legge on allievi_etichette;
create policy staff_legge on allievi_etichette for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on allievi_etichette;
create policy gestione_scrive on allievi_etichette for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Scadenze già gestite (telefonato, scritto, rinnovato fuori…)
create table if not exists scadenze_gestite (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  allievo_id   uuid not null references allievi(id) on delete cascade,
  tipo         text not null,
  riferimento  text not null,
  nota         text,
  gestito_da   uuid references auth.users(id) on delete set null,
  gestito_at   timestamptz not null default now(),
  unique (allievo_id, tipo, riferimento)
);
alter table scadenze_gestite enable row level security;
drop policy if exists gestione_tutto on scadenze_gestite;
create policy gestione_tutto on scadenze_gestite for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- ---------------------------------------------------------------------
-- 3. Periodi di abbonamento (RMHouse + storico importato)
-- ---------------------------------------------------------------------
create or replace view v_periodi with (security_invoker = true) as
  select i.palestra_id, i.allievo_id, i.id as iscrizione_id, i.data_inizio as dal, i.data_fine as al,
         (i.stato in ('attiva', 'sospesa')) as viva, i.ingressi_residui, t.modalita::text as modalita,
         t.prezzo_cent, t.nome as abbonamento
  from iscrizioni i join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
  where i.stato <> 'annullata'
  union all
  select st.palestra_id, st.allievo_id, null, st.dal, st.al, false, null, null, st.valore_cent, st.abbonamento
  from storico_abbonamenti st
  where st.iscrizione_id is null and st.allievo_id is not null and st.dal is not null and st.al is not null;

-- ---------------------------------------------------------------------
-- 4. Stato di ogni persona
-- ---------------------------------------------------------------------
drop view if exists v_stato_clienti;
create view v_stato_clienti with (security_invoker = true) as
with per as (
  select allievo_id,
         bool_or(viva and al >= current_date) as attivo,
         min(al) filter (where viva and al >= current_date) as fine_prossima,
         min(ingressi_residui) filter (where viva and al >= current_date and modalita = 'ingressi') as ingressi_min,
         min(dal) as prima_data,
         max(al) as ultima_fine,
         max(dal) filter (where dal <= current_date) as ultimo_inizio
  from v_periodi group by allievo_id
),
pres as (
  select ps.allievo_id, max(l.data) as ultima_presenza
  from presenze ps join lezioni l on l.id = ps.lezione_id
  where ps.presente group by ps.allievo_id
),
quote as (select allievo_id, max(stagione) as stagione, max(data) as ultima_quota from quote_iscrizione group by allievo_id),
senza_orari as (
  select distinct i.allievo_id from iscrizioni i join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
  where i.stato = 'attiva' and i.data_fine >= current_date and t.modalita = 'orari_fissi'
    and not exists (select 1 from iscrizioni_orari io where io.iscrizione_id = i.id)
),
eti as (
  select ae.allievo_id, array_agg(e.id order by e.nome) as etichette_id, array_agg(e.nome order by e.nome) as etichette
  from allievi_etichette ae join etichette e on e.id = ae.etichetta_id group by ae.allievo_id
),
base as (
  select a.id, a.palestra_id, a.nome, a.cognome, a.data_nascita, a.foto_url, a.stato_lead,
         a.certificato_scadenza, a.is_titolare, a.created_at, a.codice_fiscale,
         acc.id as account_id, acc.nome as titolare_nome, acc.cognome as titolare_cognome, acc.email, acc.telefono,
         lower(concat_ws(' ', a.nome, a.cognome, acc.nome, acc.cognome, acc.email, acc.telefono, a.codice_fiscale)) as ricerca,
         coalesce(per.attivo, false) as attivo, per.fine_prossima, per.ingressi_min, per.prima_data, per.ultima_fine,
         per.ultimo_inizio, pres.ultima_presenza, eti.etichette_id, eti.etichette,
         (so.allievo_id is not null) as senza_orari,
         p.soglie, p.mese_inizio_stagione, p.quota_iscrizione_cent, quote.stagione as stagione_quota, quote.ultima_quota,
         (select max(p2.al) from v_periodi p2 where p2.allievo_id = a.id and p2.al < per.ultimo_inizio) as fine_precedente
  from allievi a
  join account acc on acc.id = a.account_id
  join palestre p on p.id = a.palestra_id
  left join per on per.allievo_id = a.id
  left join pres on pres.allievo_id = a.id
  left join quote on quote.allievo_id = a.id
  left join senza_orari so on so.allievo_id = a.id
  left join eti on eti.allievo_id = a.id
)
select b.id, b.palestra_id, b.nome, b.cognome, b.data_nascita, b.foto_url, b.stato_lead, b.certificato_scadenza,
       b.is_titolare, b.created_at, b.codice_fiscale, b.account_id, b.titolare_nome, b.titolare_cognome,
       b.email, b.telefono, b.ricerca, b.attivo, b.fine_prossima, b.ingressi_min, b.prima_data, b.ultima_fine,
       b.ultima_presenza, coalesce(b.etichette_id, '{}') as etichette_id, coalesce(b.etichette, '{}') as etichette,
       case
         when b.attivo then case
           when b.ingressi_min is not null and b.ingressi_min <= soglia(b.soglie, 'esaurimento_ingressi') then 'in_esaurimento'
           when b.fine_prossima <= current_date + soglia(b.soglie, 'in_scadenza_giorni') then 'in_scadenza'
           when b.ultimo_inizio >= current_date - 45 and b.fine_precedente is not null
                and b.ultimo_inizio - b.fine_precedente > soglia(b.soglie, 'rientro_giorni') then 'rientro'
           when b.ultima_presenza is not null and b.ultima_presenza < current_date - soglia(b.soglie, 'inattivo_giorni')
                and b.ultimo_inizio < current_date - soglia(b.soglie, 'inattivo_giorni') then 'inattivo'
           when b.prima_data <= current_date - make_interval(months => soglia(b.soglie, 'fedele_mesi')) then 'fedele'
           else 'iscritto' end
         when b.ultima_fine is not null then
           case when current_date - b.ultima_fine <= soglia(b.soglie, 'perso_giorni') then 'no_rinnovo' else 'perso' end
         when b.stato_lead in ('prova_prenotata', 'prova_effettuata') then 'prova'
         when b.stato_lead = 'perso' then 'perso'
         else 'lead'
       end as stato,
       (b.attivo and (b.certificato_scadenza is null or b.certificato_scadenza < current_date)) as certificato_scaduto,
       -- la quota vale per la sua stagione, oppure per 12 mesi dal pagamento (come in APP Palestre)
       (b.attivo and b.quota_iscrizione_cent > 0
          and coalesce(b.stagione_quota, 0) < stagione_di(current_date, b.mese_inizio_stagione)
          and coalesce(b.ultima_quota, '1900-01-01') <= current_date - 365) as quota_mancante,
       b.senza_orari,
       case when b.data_nascita is null then null
            else (make_date(extract(year from current_date)::int
                            + case when to_char(b.data_nascita, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
                            extract(month from b.data_nascita)::int,
                            least(extract(day from b.data_nascita)::int,
                                  case when extract(month from b.data_nascita) = 2 then 28 else 31 end))
                  - current_date) end as giorni_al_compleanno
from base b;

-- ---------------------------------------------------------------------
-- 5. Scadenze
-- ---------------------------------------------------------------------
drop view if exists v_scadenze;
create view v_scadenze with (security_invoker = true) as
with voci as (
  -- abbonamenti che finiscono tra 30 giorni fa e 30 giorni da oggi, senza un rinnovo dopo
  select i.palestra_id, 'abbonamento'::text as tipo, i.allievo_id, i.id::text as riferimento,
         i.data_fine as data, t.nome || ' · ' || c.nome as dettaglio, t.prezzo_cent as importo_cent
  from iscrizioni i
  join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
  join corsi c on c.id = i.corso_id
  where i.stato in ('attiva', 'scaduta')
    and i.data_fine between current_date - 30 and current_date + 30
    and not exists (select 1 from iscrizioni n where n.allievo_id = i.allievo_id and n.id <> i.id
                      and n.stato in ('attiva', 'sospesa') and n.data_fine > i.data_fine)
  union all
  -- pacchetti a ingressi quasi finiti
  select i.palestra_id, 'ingressi', i.allievo_id, i.id::text || ':' || i.ingressi_residui,
         i.data_fine, t.nome || ' · restano ' || i.ingressi_residui || ' ingressi', t.prezzo_cent
  from iscrizioni i
  join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
  join palestre p on p.id = i.palestra_id
  where i.stato = 'attiva' and i.data_fine >= current_date and t.modalita = 'ingressi'
    and i.ingressi_residui <= soglia(p.soglie, 'esaurimento_ingressi')
  union all
  -- certificati mancanti o in scadenza di chi è iscritto
  select a.palestra_id, 'certificato', a.id, 'cert:' || coalesce(a.certificato_scadenza::text, 'mancante'),
         a.certificato_scadenza,
         case when a.certificato_scadenza is null then 'Certificato mancante'
              when a.certificato_scadenza < current_date then 'Certificato scaduto'
              else 'Certificato in scadenza' end, null
  from allievi a
  where exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva' and i.data_fine >= current_date)
    and (a.certificato_scadenza is null or a.certificato_scadenza <= current_date + 30)
  union all
  -- quota annuale della stagione non pagata da chi è iscritto
  select a.palestra_id, 'quota', a.id, 'quota:' || stagione_di(current_date, p.mese_inizio_stagione),
         null::date, 'Quota ' || stagione_di(current_date, p.mese_inizio_stagione) || '/'
                     || (stagione_di(current_date, p.mese_inizio_stagione) + 1 - 2000), p.quota_iscrizione_cent
  from allievi a join palestre p on p.id = a.palestra_id
  where p.quota_iscrizione_cent > 0
    and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva' and i.data_fine >= current_date)
    and not exists (select 1 from quote_iscrizione q where q.allievo_id = a.id
                      and (q.stagione = stagione_di(current_date, p.mese_inizio_stagione) or q.data > current_date - 365))
)
select v.palestra_id, v.tipo, v.allievo_id, v.riferimento, v.data,
       case when v.data is null then null else v.data - current_date end as giorni,
       v.dettaglio, v.importo_cent,
       a.nome, a.cognome, acc.nome as titolare_nome, acc.cognome as titolare_cognome, acc.email, acc.telefono,
       a.is_titolare, g.id is not null as gestito, g.nota as nota_gestione, g.gestito_at
from voci v
join allievi a on a.id = v.allievo_id
join account acc on acc.id = a.account_id
left join scadenze_gestite g on g.allievo_id = v.allievo_id and g.tipo = v.tipo and g.riferimento = v.riferimento;

-- ---------------------------------------------------------------------
-- 6. Cruscotto
-- ---------------------------------------------------------------------
create or replace function cruscotto(p_palestra uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  r jsonb; v_inizio_mese date := date_trunc('month', current_date)::date;
  v_lun date := (current_date - (extract(isodow from current_date)::int - 1));
begin
  with st as (select * from v_stato_clienti where palestra_id = p_palestra),
       pe as (select * from v_periodi where palestra_id = p_palestra)
  select jsonb_build_object(
    -- persone
    'attivi', (select count(*) from st where attivo),
    'attivi_mese_scorso', (select count(distinct allievo_id) from pe
                             where dal <= current_date - 30 and al >= current_date - 30),
    'nuovi_mese', (select count(*) from st where prima_data >= v_inizio_mese),
    'stati', (select coalesce(jsonb_object_agg(stato, n), '{}'::jsonb)
                from (select stato, count(*) as n from st group by stato) x),
    -- soldi
    'venduto_mese', (select coalesce(sum(prezzo_cent), 0) from pe where dal >= v_inizio_mese and dal <= current_date)
                    + (select coalesce(sum(importo_cent), 0) from pagamenti
                         where palestra_id = p_palestra and stato = 'pagato' and causale <> 'abbonamento'
                           and pagato_at >= v_inizio_mese),
    'venduto_mese_scorso', (select coalesce(sum(prezzo_cent), 0) from pe
                              where dal >= (v_inizio_mese - interval '1 month')::date
                                and dal <= (current_date - interval '1 month')::date),
    'incassato_mese', (select coalesce(sum(importo_cent), 0) from pagamenti
                         where palestra_id = p_palestra and stato = 'pagato' and pagato_at >= v_inizio_mese),
    'da_rinnovare_14', (select jsonb_build_object('quanti', count(*), 'valore', coalesce(sum(importo_cent), 0))
                          from v_scadenze where palestra_id = p_palestra and tipo = 'abbonamento'
                            and not gestito and data between current_date and current_date + 14),
    -- settimana
    'lezioni_oggi', (select count(*) from v_occupazione where palestra_id = p_palestra and data = current_date and stato = 'programmata'),
    'attesi_oggi', (select coalesce(sum(iscritti + prove), 0) from v_occupazione
                      where palestra_id = p_palestra and data = current_date and stato = 'programmata'),
    'occupazione_settimana', (select case when sum(capienza) > 0
                                  then round(100.0 * sum(iscritti + prove) / sum(capienza)) end
                                from v_occupazione where palestra_id = p_palestra and stato = 'programmata'
                                  and capienza > 0 and data between v_lun and v_lun + 6),
    'prove_settimana', (select count(*) from prove pr join lezioni l on l.id = pr.lezione_id
                          where pr.palestra_id = p_palestra and pr.stato <> 'annullata'
                            and l.data between v_lun and v_lun + 6),
    'lead_nuovi_7', (select count(*) from lead_eventi where palestra_id = p_palestra and evento = 'richiesta'
                       and created_at >= now() - interval '7 days'),
    -- problemi
    'certificati_scaduti', (select count(*) from st where certificato_scaduto),
    'certificati_da_verificare', (select count(*) from certificati where palestra_id = p_palestra and stato = 'da_verificare'),
    'no_rinnovo', (select count(*) from st where stato = 'no_rinnovo'),
    'in_scadenza_7', (select count(*) from v_scadenze where palestra_id = p_palestra and tipo = 'abbonamento'
                        and not gestito and data between current_date and current_date + 7),
    'in_esaurimento', (select count(*) from st where stato = 'in_esaurimento'),
    'inattivi', (select count(*) from st where stato = 'inattivo'),
    'senza_orari', (select count(*) from st where senza_orari),
    'quota_mancante', (select count(*) from st where quota_mancante),
    'presenze_da_segnare', (select count(*) from v_occupazione o where o.palestra_id = p_palestra and o.data = current_date
                              and o.stato = 'programmata' and o.inizio < now() and o.presenti + o.assenti = 0 and o.iscritti > 0),
    'spazi_da_rispondere', (select count(*) from prenotazioni_spazi where palestra_id = p_palestra and stato = 'richiesta'),
    'lead_da_seguire', (select count(*) from allievi where palestra_id = p_palestra and stato_lead in ('nuovo', 'prova_effettuata')
                          and created_at >= now() - interval '60 days'),
    'messaggi_errore', (select count(*) from messaggi_coda where palestra_id = p_palestra and stato = 'errore'
                          and created_at >= now() - interval '14 days'),
    'attese', (select count(*) from liste_attesa where palestra_id = p_palestra and stato = 'in_attesa'),
    -- andamento: persone con un abbonamento valido a metà di ogni mese, ultimi 12 mesi
    'andamento', (select jsonb_agg(jsonb_build_object('mese', to_char(m, 'YYYY-MM'),
                                     'attivi', (select count(distinct allievo_id) from pe
                                                 where dal <= (m + interval '14 days')::date and al >= (m + interval '14 days')::date))
                                   order by m)
                    from generate_series(date_trunc('month', current_date) - interval '11 months',
                                         date_trunc('month', current_date), interval '1 month') m),
    'compleanni', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'cognome', cognome,
                                                               'giorni', giorni_al_compleanno) order by giorni_al_compleanno), '[]')
                     from st where attivo and giorni_al_compleanno between 0 and 6)
  ) into r;
  return r;
end $$;
grant execute on function cruscotto(uuid) to authenticated;

-- Conteggi per i filtri della pagina Persone
create or replace function conteggi_persone(p_palestra uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with st as (select * from v_stato_clienti where palestra_id = p_palestra)
  select jsonb_build_object(
    'tutti', (select count(*) from st),
    'attivi', (select count(*) from st where attivo),
    'nuovi', (select count(*) from st where prima_data >= date_trunc('month', current_date)),
    'stati', (select coalesce(jsonb_object_agg(stato, n), '{}'::jsonb) from (select stato, count(*) n from st group by stato) x),
    'certificato_scaduto', (select count(*) from st where certificato_scaduto),
    'quota_mancante', (select count(*) from st where quota_mancante),
    'senza_orari', (select count(*) from st where senza_orari),
    'compleanno', (select count(*) from st where attivo and giorni_al_compleanno between 0 and 6),
    'senza_email', (select count(*) from st where email is null),
    'etichette', (select coalesce(jsonb_object_agg(e.id, (select count(*) from allievi_etichette ae where ae.etichetta_id = e.id)), '{}'::jsonb)
                    from etichette e where e.palestra_id = p_palestra)
  );
$$;
grant execute on function conteggi_persone(uuid) to authenticated;

-- Controllo
select stato, count(*) from v_stato_clienti group by stato order by count(*) desc;
