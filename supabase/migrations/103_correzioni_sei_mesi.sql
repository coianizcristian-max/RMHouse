-- 103 · Correzioni emerse dalla simulazione di sei mesi
-- Rieseguibile.

-- 1. Una persona compare una volta sola in una lezione.
--    Caso reale: prenota la prova dal sito, si iscrive prima del giorno della prova → era in appello due volte
--    ("iscritto" e "prova"), contava due posti e "Tutti presenti" andava in errore.
--    Se ha più motivi per esserci vale, nell'ordine: iscritto, recupero, ingresso, prova.
create or replace view v_partecipanti_lezione with (security_invoker = true) as
select distinct on (b.lezione_id, b.allievo_id) b.lezione_id, b.palestra_id, b.allievo_id, b.tipo, b.riferimento_id
  from v_partecipanti_base b
 where not (b.tipo = 'iscritto' and exists (select 1 from assenze_avvisate x where x.lezione_id = b.lezione_id and x.allievo_id = b.allievo_id))
 order by b.lezione_id, b.allievo_id,
          case b.tipo when 'iscritto' then 0 when 'recupero' then 1 when 'ingresso' then 2 when 'prova' then 3 else 4 end;

-- 2. Presenze: la stessa persona ripetuta nell'elenco non manda più in errore l'appello
create or replace function segna_presenze(p_lezione uuid, p_allievi uuid[], p_presente boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l lezioni; io uuid;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not puo_fare_appello(p_lezione) then raise exception 'non_autorizzato'; end if;
  if l.stato = 'annullata' then raise exception 'lezione_annullata'; end if;
  select id into io from staff where user_id = auth.uid() and palestra_id = l.palestra_id and attivo limit 1;

  insert into presenze (palestra_id, lezione_id, allievo_id, presente, registrata_da, registrata_at)
  select l.palestra_id, l.id, a, p_presente, auth.uid(), now() from (select distinct unnest(p_allievi) a) x
  on conflict (lezione_id, allievo_id) do update
     set presente = excluded.presente, registrata_da = excluded.registrata_da, registrata_at = now();

  update lezioni set appello_da = coalesce(appello_da, io), appello_at = coalesce(appello_at, now()),
                     appello_mod_da = io, appello_mod_at = now()
   where id = l.id
  returning * into l;
  return jsonb_build_object('appello_at', l.appello_at, 'appello_da', l.appello_da,
                            'appello_mod_at', l.appello_mod_at, 'appello_mod_da', l.appello_mod_da);
end $$;

-- 3. Rinnovo con bonifico chiesto prima della scadenza: parte il giorno dopo la fine di quello in corso
--    (prima partiva "oggi" e la conferma della segreteria dava errore "iscrizione già attiva")
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('richiedi_abbonamento(uuid,uuid,uuid,uuid[],date)'::regprocedure); v0 := v;
  if v not ilike '%dopo quello in corso%' then
    v := replace(v, '  if not quota_pagata(a.id, v_inizio) then',
      '  -- dopo quello in corso sullo stesso corso
  v_inizio := greatest(v_inizio, coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = a.id and corso_id = c.id and stato = ''attiva''), v_inizio));
  if not quota_pagata(a.id, v_inizio) then');
    -- il controllo dei posti va fatto sul periodo giusto: si sposta dopo il calcolo della data
    v := replace(v, '  foreach v_o in array coalesce(p_orari, ''{}'') loop
    if orario_pieno(v_o, v_inizio, scadenza_abbonamento(t.id, v_inizio), a.id) then raise exception ''orario_pieno''; end if;
  end loop;
', '');
    v := replace(v, '  if not quota_pagata(a.id, v_inizio) then
    select', '  foreach v_o in array coalesce(p_orari, ''{}'') loop
    if orario_pieno(v_o, v_inizio, scadenza_abbonamento(t.id, v_inizio), a.id) then raise exception ''orario_pieno''; end if;
  end loop;
  if not quota_pagata(a.id, v_inizio) then
    select');
    if v = v0 then raise notice 'richiedi_abbonamento: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- e alla conferma, se nel frattempo è cambiato qualcosa, la data si ricalcola
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('conferma_richiesta(uuid,text)'::regprocedure); v0 := v;
  if v not ilike '%v_dal%' then
    v := replace(v, 'declare r richieste_cliente; a allievi; v_isc uuid; v_orari uuid[];', 'declare r richieste_cliente; a allievi; v_isc uuid; v_orari uuid[]; v_dal date;');
    v := replace(v, '    v_isc := crea_iscrizione(r.allievo_id, (r.dati->>''tipo_abbonamento_id'')::uuid, (r.dati->>''corso_id'')::uuid,
                             (r.dati->>''data_inizio'')::date,',
      '    v_dal := greatest((r.dati->>''data_inizio'')::date, current_date,
      coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = r.allievo_id and corso_id = (r.dati->>''corso_id'')::uuid and stato = ''attiva''), current_date));
    v_isc := crea_iscrizione(r.allievo_id, (r.dati->>''tipo_abbonamento_id'')::uuid, (r.dati->>''corso_id'')::uuid,
                             v_dal,');
    if v = v0 then raise notice 'conferma_richiesta: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- 4. Pacchetto a ingressi finito prima della scadenza: il nuovo pacchetto parte subito
--    (prima: "iscrizione già attiva" in segreteria, e il rinnovo partiva solo dopo la scadenza dei 3 mesi)
create or replace function crea_iscrizione(p_allievo uuid, p_tipo_abbonamento uuid, p_corso uuid, p_data_inizio date, p_orari uuid[],
                                           p_sconto_cent integer default 0, p_quota boolean default false, p_note text default null)
returns uuid language plpgsql as $$
declare v_pal uuid; v_id uuid; v_orario uuid; v_quota int; v_mese smallint;
begin
  select palestra_id into v_pal from allievi where id = p_allievo;
  if v_pal is null then raise exception 'allievo_non_trovato'; end if;

  -- un pacchetto a ingressi già finito si chiude il giorno prima del nuovo
  update iscrizioni i set data_fine = greatest(i.data_inizio, coalesce(p_data_inizio, current_date) - 1),
                          stato = case when coalesce(p_data_inizio, current_date) - 1 < current_date then 'scaduta' else i.stato end,
                          note = concat_ws(' · ', nullif(i.note, ''), 'ingressi finiti')
   where i.allievo_id = p_allievo and i.corso_id = p_corso and i.stato = 'attiva'
     and i.data_fine >= coalesce(p_data_inizio, current_date)
     and coalesce(i.ingressi_residui, 1) <= 0
     and exists (select 1 from tipi_abbonamento t where t.id = i.tipo_abbonamento_id and t.modalita = 'ingressi');

  if exists (select 1 from iscrizioni
              where allievo_id = p_allievo and corso_id = p_corso and stato = 'attiva'
                and data_fine >= p_data_inizio) then
    raise exception 'iscrizione_gia_attiva';
  end if;

  insert into iscrizioni (palestra_id, allievo_id, tipo_abbonamento_id, corso_id, data_inizio, sconto_cent, note)
  values (v_pal, p_allievo, p_tipo_abbonamento, p_corso, coalesce(p_data_inizio, current_date),
          coalesce(p_sconto_cent, 0), p_note)
  returning id into v_id;

  foreach v_orario in array coalesce(p_orari, '{}') loop
    if not exists (select 1 from orari where id = v_orario and corso_id = p_corso) then
      raise exception 'orario_non_del_corso';
    end if;
    insert into iscrizioni_orari (iscrizione_id, orario_id) values (v_id, v_orario)
    on conflict do nothing;
  end loop;

  if p_quota then
    select quota_iscrizione_cent, mese_inizio_stagione into v_quota, v_mese from palestre where id = v_pal;
    insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent)
    values (v_pal, p_allievo, stagione_di(coalesce(p_data_inizio, current_date), v_mese), coalesce(v_quota, 0))
    on conflict (allievo_id, stagione) do nothing;
  end if;

  return v_id;
