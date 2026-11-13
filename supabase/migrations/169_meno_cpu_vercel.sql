-- 169 — Meno lavoro per Vercel (piano gratuito: 4 ore di CPU al mese per tutti i siti insieme)
-- Due lavori pianificati del database chiamavano il sito anche quando non c'era niente da fare:
-- • invio dei messaggi: ogni 5 minuti, giorno e notte (≈ 8.600 chiamate al mese) anche con la coda vuota.
--   Ora chiama il sito solo se c'è davvero un messaggio (email o notifica) da mandare in quel momento.
--   Le email ferme da più di 2 giorni (es. senza Resend configurato) non fanno più chiamare il sito a vuoto:
--   partono comunque insieme al primo messaggio nuovo.
-- • "sveglia" del sito: ogni 4 minuti DUE indirizzi (≈ 16.000 chiamate al mese). Ora uno solo (/salute, la parte
--   delle pagine), ogni 5 minuti, dalle 7 alle 23 ora italiana: ≈ 5.800 chiamate al mese.
-- Non cambia niente per chi usa il sito. Si può rilanciare. Se pg_cron non c'è (prove in locale) non fa niente.

-- c'è qualcosa da mandare adesso?
create or replace function messaggi_da_inviare()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from messaggi_coda
                  where stato = 'in_coda' and programmato_per <= now()
                    and (canale <> 'email' or programmato_per > now() - interval '2 days'));
$$;
revoke all on function messaggi_da_inviare() from public, anon, authenticated;

do $$
declare j record; v_cmd text; v_url text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron non presente: niente da cambiare'; return;
  end if;

  -- invio messaggi: la stessa chiamata di prima (con il suo indirizzo e la sua chiave, che restano dove sono),
  -- solo con "se c'è qualcosa da mandare" in fondo
  for j in select jobid, command from cron.job where jobname = 'rmhouse-invio-messaggi' loop
    if j.command ilike '%messaggi_da_inviare%' then
      raise notice 'invio messaggi: già a posto';
    elsif j.command ~* '^\s*select\s+net\.http_post\s*\(' and j.command !~* '\mwhere\M' then
      v_cmd := regexp_replace(btrim(j.command, E' \t\r\n'), ';\s*$', '') || E'\n  where public.messaggi_da_inviare();';
      perform cron.alter_job(j.jobid, command := v_cmd);
      raise notice 'invio messaggi: ora chiama il sito solo se c''è qualcosa da mandare';
    else
      raise notice 'invio messaggi: comando diverso dal solito, lasciato com''è';
    end if;
  end loop;

  -- sveglia: un indirizzo solo, ogni 5 minuti, 5–21 UTC (7–23 in Italia d'estate, 6–22 d'inverno)
  select base_url into v_url from palestre where base_url is not null order by created_at limit 1;
  if v_url is not null and exists (select 1 from cron.job where jobname = 'rmhouse_sveglia_sito') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'rmhouse_sveglia_sito';
    perform cron.schedule('rmhouse_sveglia_sito', '*/5 5-21 * * *',
      format($c$select net.http_get(url := %L, timeout_milliseconds := 8000)$c$, rtrim(v_url, '/') || '/salute'));
    raise notice 'sveglia: ogni 5 minuti su %', rtrim(v_url, '/') || '/salute';
  end if;
end $$;

-- per controllare:  select jobname, schedule, command from cron.job order by jobname;
