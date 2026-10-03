-- 095 · Statistiche più veloci
-- La prima versione ricalcolava le stesse cose molte volte (per ogni mese, per ogni persona):
-- con migliaia di iscrizioni e lezioni la pagina impiegava diversi secondi.
-- Ora: ogni sezione chiede solo i dati che mostra (p_sezione) e i conti si fanno in un passaggio solo.
-- Rieseguibile.

drop function if exists statistiche_stagione(uuid, date, date);
drop function if exists statistiche_stagione(uuid, date, date, text);
create function statistiche_stagione(p_palestra uuid, p_dal date, p_al date, p_sezione text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v jsonb := '{}'::jsonb;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_inizio_stagione date;
  v_mese0 date := (date_trunc('month', (now() at time zone 'Europe/Rome')::date) - interval '11 months')::date;
  tutto boolean := p_sezione is null;
  s text := coalesce(p_sezione, '');
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  v_inizio_stagione := make_date(case when extract(month from v_oggi) >= 9 then extract(year from v_oggi)::int else extract(year from v_oggi)::int - 1 end, 9, 1);

  -- iscrizioni con, per ognuna, la prima iscrizione della persona e la successiva (un passaggio solo)
  create temp table if not exists _isc (id uuid, allievo_id uuid, corso_id uuid, tipo_abbonamento_id uuid, stato text,
                                        data_inizio date, data_fine date, sconto_cent int, prima date, prossima date) on commit drop;
  truncate _isc;
  insert into _isc
  select i.id, i.allievo_id, i.corso_id, i.tipo_abbonamento_id, i.stato::text, i.data_inizio, i.data_fine, i.sconto_cent,
         min(i.data_inizio) over w, lead(i.data_inizio) over (partition by i.allievo_id order by i.data_inizio, i.id)
    from iscrizioni i
   where i.palestra_id = p_palestra and i.stato <> 'annullata'
  window w as (partition by i.allievo_id);

  -- ISCRIZIONI ------------------------------------------------------------
  if tutto or s in ('panoramica', 'iscrizioni') then
    v := v || jsonb_build_object(
      'iscrizioni_mese', (
        select jsonb_agg(jsonb_build_object('mese', m.m, 'nuove', coalesce(x.nuove, 0), 'rinnovi', coalesce(x.rinnovi, 0), 'uscite', coalesce(u.uscite, 0)) order by m.m)
          from generate_series(v_mese0, date_trunc('month', v_oggi)::date, interval '1 month') m(m)
          left join (select date_trunc('month', data_inizio)::date mm,
                            count(*) filter (where data_inizio = prima) nuove, count(*) filter (where data_inizio > prima) rinnovi
                       from _isc where data_inizio >= v_mese0 group by 1) x on x.mm = m.m
          left join (select date_trunc('month', data_fine)::date mm, count(distinct allievo_id) uscite
                       from _isc where data_fine >= v_mese0 and data_fine < v_oggi
                        and (prossima is null or prossima > data_fine + 45) group by 1) u on u.mm = m.m),
      'stagioni', (
        select jsonb_agg(jsonb_build_object('k', g.k, 'n', g.n, 'giorno', g.giorno,
                 'attivi', case when g.giorno > v_oggi then null else
                   (select count(distinct allievo_id) from _isc where data_inizio <= g.giorno and coalesce(data_fine, g.giorno) >= g.giorno) end)
               order by g.k, g.n)
          from (select k, n, (make_date(extract(year from v_inizio_stagione)::int - k, 9, 15) + (n || ' months')::interval)::date giorno
                  from generate_series(0, 1) k, generate_series(0, 11) n) g),
      'rinnovo', (
        select jsonb_build_object('finite', count(*),
                                  'rinnovate', count(*) filter (where prossima is not null and prossima <= data_fine + 45))
          from _isc where data_fine between p_dal and least(p_al, v_oggi - 1)));
  end if;

  if tutto or s = 'iscrizioni' then
    v := v || jsonb_build_object('abbonamenti', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'n', n, 'euro', e) order by n desc), '[]'::jsonb) from (
        select ta.nome, count(*) n, sum(greatest(ta.prezzo_cent - i.sconto_cent, 0)) e
          from _isc i join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id
         where i.data_inizio between p_dal and p_al group by ta.nome order by count(*) desc limit 10) z));
  end if;

  -- CHI FREQUENTA -----------------------------------------------------------
  if tutto or s in ('iscrizioni', 'persone', 'panoramica') then
    create temp table if not exists _attivi (allievo_id uuid primary key) on commit drop;
    truncate _attivi;
    insert into _attivi select distinct allievo_id from _isc where stato = 'attiva' and data_inizio <= v_oggi and coalesce(data_fine, v_oggi) >= v_oggi;

    v := v || jsonb_build_object(
      'anzianita', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', e, 'valore', n) order by o), '[]'::jsonb) from (
         select case when anni < 1 then 'Primo anno' when anni < 2 then '1–2 anni' when anni < 4 then '2–4 anni' else 'Più di 4 anni' end e,
                case when anni < 1 then 1 when anni < 2 then 2 when anni < 4 then 3 else 4 end o, count(*) n
           from (select a.allievo_id, (v_oggi - min(i.prima)) / 365.0 anni from _attivi a join _isc i on i.allievo_id = a.allievo_id group by a.allievo_id) t
          group by 1, 2) z),
      'discipline', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', d, 'valore', n)), '[]'::jsonb) from (
         select coalesce(di.nome, co.nome) d, count(distinct i.allievo_id) n
           from _isc i join corsi co on co.id = i.corso_id left join discipline di on di.id = co.disciplina_id
          where i.stato = 'attiva' and i.data_inizio <= v_oggi and coalesce(i.data_fine, v_oggi) >= v_oggi
          group by 1 order by 2 desc limit 12) z));
  end if;

  if tutto or s = 'persone' then
    v := v || jsonb_build_object(
      'genere', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', e, 'valore', n)), '[]'::jsonb) from (
         select case genere_di(al.sesso, al.codice_fiscale) when 'F' then 'Femmine' when 'M' then 'Maschi' else 'Non indicato' end e, count(*) n
           from _attivi a join allievi al on al.id = a.allievo_id group by 1 order by 2 desc) z),
      'eta_media', (select round(avg(extract(year from age(v_oggi, al.data_nascita)))::numeric, 1)
                      from _attivi a join allievi al on al.id = a.allievo_id where al.data_nascita is not null),
      'minorenni', (select count(*) from _attivi a join allievi al on al.id = a.allievo_id where al.data_nascita > v_oggi - interval '18 years'),
      'citta', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', c, 'valore', n)), '[]'::jsonb) from (
         select initcap(coalesce(nullif(trim(ac.citta), ''), 'Non indicata')) c, count(*) n
           from _attivi a join allievi al on al.id = a.allievo_id join account ac on ac.id = al.account_id
          group by 1 order by 2 desc limit 8) z));
  end if;

  -- FREQUENZA ---------------------------------------------------------------
  if tutto or s in ('panoramica', 'frequenza') then
    v := v || jsonb_build_object('presenze_mese', (
      select jsonb_agg(jsonb_build_object('mese', m.m, 'presenti', coalesce(x.presenti, 0), 'segnati', coalesce(x.segnati, 0)) order by m.m)
        from generate_series(v_mese0, date_trunc('month', v_oggi)::date, interval '1 month') m(m)
        left join (select date_trunc('month', l.data)::date mm, count(*) filter (where ps.presente) presenti, count(*) segnati
                     from presenze ps join lezioni l on l.id = ps.lezione_id
                    where l.palestra_id = p_palestra and l.data >= v_mese0 group by 1) x on x.mm = m.m));
  end if;

  if tutto or s = 'frequenza' then
    create temp table if not exists _lez (id uuid primary key, dow int, ora int, fine timestamptz, attesi int, presenti int, segnati int) on commit drop;
    truncate _lez;
    insert into _lez
    select l.id, extract(isodow from l.data)::int, extract(hour from l.inizio_roma)::int, l.fine, 0, 0, 0
      from (select l0.*, l0.inizio at time zone 'Europe/Rome' as inizio_roma from lezioni l0
             where l0.palestra_id = p_palestra and l0.stato <> 'annullata' and l0.data between p_dal and least(p_al, v_oggi)) l;
    update _lez t set attesi = x.n from (
      select vp.lezione_id, count(*)::int n from v_partecipanti_lezione vp join _lez z on z.id = vp.lezione_id group by 1) x
     where x.lezione_id = t.id;
    update _lez t set presenti = x.p, segnati = x.s from (
      select ps.lezione_id, (count(*) filter (where ps.presente))::int p, count(*)::int s
        from presenze ps join _lez z on z.id = ps.lezione_id group by 1) x
     where x.lezione_id = t.id;

    v := v || jsonb_build_object(
      'calore', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'ora', ora, 'lezioni', n, 'attesi', a, 'presenti', p)), '[]'::jsonb) from (
         select dow, ora, count(*) n, round(avg(attesi), 1) a, round(avg(presenti) filter (where segnati > 0), 1) p from _lez group by dow, ora) z),
      'giorni', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'lezioni', n, 'attesi', a, 'presenti', p) order by dow), '[]'::jsonb) from (
         select dow, count(*) n, sum(attesi) a, sum(presenti) p from _lez group by dow) z),
      'appelli', (select jsonb_build_object('finite', count(*) filter (where fine < now() and attesi > 0),
                                            'fatti', count(*) filter (where fine < now() and attesi > 0 and segnati > 0)) from _lez),
      'disdette', (select jsonb_build_object('app', count(*) filter (where x.da = 'cliente'), 'segreteria', count(*) filter (where x.da <> 'cliente'))
                     from assenze_avvisate x join lezioni l on l.id = x.lezione_id
                    where x.palestra_id = p_palestra and l.data between p_dal and p_al),
      'recuperi', (select jsonb_build_object('dati', count(*),
           'usati', count(*) filter (where usato_in is not null),
           'scaduti', count(*) filter (where usato_in is null and not coalesce(annullato, false) and scadenza < v_oggi),
           'aperti', count(*) filter (where usato_in is null and not coalesce(annullato, false) and scadenza >= v_oggi))
         from crediti_recupero where palestra_id = p_palestra and created_at::date between p_dal and p_al));
  end if;

  -- PROVE --------------------------------------------------------------------
  if tutto or s = 'prove' then
    v := v || jsonb_build_object('prove_mese', (
      select jsonb_agg(jsonb_build_object('mese', m.m, 'prenotate', coalesce(x.pren, 0), 'fatte', coalesce(x.fatte, 0), 'iscritti', coalesce(x.isc, 0)) order by m.m)
        from generate_series(v_mese0, date_trunc('month', v_oggi)::date, interval '1 month') m(m)
        left join (select date_trunc('month', pr.created_at)::date mm,
                          count(*) filter (where pr.stato <> 'annullata') pren, count(*) filter (where pr.stato = 'presente') fatte,
                          count(distinct pr.allievo_id) filter (where exists (
                            select 1 from iscrizioni i where i.allievo_id = pr.allievo_id and i.stato <> 'annullata'
                               and i.created_at >= pr.created_at and i.created_at < pr.created_at + interval '60 days')) isc
                     from prove pr where pr.palestra_id = p_palestra and pr.created_at >= v_mese0 group by 1) x on x.mm = m.m));
  end if;

  -- ECONOMIA -----------------------------------------------------------------
  if tutto or s = 'economia' then
    v := v || jsonb_build_object(
      'metodi', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', initcap(coalesce(metodo, 'altro')), 'valore', round(e / 100.0))), '[]'::jsonb) from (
         select metodo, sum(importo_cent) e from pagamenti where palestra_id = p_palestra and stato = 'pagato'
            and (pagato_at at time zone 'Europe/Rome')::date between p_dal and p_al group by metodo order by 2 desc) z),
      'causali', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', initcap(replace(coalesce(causale, 'altro'), '_', ' ')), 'valore', round(e / 100.0))), '[]'::jsonb) from (
         select causale, sum(importo_cent) e from pagamenti where palestra_id = p_palestra and stato = 'pagato'
            and (pagato_at at time zone 'Europe/Rome')::date between p_dal and p_al group by causale order by 2 desc) z));
  end if;

  return v;
