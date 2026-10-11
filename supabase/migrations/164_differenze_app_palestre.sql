-- 164 — Differenze con APP Palestre: niente modifica fatta a mano in RMHouse viene sovrascritta in silenzio
-- • Ogni import si ricorda cosa diceva APP Palestre (tabella import_valori) per persone, contatti della famiglia,
--   date degli abbonamenti e incassi.
-- • Al giro dopo: se in RMHouse nessuno ha toccato quel campo e in APP Palestre è cambiato → si aggiorna da solo.
--   Se in RMHouse è stato cambiato a mano (o è il primo confronto) → resta quello di RMHouse e in "Da sistemare"
--   compare la differenza, campo per campo, con il bottone "Usa APP Palestre" (incassi: solo segnalati).
-- • L'email non si aggiorna mai da sola (serve per l'accesso all'app): solo segnalata.
-- • Non sono differenze: nome e cognome solo scambiati, data di nascita corretta col codice fiscale, codice fiscale
--   giusto in RMHouse e sbagliato in APP Palestre, maiuscole, spazi, punteggiatura, prefisso +39.
-- • "Togli le prove": vanno via anche le iscrizioni agli eventi delle persone tolte.
-- Ridefinisce per intero: importa_app_palestre_clienti, importa_ap_pagamenti, importa_ap_chiudi,
-- risolvi_anomalia_import, togli_prove. Si può rilanciare.

create table if not exists import_valori (
  palestra_id uuid not null references palestre(id) on delete cascade,
  tipo text not null,            -- persona | famiglia | abbonamento | incasso
  rif_id uuid not null,          -- allievi / account / iscrizioni / pagamenti
  valori jsonb not null,         -- cosa diceva APP Palestre all'ultimo import
  visto_at timestamptz not null default now(),
  primary key (tipo, rif_id)
);
alter table import_valori enable row level security;   -- solo le funzioni qui sotto la usano

-- un valore pronto per il confronto: niente maiuscole, spazi, punteggiatura, prefissi
create or replace function confronto_norm(p_campo text, v text)
returns text
language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then null
    when p_campo = 'telefono' then nullif(
      (select case when length(d) > 10 and d like '0039%' then substr(d, 5) when length(d) > 10 and d like '39%' then substr(d, 3) else d end
         from (select regexp_replace(v, '\D', '', 'g') as d) x), '')
    when p_campo = 'codice_fiscale' then upper(regexp_replace(v, '\s', '', 'g'))
    when p_campo = 'email' then lower(btrim(v))
    when p_campo in ('cap', 'importo_cent') then nullif(regexp_replace(v, '\D', '', 'g'), '')
    when p_campo like 'data%' then left(btrim(v), 10)
    else nullif(btrim(regexp_replace(lower(v), '[^[:alnum:]]+', ' ', 'g')), '')
  end
$$;

