-- =====================================================================
-- RMHouse — 107 MESE SOLARE ANCHE PER I RINNOVI
-- Gli abbonamenti vanno a mese solare: scadono il 30/31 del mese.
-- • Il rinnovo automatico con carta torna a mese solare (la 103 lo faceva andare
--   dal 12 all'11): il primo mese si paga all'acquisto, poi Stripe addebita il 1° del mese.
-- • Dall'app (carta o bonifico) un abbonamento a mese si compra solo dal 1° del mese:
--   per partire a metà mese si passa dalla segreteria, che decide l'importo.
-- • Rinnovo in segreteria che ripartirebbe a metà mese (scaduto da qualche giorno,
--   o dopo una sospensione): serve l'importo, non si rinnova "in blocco".
-- Si può eseguire più volte. Va dopo la 106.
-- =====================================================================

-- Un abbonamento "a mese solare": scade a fine mese (non a ingressi, non a giorni/settimane)
create or replace function a_mese_solare(p_tipo uuid)
returns boolean language sql stable set search_path = public as $$
  select coalesce((select t.scadenza_fine_mese and t.modalita <> 'ingressi'
                          and (t.durata_giorni is null or t.durata_giorni >= 28)
                     from tipi_abbonamento t where t.id = p_tipo), false);
$$;
grant execute on function a_mese_solare(uuid) to authenticated;

-- 1. Acquisto con carta dall'app: solo dal 1° del mese
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('prepara_acquisto(jsonb)'::regprocedure); v0 := v;
  if v not ilike '%inizio_meta_mese%' then
    v := replace(v, '  -- posti: chi rinnova il suo stesso orario non conta',
      '  -- mese solare: dall''app si parte il 1° del mese (a metà mese l''importo lo decide la segreteria)
  if a_mese_solare(t.id) and extract(day from v_inizio) <> 1 then raise exception ''inizio_meta_mese''; end if;

  -- posti: chi rinnova il suo stesso orario non conta');
    if v = v0 then raise exception 'prepara_acquisto: testo non trovato'; end if;
    execute v;
  end if;
end $$;

-- 2. Richiesta di bonifico dall'app: stessa regola
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('richiedi_abbonamento(uuid, uuid, uuid, uuid[], date)'::regprocedure); v0 := v;
  if v not ilike '%inizio_meta_mese%' then
    v := replace(v, 'stato = ''attiva''), v_inizio));
  foreach v_o in array',
      'stato = ''attiva''), v_inizio));
  if a_mese_solare(t.id) and extract(day from v_inizio) <> 1 then raise exception ''inizio_meta_mese''; end if;
  foreach v_o in array');
    if v = v0 then raise exception 'richiedi_abbonamento: testo non trovato'; end if;
    execute v;
  end if;
end $$;

-- 3. Fine dell'acquisto online: la scadenza è quella normale (fine mese), anche col rinnovo automatico.
--    Il rinnovo automatico si collega dopo, con collega_ricorrente.
create or replace function completa_acquisto(p_acquisto uuid, p_session text, p_intent text, p_customer text default null, p_subscription text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare q acquisti_online; v_iscr uuid; v_pal palestre; t tipi_abbonamento; v_inizio date; a allievi; c corsi;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into q from acquisti_online where id = p_acquisto for update;
  if not found then raise exception 'acquisto_non_trovato'; end if;
  if q.stato = 'completato' then return q.iscrizione_id; end if;
  select * into t from tipi_abbonamento where id = q.tipo_abbonamento_id;
  -- pagato due volte (due schede aperte): il secondo si accoda al primo e la segreteria lo sa
  v_inizio := greatest(q.data_inizio, coalesce((select max(data_fine) + 1 from iscrizioni
                where allievo_id = q.allievo_id and corso_id = q.corso_id and stato = 'attiva'), q.data_inizio));
  if v_inizio <> q.data_inizio then
    select * into a from allievi where id = q.allievo_id;
    select * into c from corsi where id = q.corso_id;
    perform accoda_push_staff(q.palestra_id, 'pagamento', 'Pagato due volte?',
      trim(a.nome || ' ' || coalesce(a.cognome, '')) || ' ha pagato online ' || coalesce(t.nome, 'un abbonamento') || ' a ' || coalesce(c.nome, '')
      || ', che aveva già: l''ho accodato dal ' || to_char(v_inizio, 'DD/MM') || '. Se è un errore, rimborsalo dalla scheda (Pagamenti → Rimborsa).',
      '/gestione/persone/' || q.allievo_id, array['admin', 'segreteria'], null, 'doppio:' || q.id);
    update acquisti_online set data_inizio = v_inizio where id = q.id;
    q.data_inizio := v_inizio;
  end if;

  update pagamenti set stato = 'pagato', pagato_at = now(), metodo = 'online',
         stripe_session_id = coalesce(p_session, stripe_session_id), stripe_payment_intent = coalesce(p_intent, stripe_payment_intent)
   where id = q.pagamento_id;
  if p_customer is not null then update account set stripe_customer_id = p_customer where id = q.account_id; end if;

  begin
    v_iscr := crea_iscrizione(q.allievo_id, q.tipo_abbonamento_id, q.corso_id, q.data_inizio, q.orari, 0, false,
                              'Acquistato online' || case when q.ricorrente then ' con rinnovo automatico' else '' end);
    update iscrizioni set pagamento_id = q.pagamento_id where id = v_iscr;
    if q.quota then
      select * into v_pal from palestre where id = q.palestra_id;
      insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, pagamento_id, data)
      values (q.palestra_id, q.allievo_id, stagione_di(q.data_inizio, v_pal.mese_inizio_stagione), v_pal.quota_iscrizione_cent,
              q.pagamento_id, current_date)
      on conflict do nothing;
    end if;
    update acquisti_online set stato = 'completato', iscrizione_id = v_iscr, stripe_session_id = p_session where id = q.id;
  exception when others then
    -- pagato ma l'iscrizione non si è potuta creare: lo vede la segreteria
    update acquisti_online set stato = 'errore', errore = sqlerrm, stripe_session_id = p_session where id = q.id;
    return null;
  end;

  -- vecchie casse in modalità abbonamento (prima della 107): il rinnovo arriva già con la sessione
  if p_subscription is not null then perform collega_ricorrente(q.id, p_subscription); end if;
  return v_iscr;
end $$;

-- Il rinnovo automatico creato su Stripe dopo il primo pagamento (parte il 1° del mese dopo la scadenza)
create or replace function collega_ricorrente(p_acquisto uuid, p_subscription text)
returns uuid language plpgsql security definer set search_path = public as $$
declare q acquisti_online; t tipi_abbonamento; v_id uuid;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into q from acquisti_online where id = p_acquisto;
  if not found or q.iscrizione_id is null then raise exception 'acquisto_non_trovato'; end if;
  select * into t from tipi_abbonamento where id = q.tipo_abbonamento_id;
  insert into abbonamenti_ricorrenti (palestra_id, account_id, allievo_id, tipo_abbonamento_id, corso_id, orari, importo_cent,
                                      stripe_subscription_id, ultima_iscrizione_id)
  values (q.palestra_id, q.account_id, q.allievo_id, q.tipo_abbonamento_id, q.corso_id, q.orari,
          coalesce(nullif(t.prezzo_web_cent, 0), t.prezzo_cent), p_subscription, q.iscrizione_id)
  on conflict (stripe_subscription_id) do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function collega_ricorrente(uuid, text) from public, anon, authenticated;
grant execute on function collega_ricorrente(uuid, text) to service_role;

-- 4. Rinnovo automatico pagato: nuovo mese solare dal giorno dopo l'ultimo pagato
create or replace function rinnova_ricorrente(p_subscription text, p_importo_cent integer, p_intent text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r abbonamenti_ricorrenti; v_pag uuid; v_iscr uuid; v_inizio date; v_ultima date; t tipi_abbonamento; c corsi; a allievi;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into r from abbonamenti_ricorrenti where stripe_subscription_id = p_subscription for update;
  if not found then return null; end if;
  if exists (select 1 from pagamenti where stripe_payment_intent = p_intent) then return null; end if;
  select * into t from tipi_abbonamento where id = r.tipo_abbonamento_id;
  select * into c from corsi where id = r.corso_id;
  select * into a from allievi where id = r.allievo_id;
  -- il nuovo mese parte dal giorno dopo l'ultimo pagato (anche se Stripe ha riprovato qualche giorno dopo)
  select max(data_fine) into v_ultima from iscrizioni
   where allievo_id = r.allievo_id and corso_id = r.corso_id and stato in ('attiva', 'scaduta');
  v_inizio := case when v_ultima is not null and v_ultima >= current_date - 20 then v_ultima + 1 else current_date end;

  insert into pagamenti (palestra_id, account_id, allievo_id, corso_id, causale, descrizione, importo_cent, metodo, stato,
                         pagato_at, stripe_payment_intent)
  values (r.palestra_id, r.account_id, r.allievo_id, r.corso_id, 'abbonamento',
          t.nome || ' · ' || c.nome || ' · ' || a.nome || ' (rinnovo automatico)', p_importo_cent, 'online', 'pagato', now(), p_intent)
  returning id into v_pag;
  if r.stato in ('annullato', 'da_disdire') then
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (r.palestra_id, current_date, 'Rinnovo automatico addebitato dopo la disdetta: ' || a.nome || ' ' || coalesce(a.cognome, '')
            || ' (' || to_char(p_importo_cent / 100.0, 'FM9990.00') || ' €). Rimborsalo dalla scheda (Pagamenti → Rimborsa).', 'Stripe');
    return v_pag;
  end if;
  v_iscr := crea_iscrizione(r.allievo_id, r.tipo_abbonamento_id, r.corso_id, v_inizio, r.orari, 0, false, 'Rinnovo automatico');
  update iscrizioni set pagamento_id = v_pag where id = v_iscr;   -- scadenza: fine mese, come tutti
  if a_mese_solare(t.id) and extract(day from v_inizio) <> 1 then
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (r.palestra_id, current_date, 'Rinnovo automatico di ' || a.nome || ' ' || coalesce(a.cognome, '') || ' partito il '
            || to_char(v_inizio, 'DD/MM') || ' (non dal 1° del mese) e pagato ' || to_char(p_importo_cent / 100.0, 'FM9990.00')
            || ' €: controlla l''importo e, se serve, rimborsa la differenza.', 'Stripe');
  end if;
  update abbonamenti_ricorrenti set ultima_iscrizione_id = v_iscr, stato = 'attivo' where id = r.id;
  return v_pag;
end $$;

-- 5. Rinnovo in segreteria: se ripartirebbe a metà mese serve l'importo (lo sconto rispetto al listino)
create or replace function rinnova_iscrizione(p_iscrizione uuid, p_tipo_abbonamento uuid default null, p_sconto_cent integer default null, p_dal date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare i iscrizioni; v_orari uuid[]; v_tipo uuid; v_dal date; v_id uuid; v_ingressi boolean; v_meta boolean;
begin
  select * into i from iscrizioni where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  if exists (select 1 from iscrizioni r where r.rinnovo_di = p_iscrizione) then
    raise exception 'gia_rinnovata';
  end if;

  v_tipo := coalesce(p_tipo_abbonamento, i.tipo_abbonamento_id);
  -- ingressi finiti: il nuovo pacchetto parte oggi, non alla scadenza del vecchio
  select t.modalita = 'ingressi' and coalesce(i.ingressi_residui, 1) <= 0 into v_ingressi from tipi_abbonamento t where t.id = i.tipo_abbonamento_id;
  v_dal := coalesce(p_dal, case when v_ingressi then current_date else greatest(i.data_fine + 1, current_date) end);
  v_meta := a_mese_solare(v_tipo) and extract(day from v_dal) <> 1;
  if v_meta and p_sconto_cent is null then raise exception 'inizio_meta_mese'; end if;
  select coalesce(array_agg(io.orario_id), '{}') into v_orari
    from iscrizioni_orari io where io.iscrizione_id = p_iscrizione;

  v_id := crea_iscrizione(i.allievo_id, v_tipo, i.corso_id, v_dal, v_orari,
                          coalesce(p_sconto_cent, i.sconto_cent), false,
                          case when v_meta then 'Rinnovo da metà mese' else 'Rinnovo' end);
  update iscrizioni set rinnovo_di = p_iscrizione where id = v_id;
  return v_id;
end $$;

-- Quanto resta del mese per chi parte a metà: lezioni dei giorni scelti da qui a fine mese su quelle del mese intero
-- (la segreteria lo vede come proposta; l'importo lo decide lei)
create or replace function lezioni_rimaste_mese(p_orari uuid[], p_dal date)
returns jsonb language sql stable security definer set search_path = public as $$
  with giorni as (
    select d::date g from generate_series(date_trunc('month', p_dal), date_trunc('month', p_dal) + interval '1 month' - interval '1 day', interval '1 day') d
  ), o as (select giorno_settimana from orari where id = any(coalesce(p_orari, '{}')))
  select jsonb_build_object(
    'mese', (select count(*) from giorni g join o on o.giorno_settimana = extract(isodow from g.g)),
    'rimaste', (select count(*) from giorni g join o on o.giorno_settimana = extract(isodow from g.g) where g.g >= p_dal
                  and not exists (select 1 from chiusure ch where g.g between ch.dal and ch.al
                                    and ch.palestra_id in (select palestra_id from orari where id = any(coalesce(p_orari, '{}'))))));
$$;
grant execute on function lezioni_rimaste_mese(uuid[], date) to authenticated;

-- 6. Rinnovi automatici già attivi con l'addebito non il 1° del mese (fatti con la 103): un promemoria per sistemarli
insert into promemoria (palestra_id, data, testo, creato_da)
select ar.palestra_id, current_date,
       'Rinnovo automatico di ' || a.nome || ' ' || coalesce(a.cognome, '') || ' si addebita il giorno '
       || extract(day from i.data_inizio) || ' del mese: va portato al 1° (su Stripe, oppure disdetto e rifatto dall''app da inizio mese).', 'Sistema'
  from abbonamenti_ricorrenti ar
  join iscrizioni i on i.id = ar.ultima_iscrizione_id
  join allievi a on a.id = ar.allievo_id
 where ar.stato in ('attivo', 'in_ritardo') and extract(day from i.data_inizio) <> 1
   and not exists (select 1 from promemoria p where p.palestra_id = ar.palestra_id and p.testo like 'Rinnovo automatico di ' || a.nome || ' ' || coalesce(a.cognome, '') || ' si addebita%');

-- 7. Bonifico confermato qualche giorno dopo: l'abbonamento parte dal giorno chiesto (il 1° del mese pagato),
--    non dal giorno della conferma (prima: richiesto dal 1°, confermato il 4 → valeva dal 4 al 30 per un mese intero)
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('conferma_richiesta(uuid, text)'::regprocedure); v0 := v;
  if v not ilike '%dal giorno chiesto%' then
    v := replace(v, $a$    v_dal := greatest((r.dati->>'data_inizio')::date, current_date,
      coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = r.allievo_id and corso_id = (r.dati->>'corso_id')::uuid and stato = 'attiva'), current_date));$a$,
      $a$    -- dal giorno chiesto (o dopo l'abbonamento in corso), anche se il bonifico si conferma qualche giorno dopo
    v_dal := greatest(coalesce((r.dati->>'data_inizio')::date, current_date),
      coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = r.allievo_id and corso_id = (r.dati->>'corso_id')::uuid and stato = 'attiva'), current_date - 3650));$a$);
    if v = v0 then raise exception 'conferma_richiesta: testo non trovato'; end if;
    execute v;
  end if;
end $$;
