-- =====================================================================
-- RMHouse — 114 CORREZIONI DAL TEST DI UNA STAGIONE INTERA (500 clienti, settembre → giugno)
-- 1. Due segretarie premono "Rinnova" insieme: nascevano due rinnovi. Ora il secondo si ferma (gia_rinnovata).
-- 2. Due rimborsi sulla carta nello stesso momento: il secondo cancellava il primo nel registro degli incassi.
--    Ora il rimborso si SOMMA a quanto già rimborsato.
-- 3. Affitto sala dalla segreteria: il prezzo del listino non veniva applicato (restava 0).
-- 4. Sospensione con date fuori dall'abbonamento: la scadenza si allungava di tutti i giorni, anche quelli
--    che non cadevano nell'abbonamento. Ora contano solo i giorni dentro; tutti fuori = errore.
-- 5. Lezione confermata DOPO che il cedolino del mese è stato pagato: non finiva in nessun cedolino.
--    Ora entra nel cedolino del mese in cui viene calcolata, come "arretrato".
-- 6. "Cancella i miei dati": il nome restava nel registro azioni, nei promemoria, nei messaggi inviati,
--    nelle notifiche allo staff, nelle iscrizioni agli eventi, negli affitti e nelle descrizioni degli incassi.
-- 7. Chi compra due abbonamenti lo stesso giorno riceveva due volte la stessa email "serve il certificato".
-- Si può eseguire più volte. Va dopo la 113.
-- =====================================================================

