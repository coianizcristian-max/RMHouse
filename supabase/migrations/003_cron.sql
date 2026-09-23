-- =====================================================================
-- RMHouse — 003 CRON (da eseguire DOPO il primo deploy su Vercel)
-- Attivare prima le estensioni: Database → Extensions → pg_cron e pg_net
-- Sostituire i due segnaposto:
--   https://TUO-SITO.vercel.app  → indirizzo del sito
--   METTI_QUI_CRON_SECRET        → lo stesso valore di CRON_SECRET su Vercel
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ogni notte alle 03:00 UTC: genera lezioni, scadenze, compleanni, sondaggi
select cron.unschedule('rmhouse-giornaliero') where exists (select 1 from cron.job where jobname = 'rmhouse-giornaliero');
select cron.schedule('rmhouse-giornaliero', '0 3 * * *', $$ select public.lavori_giornalieri(); $$);

-- Ogni 5 minuti: il sito invia i messaggi in coda (conferme, promemoria, follow-up)
select cron.unschedule('rmhouse-invio-messaggi') where exists (select 1 from cron.job where jobname = 'rmhouse-invio-messaggi');
select cron.schedule('rmhouse-invio-messaggi', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://TUO-SITO.vercel.app/api/cron/invia-messaggi',
    headers := jsonb_build_object('Authorization', 'Bearer b7f3a91c4e2d48a6be05c17d93f2ea6018cd5b74a9e3f082', 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
$$);

-- Verifica: select * from cron.job;   Storico: select * from cron.job_run_details order by start_time desc limit 20;