-- per il testo in "Da sistemare"
create or replace function valore_leggibile(p_campo text, v jsonb)
returns text
language sql immutable as $$
  select case
    when v is null or v = 'null'::jsonb or btrim(v #>> '{}') = '' then '(vuoto)'
    when p_campo like 'data%' then to_char((v #>> '{}')::date, 'DD/MM/YYYY')
    when p_campo = 'importo_cent' then replace(to_char((v #>> '{}')::numeric / 100, 'FM999999990.00'), '.', ',') || ' €'
    else v #>> '{}'
  end
$$;

-- confronta quello che dice APP Palestre (p_app) con RMHouse (p_rmh) e con l'ultimo import.
-- Ritorna { aggiorna: i campi da aggiornare da soli (quelli in p_auto che in RMHouse nessuno ha toccato), diversi: quante
-- differenze sono andate in "Da sistemare" }. I campi vuoti in RMHouse li riempie chi chiama, come prima.
create or replace function differenze_import(p_palestra uuid, p_imp uuid, p_tipo text, p_rif uuid, p_allievo uuid,
                                             p_app jsonb, p_rmh jsonb, p_auto text[], p_titolo text, p_categoria text,
                                             p_link text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; k text; a text; r text; o text; v_agg jsonb := '{}'; v_campi jsonb := '{}'; v_righe jsonb := '[]';
  v_testo text[] := '{}'; v_chiave text;
  v_et jsonb := '{"nome":"Nome","cognome":"Cognome","data_nascita":"Data di nascita","codice_fiscale":"Codice fiscale",
                  "email":"Email","telefono":"Telefono","indirizzo":"Indirizzo","cap":"CAP","citta":"Comune","provincia":"Provincia",
                  "data_inizio":"Inizio","data_fine":"Fine","importo_cent":"Importo","metodo":"Metodo","data":"Data"}';
begin
  select valori into v_old from import_valori where tipo = p_tipo and rif_id = p_rif;
  for k in select jsonb_object_keys(p_app) loop
    a := confronto_norm(k, p_app ->> k); r := confronto_norm(k, p_rmh ->> k); o := confronto_norm(k, v_old ->> k);
    continue when a is null or r is null or a = r;
    if v_old is not null and r is not distinct from o and k = any(p_auto) then
      v_agg := v_agg || jsonb_build_object(k, p_app -> k);          -- in RMHouse nessuno l'ha toccato: vale APP Palestre
    else
      v_campi := v_campi || jsonb_build_object(k, p_app -> k);
      v_righe := v_righe || jsonb_build_array(jsonb_build_object('campo', k, 'etichetta', coalesce(v_et ->> k, k),
                   'rmhouse', valore_leggibile(k, p_rmh -> k), 'app', valore_leggibile(k, p_app -> k)));
      v_testo := v_testo || (coalesce(v_et ->> k, k) || ': in RMHouse «' || valore_leggibile(k, p_rmh -> k) ||
                             '», in APP Palestre «' || valore_leggibile(k, p_app -> k) || '»');
    end if;
  end loop;
  insert into import_valori (palestra_id, tipo, rif_id, valori, visto_at) values (p_palestra, p_tipo, p_rif, p_app, now())
  on conflict (tipo, rif_id) do update set valori = excluded.valori, visto_at = now();
  if jsonb_array_length(v_righe) > 0 then
    v_chiave := 'diversi_' || case p_tipo when 'persona' then 'pers' when 'famiglia' then 'fam' when 'abbonamento' then 'abb' else 'inc' end
                || '|' || p_rif || '|' || md5(v_campi::text);
    perform anomalia_import(p_palestra, p_imp, p_allievo, p_categoria, 'da_verificare', p_titolo,
      array_to_string(v_testo, '; ') || '. Ho tenuto quello di RMHouse' ||
      case when p_tipo = 'incasso' then ': se è giusto APP Palestre, correggi la ricevuta in RMHouse.'
           else ': se è giusto APP Palestre premi «Usa APP Palestre».' end,
      v_chiave, p_link);
    update anomalie_import set dati = jsonb_build_object('azione', case when p_tipo <> 'incasso' then 'usa_app' end,
                                                         'tipo', p_tipo, 'rif_id', p_rif, 'campi', v_campi, 'righe', v_righe)
     where palestra_id = p_palestra and chiave = v_chiave;
  end if;
  return jsonb_build_object('aggiorna', v_agg, 'diversi', jsonb_array_length(v_righe));
end $$;
revoke all on function differenze_import(uuid, uuid, text, uuid, uuid, jsonb, jsonb, text[], text, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------- importa_app_palestre_clienti (per intero)
CREATE OR REPLACE FUNCTION public.importa_app_palestre_clienti(p_palestra uuid, p_righe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; v_all allievi; v_acc uuid; v_mese int; v_quota int;
  n_nuovi int := 0; n_aggiornati int := 0; n_account int := 0;
  -- 164: confronto con l'ultimo import
  v_imp uuid; v_acc_esisteva boolean; v_app jsonb; v_rmh jsonb; v_d jsonb; v_up jsonb; n_da_app int := 0; n_diversi int := 0;
begin
  if auth.uid() is not null and not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select mese_inizio_stagione, quota_iscrizione_cent into v_mese, v_quota from palestre where id = p_palestra;
  -- l'import in corso (aperto da importa_ap_inizia): le differenze vanno lì; e si ricorda che le persone sono state caricate
  select id into v_imp from importazioni where palestra_id = p_palestra and fonte = 'app_palestre' and finita_at is null
   order by iniziata_at desc limit 1;
  update importazioni set riepilogo = coalesce(riepilogo, '{}'::jsonb) || jsonb_build_object('clienti_at', now()) where id = v_imp;

  for r in select * from jsonb_to_recordset(p_righe) as x(
      chiave text, nome text, cognome text, email text, telefono text, nascita date, luogo text,
      cf text, sesso text, indirizzo text, cap text, citta text, provincia text, intestatario text,
      tessera text, certificato date, prima date, quota_dal date, nota text, bloccato boolean)
  loop
    if coalesce(trim(r.nome), '') = '' then continue; end if;
    v_all := null; v_acc := null; v_acc_esisteva := false;

    select * into v_all from allievi where palestra_id = p_palestra and codice_esterno = r.chiave;
    if v_all.id is null and r.email is not null then
      select a.* into v_all from allievi a join account ac on ac.id = a.account_id
       where a.palestra_id = p_palestra and ac.email = r.email
         and lower(a.nome) = lower(r.nome) and lower(a.cognome) = lower(r.cognome)
       limit 1;
    end if;

    -- chi paga
    if v_all.id is not null then
      v_acc := v_all.account_id;
    elsif r.email is not null then
      select id into v_acc from account where palestra_id = p_palestra and email = r.email;
    else
      select id into v_acc from account where palestra_id = p_palestra and codice_esterno = 'noemail|' || r.chiave;
    end if;

    if v_acc is null then
      insert into account (palestra_id, nome, cognome, email, telefono, codice_fiscale, indirizzo, cap, citta,
                           provincia, fonte, codice_esterno)
      values (p_palestra, coalesce(r.intestatario, r.nome), case when r.intestatario is null then r.cognome else '' end,
              r.email, r.telefono, case when r.intestatario is null then r.cf end, r.indirizzo, r.cap, r.citta,
              r.provincia, 'app_palestre', case when r.email is null then 'noemail|' || r.chiave end)
      returning id into v_acc;
      n_account := n_account + 1;
    else
      v_acc_esisteva := true;   -- i contatti si confrontano qui sotto, quando la persona è nota
    end if;

    -- chi frequenta
    if v_all.id is null then
      insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare, certificato_scadenza,
                           note, codice_fiscale, sesso, luogo_nascita, tessera, codice_esterno, created_at)
      values (p_palestra, v_acc, r.nome, r.cognome, r.nascita, r.intestatario is null, r.certificato,
              nullif(concat_ws(E'\n', case when r.bloccato then 'Bloccato in APP Palestre' end, r.nota), ''),
              r.cf, r.sesso, r.luogo, r.tessera, r.chiave, coalesce(r.prima::timestamptz, now()))
      returning * into v_all;
      n_nuovi := n_nuovi + 1;
      -- 164: cosa dice APP Palestre adesso (per capire, la prossima volta, cosa è stato cambiato in RMHouse)
      insert into import_valori (palestra_id, tipo, rif_id, valori)
      values (p_palestra, 'persona', v_all.id, jsonb_strip_nulls(jsonb_build_object('nome', r.nome, 'cognome', r.cognome,
              'data_nascita', r.nascita, 'codice_fiscale', r.cf)))
      on conflict (tipo, rif_id) do update set valori = excluded.valori, visto_at = now();
    else
      -- già in RMHouse: si completano i campi vuoti; il certificato si aggiorna solo se APP Palestre ne ha uno che scade dopo.
      -- 164: nome, cognome, nascita e codice fiscale cambiati in APP Palestre si aggiornano solo se in RMHouse nessuno li
      --      ha toccati dall'ultimo import; se sono stati corretti a mano restano e la differenza va in "Da sistemare".
      --      Non sono differenze: nome e cognome solo scambiati, nascita giusta per il codice fiscale di RMHouse,
      --      codice fiscale valido in RMHouse e non valido in APP Palestre.
      v_app := jsonb_strip_nulls(jsonb_build_object('nome', r.nome, 'cognome', r.cognome, 'data_nascita', r.nascita, 'codice_fiscale', r.cf));
      if testo_norm(v_all.nome) = testo_norm(r.cognome) and testo_norm(v_all.cognome) = testo_norm(r.nome) then
        v_app := v_app - 'nome' - 'cognome';
      end if;
      if v_all.data_nascita is not null and v_all.data_nascita = cf_nascita(v_all.codice_fiscale) then v_app := v_app - 'data_nascita'; end if;
      if coalesce(cf_valido(v_all.codice_fiscale), false) and not coalesce(cf_valido(r.cf), false) then v_app := v_app - 'codice_fiscale'; end if;
      v_d := differenze_import(p_palestra, v_imp, 'persona', v_all.id, v_all.id, v_app,
               jsonb_build_object('nome', v_all.nome, 'cognome', v_all.cognome, 'data_nascita', v_all.data_nascita, 'codice_fiscale', v_all.codice_fiscale),
               array['nome', 'cognome', 'data_nascita', 'codice_fiscale'], 'Dati diversi da APP Palestre', 'persone');
      v_up := v_d -> 'aggiorna';
      if v_up <> '{}'::jsonb then n_da_app := n_da_app + 1; end if;
      if (v_d ->> 'diversi')::int > 0 then n_diversi := n_diversi + 1; end if;
      update allievi set
        nome = coalesce(v_up ->> 'nome', nome),
        cognome = coalesce(v_up ->> 'cognome', cognome),
        data_nascita = coalesce((v_up ->> 'data_nascita')::date, data_nascita, r.nascita),
        certificato_scadenza = greatest(r.certificato, certificato_scadenza),
        codice_fiscale = coalesce(v_up ->> 'codice_fiscale', nullif(codice_fiscale, ''), r.cf),
        sesso = coalesce(nullif(sesso, ''), r.sesso),
        luogo_nascita = coalesce(nullif(luogo_nascita, ''), r.luogo),
        tessera = coalesce(nullif(tessera, ''), r.tessera),
        note = coalesce(note, nullif(concat_ws(E'\n', case when r.bloccato then 'Bloccato in APP Palestre' end, r.nota), '')),
        codice_esterno = r.chiave
      where id = v_all.id;
      n_aggiornati := n_aggiornati + 1;
    end if;

    -- 164: i contatti della famiglia (chi paga): vuoti → si riempiono; cambiati in APP Palestre → si aggiornano se in
    --      RMHouse nessuno li ha toccati, altrimenti differenza in "Da sistemare". L'email non si cambia mai da sola.
    if v_acc_esisteva then
      select jsonb_build_object('email', email, 'telefono', telefono, 'indirizzo', indirizzo, 'cap', cap, 'citta', citta, 'provincia', provincia)
        into v_rmh from account where id = v_acc;
      v_d := differenze_import(p_palestra, v_imp, 'famiglia', v_acc, v_all.id,
               jsonb_strip_nulls(jsonb_build_object('email', r.email, 'telefono', r.telefono, 'indirizzo', r.indirizzo, 'cap', r.cap,
                                                    'citta', r.citta, 'provincia', r.provincia)),
               v_rmh, array['telefono', 'indirizzo', 'cap', 'citta', 'provincia'],
               'Contatti diversi da APP Palestre' || coalesce(' (paga ' || nullif(btrim(r.intestatario), '') || ')', ''), 'persone');
      v_up := v_d -> 'aggiorna';
      if v_up <> '{}'::jsonb then n_da_app := n_da_app + 1; end if;
      if (v_d ->> 'diversi')::int > 0 then n_diversi := n_diversi + 1; end if;
      update account set
        telefono  = coalesce(v_up ->> 'telefono', nullif(telefono, ''), r.telefono),
        indirizzo = coalesce(v_up ->> 'indirizzo', nullif(indirizzo, ''), r.indirizzo),
        cap       = coalesce(v_up ->> 'cap', nullif(cap, ''), r.cap),
        citta     = coalesce(v_up ->> 'citta', nullif(citta, ''), r.citta),
        provincia = coalesce(v_up ->> 'provincia', nullif(provincia, ''), r.provincia)
      where id = v_acc;
    else
      insert into import_valori (palestra_id, tipo, rif_id, valori)
      values (p_palestra, 'famiglia', v_acc, jsonb_strip_nulls(jsonb_build_object('email', r.email, 'telefono', r.telefono,
              'indirizzo', r.indirizzo, 'cap', r.cap, 'citta', r.citta, 'provincia', r.provincia)))
      on conflict (tipo, rif_id) do update set valori = excluded.valori, visto_at = now();
    end if;

    -- quota annuale già pagata
    if r.quota_dal is not null then
      insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, data)
      values (p_palestra, v_all.id, stagione_di(r.quota_dal, v_mese), coalesce(v_quota, 0), r.quota_dal)
      on conflict (allievo_id, stagione) do nothing;
    end if;
  end loop;

  return jsonb_build_object('nuovi', n_nuovi, 'aggiornati', n_aggiornati, 'account_nuovi', n_account,
                            'da_app', n_da_app, 'diversi', n_diversi);
end $function$;

-- ----------------------------------------------------------------- importa_ap_pagamenti (per intero)
CREATE OR REPLACE FUNCTION public.importa_ap_pagamenti(p_imp uuid, p_righe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pal uuid; r record; v_all allievi; v_acc uuid; v_tipo uuid; v_causale text; v_metodo text; v_codice text;
  v_pag uuid; v_ric uuid; v_num_rnf uuid; v_num_rf uuid; v_num uuid; v_anno int; v_esiste ricevute;
  v_quando timestamptz; v_fuso text; v_trovato uuid; v_al aliquote_iva; v_imp int; v_iva int; v_tipo_doc text;
  n_nuovi int := 0; n_gia int := 0; n_ric int := 0; n_senza int := 0; n_storni int := 0;
  v_p pagamenti; v_d jsonb; n_diversi int := 0;   -- 164
begin
  select palestra_id into v_pal from importazioni where id = p_imp;
  if v_pal is null then raise exception 'importazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  select coalesce(fuso_orario, 'Europe/Rome') into v_fuso from palestre where id = v_pal;
  -- 164: si ricorda che i pagamenti sono stati caricati (le loro differenze si rifanno solo così)
  update importazioni set riepilogo = coalesce(riepilogo, '{}'::jsonb) || jsonb_build_object('pagamenti_at', now()) where id = p_imp;

  select id into v_num_rnf from numerazioni where palestra_id = v_pal and tipo_documento = 'ricevuta' and predefinita and attiva limit 1;
  if v_num_rnf is null then raise exception 'numerazione_mancante'; end if;

  for r in select * from jsonb_to_recordset(p_righe) as x(
      cliente text, email text, cf text, tessera text, documento text, numero int, metodo text,
      data_doc date, data_pag date, importo_cent int, voce text, dal date, al date,
      intestatario text, indirizzo text, descrizione text)
  loop
    v_all := null; v_pag := null; v_ric := null; v_tipo := null;
    v_trovato := trova_allievo_importato(v_pal, r.cliente, r.email, r.tessera, r.cf);
    select * into v_all from allievi where id = v_trovato;
    if v_all.id is null then n_senza := n_senza + 1; end if;
    v_acc := v_all.account_id;
    v_anno := extract(year from coalesce(r.data_doc, r.data_pag))::int;
    v_codice := case when r.documento = 'nessuno' or r.numero is null
                     then 'ap|nodoc|' || coalesce(r.data_pag::text, '') || '|' || coalesce(testo_norm(r.cliente), '') || '|' || r.importo_cent || '|' || coalesce(testo_norm(r.voce), '')
                     else 'ap|' || r.documento || '|' || v_anno || '|' || r.numero end;

    -- la numerazione: le "ricevute fiscali" (pagate con Stripe) avevano la loro
    if r.documento = 'ricevuta_fiscale' then
      select id into v_num_rf from numerazioni where palestra_id = v_pal and codice = 'RF';
      if v_num_rf is null then
        insert into numerazioni (palestra_id, codice, nome, tipo_documento, predefinita, attiva)
        values (v_pal, 'RF', 'Ricevute fiscali (APP Palestre, pagamenti online)', 'ricevuta', false, false)
        returning id into v_num_rf;
      end if;
      v_num := v_num_rf;
    else
      v_num := v_num_rnf;
    end if;

    -- già importato? (l'import si può rifare)
    if exists (select 1 from pagamenti where palestra_id = v_pal and codice_esterno = v_codice)
       or (r.importo_cent < 0 and exists (select 1 from ricevute where numerazione_id = v_num and anno = v_anno and numero = r.numero
                                            and note like 'Importata da APP Palestre%')) then
      n_gia := n_gia + 1;
      -- 164: l'incasso in RMHouse è diverso da APP Palestre (cambiato a mano?): si segnala, non si tocca
      if r.importo_cent >= 0 then
        select * into v_p from pagamenti where palestra_id = v_pal and codice_esterno = v_codice;
        if v_p.id is not null then
          v_d := differenze_import(v_pal, p_imp, 'incasso', v_p.id, coalesce(v_p.allievo_id, v_all.id),
                   jsonb_build_object('importo_cent', r.importo_cent,
                     'metodo', case testo_norm(r.metodo) when 'bancomat' then 'pos' when 'carta' then 'pos' when 'pos' then 'pos'
                                 when 'bonifico' then 'bonifico' when 'contanti' then 'contanti' when 'assegno' then 'assegno'
                                 when 'stripe' then 'online' when 'satispay' then 'satispay' else 'altro' end,
                     'data', coalesce(r.data_pag, r.data_doc)),
                   jsonb_build_object('importo_cent', v_p.importo_cent, 'metodo', v_p.metodo, 'data', (v_p.pagato_at at time zone v_fuso)::date),
                   '{}', 'Incasso diverso da APP Palestre' || coalesce(': ricevuta n. ' || r.numero || '/' || v_anno, ''), 'pagamenti',
                   (select '/gestione/ricevute/' || ri.id from ricevute ri where ri.pagamento_id = v_p.id and ri.tipo_documento <> 'nota_credito' limit 1));
          if (v_d ->> 'diversi')::int > 0 then n_diversi := n_diversi + 1; end if;
        end if;
      end if;
      -- ricollega alla nuova importazione (servirà per abbinare gli abbonamenti)
      insert into import_pagamenti (importazione_id, palestra_id, pagamento_id, ricevuta_id, allievo_id, cliente, voce, dal, al,
                                    importo_cent, causale, data_pagamento)
      select p_imp, v_pal, p.id, (select id from ricevute where pagamento_id = p.id and tipo_documento <> 'nota_credito' limit 1),
             coalesce(p.allievo_id, v_all.id), r.cliente, r.voce, r.dal, r.al, r.importo_cent, p.causale, r.data_pag
        from pagamenti p where p.palestra_id = v_pal and p.codice_esterno = v_codice;
      if r.importo_cent < 0 then   -- gli storni non hanno incasso: si ricollega la nota di credito
        insert into import_pagamenti (importazione_id, palestra_id, pagamento_id, ricevuta_id, allievo_id, cliente, voce, dal, al,
                                      importo_cent, causale, data_pagamento)
        select p_imp, v_pal, null, ri.id, coalesce(ri.allievo_id, v_all.id), r.cliente, r.voce, r.dal, r.al, r.importo_cent, null, r.data_pag
          from ricevute ri where ri.numerazione_id = v_num and ri.anno = v_anno and ri.numero = r.numero
           and ri.note like 'Importata da APP Palestre%' limit 1;
      end if;
      continue;
    end if;

    v_quando := ((coalesce(r.data_pag, r.data_doc))::timestamp + time '12:00') at time zone v_fuso;

    if r.importo_cent >= 0 then
      v_tipo := tipo_da_nome(v_pal, r.voce);
      v_causale := case when testo_norm(r.voce) like 'iscrizione annuale%' or testo_norm(r.voce) like 'quota%iscrizione%' then 'quota_iscrizione'
                        when v_tipo is not null then 'abbonamento'
                        when testo_norm(r.voce) like 'lezione prova%' then 'prova'
                        else 'altro' end;
      v_metodo := case testo_norm(r.metodo) when 'bancomat' then 'pos' when 'carta' then 'pos' when 'pos' then 'pos'
                                            when 'bonifico' then 'bonifico' when 'contanti' then 'contanti'
                                            when 'assegno' then 'assegno' when 'stripe' then 'online' when 'satispay' then 'satispay' else 'altro' end;
      insert into pagamenti (palestra_id, account_id, allievo_id, causale, descrizione, importo_cent, metodo, stato,
                             pagato_at, created_at, codice_esterno)
      values (v_pal, v_acc, v_all.id, v_causale,
              coalesce(nullif(r.descrizione, ''), r.voce, 'Pagamento') || case when v_metodo = 'altro' and r.metodo is not null then ' (' || r.metodo || ')' else '' end,
              r.importo_cent, v_metodo, 'pagato', v_quando, v_quando, v_codice)
      returning id into v_pag;
      n_nuovi := n_nuovi + 1;
    else
      n_storni := n_storni + 1;
    end if;

    -- la ricevuta con il suo numero
    if r.documento <> 'nessuno' and r.numero is not null then
      select * into v_esiste from ricevute where numerazione_id = v_num and anno = v_anno and numero = r.numero;
      if v_esiste.id is not null then
        perform anomalia_import(v_pal, p_imp, v_all.id, 'ricevute', 'da_sistemare',
          'Numero di ricevuta già usato in RMHouse: ' || r.numero || '/' || v_anno,
          'In APP Palestre la ricevuta n. ' || r.numero || ' del ' || to_char(r.data_doc, 'DD/MM/YYYY') || ' è intestata a ' ||
          coalesce(r.intestatario, r.cliente) || ' (' || replace(to_char(r.importo_cent / 100.0, 'FM999999990.00'), '.', ',') || ' €), ma in RMHouse lo stesso numero c''è già: ' ||
          v_esiste.intestatario || ' del ' || to_char(v_esiste.data, 'DD/MM/YYYY') || '. L''incasso è stato importato, la ricevuta no: ' ||
          'se quella di RMHouse era una prova annullala e rifai l''import, altrimenti va deciso con il commercialista.',
          'ric_doppia|' || v_num || '|' || v_anno || '|' || r.numero, '/gestione/ricevute/' || v_esiste.id);
      else
        select * into v_al from aliquote_iva where id = aliquota_di_pagamento(coalesce(v_pag, '00000000-0000-0000-0000-000000000000'::uuid));
        if v_al.id is null then select * into v_al from aliquote_iva where palestra_id = v_pal and predefinita and attiva limit 1; end if;
        v_imp := round(abs(r.importo_cent) / (1 + coalesce(v_al.percentuale, 0) / 100.0));
        v_iva := abs(r.importo_cent) - v_imp;
        v_tipo_doc := case when r.importo_cent < 0 then 'nota_credito' else 'ricevuta' end;
        insert into ricevute (palestra_id, numerazione_id, tipo_documento, numero, anno, data, pagamento_id, account_id, allievo_id,
                              intestatario, codice_fiscale, indirizzo, descrizione, importo_cent, iva_cent, aliquota, aliquota_id,
                              natura, metodo, note, created_at)
        values (v_pal, v_num, v_tipo_doc, r.numero, v_anno, coalesce(r.data_doc, r.data_pag), v_pag, v_acc, v_all.id,
                coalesce(nullif(trim(r.intestatario), ''), r.cliente, 'Cliente'), nullif(upper(trim(r.cf)), ''), nullif(trim(r.indirizzo), ''),
                case when r.importo_cent < 0 then 'Storno' || coalesce(': ' || nullif(r.voce, 'STORNO'), '') else coalesce(nullif(r.descrizione, ''), r.voce, 'Pagamento') end,
                v_imp, v_iva, coalesce(v_al.nome, 'esente'), v_al.id, v_al.natura,
                case when v_pag is not null then (select metodo from pagamenti where id = v_pag) else testo_norm(r.metodo) end,
                'Importata da APP Palestre', v_quando)
        returning id into v_ric;
        n_ric := n_ric + 1;
      end if;
    end if;

    insert into import_pagamenti (importazione_id, palestra_id, pagamento_id, ricevuta_id, allievo_id, cliente, voce, dal, al,
                                  importo_cent, causale, data_pagamento)
    values (p_imp, v_pal, v_pag, v_ric, v_all.id, r.cliente, r.voce, r.dal, r.al, r.importo_cent, v_causale, r.data_pag);
  end loop;

  return jsonb_build_object('nuovi', n_nuovi, 'gia', n_gia, 'ricevute', n_ric, 'senza_persona', n_senza, 'storni', n_storni,
                            'diversi', n_diversi);
end $function$;

-- ----------------------------------------------------------------- importa_ap_chiudi (per intero)
CREATE OR REPLACE FUNCTION public.importa_ap_chiudi(p_imp uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pal uuid; v_inizio timestamptz; v_sede uuid; v_mese int; s record; t tipi_abbonamento; o record;
  v_corso uuid; v_isc iscrizioni; v_orari uuid[]; v_slot text[]; v_fuori text[]; v_n int; v_lez int;
  v_pag record; v_nome text; v_esistenti int; v_dett text; v_gg text[] := array['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'];
  n_nuove int := 0; n_aggiornate int := 0; n_con_orari int := 0; n_senza_orari int := 0; n_saltate int := 0; n_quote int := 0;
  v_primo_pag date; v_rifatta boolean; v_manuale boolean; v_lezione uuid; v_lez_corso uuid; n_coda int := 0;
  v_fuso text; v_pren boolean;
  v_d jsonb; n_date_app int := 0; n_date_diverse int := 0;   -- 164
begin
  select palestra_id, iniziata_at, finita_at is not null into v_pal, v_inizio, v_rifatta from importazioni where id = p_imp;
  if v_pal is null then raise exception 'importazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  -- rifatta dal "Da sistemare": conta da adesso (per le anomalie e per i messaggi)
  if v_rifatta then
    update importazioni set ricalcolata_at = now() where id = p_imp;
    v_inizio := now();
  end if;
  -- 164: le differenze di persone, famiglie e incassi si rifanno solo quando si caricano quei file: se in questo giro
  --      non sono stati caricati restano come sono (il controllo finale non le chiude)
  update anomalie_import set importazione_id = p_imp, aggiornata_at = now()
   where palestra_id = v_pal and not risolta
     and ((split_part(chiave, '|', 1) in ('diversi_pers', 'diversi_fam')
           and coalesce((select (riepilogo ->> 'clienti_at')::timestamptz from importazioni where id = p_imp), '-infinity') < v_inizio)
       or (split_part(chiave, '|', 1) = 'diversi_inc'
           and coalesce((select (riepilogo ->> 'pagamenti_at')::timestamptz from importazioni where id = p_imp), '-infinity') < v_inizio));
  select id into v_sede from sedi where palestra_id = v_pal and principale order by ordine limit 1;
  select mese_inizio_stagione, coalesce(fuso_orario, 'Europe/Rome') into v_mese, v_fuso from palestre where id = v_pal;
  select min(data_pagamento) into v_primo_pag from import_pagamenti where importazione_id = p_imp;
  -- 148: le anomalie sugli orari solo se questa volta sono state caricate le prenotazioni
  v_pren := exists (select 1 from import_prenotazioni where importazione_id = p_imp);

  -- 7.1 le quote annuali pagate
  insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, pagamento_id, data)
  select distinct on (ip.allievo_id, stagione_di(coalesce(ip.dal, ip.data_pagamento), coalesce(v_mese, 9)))
         v_pal, ip.allievo_id, stagione_di(coalesce(ip.dal, ip.data_pagamento), coalesce(v_mese, 9)), ip.importo_cent, ip.pagamento_id,
         coalesce(ip.dal, ip.data_pagamento)
    from import_pagamenti ip
   where ip.importazione_id = p_imp and ip.causale = 'quota_iscrizione' and ip.allievo_id is not null and ip.pagamento_id is not null
   order by ip.allievo_id, stagione_di(coalesce(ip.dal, ip.data_pagamento), coalesce(v_mese, 9)), ip.data_pagamento desc
  on conflict (allievo_id, stagione) do update
    set pagamento_id = coalesce(quote_iscrizione.pagamento_id, excluded.pagamento_id),
        importo_cent = case when quote_iscrizione.pagamento_id is null then excluded.importo_cent else quote_iscrizione.importo_cent end;
  get diagnostics n_quote = row_count;

  -- 7.1b abbonamenti che non sono nella lista abbonamenti ma hanno prenotazioni future (APP Palestre a volte non li
  --      esporta, es. annuali appena venduti): si prendono dalle prenotazioni, che hanno nome, inizio e fine
  for s in
    select b.chiave, min(b.abbonamento) as abbonamento, b.abb_dal, max(b.abb_al) as abb_al, count(*) as quante,
           (select a.id from allievi a where a.palestra_id = v_pal and a.codice_esterno = b.chiave) as allievo_id
      from import_prenotazioni b
     where b.importazione_id = p_imp and not b.cancellata and b.abbonamento is not null and b.abb_dal is not null
       and b.abb_al >= current_date and b.giorno::date >= current_date
     group by b.chiave, testo_norm(b.abbonamento), b.abb_dal
  loop
    continue when s.allievo_id is null;
    continue when exists (select 1 from storico_abbonamenti st where st.palestra_id = v_pal and st.fonte = 'app_palestre'
                            and st.chiave = s.chiave and testo_norm(st.abbonamento) = testo_norm(s.abbonamento) and st.dal = s.abb_dal
                            and st.stato = 'attivo');
    update storico_abbonamenti st set stato = 'attivo', al = greatest(st.al, s.abb_al)
     where st.palestra_id = v_pal and st.fonte = 'app_palestre' and st.chiave = s.chiave
       and testo_norm(st.abbonamento) = testo_norm(s.abbonamento) and st.dal = s.abb_dal;
    if not found then
      insert into storico_abbonamenti (palestra_id, allievo_id, chiave, abbonamento, tipo_abbonamento_id, dal, al, stato)
      values (v_pal, s.allievo_id, s.chiave, trim(s.abbonamento), tipo_da_nome(v_pal, s.abbonamento), s.abb_dal, s.abb_al, 'attivo');
    end if;
    perform anomalia_import(v_pal, p_imp, s.allievo_id, 'abbonamenti', 'da_verificare',
      'Abbonamento preso dalle prenotazioni: ' || trim(s.abbonamento),
      'Nella lista abbonamenti di APP Palestre non c''è (o non risulta attivo), ma ha ' || s.quante || ' prenotazioni future con ' ||
      trim(s.abbonamento) || ' dal ' || to_char(s.abb_dal, 'DD/MM/YYYY') || ' al ' || to_char(s.abb_al, 'DD/MM/YYYY') ||
      ': l''iscrizione l''ho fatta da lì. Controlla che sia giusto (per esempio se è stato pagato).',
      'da_pren|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.abb_dal);
  end loop;

  -- 7.2 gli abbonamenti in corso
  for s in
    select st.*, a.data_nascita, a.nome as a_nome, a.cognome as a_cognome
      from storico_abbonamenti st join allievi a on a.id = st.allievo_id
     where st.palestra_id = v_pal and st.fonte = 'app_palestre' and st.stato = 'attivo' and st.al >= current_date
     order by st.chiave, st.dal
  loop
    v_nome := trim(s.abbonamento) || ' (' || to_char(s.dal, 'DD/MM/YYYY') || ' → ' || to_char(s.al, 'DD/MM/YYYY') || ')';
    if s.tipo_abbonamento_id is null then
      n_saltate := n_saltate + 1;
      perform anomalia_import(v_pal, p_imp, s.allievo_id, 'abbonamenti', 'da_sistemare',
        'Abbonamento non presente nel listino: ' || trim(s.abbonamento),
        'In APP Palestre ha ' || v_nome || '. In RMHouse non c''è un abbonamento con questo nome, quindi l''iscrizione NON è stata creata. ' ||
        'In cima a questa pagina ("Abbonamenti da abbinare") scegli a quale abbonamento di RMHouse corrisponde: l''iscrizione si crea da sola. ' ||
        'Se non corrisponde a nessuno, iscrivi la persona a mano dalla scheda.',
        'abb_listino|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
      continue;
    end if;
    select * into t from tipi_abbonamento where id = s.tipo_abbonamento_id;
    v_lez := coalesce(t.lezioni_settimanali, 0);

    -- gli orari dalle prenotazioni
    v_orari := '{}'; v_slot := '{}'; v_fuori := '{}'; v_corso := null; v_n := 0;
    if t.modalita = 'orari_fissi' then
      for o in select * from import_orari_prenotati(p_imp, s.chiave, s.abbonamento, s.dal) loop
        if o.orario_id is not null then
          if v_lez = 0 or v_n < v_lez then
            v_orari := v_orari || o.orario_id; v_n := v_n + 1;
            v_slot := v_slot || (v_gg[o.giorno] || ' ' || to_char(o.ora, 'HH24:MI') || ' ' || trim(o.corso));
            v_corso := coalesce(v_corso, o.corso_id);
          else
            v_fuori := v_fuori || (v_gg[o.giorno] || ' ' || to_char(o.ora, 'HH24:MI') || ' ' || trim(o.corso) || ' (in più rispetto alle ' || v_lez || ' lezioni a settimana)');
          end if;
        else
          v_fuori := v_fuori || (v_gg[o.giorno] || ' ' || to_char(o.ora, 'HH24:MI') || ' ' || trim(o.corso) || ' (orario che in RMHouse non c''è)');
          -- il corso esiste anche se manca l'orario
          v_corso := coalesce(v_corso, (select c.id from corsi c where c.palestra_id = v_pal and corso_norm(c.nome) = corso_norm(o.corso) limit 1));
          perform anomalia_import(v_pal, p_imp, null, 'corsi', 'da_sistemare',
            'Orario prenotato in APP Palestre che in RMHouse non c''è: ' || v_gg[o.giorno] || ' ' || to_char(o.ora, 'HH24:MI') || ' ' || trim(o.corso),
            'In RMHouse non c''è un orario con questo corso, giorno e ora, quindi chi è prenotato lì non l''ha avuto. ' ||
            'In cima a questa pagina ("Orari da abbinare") scegli a quale orario di RMHouse corrisponde: gli orari si aggiungono da soli alle iscrizioni.',
            'orario_manca|' || corso_norm(o.corso) || '|' || o.giorno || '|' || to_char(o.ora, 'HH24:MI'), '/gestione/da-sistemare#orari');
        end if;
      end loop;
    end if;

    -- se dalle prenotazioni non esce il corso: il più adatto tra quelli coperti (età giusta, sede principale, con orari)
    if v_corso is null then
      select c.id into v_corso
        from tipi_abbonamento_corsi tc
        join corsi c on c.id = tc.corso_id and c.attivo
        left join fasce_eta f on f.id = c.fascia_eta_id
       where tc.tipo_abbonamento_id = t.id
       order by (s.data_nascita is not null and extract(year from age(current_date, s.data_nascita))
                   between coalesce(f.eta_min, 0) and coalesce(f.eta_max, 200)) desc,
                (c.sede_id = v_sede) desc,
                (select count(*) from orari o2 where o2.corso_id = c.id and o2.attivo) desc, c.nome
       limit 1;
    end if;
    if v_corso is null then
      n_saltate := n_saltate + 1;
      perform anomalia_import(v_pal, p_imp, s.allievo_id, 'abbonamenti', 'da_sistemare',
        'Abbonamento senza corsi collegati: ' || trim(s.abbonamento),
        'In APP Palestre ha ' || v_nome || ', ma in RMHouse questo abbonamento non copre nessun corso attivo: iscrizione NON creata. ' ||
        'Iscrivi la persona a mano dalla scheda scegliendo il corso, oppure abbina gli orari prenotati in cima a questa pagina.',
        'abb_corsi|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
      continue;
    end if;

    -- l'iscrizione: quella già importata (anche se APP Palestre ha poi spostato le date) o una nuova
    v_isc := null;
    select * into v_isc from iscrizioni where palestra_id = v_pal and codice_esterno = s.chiave || '|' || s.abbonamento || '|' || s.dal;
    if v_isc.id is null then
      select * into v_isc from iscrizioni i
       where i.allievo_id = s.allievo_id and i.tipo_abbonamento_id = t.id and i.stato in ('attiva', 'sospesa')
         and i.codice_esterno is not null
         and daterange(i.data_inizio, coalesce(i.data_fine, i.data_inizio), '[]') && daterange(s.dal, s.al, '[]')
         and not exists (select 1 from storico_abbonamenti x where x.iscrizione_id = i.id and x.id <> s.id and x.stato = 'attivo' and x.al >= current_date)
       order by i.data_inizio desc limit 1;
    end if;
    -- o quella fatta a mano in RMHouse per lo stesso abbonamento nello stesso periodo: si tiene quella
    v_manuale := false;
    if v_isc.id is null then
      select * into v_isc from iscrizioni i
       where i.allievo_id = s.allievo_id and i.tipo_abbonamento_id = t.id and i.stato in ('attiva', 'sospesa')
         and i.codice_esterno is null
         and daterange(i.data_inizio, coalesce(i.data_fine, i.data_inizio), '[]') && daterange(s.dal, s.al, '[]')
         and not exists (select 1 from storico_abbonamenti x where x.iscrizione_id = i.id and x.id <> s.id and x.stato = 'attivo' and x.al >= current_date)
       order by i.data_inizio desc limit 1;
      v_manuale := v_isc.id is not null;
    end if;

    if v_isc.id is null then
      insert into iscrizioni (palestra_id, allievo_id, tipo_abbonamento_id, corso_id, data_inizio, data_fine, stato,
                              ingressi_residui, note, codice_esterno)
      values (v_pal, s.allievo_id, t.id, v_corso, s.dal, s.al, 'attiva',
              case when t.modalita = 'ingressi' then s.restanti end,
              'Importata da APP Palestre', s.chiave || '|' || s.abbonamento || '|' || s.dal)
      returning * into v_isc;
      insert into iscrizioni_orari (iscrizione_id, orario_id) select v_isc.id, unnest(v_orari) on conflict do nothing;
      n_nuove := n_nuove + 1;
      -- 164: le date di APP Palestre di adesso (per capire, la prossima volta, se in RMHouse sono state cambiate)
      insert into import_valori (palestra_id, tipo, rif_id, valori)
      values (v_pal, 'abbonamento', v_isc.id, jsonb_strip_nulls(jsonb_build_object('data_inizio', s.dal, 'data_fine', s.al)))
      on conflict (tipo, rif_id) do update set valori = excluded.valori, visto_at = now();
    elsif v_manuale then
      -- fatta dalla segreteria: non si tocca (al massimo si aggiungono gli orari se non ne ha)
      select count(*) into v_esistenti from iscrizioni_orari where iscrizione_id = v_isc.id;
      if v_esistenti = 0 then
        insert into iscrizioni_orari (iscrizione_id, orario_id) select v_isc.id, unnest(v_orari) on conflict do nothing;
      end if;
      perform anomalia_import(v_pal, p_imp, s.allievo_id, 'abbonamenti', 'da_verificare',
        'Iscrizione già fatta a mano in RMHouse: ' || trim(s.abbonamento),
        'In RMHouse c''era già un''iscrizione a ' || t.nome || ' dal ' || to_char(v_isc.data_inizio, 'DD/MM/YYYY') ||
        coalesce(' al ' || to_char(v_isc.data_fine, 'DD/MM/YYYY'), '') || ', fatta a mano: ho tenuto quella e non ne ho creata un''altra. ' ||
        'In APP Palestre ha ' || v_nome || '. Controlla le date e che non sia stato fatto pagare due volte (in APP Palestre e in RMHouse).',
        'manuale|' || v_isc.id);
      n_aggiornate := n_aggiornate + 1;
    else
      select count(*) into v_esistenti from iscrizioni_orari where iscrizione_id = v_isc.id;
      -- 164: le date di APP Palestre valgono se in RMHouse nessuno le ha toccate dall'ultimo import; se sono state
      --      cambiate a mano restano quelle di RMHouse e la differenza va in "Da sistemare" ("Usa APP Palestre")
      v_d := differenze_import(v_pal, p_imp, 'abbonamento', v_isc.id, s.allievo_id,
               jsonb_strip_nulls(jsonb_build_object('data_inizio', s.dal, 'data_fine', s.al)),
               jsonb_build_object('data_inizio', v_isc.data_inizio, 'data_fine', v_isc.data_fine),
               array['data_inizio', 'data_fine'], 'Date diverse da APP Palestre: ' || trim(s.abbonamento), 'abbonamenti');
      if (v_d -> 'aggiorna') <> '{}'::jsonb then n_date_app := n_date_app + 1; end if;
      if (v_d ->> 'diversi')::int > 0 then n_date_diverse := n_date_diverse + 1; end if;
      update iscrizioni set data_inizio = coalesce((v_d -> 'aggiorna' ->> 'data_inizio')::date, data_inizio, s.dal),
             data_fine = coalesce((v_d -> 'aggiorna' ->> 'data_fine')::date, data_fine, s.al),
             codice_esterno = s.chiave || '|' || s.abbonamento || '|' || s.dal,
             corso_id = case when v_esistenti = 0 then v_corso else corso_id end,
             ingressi_residui = case when t.modalita = 'ingressi' then coalesce(s.restanti, ingressi_residui) else ingressi_residui end
       where id = v_isc.id;
      if v_esistenti = 0 or not exists (select orario_id from iscrizioni_orari where iscrizione_id = v_isc.id
                                         except select unnest(v_orari)) then
        -- nessun orario, o solo orari che vengono da APP Palestre: si completano con quelli trovati ora
        insert into iscrizioni_orari (iscrizione_id, orario_id) select v_isc.id, unnest(v_orari) on conflict do nothing;
      elsif cardinality(v_orari) > 0 and exists (
              select unnest(v_orari) except select orario_id from iscrizioni_orari where iscrizione_id = v_isc.id) then
        perform anomalia_import(v_pal, p_imp, s.allievo_id, 'corsi', 'da_verificare',
          'Orari diversi da APP Palestre: ' || trim(s.abbonamento),
          'In RMHouse l''iscrizione ha già degli orari (scelti a mano, non li ho toccati). In APP Palestre è prenotata: ' ||
          array_to_string(v_slot, ', ') || '. Controlla quali sono quelli giusti.',
          'orari_diversi|' || v_isc.id);
      end if;
      n_aggiornate := n_aggiornate + 1;
    end if;
    update storico_abbonamenti set iscrizione_id = v_isc.id where id = s.id;
    if cardinality(v_orari) > 0 then n_con_orari := n_con_orari + 1; end if;

    -- anomalie sull'iscrizione
    if t.modalita = 'orari_fissi' and v_pren then
      if cardinality(v_orari) = 0 and cardinality(v_fuori) = 0 then
        n_senza_orari := n_senza_orari + 1;
        perform anomalia_import(v_pal, p_imp, s.allievo_id, 'corsi', 'da_sistemare',
          'Corso e orari da assegnare: ' || trim(s.abbonamento),
          'In APP Palestre non ha nessuna prenotazione per ' || v_nome || ', quindi non so in che corso va. ' ||
          'L''ho messa provvisoriamente su "' || (select nome from corsi where id = v_corso) || '" senza orari: ' ||
          'apri la scheda, iscrizione → Modifica, e scegli corso e orari.',
          'senza_orari|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
      elsif v_lez > 0 and cardinality(v_orari) < v_lez then
        perform anomalia_import(v_pal, p_imp, s.allievo_id, 'corsi', 'da_sistemare',
          'Mancano ' || (v_lez - cardinality(v_orari)) || ' orari su ' || v_lez || ': ' || trim(s.abbonamento),
          'L''abbonamento prevede ' || v_lez || ' lezioni a settimana, ma in APP Palestre è prenotata solo: ' ||
          coalesce(nullif(array_to_string(v_slot, ', '), ''), 'nessun orario valido') ||
          case when cardinality(v_fuori) > 0 then '. Prenotazioni non usate: ' || array_to_string(v_fuori, ', ') else '' end ||
          '. Aggiungi gli orari mancanti dalla scheda (iscrizione → Modifica).',
          'pochi_orari|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
      elsif cardinality(v_fuori) > 0 then
        perform anomalia_import(v_pal, p_imp, s.allievo_id, 'corsi', 'da_verificare',
          'Prenotazioni in più in APP Palestre: ' || trim(s.abbonamento),
          'Ho messo: ' || array_to_string(v_slot, ', ') || '. Non ho messo: ' || array_to_string(v_fuori, ', ') || '. Controlla che sia giusto.',
          'orari_in_piu|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
      end if;
      if v_corso is not null and not exists (select 1 from tipi_abbonamento_corsi where tipo_abbonamento_id = t.id and corso_id = v_corso) then
        perform anomalia_import(v_pal, p_imp, s.allievo_id, 'corsi', 'da_verificare',
          'Corso non coperto dall''abbonamento: ' || (select nome from corsi where id = v_corso),
          'In APP Palestre con ' || v_nome || ' frequenta "' || (select nome from corsi where id = v_corso) || '", ma in RMHouse ' ||
          'questo corso non è tra quelli coperti dall''abbonamento. Controlla dalla scheda: o il corso o l''abbonamento in APP Palestre era sbagliato.',
          'corso_non_coperto|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
      end if;
      if extract(day from s.al + 1) <> 1 or (extract(day from s.dal) <> 1 and s.dal >= date_trunc('month', current_date)::date) then
        perform anomalia_import(v_pal, p_imp, s.allievo_id, 'abbonamenti', 'da_verificare',
          'Date non a mese solare: ' || trim(s.abbonamento),
          'In APP Palestre va ' || v_nome || '. In RMHouse gli abbonamenti vanno dal 1° a fine mese: le date le ho lasciate come in APP Palestre, ' ||
          'controlla se vanno corrette.',
          'date|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
      end if;
    end if;

    -- il pagamento dell'abbonamento
    select ip.pagamento_id, ip.importo_cent, ip.data_pagamento into v_pag
      from import_pagamenti ip
     where ip.importazione_id = p_imp and ip.allievo_id = s.allievo_id and ip.pagamento_id is not null
       and testo_norm(ip.voce) = testo_norm(s.abbonamento)
       and (ip.dal = s.dal or ip.al = s.al or (ip.dal is not null and daterange(ip.dal, coalesce(ip.al, ip.dal), '[]') && daterange(s.dal, s.al, '[]')))
     order by (ip.dal = s.dal) desc, (ip.al = s.al) desc, ip.data_pagamento desc
     limit 1;
    if v_pag.pagamento_id is not null then
      update iscrizioni set pagamento_id = v_pag.pagamento_id where id = v_isc.id and pagamento_id is null;
      update pagamenti set corso_id = coalesce(corso_id, v_corso), allievo_id = coalesce(allievo_id, s.allievo_id) where id = v_pag.pagamento_id;
      if s.valore_cent is not null and v_pag.importo_cent <> s.valore_cent then
        perform anomalia_import(v_pal, p_imp, s.allievo_id, 'pagamenti', 'da_verificare',
          'Pagato diverso dal valore dell''abbonamento: ' || trim(s.abbonamento),
          'In APP Palestre l''abbonamento ' || v_nome || ' vale ' || replace(to_char(s.valore_cent / 100.0, 'FM999990.00'), '.', ',') ||
          ' €, il pagamento abbinato è di ' || replace(to_char(v_pag.importo_cent / 100.0, 'FM999990.00'), '.', ',') || ' € del ' ||
          to_char(v_pag.data_pagamento, 'DD/MM/YYYY') || '. Controlla se manca un pagamento o se era uno sconto.',
          'pag_diverso|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
      end if;
    elsif v_primo_pag is not null and coalesce(s.valore_cent, 0) > 0 then
      perform anomalia_import(v_pal, p_imp, s.allievo_id, 'pagamenti', 'da_sistemare',
        'Nessun pagamento trovato: ' || trim(s.abbonamento),
        'L''abbonamento ' || v_nome || ' vale ' || replace(to_char(s.valore_cent / 100.0, 'FM999990.00'), '.', ',') ||
        ' €, ma nel file dei pagamenti (dal ' || to_char(v_primo_pag, 'DD/MM/YYYY') || ') non c''è un pagamento per lui/lei. ' ||
        case when s.dal < v_primo_pag + 31 then 'Potrebbe essere stato pagato prima del ' || to_char(v_primo_pag, 'DD/MM/YYYY') || ': controlla. '
             else 'Probabilmente non è ancora stato pagato: '
        end || 'Se è da incassare, registra il pagamento dalla scheda.',
        'non_pagato|' || s.chiave || '|' || testo_norm(s.abbonamento) || '|' || s.dal);
    end if;
  end loop;

  -- 7.25 chi in APP Palestre è "In coda" su una lezione futura piena → in coda sulla stessa lezione in RMHouse
  --      (stesso ordine: conta quando si era messo in coda). Le code passate non servono.
  for s in
    select b.chiave, b.corso, b.giorno, b.prenotata_il, a.id as allievo_id, a.account_id,
           (select x.orario_id from orario_per_slot(v_pal, corso_norm(b.corso), extract(isodow from b.giorno)::int, b.giorno::time) x) as orario_id
      from import_prenotazioni b join allievi a on a.palestra_id = v_pal and a.codice_esterno = b.chiave
     where b.importazione_id = p_imp and b.in_coda and b.giorno > (now() at time zone v_fuso)
     order by b.prenotata_il nulls last
  loop
    v_lezione := null;
    select l.id, l.corso_id into v_lezione, v_lez_corso from lezioni l
     where l.orario_id = s.orario_id and l.data = s.giorno::date and l.stato <> 'annullata' limit 1;
    continue when v_lezione is null;
    continue when exists (select 1 from liste_attesa la where la.lezione_id = v_lezione and la.allievo_id = s.allievo_id and la.stato in ('in_attesa', 'avvisato'))
               or exists (select 1 from v_partecipanti_lezione vp where vp.lezione_id = v_lezione and vp.allievo_id = s.allievo_id);
    insert into liste_attesa (palestra_id, tipo, corso_id, lezione_id, allievo_id, account_id, stato, note, created_at)
    values (v_pal, 'lezione', v_lez_corso, v_lezione, s.allievo_id, s.account_id, 'in_attesa', 'In coda in APP Palestre',
            coalesce(s.prenotata_il at time zone v_fuso, now()));
    n_coda := n_coda + 1;
  end loop;

  -- 7.3 stato delle persone importate
  update allievi a set stato_lead = 'iscritto', motivo_perso = null
   where a.palestra_id = v_pal and a.codice_esterno is not null and a.stato_lead <> 'iscritto'
     and exists (select 1 from storico_abbonamenti st where st.allievo_id = a.id);
  update allievi a set stato_lead = 'perso', motivo_perso = 'Registrato in APP Palestre, mai iscritto'
   where a.palestra_id = v_pal and a.codice_esterno is not null and a.stato_lead = 'nuovo'
     and not exists (select 1 from storico_abbonamenti st where st.allievo_id = a.id);

  -- 7.4 nessun messaggio automatico per effetto dell'import
  update messaggi_coda set stato = 'annullato'
   where palestra_id = v_pal and stato = 'in_coda' and created_at >= v_inizio;

  update importazioni set riepilogo = riepilogo || jsonb_build_object(
      'iscrizioni_nuove', n_nuove, 'iscrizioni_aggiornate', n_aggiornate, 'con_orari', n_con_orari,
      'senza_orari', n_senza_orari, 'non_create', n_saltate, 'quote', n_quote, 'in_coda', n_coda,
      'date_da_app', n_date_app, 'date_diverse', n_date_diverse)
   where id = p_imp;
  return jsonb_build_object('nuove', n_nuove, 'aggiornate', n_aggiornate, 'con_orari', n_con_orari,
                            'senza_orari', n_senza_orari, 'non_create', n_saltate, 'quote', n_quote, 'in_coda', n_coda,
                            'date_da_app', n_date_app, 'date_diverse', n_date_diverse);
end $function$;

-- ----------------------------------------------------------------- risolvi_anomalia_import (per intero)
CREATE OR REPLACE FUNCTION public.risolvi_anomalia_import(p_id uuid, p_azione text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a anomalie_import; al allievi; v_pag uuid; v_nota text; v_tipo tipi_abbonamento; v_campi jsonb; v_rif uuid;
begin
  select * into a from anomalie_import where id = p_id for update;
  if a.id is null then raise exception 'non_trovata'; end if;
  if not is_gestione(a.palestra_id) then raise exception 'non_autorizzato'; end if;
  if a.risolta then raise exception 'gia_fatta'; end if;
  if a.dati is null or a.dati->>'azione' is distinct from p_azione then raise exception 'azione_non_valida'; end if;

  if p_azione = 'da_incassare' then
    select * into al from allievi where id = (a.dati->>'allievo_id')::uuid and palestra_id = a.palestra_id;
    if al.id is null then raise exception 'persona_non_trovata'; end if;
    insert into pagamenti (palestra_id, account_id, allievo_id, causale, descrizione, importo_cent, metodo, stato)
    values (a.palestra_id, al.account_id, al.id, coalesce(a.dati->>'causale', 'altro'),
            coalesce(nullif(a.dati->>'descrizione', ''), 'Vendita di APP Palestre') || ' (venduto in APP Palestre)',
            greatest(coalesce((a.dati->>'importo_cent')::int, 0), 0), 'contanti', 'in_attesa')
    returning id into v_pag;
    v_nota := 'Messo da incassare: ' || euro_testo((a.dati->>'importo_cent')::int) || ' €';
  elsif p_azione = 'prezzo_app' then
    select * into v_tipo from tipi_abbonamento where id = (a.dati->>'tipo_id')::uuid and palestra_id = a.palestra_id;
    if v_tipo.id is null then raise exception 'abbonamento_non_trovato'; end if;
    update tipi_abbonamento set prezzo_cent = (a.dati->>'prezzo_cent')::int,
           prezzo_web_cent = coalesce(nullif((a.dati->>'prezzo_web_cent')::int, 0), prezzo_web_cent)
     where id = v_tipo.id;
    v_nota := 'Messo il prezzo di APP Palestre: ' || euro_testo((a.dati->>'prezzo_cent')::int) || ' € (prima ' || euro_testo(v_tipo.prezzo_cent) || ' €)';
  elsif p_azione = 'usa_app' then
    -- 164: mette in RMHouse il valore di APP Palestre per i campi diversi
    v_campi := coalesce(a.dati -> 'campi', '{}'::jsonb); v_rif := (a.dati ->> 'rif_id')::uuid;
    if a.dati ->> 'tipo' = 'persona' then
      update allievi set nome = coalesce(v_campi ->> 'nome', nome), cognome = coalesce(v_campi ->> 'cognome', cognome),
             data_nascita = coalesce((v_campi ->> 'data_nascita')::date, data_nascita),
             codice_fiscale = coalesce(v_campi ->> 'codice_fiscale', codice_fiscale)
       where id = v_rif and palestra_id = a.palestra_id;
      if not found then raise exception 'persona_non_trovata'; end if;
    elsif a.dati ->> 'tipo' = 'famiglia' then
      begin
        update account set email = coalesce(v_campi ->> 'email', email), telefono = coalesce(v_campi ->> 'telefono', telefono),
               indirizzo = coalesce(v_campi ->> 'indirizzo', indirizzo), cap = coalesce(v_campi ->> 'cap', cap),
               citta = coalesce(v_campi ->> 'citta', citta), provincia = coalesce(v_campi ->> 'provincia', provincia)
         where id = v_rif and palestra_id = a.palestra_id;
      exception when unique_violation then raise exception 'email_gia_usata';
      end;
    elsif a.dati ->> 'tipo' = 'abbonamento' then
      update iscrizioni set data_inizio = coalesce((v_campi ->> 'data_inizio')::date, data_inizio),
             data_fine = coalesce((v_campi ->> 'data_fine')::date, data_fine)
       where id = v_rif and palestra_id = a.palestra_id;
      if not found then raise exception 'abbonamento_non_trovato'; end if;
    else
      raise exception 'azione_non_valida';
    end if;
    select 'Messi i dati di APP Palestre: ' || string_agg(lower(x ->> 'etichetta') || ' ' || (x ->> 'app'), ', ')
      into v_nota from jsonb_array_elements(coalesce(a.dati -> 'righe', '[]'::jsonb)) x;
  else
    raise exception 'azione_non_valida';
  end if;

  update anomalie_import set risolta = true, risolta_at = now(), risolta_da = auth.uid(), nota = v_nota, chiusa_sola = false
   where id = p_id;
  return jsonb_build_object('pagamento_id', v_pag, 'nota', v_nota);
end $function$;

-- ----------------------------------------------------------------- togli_prove (per intero)
CREATE OR REPLACE FUNCTION public.togli_prove(p_palestra uuid, p_persone uuid[] DEFAULT '{}'::uuid[], p_iscrizioni uuid[] DEFAULT '{}'::uuid[], p_pagamenti uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET jit TO 'off'
AS $function$
declare v_pers uuid[]; v_isc uuid[]; v_pag uuid[]; v_ric uuid[]; v_acc uuid[]; n_pers int; n_isc int; n_pag int; n_ric int; n_acc int;
begin
  if not is_admin(p_palestra) then raise exception 'non_autorizzato'; end if;

  select coalesce(array_agg(f.allievo_id), '{}') into v_pers
    from prove_persone(p_palestra) f where f.allievo_id = any(coalesce(p_persone, '{}'));
  -- abbonamenti: quelli scelti (fatti in RMHouse) + tutti quelli delle persone tolte
  select coalesce(array_agg(i.id), '{}') into v_isc from iscrizioni i
   where i.palestra_id = p_palestra and i.codice_esterno is null
     and (i.id = any(coalesce(p_iscrizioni, '{}')) or i.allievo_id = any(v_pers));
  -- incassi: quelli scelti + quelli degli abbonamenti tolti (se fatti in RMHouse e non usati da altri abbonamenti)
  --          + tutti quelli fatti in RMHouse delle persone tolte
  select coalesce(array_agg(distinct p.id), '{}') into v_pag from pagamenti p
   where p.palestra_id = p_palestra and p.codice_esterno is null and (
         (p.id = any(coalesce(p_pagamenti, '{}')) and prove_incasso_ok(p.id))
      or ((p.id in (select i.pagamento_id from iscrizioni i where i.id = any(v_isc))
           or p.id in (select r.pagamento_id from rate r where r.iscrizione_id = any(v_isc)))
          and not exists (select 1 from iscrizioni i where i.pagamento_id = p.id and not (i.id = any(v_isc))))
      or p.allievo_id = any(v_pers)
      or (p.allievo_id is null and p.account_id in (select a.account_id from allievi a where a.id = any(v_pers))
          and not exists (select 1 from allievi a where a.account_id = p.account_id and not (a.id = any(v_pers)))));
  -- ricevute (e note di credito che le stornano) di quegli incassi o delle persone tolte; mai quelle importate
  select coalesce(array_agg(distinct r.id), '{}') into v_ric from ricevute r
   where r.palestra_id = p_palestra
     and (r.pagamento_id = any(v_pag) or r.allievo_id = any(v_pers))
     and not exists (select 1 from import_pagamenti ip where ip.ricevuta_id = r.id);
  select v_ric || coalesce(array_agg(r.id), '{}') into v_ric from ricevute r where r.riferimento_id = any(v_ric) and not (r.id = any(v_ric));
  -- le famiglie (account) che restano vuote, se non vengono da APP Palestre
  select coalesce(array_agg(distinct a.account_id), '{}') into v_acc from allievi a
    join account ac on ac.id = a.account_id
   where a.id = any(v_pers) and coalesce(ac.fonte, '') <> 'app_palestre' and ac.codice_esterno is null
     and not exists (select 1 from allievi b where b.account_id = a.account_id and not (b.id = any(v_pers)));

  n_pers := coalesce(array_length(v_pers, 1), 0); n_isc := coalesce(array_length(v_isc, 1), 0);
  n_pag := coalesce(array_length(v_pag, 1), 0); n_ric := coalesce(array_length(v_ric, 1), 0);

  delete from ricevute where id = any(v_ric);
  delete from documenti_fiscali where pagamento_id = any(v_pag);
  delete from quote_iscrizione where pagamento_id = any(v_pag);
  -- abbonamenti: prima ciò che li tiene legati
  delete from prenotazioni where iscrizione_id = any(v_isc);
  delete from rate where iscrizione_id = any(v_isc) or allievo_id = any(v_pers) or pagamento_id = any(v_pag) and iscrizione_id is null;
  update iscrizioni set rinnovo_di = null where rinnovo_di = any(v_isc) and not (id = any(v_isc));
  update iscrizioni set pagamento_id = null where pagamento_id = any(v_pag) and not (id = any(v_isc));
  delete from iscrizioni where id = any(v_isc);
  -- persone (con certificati, tessere, firme, presenze, prenotazioni… che vanno via con loro)
  delete from iscrizioni_evento where allievo_id = any(v_pers);   -- 164: anche le iscrizioni agli eventi
  delete from allievi where id = any(v_pers);
  update prove set pagamento_id = null where pagamento_id = any(v_pag);
  delete from pagamenti where id = any(v_pag);
  -- famiglie rimaste vuote (se non hanno altri incassi)
  delete from account ac where ac.id = any(v_acc)
     and not exists (select 1 from pagamenti p where p.account_id = ac.id)
     and not exists (select 1 from allievi a where a.account_id = ac.id);
  get diagnostics n_acc = row_count;

  return jsonb_build_object('persone', n_pers, 'abbonamenti', n_isc, 'incassi', n_pag, 'ricevute', n_ric, 'famiglie', n_acc,
    'ultima_ricevuta', (select max(r.numero) from ricevute r where r.palestra_id = p_palestra and r.tipo_documento = 'ricevuta'
                          and r.anno = extract(year from now() at time zone 'Europe/Rome')::int));
end $function$;

notify pgrst, 'reload schema';