-- ─── 1. rinnovo: una sola segretaria alla volta ──────────────────────────────────────────────────
create or replace function rinnova_iscrizione(p_iscrizione uuid, p_tipo_abbonamento uuid default null, p_sconto_cent integer default null, p_dal date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare i iscrizioni; v_orari uuid[]; v_tipo uuid; v_dal date; v_id uuid; v_ingressi boolean; v_meta boolean;
begin
  -- il lucchetto sulla riga: la seconda segretaria aspetta la prima e poi trova il rinnovo già fatto
  select * into i from iscrizioni where id = p_iscrizione for update;
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

-- la cintura oltre alle bretelle: un abbonamento può avere un solo rinnovo
do $$
declare n int;
begin
  select count(*) into n from (select rinnovo_di from iscrizioni where rinnovo_di is not null group by rinnovo_di having count(*) > 1) x;
  if n > 0 then
    raise notice 'ATTENZIONE: % abbonamenti hanno già due rinnovi (vedi: select rinnovo_di from iscrizioni where rinnovo_di is not null group by 1 having count(*)>1). Il vincolo unico non è stato creato: sistemarli e rieseguire.', n;
  elsif not exists (select 1 from pg_indexes where indexname = 'iscrizioni_un_solo_rinnovo') then
    create unique index iscrizioni_un_solo_rinnovo on iscrizioni (rinnovo_di) where rinnovo_di is not null;
  end if;
end $$;

-- ─── 2. rimborsi sulla carta: si sommano ─────────────────────────────────────────────────────────
drop function if exists segna_rimborso_online(text, integer);
create or replace function segna_rimborso_online(p_intent text, p_rimborsato_cent integer default null, p_aggiungi integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare p pagamenti; r ricevute; v_eur text; v_chi text; v_note int; v_tot int;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into p from pagamenti where stripe_payment_intent = p_intent limit 1 for update;
  if not found then return; end if;
  -- p_aggiungi: un rimborso appena fatto dalla segreteria, da sommare a quelli di prima (anche se arrivano insieme)
  -- p_rimborsato_cent: il totale che dice Stripe (webhook charge.refunded), che non può mai abbassare il nostro
  v_tot := case when p_aggiungi is not null then coalesce(p.rimborsato_cent, 0) + p_aggiungi else p_rimborsato_cent end;
  v_tot := least(v_tot, p.importo_cent);
  if v_tot is null or v_tot <= coalesce(p.rimborsato_cent, 0) then return; end if;   -- già registrato
  v_eur := replace(to_char(v_tot / 100.0, 'FM99999990.00'), '.', ',') || ' €';
  update pagamenti set rimborsato_cent = v_tot,
         stato = case when v_tot >= importo_cent then 'rimborsato'::stato_pagamento else stato end,
         descrizione = regexp_replace(descrizione, ' — rimborsati .*$', '') || ' — rimborsati ' || v_eur || ' su Stripe'
   where id = p.id;

  select * into r from ricevute where pagamento_id = p.id and tipo_documento in ('ricevuta', 'fattura') and not annullata
   order by created_at limit 1;
  select coalesce(sum(importo_cent + iva_cent), 0) into v_note from ricevute
   where riferimento_id = r.id and tipo_documento = 'nota_credito' and not annullata;
  select trim(nome || ' ' || coalesce(cognome, '')) into v_chi from account where id = p.account_id;
  if r.id is not null and v_note < v_tot then
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (p.palestra_id, current_date,
            'Rimborso online di ' || v_eur || coalesce(' a ' || v_chi, '') || ' (' || regexp_replace(coalesce(p.descrizione, 'pagamento'), ' — rimborsati .*$', '') || ')'
            || ': emetti la nota di credito di ' || replace(to_char((v_tot - v_note) / 100.0, 'FM99999990.00'), '.', ',') || ' €'
            || ' sulla ' || r.tipo_documento || ' n. ' || r.numero || '/' || r.anno || ' (Conti → Ricevute e fatture)',
            'Stripe');
  end if;
  begin
    perform accoda_push_staff(p.palestra_id, 'pagamento', 'Rimborso sulla carta', v_eur || coalesce(' · ' || v_chi, ''),
                              '/gestione/ricevute', array['admin', 'segreteria'], null, 'rimborso:' || p_intent || ':' || v_tot);
  exception when others then null;
  end;
end $$;
grant execute on function segna_rimborso_online(text, integer, integer) to service_role;

-- ─── 3. affitto dalla segreteria: il prezzo del listino ──────────────────────────────────────────
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('crea_prenotazione_spazio(jsonb)'::regprocedure); v0 := v;
  v := replace(v, 'begin v_prezzo := prezzo_spazio(v_pal, v_sala, v_inizio, v_fine);',
                  'begin v_prezzo := (prezzo_spazio(v_pal, v_sala, v_inizio, v_fine) ->> ''prezzo_cent'')::int;');
  if v <> v0 then execute v; end if;
end $$;

-- ─── 4. sospensioni: contano solo i giorni dentro l'abbonamento, e la scadenza non va sopra il rinnovo ──
create or replace function trg_sospensioni()
returns trigger language plpgsql security definer set search_path = public as $$
declare i iscrizioni; v_giorni int; v_fine date; v_prossimo date; v_persi int; v_nome text;
begin
  select * into i from iscrizioni where id = new.iscrizione_id for update;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  v_giorni := least(new.al, i.data_fine) - greatest(new.dal, i.data_inizio) + 1;
  if v_giorni <= 0 then raise exception 'sospensione_fuori_periodo'; end if;
  v_fine := i.data_fine + v_giorni;
  -- se il rinnovo è già stato fatto (parte il 1° del mese dopo), la scadenza si ferma il giorno prima:
  -- due abbonamenti dello stesso corso non si sovrappongono; i giorni che restano li decide la segreteria
  select min(data_inizio) into v_prossimo from iscrizioni
   where allievo_id = i.allievo_id and corso_id = i.corso_id and id <> i.id and stato in ('attiva', 'sospesa') and data_inizio > i.data_fine;
  if v_prossimo is not null and v_fine >= v_prossimo then
    v_persi := v_fine - (v_prossimo - 1); v_fine := v_prossimo - 1;
    select trim(nome || ' ' || coalesce(cognome, '')) into v_nome from allievi where id = i.allievo_id;
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (i.palestra_id, current_date,
            'Sospensione di ' || coalesce(v_nome, '?') || ' (' || to_char(new.dal, 'DD/MM') || '–' || to_char(new.al, 'DD/MM') || '): ' || v_persi
            || ' giorni non si possono aggiungere perché il rinnovo parte il ' || to_char(v_prossimo, 'DD/MM') || '. Valuta uno sconto sul rinnovo o dei recuperi.',
            'Sistema');
  end if;
  update iscrizioni set data_fine = v_fine where id = new.iscrizione_id;
  return new;
end $$;

-- ─── 5. compensi: le lezioni confermate dopo il pagamento del cedolino ───────────────────────────
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('calcola_compensi(uuid, integer, integer)'::regprocedure); v0 := v;
  if v not like '%arretrato%' then
    -- anche chi questo mese non ha lezioni ma ha arretrati entra nel giro
    v := replace(v, $a$                     and (x.insegnante_id = s.id or x.svolta_da = s.id))
$a$, $a$                     and (x.insegnante_id = s.id or x.svolta_da = s.id))
            or exists (select 1 from lezioni x join compensi cp on cp.staff_id = s.id and cp.stato = 'pagato'
                         and cp.anno = extract(year from x.data) and cp.mese = extract(month from x.data)
                        where x.palestra_id = p_palestra and x.svolta_da = s.id and x.stato <> 'annullata'
                          and x.data < v_dal and x.data >= v_dal - interval '4 months'
                          and not exists (select 1 from compensi_righe r1 join compensi c1 on c1.id = r1.compenso_id
                                           where r1.lezione_id = x.id and r1.staff_id = s.id and r1.stato in ('contata', 'forfait')
                                             and (c1.anno, c1.mese) <> (p_anno, p_mese)))
$a$);
    v := replace(v, $a$    -- lezioni private confermate (dalle richieste dell'app)$a$,
$a$    -- arretrati: lezioni dei mesi scorsi tenute da lei ma confermate dopo che quel cedolino era già pagato
    for l in
      select x.*, c.nome as corso_nome, c.disciplina_id,
             extract(epoch from (x.fine - x.inizio)) / 3600.0 as ore,
             (select count(*) from presenze p where p.lezione_id = x.id and p.presente)::int as presenti,
             (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = x.id)::int as prenotati
        from lezioni x join corsi c on c.id = x.corso_id
       where x.palestra_id = p_palestra and x.stato <> 'annullata' and x.svolta_da = st.id
         and x.data < v_dal and x.data >= v_dal - interval '4 months'
         and exists (select 1 from compensi cp where cp.staff_id = st.id and cp.stato = 'pagato'
                       and cp.anno = extract(year from x.data) and cp.mese = extract(month from x.data))
         and not exists (select 1 from compensi_righe r1 where r1.lezione_id = x.id and r1.staff_id = st.id
                           and r1.stato in ('contata', 'forfait') and r1.compenso_id <> v_id)
       order by x.inizio
    loop
      v_ore := round(l.ore::numeric, 2);
      if (regola_per(st.id, l.corso_id, l.disciplina_id, false, l.data, array['forfait_mese'])).id is not null then continue; end if;
      rg := regola_per(st.id, l.corso_id, l.disciplina_id, false, l.data, array['ora', 'lezione', 'fasce', 'a_persona']);
      select * into v from valore_lezione(rg, v_ore, l.presenti, l.prenotati, st.tariffa);
      insert into compensi_righe (compenso_id, palestra_id, staff_id, lezione_id, data, inizio, corso, ore, presenti, prenotati, stato, sostituzione, regola, importo_cent)
      values (v_id, p_palestra, st.id, l.id, l.data, l.inizio, l.corso_nome, v_ore, l.presenti, l.prenotati, 'contata', null,
              'arretrato di ' || to_char(l.data, 'DD/MM') || ' · ' || coalesce(v.descr, ''), coalesce(v.importo, 0));
      v_base := v_base + coalesce(v.importo, 0); v_ore_tot := v_ore_tot + v_ore; v_lez := v_lez + 1;
    end loop;

    -- lezioni private confermate (dalle richieste dell'app)$a$);
    if v = v0 then raise exception 'calcola_compensi: testo non trovato'; end if;
    execute v;
  end if;
end $$;

-- ─── 6. "cancella i miei dati": via il nome da tutto quello che non è un documento fiscale ───────
create or replace function anonimizza_persona(p_allievo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; ac account; v_acc uuid; v_altri int; v_file text[]; v_nomi text[]; v_n text;
begin
  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  if not ha_ruolo(a.palestra_id, array['admin']) then raise exception 'solo_amministrazione'; end if;
  v_acc := a.account_id;
  select * into ac from account where id = v_acc;

  select coalesce(array_agg(file_path), '{}') into v_file from certificati where allievo_id = a.id;
  delete from certificati where allievo_id = a.id;
  delete from allievi_etichette where allievo_id = a.id;
  delete from contatti_lead where allievo_id = a.id;
  delete from liste_attesa where allievo_id = a.id;
  delete from feedback_prove where prova_id in (select id from prove where allievo_id = a.id);

  -- le forme del nome da cancellare dai testi liberi
  v_nomi := array_remove(array[
    nullif(trim(coalesce(a.nome, '') || ' ' || coalesce(a.cognome, '')), ''),
    nullif(trim(coalesce(a.cognome, '') || ' ' || coalesce(a.nome, '')), '')], null);

  update allievi set nome = 'Persona', cognome = 'anonimizzata', data_nascita = null, luogo_nascita = null,
         codice_fiscale = null, sesso = null, tessera = null, note = null, foto_url = null,
         certificato_scadenza = null, codice_esterno = null, stato_lead = 'perso',
         motivo_perso = 'Dati cancellati su richiesta'
   where id = a.id;
  update iscrizioni_evento set nome = 'Persona anonimizzata', email = null, telefono = null, note = null where allievo_id = a.id;
  update messaggi_coda set stato = 'annullato' where allievo_id = a.id and stato = 'in_coda';

  -- chi paga si anonimizza solo se non paga anche per altri
  select count(*) into v_altri from allievi where account_id = v_acc and id <> a.id and cognome <> 'anonimizzata';
  if v_altri = 0 and ac.id is not null then
    v_nomi := v_nomi || array_remove(array[
      nullif(trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')), ''),
      nullif(trim(coalesce(ac.cognome, '') || ' ' || coalesce(ac.nome, '')), ''),
      nullif(ac.email, ''), nullif(ac.telefono, '')], null);
    delete from push_iscrizioni where account_id = v_acc;
    update account set nome = 'Cliente', cognome = 'anonimizzato', email = null, telefono = null, codice_fiscale = null,
           indirizzo = null, cap = null, citta = null, provincia = null, note = null, utm = null,
           consenso_marketing = false, codice_esterno = null, user_id = null
     where id = v_acc;
    update messaggi_coda set stato = 'annullato' where account_id = v_acc and stato = 'in_coda';
    -- i messaggi già mandati restano come fatto, senza il testo né il recapito
    update messaggi_coda set destinatario = 'anonimizzato', oggetto = null, corpo = '[cancellato su richiesta della persona]'
     where account_id = v_acc;
    update prenotazioni_spazi set contatto_nome = 'Cliente anonimizzato', email = null, telefono = null where account_id = v_acc;
    update iscrizioni_evento set nome = 'Persona anonimizzata', email = null, telefono = null, note = null
     where allievo_id in (select id from allievi where account_id = v_acc);
  end if;

  -- il nome nei testi liberi: registro azioni, promemoria, notifiche allo staff, descrizioni degli incassi
  v_nomi := (select array_agg(distinct x) from unnest(v_nomi) x where length(x) >= 4);
  foreach v_n in array coalesce(v_nomi, '{}') loop
    update registro_azioni set descrizione = replace(descrizione, v_n, 'Persona anonimizzata')
     where palestra_id = a.palestra_id and descrizione like '%' || v_n || '%';
    update promemoria set testo = replace(testo, v_n, 'Persona anonimizzata')
     where palestra_id = a.palestra_id and testo like '%' || v_n || '%';
    update notifiche_staff set titolo = replace(titolo, v_n, 'Persona anonimizzata'), testo = replace(testo, v_n, 'Persona anonimizzata')
     where palestra_id = a.palestra_id and (titolo like '%' || v_n || '%' or testo like '%' || v_n || '%');
    update pagamenti set descrizione = replace(descrizione, v_n, 'Persona anonimizzata')
     where palestra_id = a.palestra_id and (allievo_id = a.id or account_id = v_acc) and descrizione like '%' || v_n || '%';
    update rate set descrizione = replace(descrizione, v_n, 'Persona anonimizzata')
     where palestra_id = a.palestra_id and (allievo_id = a.id or account_id = v_acc) and descrizione like '%' || v_n || '%';
  end loop;
  -- nel registro, i valori vecchi/nuovi delle righe sulla persona (contengono nome, data di nascita, codice fiscale…)
  update registro_azioni set modifiche = null
   where palestra_id = a.palestra_id and modifiche is not null
     and (record_id = a.id or persona_id = a.id or (v_altri = 0 and record_id = v_acc));

  return jsonb_build_object('file_da_cancellare', to_jsonb(v_file), 'account_anonimizzato', v_altri = 0);
end $$;

-- ─── 7. email "serve il certificato": una al giorno per persona, non una per abbonamento ─────────
create or replace function trg_iscrizioni_certificato()
returns trigger language plpgsql security definer set search_path = public as $$
declare a allievi; p palestre;
begin
  select * into a from allievi where id = new.allievo_id;
  if a.certificato_scadenza is not null and a.certificato_scadenza >= new.data_fine then return new; end if;
  select * into p from palestre where id = new.palestra_id;
  perform accoda_messaggio(new.palestra_id, 'certificato_richiesto', a.account_id, a.id,
    a.id::text || ':' || to_char(now(), 'YYYY-MM-DD'), now(), jsonb_build_object('nome', a.nome, 'palestra', p.nome));
  return new;
end $$;