end $$;

create or replace function rinnova_iscrizione(p_iscrizione uuid, p_tipo_abbonamento uuid default null, p_sconto_cent integer default null, p_dal date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare i iscrizioni; v_orari uuid[]; v_tipo uuid; v_dal date; v_id uuid; v_ingressi boolean;
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
  select coalesce(array_agg(io.orario_id), '{}') into v_orari
    from iscrizioni_orari io where io.iscrizione_id = p_iscrizione;

  v_id := crea_iscrizione(i.allievo_id, v_tipo, i.corso_id, v_dal, v_orari,
                          coalesce(p_sconto_cent, i.sconto_cent), false, 'Rinnovo');
  update iscrizioni set rinnovo_di = p_iscrizione where id = v_id;
  return v_id;
end $$;

-- 5. Lezione annullata: le prenotazioni si chiudono e i recuperi tornano a disposizione
--    (prima: chi aveva usato un recupero su una lezione poi annullata, per esempio nella chiusura di Natale, lo perdeva)
--    Le prove su quella lezione finiscono tra le cose da fare della segreteria, per spostarle.
create or replace function trg_lezioni_annullata_prenotazioni()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_corso text;
begin
  if new.stato = 'annullata' and old.stato is distinct from 'annullata' then
    update crediti_recupero cr set usato_in = null
      from prenotazioni p
     where p.lezione_id = new.id and p.stato = 'confermata' and p.tipo = 'recupero' and cr.usato_in = p.id;
    update prenotazioni set stato = 'annullata' where lezione_id = new.id and stato = 'confermata';
    select nome into v_corso from corsi where id = new.corso_id;
    for r in select pr.id, a.nome, a.cognome from prove pr join allievi a on a.id = pr.allievo_id
              where pr.lezione_id = new.id and pr.stato in ('confermata', 'in_attesa_pagamento') loop
      insert into promemoria (palestra_id, data, testo, creato_da, lezione_id)
      values (new.palestra_id, current_date,
              'Prova da spostare: ' || r.nome || ' ' || coalesce(r.cognome, '') || ' — ' || coalesce(v_corso, 'lezione') || ' del '
                || to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ' è stata annullata.', 'Calendario', new.id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_lezioni_annullata_rimborsa on lezioni;
create trigger trg_lezioni_annullata_rimborsa after update of stato on lezioni
  for each row execute function trg_lezioni_annullata_prenotazioni();

-- sistemazione dei dati già presenti: prenotazioni rimaste "confermate" su lezioni già annullate
update crediti_recupero cr set usato_in = null
  from prenotazioni p join lezioni l on l.id = p.lezione_id
 where l.stato = 'annullata' and p.stato = 'confermata' and p.tipo = 'recupero' and cr.usato_in = p.id;
update prenotazioni p set stato = 'annullata'
  from lezioni l where l.id = p.lezione_id and l.stato = 'annullata' and p.stato = 'confermata';

-- 6. Rinnovo automatico (Stripe): l'abbonamento va di mese in mese dal giorno d'inizio, come gli addebiti di Stripe
--    (prima: comprato il 12, valeva fino al 31; Stripe riaddebitava il 12 del mese dopo → dal 1° all'11 il cliente
--    restava senza abbonamento, fuori dagli appelli, e ogni mese pagava un mese intero per 20 giorni)
create or replace function completa_acquisto(p_acquisto uuid, p_session text, p_intent text, p_customer text default null, p_subscription text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare q acquisti_online; v_iscr uuid; v_pal palestre; t tipi_abbonamento;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into q from acquisti_online where id = p_acquisto for update;
  if not found then raise exception 'acquisto_non_trovato'; end if;
  if q.stato = 'completato' then return q.iscrizione_id; end if;
  select * into t from tipi_abbonamento where id = q.tipo_abbonamento_id;

  update pagamenti set stato = 'pagato', pagato_at = now(), metodo = 'online',
         stripe_session_id = coalesce(p_session, stripe_session_id), stripe_payment_intent = coalesce(p_intent, stripe_payment_intent)
   where id = q.pagamento_id;
  if p_customer is not null then update account set stripe_customer_id = p_customer where id = q.account_id; end if;

  begin
    v_iscr := crea_iscrizione(q.allievo_id, q.tipo_abbonamento_id, q.corso_id, q.data_inizio, q.orari, 0, false,
                              'Acquistato online' || case when p_subscription is not null then ' con rinnovo automatico' else '' end);
    update iscrizioni set pagamento_id = q.pagamento_id,
           data_fine = case when p_subscription is not null
                            then (data_inizio + make_interval(months => greatest(coalesce(t.durata_mesi, 1), 1)))::date - 1
                            else data_fine end
     where id = v_iscr;
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

  if p_subscription is not null then
    insert into abbonamenti_ricorrenti (palestra_id, account_id, allievo_id, tipo_abbonamento_id, corso_id, orari, importo_cent,
                                        stripe_subscription_id, ultima_iscrizione_id)
    values (q.palestra_id, q.account_id, q.allievo_id, q.tipo_abbonamento_id, q.corso_id, q.orari,
            coalesce(nullif(t.prezzo_web_cent, 0), t.prezzo_cent), p_subscription, v_iscr)
    on conflict (stripe_subscription_id) do nothing;
  end if;
  return v_iscr;
end $$;

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
  update iscrizioni set pagamento_id = v_pag,
         data_fine = (data_inizio + make_interval(months => greatest(coalesce(t.durata_mesi, 1), 1)))::date - 1
   where id = v_iscr;
  update abbonamenti_ricorrenti set ultima_iscrizione_id = v_iscr, stato = 'attivo' where id = r.id;
  return v_pag;
end $$;

-- 7. Chi ha il rinnovo automatico non riceve più "il tuo abbonamento scade, rinnovalo" (rischiava di pagare due volte)
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('lavori_giornalieri()'::regprocedure); v0 := v;
  if v not ilike '%abbonamenti_ricorrenti%' then
    v := replace(v, 'where i.palestra_id = pal.id and i.stato = ''attiva'' and i.data_fine = v_oggi + t.giorni',
      'where i.palestra_id = pal.id and i.stato = ''attiva'' and i.data_fine = v_oggi + t.giorni
          and not exists (select 1 from abbonamenti_ricorrenti ar where ar.allievo_id = i.allievo_id and ar.corso_id = i.corso_id
                            and ar.stato in (''attivo'', ''in_ritardo''))');
    if v = v0 then raise notice 'lavori_giornalieri: testo non trovato'; else execute v; end if;
  end if;
  v := pg_get_functiondef('notifiche_clienti(text)'::regprocedure); v0 := v;
  if v not ilike '%abbonamenti_ricorrenti%' then
    v := replace(v, '     where i.stato = ''attiva'' and (i.data_fine - (now() at time zone p.fuso_orario)::date) in (7, 1)',
      '     where i.stato = ''attiva'' and (i.data_fine - (now() at time zone p.fuso_orario)::date) in (7, 1)
       and not exists (select 1 from abbonamenti_ricorrenti ar where ar.allievo_id = i.allievo_id and ar.corso_id = i.corso_id
                         and ar.stato in (''attivo'', ''in_ritardo''))');
    if v = v0 then raise notice 'notifiche_clienti: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- 8. Chiusure (Palinsesto → Chiusure): un avviso solo per persona, non uno per ogni lezione
--    (Natale: chi ha 2 lezioni a settimana riceveva 4 messaggi; le insegnanti uno per lezione).
--    Si annullano solo le lezioni ancora da fare (non quelle già tenute).
create or replace function trg_lezioni_annullata_clienti()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; n int; v_testo text; pal palestre;
begin
  if coalesce(current_setting('rm.chiusura', true), '') = '1' then return new; end if;   -- ci pensa la chiusura
  if new.stato = 'annullata' and old.stato is distinct from 'annullata' and new.inizio > now() then
    select * into pal from palestre where id = new.palestra_id;
    v_testo := (select nome from corsi where id = new.corso_id) || ' di ' ||
               to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ' non si fa. Ci scusiamo!';
    for r in select distinct a.account_id from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id
              where vp.lezione_id = new.id and a.account_id is not null loop
      begin
        n := 0;
        if vuole_notifica(r.account_id, 'lezioni') then
          n := accoda_push(r.account_id, 'Lezione annullata', v_testo, '/area', 'ann:' || new.id || ':' || r.account_id);
        end if;
        -- nessun telefono raggiunto: l'avviso arriva per email (è un'informazione di servizio)
        if coalesce(n, 0) = 0 then
          insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
          select new.palestra_id, acc.id, 'lezione_annullata', 'email', acc.email, 'Lezione annullata',
                 'Ciao,' || E'\n\n' || v_testo || coalesce(E'\n' || nullif(trim(new.note), ''), '')
                   || E'\n\nPer recuperarla scrivici o guarda l''app.' || E'\n\n' || pal.nome,
                 'ann-mail:' || new.id || ':' || acc.id
            from account acc where acc.id = r.account_id and acc.email is not null
          on conflict (palestra_id, chiave) do nothing;
        end if;
      exception when others then null; end;
    end loop;
  end if;
  return new;
end $$;

create or replace function trg_chiusure_annulla()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; r record; n int; pal palestre; v_periodo text; v_testo text;
begin
  select * into pal from palestre where id = new.palestra_id;
  select coalesce(array_agg(id), '{}') into v_ids from lezioni
   where palestra_id = new.palestra_id and data between new.dal and new.al and stato = 'programmata' and svolta_da is null;
  if cardinality(v_ids) = 0 then return new; end if;
  v_periodo := case when new.dal = new.al then 'il ' || to_char(new.dal, 'DD/MM')
                    else 'dal ' || to_char(new.dal, 'DD/MM') || ' al ' || to_char(new.al, 'DD/MM') end;
  v_testo := 'La scuola resta chiusa ' || v_periodo || coalesce(' (' || nullif(trim(new.motivo), '') || ')', '') || ': ';

  -- i clienti: un messaggio solo, con le loro lezioni saltate
  for r in select a.account_id, count(distinct vp.lezione_id) as quante
             from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id join lezioni l on l.id = vp.lezione_id
            where vp.lezione_id = any (v_ids) and l.inizio > now() and a.account_id is not null
            group by a.account_id loop
    begin
      n := 0;
      if vuole_notifica(r.account_id, 'lezioni') then
        n := accoda_push(r.account_id, 'Scuola chiusa ' || v_periodo, v_testo || r.quante || case when r.quante = 1 then ' tua lezione non si fa.' else ' tue lezioni non si fanno.' end,
                         '/area', 'chius:' || new.id || ':' || r.account_id);
      end if;
      if coalesce(n, 0) = 0 then
        insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
        select new.palestra_id, acc.id, 'chiusura', 'email', acc.email, 'Scuola chiusa ' || v_periodo,
               'Ciao,' || E'\n\n' || v_testo || r.quante || case when r.quante = 1 then ' tua lezione non si fa.' else ' tue lezioni non si fanno.' end
                 || E'\n\n' || pal.nome,
               'chius-mail:' || new.id || ':' || acc.id
          from account acc where acc.id = r.account_id and acc.email is not null
        on conflict (palestra_id, chiave) do nothing;
      end if;
    exception when others then null; end;
  end loop;

  -- le insegnanti: un avviso ciascuna
  for r in select insegnante_id, count(*) as quante from lezioni where id = any (v_ids) and insegnante_id is not null and inizio > now() group by insegnante_id loop
    begin
      perform accoda_push_staff(new.palestra_id, 'lezione', 'Scuola chiusa ' || v_periodo,
        r.quante || case when r.quante = 1 then ' tua lezione annullata' else ' tue lezioni annullate' end || coalesce(' · ' || nullif(trim(new.motivo), ''), ''),
        '/gestione/calendario', null, r.insegnante_id, 'chius:' || new.id || ':' || r.insegnante_id);
    exception when others then null; end;
  end loop;

  perform set_config('rm.chiusura', '1', true);
  perform set_config('rm.cambio_in_blocco', '1', true);
  update lezioni set stato = 'annullata', note = coalesce(new.motivo, 'Chiusura') where id = any (v_ids);
  perform set_config('rm.chiusura', '', true);
  perform set_config('rm.cambio_in_blocco', '', true);
  return new;
end $$;

-- 9. Statistiche "Prova → iscrizione": contavano tutti i nuovi iscritti, anche chi non aveva fatto la prova
--    (nella simulazione usciva 262%). Ora contano solo gli iscritti che hanno fatto la prova.
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('cruscotto(uuid,date,date)'::regprocedure); v0 := v;
  if v not ilike '%iscritti dopo una prova%' then
    v := replace(v, 'count(distinct allievo_id) filter (where evento = ''iscritto'') iscritti',
      'count(distinct allievo_id) filter (where evento = ''iscritto'' and exists (select 1 from lead_eventi p   -- iscritti dopo una prova
          where p.allievo_id = lead_eventi.allievo_id and p.evento = ''prova_effettuata'')) iscritti');
    if v = v0 then raise notice 'cruscotto: testo non trovato'; else execute v; end if;
  end if;
  v := pg_get_functiondef('statistiche_funnel(uuid,date,date)'::regprocedure); v0 := v;
  if v not ilike '%iscritti dopo una prova%' then
    v := replace(v, 'filter (where le.evento = ''iscritto'')',
      'filter (where le.evento = ''iscritto'' and exists (select 1 from lead_eventi p   -- iscritti dopo una prova
          where p.allievo_id = le.allievo_id and p.evento = ''prova_effettuata''))');
    if v = v0 then raise notice 'statistiche_funnel: testo non trovato'; else execute v; end if;
  end if;
end $$;
