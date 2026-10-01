-- =====================================================================
-- RMHouse — 070 VELOCITÀ, MENO LAVORO PER VERCEL, SICUREZZA, PRIVACY
--  1. Indici: ogni collegamento fra tabelle ha il suo indice, più quelli
--     per le ricerche che il gestionale e l'app fanno di continuo
--  2. Invio messaggi: il database chiama Vercel solo se c'è davvero
--     qualcosa da spedire (prima: 288 chiamate al giorno a vuoto)
--  3. Funzioni del database: chi non ha fatto l'accesso non può chiamarle
--  4. Richieste privacy dei clienti (cancellazione) alla segreteria
-- Si può eseguire più volte. Va dopo la 068.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. INDICI
-- ---------------------------------------------------------------------
-- un indice per ogni chiave esterna che non ne ha già uno
do $$
declare r record; v_nome text;
begin
  for r in
    select c.conrelid::regclass::text as tab, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and array_length(c.conkey, 1) = 1
       and c.connamespace = 'public'::regnamespace
       and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    v_nome := left('ix_' || replace(r.tab, 'public.', '') || '_' || r.col, 63);
    execute format('create index if not exists %I on %s (%I)', v_nome, r.tab, r.col);
  end loop;
end $$;

-- le ricerche più frequenti
create index if not exists ix_lezioni_palestra_inizio   on lezioni (palestra_id, inizio);
create index if not exists ix_lezioni_insegnante_data   on lezioni (insegnante_id, data);
create index if not exists ix_lezioni_sala_data         on lezioni (sala_id, data);
create index if not exists ix_prenotazioni_lezione_conf on prenotazioni (lezione_id) where stato = 'confermata';
create index if not exists ix_prenotazioni_allievo_stato on prenotazioni (allievo_id, stato);
create index if not exists ix_presenze_allievo_lezione  on presenze (allievo_id, lezione_id);
create index if not exists ix_iscrizioni_corso_stato    on iscrizioni (corso_id, stato, data_fine);
create index if not exists ix_iscrizioni_allievo_stato  on iscrizioni (allievo_id, stato, data_fine);
create index if not exists ix_iscrizioni_orari_orario   on iscrizioni_orari (orario_id, iscrizione_id);
create index if not exists ix_pagamenti_allievo_data    on pagamenti (allievo_id, created_at desc);
create index if not exists ix_pagamenti_account_data    on pagamenti (account_id, created_at desc);
create index if not exists ix_crediti_allievo_liberi    on crediti_recupero (allievo_id, scadenza) where usato_in is null and not annullato;
create index if not exists ix_account_email             on account (palestra_id, lower(email));
create index if not exists ix_allievi_palestra_nome     on allievi (palestra_id, lower(cognome), lower(nome));
create index if not exists ix_messaggi_da_spedire       on messaggi_coda (programmato_per) where stato = 'in_coda';
create index if not exists ix_orari_attivi              on orari (palestra_id, giorno_settimana, ora_inizio) where attivo;
create index if not exists ix_assenze_lezione           on assenze_avvisate (lezione_id, allievo_id);

-- statistiche aggiornate, così il database sceglie subito gli indici giusti
analyze;

-- ---------------------------------------------------------------------
-- 2. INVIO MESSAGGI: CHIAMARE VERCEL SOLO SE SERVE
--    Il comando del cron resta quello che avete impostato (indirizzo e
--    chiave segreta), ma parte solo se c'è un messaggio pronto.
-- ---------------------------------------------------------------------
do $$
declare j record; v_cmd text;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'rmhouse-invio-messaggi';
  if j.jobid is null or j.command ilike '%messaggi_coda%' then return; end if;
  v_cmd := regexp_replace(trim(j.command), ';\s*$', '');
  v_cmd := v_cmd || E'\n  where exists (select 1 from public.messaggi_coda m where m.stato = ''in_coda'' and m.programmato_per <= now() and m.canale::text in (''email'', ''push''));';
  perform cron.alter_job(j.jobid, command := v_cmd);
end $$;

-- ---------------------------------------------------------------------
-- 3. FUNZIONI DEL DATABASE: NIENTE PER CHI NON HA FATTO L'ACCESSO
--    Il sito pubblico (prova, affitto sale, sondaggi…) passa dal server,
--    che usa la sua chiave: ai visitatori anonimi non serve chiamarle.
--    Restano quelle usate nelle regole di lettura delle tabelle.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
       and not exists (select 1 from pg_policies pol
                        where position(p.proname || '(' in coalesce(pol.qual, '') || coalesce(pol.with_check, '')) > 0)
  loop
    execute format('revoke execute on function %s from public, anon', r.firma);
  end loop;
end $$;
-- anche per le funzioni che verranno create in futuro
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- 4. RICHIESTE PRIVACY DEI CLIENTI
--    Dall'area clienti: "chiedi la cancellazione dei miei dati".
--    Arriva alla segreteria in "Da fare oggi"; la cancellazione vera la fa
--    un amministratore dalla scheda (Privacy → Cancella i dati).
-- ---------------------------------------------------------------------
create or replace function richiesta_privacy(p_allievo uuid, p_tipo text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a allievi; v_chi text;
begin
  if p_tipo not in ('cancellazione', 'rettifica', 'opposizione', 'altro') then raise exception 'tipo_non_valido'; end if;
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  select trim(nome || ' ' || coalesce(cognome, '')) into v_chi from account where id = a.account_id;
  insert into promemoria (palestra_id, data, testo, creato_da)
  values (a.palestra_id, current_date,
          'Richiesta privacy (' || p_tipo || ') per ' || trim(a.nome || ' ' || coalesce(a.cognome, ''))
            || ' da ' || coalesce(v_chi, 'cliente') || coalesce(': ' || nullif(trim(p_nota), ''), '')
            || ' — rispondere entro 30 giorni (GDPR)',
          'area clienti');
end $$;
revoke execute on function richiesta_privacy(uuid, text, text) from public, anon;
grant execute on function richiesta_privacy(uuid, text, text) to authenticated;
