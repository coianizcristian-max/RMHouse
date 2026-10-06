-- =====================================================================
-- RMHouse — 135 VELOCITÀ: Riepilogo più rapido e sito tenuto "sveglio"
-- 1) cruscotto_dati: il grafico "andamento" (persone attive negli ultimi 12 mesi) rileggeva tutti i
--    periodi di abbonamento 12 volte, una per mese. Ora li legge una volta sola: stessi numeri,
--    circa un quinto del tempo (sulla copia dei dati reali: da 112 a 22 ms la parte del grafico,
--    da ~140 a ~90 ms tutto il Riepilogo nel database). Inoltre dalle 2.500 schede si leggono solo le
--    colonne che servono ai conteggi.
-- 2) Un lavoro pianificato (pg_cron + pg_net, già disponibili su Supabase) chiama il sito ogni 5 minuti
--    dalle 7 alle 23: così la funzione su Vercel resta in memoria e la prima pagina della giornata
--    non paga l'avvio a freddo (2-3 secondi). Usa palestre.base_url. Se le estensioni mancano
--    (database locale) salta questa parte con un avviso.
-- Si può eseguire più volte.
-- =====================================================================

create or replace function cruscotto_dati(p_palestra uuid)
returns jsonb language plpgsql stable security definer set search_path = public set jit = off as $function$
declare
  r jsonb; v_inizio_mese date := date_trunc('month', current_date)::date;
  v_lun date := (current_date - (extract(isodow from current_date)::int - 1));
begin
  -- (solo le colonne che servono: così il database non calcola per 2.500 persone anche ricerca, etichette ecc.)
  with st as (select id, nome, cognome, attivo, prima_data, stato, certificato_scaduto, senza_orari, quota_mancante, giorni_al_compleanno
                from v_stato_clienti where palestra_id = p_palestra),
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
    -- (ogni periodo viene "spalmato" sui mesi in cui copre il giorno 15, in un passaggio solo:
    --  prima si rileggevano tutti i periodi 12 volte, una per mese)
    'andamento', (with mesi as (select generate_series(date_trunc('month', current_date) - interval '11 months',
                                                        date_trunc('month', current_date), interval '1 month')::date as m),
                       conta as (select g.m, count(distinct pe.allievo_id) as n
                                   from pe, lateral generate_series(
                                          greatest(date_trunc('month', pe.dal - 14 + interval '1 month' - interval '1 day')::date, (select min(m) from mesi)),
                                          least(date_trunc('month', pe.al - 14)::date, (select max(m) from mesi)),
                                          interval '1 month') g(m)
                                  group by g.m)
                  select jsonb_agg(jsonb_build_object('mese', to_char(mesi.m, 'YYYY-MM'), 'attivi', coalesce(conta.n, 0)) order by mesi.m)
                    from mesi left join conta on conta.m = mesi.m),
    'compleanni', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'cognome', cognome,
                                                               'giorni', giorni_al_compleanno) order by giorni_al_compleanno), '[]')
                     from st where attivo and giorni_al_compleanno between 0 and 6)
  ) into r;
  return r;
end $function$;

-- --------------------------------------------------------------------- sveglia del sito ogni 5 minuti
do $$
declare v_url text;
begin
  select base_url into v_url from palestre where base_url is not null order by created_at limit 1;
  if v_url is null then raise notice 'palestre.base_url vuoto: sveglia del sito non impostata'; return; end if;
  begin
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron/pg_net non disponibili qui (%): sveglia del sito saltata', sqlerrm; return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'rmhouse_sveglia_sito';
  -- ogni 5 minuti, dalle 5 alle 21 UTC (7–23 ora italiana legale, 6–22 solare)
  perform cron.schedule('rmhouse_sveglia_sito', '*/5 5-21 * * *',
    format($c$select net.http_get(url := %L, timeout_milliseconds := 8000)$c$, rtrim(v_url, '/') || '/api/salute'));
  raise notice 'sveglia del sito impostata su %', rtrim(v_url, '/') || '/api/salute';
end $$;
