-- =====================================================================
-- RMHouse — 041 QUOTA ANNUALE: VALE 12 MESI DAL PAGAMENTO
--
-- Decisione presa: la quota annuale vale 12 mesi dal giorno in cui si paga
-- (non più "la stagione oppure 12 mesi"). Chi l'ha pagata il 15 ottobre 2025
-- è in regola fino al 14 ottobre 2026.
-- Cambia: il controllo della quota (ingresso, acquisto online, avvisi),
-- lo stato dei clienti (campanello "quota mancante" e nuova colonna con la
-- data fino a cui vale) e le Scadenze (la quota compare 30 giorni prima di
-- scadere, con la sua data).
-- Non tocca le quote registrate. Da eseguire dopo la 039. Si può rieseguire.
-- =====================================================================

create or replace function quota_pagata(p_allievo uuid, p_data date default current_date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from quote_iscrizione q
    where q.allievo_id = p_allievo
      and q.data <= p_data
      and (q.data + interval '1 year')::date > p_data
  );
$$;

-- Stato dei clienti
create or replace view v_stato_clienti with (security_invoker = true) as
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
       -- la quota vale 12 mesi dal giorno del pagamento
       (b.attivo and b.quota_iscrizione_cent > 0
          and (b.ultima_quota is null or (b.ultima_quota + interval '1 year')::date <= current_date)) as quota_mancante,
       b.senza_orari,
       case when b.data_nascita is null then null
            else (make_date(extract(year from current_date)::int
                            + case when to_char(b.data_nascita, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
                            extract(month from b.data_nascita)::int,
                            least(extract(day from b.data_nascita)::int,
                                  case when extract(month from b.data_nascita) = 2 then 28 else 31 end))
                  - current_date) end as giorni_al_compleanno,
       (b.ultima_quota + interval '1 year')::date as quota_valida_fino
from base b;

-- Scadenze: la quota compare 30 giorni prima di scadere
drop view if exists v_scadenze;
create view v_scadenze with (security_invoker = true) as
with voci as (
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
  select i.palestra_id, 'ingressi', i.allievo_id, i.id::text || ':' || i.ingressi_residui,
         i.data_fine, t.nome || ' · restano ' || i.ingressi_residui || ' ingressi', t.prezzo_cent
  from iscrizioni i
  join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
  join palestre p on p.id = i.palestra_id
  where i.stato = 'attiva' and i.data_fine >= current_date and t.modalita = 'ingressi'
    and i.ingressi_residui <= soglia(p.soglie, 'esaurimento_ingressi')
  union all
  select a.palestra_id, 'certificato', a.id, 'cert:' || coalesce(a.certificato_scadenza::text, 'mancante'),
         a.certificato_scadenza,
         case when a.certificato_scadenza is null then 'Certificato mancante'
              when a.certificato_scadenza < current_date then 'Certificato scaduto'
              else 'Certificato in scadenza' end, null
  from allievi a
  where exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva' and i.data_fine >= current_date)
    and (a.certificato_scadenza is null or a.certificato_scadenza <= current_date + 30)
  union all
  select a.palestra_id, 'quota', a.id, 'quota:' || coalesce(uq.ultima::text, 'mai'),
         (uq.ultima + interval '1 year')::date,
         case when uq.ultima is null then 'Quota annuale mai pagata'
              when (uq.ultima + interval '1 year')::date <= current_date then 'Quota annuale scaduta'
              else 'Quota annuale in scadenza' end,
         p.quota_iscrizione_cent
  from allievi a
  join palestre p on p.id = a.palestra_id
  left join lateral (select max(q.data) as ultima from quote_iscrizione q where q.allievo_id = a.id) uq on true
  where p.quota_iscrizione_cent > 0
    and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva' and i.data_fine >= current_date)
    and (uq.ultima is null or (uq.ultima + interval '1 year')::date <= current_date + 30)
  union all
  select r.palestra_id, 'rata', coalesce(r.allievo_id, (select id from allievi x where x.account_id = r.account_id order by created_at limit 1)),
         r.id::text, r.scadenza, r.descrizione || ' · rata ' || r.numero || ' di ' || r.di, r.importo_cent
  from rate r
  where r.stato = 'da_pagare' and r.scadenza <= current_date + 30
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

select 'quote in regola' as cosa, count(*) from v_stato_clienti where attivo and not quota_mancante
union all select 'quote da pagare', count(*) from v_stato_clienti where quota_mancante
union all select 'quote nelle scadenze', count(*) from v_scadenze where tipo = 'quota';