end $$;
revoke execute on function statistiche_stagione(uuid, date, date, text) from public, anon;
grant execute on function statistiche_stagione(uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- andamento_mensile: prima ricalcolava il riempimento di TUTTE le lezioni per ognuno dei 12 mesi
-- (secondi, e con tanti dati decine di secondi che rallentavano tutto il database).
-- Ora le lezioni dei 12 mesi si contano una volta sola. Ora c'è anche la % di abbandono.
-- ---------------------------------------------------------------------
create or replace function andamento_mensile(p_palestra uuid, p_mesi integer default 12)
returns table (mese date, iscritti_attivi bigint, nuovi bigint, cessati bigint, abbandono_pct numeric, ricavi_cent bigint,
               costi_cent bigint, presenza_pct numeric, riempimento_pct numeric, prove bigint)
language sql stable as $$
  with
  mesi as (
    select generate_series(date_trunc('month', current_date) - make_interval(months => p_mesi - 1),
                           date_trunc('month', current_date), interval '1 month')::date as m
  ),
  isc as (
    select i.allievo_id, i.stato, i.data_inizio, i.data_fine, i.tipo_abbonamento_id, i.sconto_cent,
           min(i.data_inizio) over (partition by i.allievo_id) prima,
           max(i.data_inizio) over (partition by i.allievo_id) ultima
      from iscrizioni i where i.palestra_id = p_palestra
  ),
  lez as (
    select date_trunc('month', l.data)::date mm,
           coalesce(l.capienza_override, c.capienza, s.capienza) capienza,
           (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') iscritti
      from lezioni l join corsi c on c.id = l.corso_id left join sale s on s.id = l.sala_id
     where l.palestra_id = p_palestra and l.stato = 'programmata'
       and l.data >= (select min(m) from mesi) and l.data < (select max(m) from mesi) + interval '1 month'
  ),
  occ as (select mm, case when sum(capienza) > 0 then round(100.0 * sum(iscritti) / sum(capienza), 1) end pct from lez group by mm),
  pres as (
    select date_trunc('month', l.data)::date mm,
           case when count(*) > 0 then round(100.0 * count(*) filter (where ps.presente) / count(*), 1) end pct
      from presenze ps join lezioni l on l.id = ps.lezione_id
     where ps.palestra_id = p_palestra and l.data >= (select min(m) from mesi)
     group by 1
  ),
  base as (
    select m.m,
      (select count(distinct allievo_id) from isc where stato <> 'annullata'
        and data_inizio <= (m.m + interval '1 month - 1 day')::date and data_fine >= m.m) attivi,
      (select count(distinct allievo_id) from isc where date_trunc('month', data_inizio)::date = m.m and data_inizio = prima) nuovi,
      (select count(distinct allievo_id) from isc where stato <> 'annullata' and date_trunc('month', data_fine)::date = m.m
        and ultima <= data_fine) cessati,
      (select coalesce(sum(greatest(ta.prezzo_cent - i.sconto_cent, 0)), 0)::bigint
         from isc i join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id
        where i.stato <> 'annullata' and date_trunc('month', i.data_inizio)::date = m.m) ricavi,
      (select coalesce(round(sum(costo_mensile(s.importo_cent, s.periodicita)))
                + coalesce(sum(case when s.periodicita = 'una_tantum'
                                    and date_trunc('month', s.data)::date = m.m then s.importo_cent else 0 end), 0), 0)::bigint
         from spese s where s.palestra_id = p_palestra and s.data <= (m.m + interval '1 month - 1 day')::date) costi,
      (select count(*) from prove pr where pr.palestra_id = p_palestra and date_trunc('month', pr.created_at)::date = m.m) prove
    from mesi m
  )
  select b.m, b.attivi, b.nuovi, b.cessati,
         case when b.attivi > 0 then round(100.0 * b.cessati / b.attivi, 1) end,
         b.ricavi, b.costi, p.pct, o.pct, b.prove
    from base b left join pres p on p.mm = b.m left join occ o on o.mm = b.m
   order by b.m;
$$;
