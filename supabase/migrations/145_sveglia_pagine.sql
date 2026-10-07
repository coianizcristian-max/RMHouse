-- =====================================================================
-- RMHouse — 145 SVEGLIA DEL SITO OGNI 4 MINUTI, ANCHE LE PAGINE
-- Il lavoro pianificato (query 135) chiamava solo /api/salute ogni 5 minuti. Le misure di Impostazioni → Velocità
-- hanno mostrato che il server delle pagine si riavviava spesso da freddo (1–1,5 s in più alla prima apertura).
-- Ora ogni 4 minuti, dalle 5 alle 22 UTC, chiama sia /api/salute sia /salute (una pagina vuota): le due parti
-- del sito restano sveglie e la connessione al database resta aperta. Si può eseguire più volte.
-- =====================================================================
do $$
declare v_url text;
begin
  select base_url into v_url from palestre where base_url is not null order by created_at limit 1;
  if v_url is null then raise notice 'palestre.base_url vuoto: sveglia del sito non impostata'; return; end if;
  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_cron/pg_net non disponibili qui (%): sveglia del sito saltata', sqlerrm; return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'rmhouse_sveglia_sito';
  perform cron.schedule('rmhouse_sveglia_sito', '*/4 5-22 * * *',
    format($c$select net.http_get(url := %L, timeout_milliseconds := 8000), net.http_get(url := %L, timeout_milliseconds := 8000)$c$,
           rtrim(v_url, '/') || '/api/salute', rtrim(v_url, '/') || '/salute'));
  raise notice 'sveglia del sito impostata: ogni 4 minuti su % e %', rtrim(v_url, '/') || '/api/salute', rtrim(v_url, '/') || '/salute';
end $$;
