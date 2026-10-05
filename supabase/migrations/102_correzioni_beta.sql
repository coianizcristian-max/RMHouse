-- 102 · Correzioni emerse dal beta test (simulazione con 10 persone)
-- 1. Acquisto online e richiesta con bonifico: non si può più comprare un orario già pieno.
-- 2. "Bonifico arrivato: attiva" registra anche l'incasso (prima l'abbonamento partiva ma il pagamento non risultava).
-- 3. Recuperi: dopo aver annullato un recupero lo si può riprenotare; la lezione disdetta non viene più proposta.
-- 4. Liste d'attesa: una riga per persona (due fratelli possono stare in attesa dello stesso corso);
--    la segreteria che aggiunge chi c'è già non dà errore; l'avviso "posto libero" porta all'area, non alla pagina delle prove.
-- 5. Appello: chi aggiunge una persona in più resta registrato; la persona nuova segnalata avvisa subito la segreteria.
-- 6. Conferma "l'ho tenuta io" su una lezione di un'altra insegnante: avvisate la titolare e la segreteria.
-- 7. Riservatezza: gli insegnanti non leggono più pagamenti e note di contatto dei clienti.
-- 8. Eventi a pagamento: il dovuto è legato all'iscrizione (nome, allievo); se ci si cancella il dovuto si chiude.
-- 9. Nuova persona: la segreteria sa se la scheda c'era già.
-- Rieseguibile.

-- ─── 1. Orari pieni ───────────────────────────────────────────────────────────
-- quanti hanno un abbonamento attivo su quell'orario nel periodo, contro i posti del corso (o della sala)
create or replace function orario_pieno(p_orario uuid, p_dal date, p_al date, p_escludi uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select count(distinct i.allievo_id)
       from iscrizioni_orari io join iscrizioni i on i.id = io.iscrizione_id
      where io.orario_id = o.id and i.stato = 'attiva'
        and i.data_inizio <= coalesce(p_al, p_dal) and i.data_fine >= p_dal
        and i.allievo_id is distinct from p_escludi)
    >= coalesce(c.capienza, s.capienza), false)
  from orari o join corsi c on c.id = o.corso_id left join sale s on s.id = o.sala_id
  where o.id = p_orario;
$$;
revoke execute on function orario_pieno(uuid, date, date, uuid) from public, anon;
grant execute on function orario_pieno(uuid, date, date, uuid) to authenticated;

-- per l'app: gli orari pieni oggi (solo gli id, niente nomi)
create or replace function orari_pieni(p_palestra uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(o.id), '{}') from orari o
   where o.palestra_id = p_palestra and o.attivo and orario_pieno(o.id, current_date, current_date);
$$;
revoke execute on function orari_pieni(uuid) from public, anon;
grant execute on function orari_pieni(uuid) to authenticated;

create or replace function prepara_acquisto(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; t tipi_abbonamento; c corsi; pal palestre; v_orari uuid[]; v_inizio date; v_importo int;
        v_quota boolean := false; v_pag uuid; v_acq uuid; righe jsonb := '[]'::jsonb; v_prezzo int; v_ric boolean;
        v_fine date; v_o uuid;
begin
  select * into a from allievi where id = (p ->> 'allievo_id')::uuid;
  if not found or a.account_id not in (select miei_account()) then raise exception 'non_autorizzato'; end if;
  select * into pal from palestre where id = a.palestra_id;
  select * into t from tipi_abbonamento where id = (p ->> 'tipo_abbonamento_id')::uuid
     and palestra_id = a.palestra_id and attivo and acquistabile_online and not coalesce(archiviato, false);
  if not found then raise exception 'abbonamento_non_acquistabile'; end if;
  select * into c from corsi where id = (p ->> 'corso_id')::uuid and palestra_id = a.palestra_id and attivo;
  if not found then raise exception 'corso_non_valido'; end if;
  if exists (select 1 from tipi_abbonamento_corsi where tipo_abbonamento_id = t.id)
     and not exists (select 1 from tipi_abbonamento_corsi where tipo_abbonamento_id = t.id and corso_id = c.id) then
    raise exception 'corso_non_compreso';
  end if;

  v_orari := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'orari', '[]'::jsonb))::uuid), '{}');
  if exists (select 1 from unnest(v_orari) o where not exists (select 1 from orari x where x.id = o and x.corso_id = c.id)) then
    raise exception 'orario_non_del_corso';
  end if;
  if t.modalita = 'orari_fissi' and cardinality(v_orari) = 0 then raise exception 'scegli_i_giorni'; end if;
  if t.lezioni_settimanali is not null and cardinality(v_orari) > t.lezioni_settimanali then raise exception 'troppi_giorni'; end if;

  -- si parte oggi, o il giorno dopo la fine dell'abbonamento in corso sullo stesso corso
  v_inizio := greatest(coalesce((p ->> 'data_inizio')::date, current_date), current_date,
    coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = a.id and corso_id = c.id and stato = 'attiva'), current_date));

  -- posti: chi rinnova il suo stesso orario non conta
  v_fine := scadenza_abbonamento(t.id, v_inizio);
  foreach v_o in array v_orari loop
    if orario_pieno(v_o, v_inizio, v_fine, a.id) then raise exception 'orario_pieno'; end if;
  end loop;

  v_prezzo := coalesce(nullif(t.prezzo_web_cent, 0), t.prezzo_cent);
  if v_prezzo <= 0 then raise exception 'prezzo_mancante'; end if;
  v_importo := v_prezzo;
  righe := righe || jsonb_build_object('descrizione', t.nome || ' · ' || c.nome, 'importo_cent', v_prezzo);
  if pal.quota_iscrizione_cent > 0 and not quota_pagata(a.id, v_inizio) then
    v_quota := true; v_importo := v_importo + pal.quota_iscrizione_cent;
    righe := righe || jsonb_build_object('descrizione', 'Quota annuale', 'importo_cent', pal.quota_iscrizione_cent);
  end if;
  v_ric := coalesce((p ->> 'ricorrente')::boolean, false) and t.rinnovo_automatico
           and coalesce((pal.stripe ->> 'rinnovo_automatico')::boolean, false);

  insert into pagamenti (palestra_id, account_id, allievo_id, corso_id, causale, descrizione, importo_cent, metodo, stato)
  values (a.palestra_id, a.account_id, a.id, c.id, 'abbonamento',
          t.nome || ' · ' || c.nome || ' · ' || a.nome || case when v_quota then ' (con quota annuale)' else '' end,
          v_importo, 'online', 'in_attesa')
  returning id into v_pag;

  insert into acquisti_online (palestra_id, pagamento_id, account_id, allievo_id, tipo_abbonamento_id, corso_id, orari,
                               data_inizio, quota, ricorrente)
  values (a.palestra_id, v_pag, a.account_id, a.id, t.id, c.id, v_orari, v_inizio, v_quota, v_ric)
  returning id into v_acq;

  return jsonb_build_object('acquisto_id', v_acq, 'pagamento_id', v_pag, 'importo_cent', v_importo,
    'prezzo_cent', v_prezzo, 'quota_cent', case when v_quota then pal.quota_iscrizione_cent else 0 end,
    'righe', righe, 'data_inizio', v_inizio, 'ricorrente', v_ric, 'nome', t.nome || ' · ' || c.nome);
end $$;

create or replace function richiedi_abbonamento(p_allievo uuid, p_tipo uuid, p_corso uuid, p_orari uuid[], p_data_inizio date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; t tipi_abbonamento; c corsi; v_quota int := 0; v_tot int; v_id uuid; v_causale text; v_o uuid;
        v_inizio date := greatest(coalesce(p_data_inizio, current_date), current_date);
begin
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  select * into t from tipi_abbonamento where id = p_tipo and palestra_id = a.palestra_id and attivo and not coalesce(archiviato, false);
  if not found then raise exception 'abbonamento_non_disponibile'; end if;
  select * into c from corsi where id = p_corso and palestra_id = a.palestra_id and attivo;
  if not found then raise exception 'corso_non_disponibile'; end if;
  if c.iscrizioni_app <> 'aperte' then raise exception 'corso_non_aperto'; end if;
  if t.modalita = 'orari_fissi' and coalesce(array_length(p_orari, 1), 0) = 0 then raise exception 'scegli_i_giorni'; end if;
  if t.lezioni_settimanali is not null and coalesce(array_length(p_orari, 1), 0) > t.lezioni_settimanali then raise exception 'troppi_giorni'; end if;
  foreach v_o in array coalesce(p_orari, '{}') loop
    if orario_pieno(v_o, v_inizio, scadenza_abbonamento(t.id, v_inizio), a.id) then raise exception 'orario_pieno'; end if;
  end loop;
  if exists (select 1 from richieste_cliente where allievo_id = p_allievo and tipo = 'abbonamento' and stato = 'da_confermare'
               and dati->>'tipo_abbonamento_id' = p_tipo::text and dati->>'corso_id' = p_corso::text) then
    raise exception 'richiesta_gia_inviata';
  end if;

  if not quota_pagata(a.id, v_inizio) then
    select coalesce(quota_iscrizione_cent, 0) into v_quota from palestre where id = a.palestra_id;
  end if;
  v_tot := coalesce(t.prezzo_web_cent, t.prezzo_cent, 0) + v_quota;
  v_causale := trim(a.nome || ' ' || coalesce(a.cognome, '')) || ' - ' || c.nome;

  insert into richieste_cliente (palestra_id, allievo_id, tipo, dati, importo_cent)
  values (a.palestra_id, a.id, 'abbonamento', jsonb_build_object(
      'tipo_abbonamento_id', t.id, 'abbonamento', t.nome, 'corso_id', c.id, 'corso', c.nome,
      'orari', to_jsonb(coalesce(p_orari, '{}')), 'data_inizio', v_inizio,
      'prezzo_cent', coalesce(t.prezzo_web_cent, t.prezzo_cent, 0), 'quota_cent', v_quota,
      'metodo', 'bonifico', 'causale', v_causale), v_tot)
  returning id into v_id;

  begin
    perform accoda_push_staff(a.palestra_id, 'richiesta', 'Abbonamento da confermare',
      trim(a.nome || ' ' || coalesce(a.cognome, '')) || ': ' || t.nome || ' · bonifico ' || to_char(v_tot / 100.0, 'FM9990.00') || ' €',
      '/gestione/richieste', array['admin', 'segreteria'], null, 'rich:' || v_id);
  exception when others then null; end;
  return jsonb_build_object('id', v_id, 'importo_cent', v_tot, 'quota_cent', v_quota, 'causale', v_causale);
end $$;

-- ─── 2. Bonifico arrivato: abbonamento + incasso ──────────────────────────────
create or replace function conferma_richiesta(p_id uuid, p_risposta text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r richieste_cliente; a allievi; v_isc uuid; v_orari uuid[];
begin
  select * into r from richieste_cliente where id = p_id for update;
  if not found or r.stato <> 'da_confermare' then raise exception 'richiesta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = r.allievo_id;

  if r.tipo = 'abbonamento' then
    select coalesce(array_agg(x::uuid), '{}') into v_orari from jsonb_array_elements_text(coalesce(r.dati->'orari', '[]'::jsonb)) x;
    v_isc := crea_iscrizione(r.allievo_id, (r.dati->>'tipo_abbonamento_id')::uuid, (r.dati->>'corso_id')::uuid,
                             (r.dati->>'data_inizio')::date, v_orari, 0, coalesce((r.dati->>'quota_cent')::int, 0) > 0,
                             'Richiesta dall''app (bonifico)');
    -- l'incasso del bonifico, così compare nei pagamenti del cliente, negli incassi e tra le ricevute da emettere
    if coalesce(r.importo_cent, 0) > 0 then
      insert into pagamenti (palestra_id, account_id, allievo_id, corso_id, causale, descrizione, importo_cent, metodo, stato, pagato_at)
      values (r.palestra_id, a.account_id, a.id, (r.dati->>'corso_id')::uuid, 'abbonamento',
              coalesce(r.dati->>'abbonamento', 'Abbonamento') || ' · ' || coalesce(r.dati->>'corso', '') || ' · ' || a.nome
                || case when coalesce((r.dati->>'quota_cent')::int, 0) > 0 then ' (con quota annuale)' else '' end,
              r.importo_cent, 'bonifico', 'pagato', now());
    end if;
  end if;

  update richieste_cliente set stato = 'confermata', risposta = nullif(trim(p_risposta), ''), iscrizione_id = v_isc,
         gestita_at = now(), gestita_da = auth.uid()
   where id = p_id;

  begin
    perform accoda_push(a.account_id,
      case when r.tipo = 'abbonamento' then 'Abbonamento attivato ✓' else 'Lezione privata confermata ✓' end,
      coalesce(nullif(trim(p_risposta), ''), case when r.tipo = 'abbonamento' then (r.dati->>'abbonamento') || ' · ' || (r.dati->>'corso')
                                                 else 'con ' || (r.dati->>'insegnante') end),
      '/area', 'risp:' || p_id);
  exception when others then null; end;
end $$;

-- ─── 3. Recuperi ──────────────────────────────────────────────────────────────
create or replace function prenota_recupero_base(p_credito uuid, p_lezione uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c crediti_recupero; l lezioni; v_cap int; v_pren uuid; v_mio boolean;
begin
  select * into c from crediti_recupero where id = p_credito for update;
  if not found or c.annullato or c.usato_in is not null then raise exception 'credito_non_valido'; end if;

  select exists (select 1 from allievi a where a.id = c.allievo_id and a.account_id in (select miei_account()))
    into v_mio;
  if auth.uid() is not null and not is_staff(c.palestra_id) and not v_mio then
    raise exception 'non_autorizzato';
  end if;

  -- nei corsi aperti a tutti per i recuperi si recupera anche se la lezione non è prenotabile dal sito
  select l2.* into l from lezioni l2
   where l2.id = p_lezione and l2.stato = 'programmata' and l2.inizio > now()
     and (l2.prenotabile or exists (select 1 from corsi x where x.id = l2.corso_id and x.recupero_per_tutti))
   for update of l2;
  if not found then raise exception 'lezione_non_disponibile'; end if;
  if l.data > c.scadenza then raise exception 'credito_scaduto'; end if;
  if not exists (select 1 from corsi_recupero(c.iscrizione_id) cr where cr.corso_id = l.corso_id) then
    raise exception 'corso_non_ammesso_per_recupero';
  end if;
  if not certificato_valido(c.allievo_id, l.data) then raise exception 'certificato_scaduto'; end if;
  if exists (select 1 from v_partecipanti_lezione where lezione_id = l.id and allievo_id = c.allievo_id) then
    raise exception 'gia_prenotata';
  end if;

  select coalesce(l.capienza_override, co.capienza, s.capienza) into v_cap
    from corsi co left join sale s on s.id = l.sala_id where co.id = l.corso_id;
  if v_cap is not null and (select count(*) from v_partecipanti_lezione where lezione_id = l.id) >= v_cap then
    raise exception 'lezione_al_completo';
  end if;

  -- una prenotazione annullata per la stessa lezione si riattiva (prima dava errore di chiave doppia)
  insert into prenotazioni (palestra_id, lezione_id, allievo_id, iscrizione_id, tipo, origine)
  values (l.palestra_id, l.id, c.allievo_id, c.iscrizione_id, 'recupero', 'cliente')
  on conflict (lezione_id, allievo_id) do update
     set stato = 'confermata', tipo = 'recupero', iscrizione_id = excluded.iscrizione_id, origine = excluded.origine
     where prenotazioni.stato <> 'confermata'
  returning id into v_pren;
  if v_pren is null then raise exception 'gia_prenotata'; end if;
  update crediti_recupero set usato_in = v_pren where id = c.id;
  return v_pren;
end $$;

-- la lezione che si è disdetta non va proposta per il recupero
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('lezioni_per_recupero(uuid)'::regprocedure); v0 := v;
  if v not ilike '%assenze_avvisate%' then
    v := replace(v, 'and not exists (select 1 from v_partecipanti_lezione vp
                       where vp.lezione_id = l.id and vp.allievo_id = c.allievo_id)',
                    'and not exists (select 1 from v_partecipanti_lezione vp
                       where vp.lezione_id = l.id and vp.allievo_id = c.allievo_id)
      and not exists (select 1 from assenze_avvisate aa where aa.lezione_id = l.id and aa.allievo_id = c.allievo_id)');
    if v = v0 then raise notice 'lezioni_per_recupero: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- ─── 4. Liste d'attesa ───────────────────────────────────────────────────────
drop index if exists lista_attesa_unica;
create unique index if not exists lista_attesa_unica on liste_attesa (coalesce(lezione_id, corso_id), allievo_id, tipo) where stato <> 'chiuso';

create or replace function aggiungi_in_attesa(p_allievo uuid, p_corso uuid, p_lezione uuid default null, p_tipo text default 'iscrizione')
returns uuid language plpgsql as $$
declare a allievi; v_id uuid;
begin
  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  -- c'è già (magari se l'è messo da solo dall'app): si tiene quella
  select id into v_id from liste_attesa
   where allievo_id = p_allievo and tipo = p_tipo and stato <> 'chiuso'
     and coalesce(lezione_id, corso_id) = coalesce(p_lezione, p_corso);
  if v_id is not null then return v_id; end if;
  insert into liste_attesa (palestra_id, tipo, corso_id, lezione_id, allievo_id, account_id)
  values (a.palestra_id, p_tipo, p_corso, p_lezione, a.id, a.account_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function avvisa_lista_attesa(p_lezione uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_pal palestre; v_liberi jsonb; n int := 0; v_corso text; v_quando text;
begin
  select p.* into v_pal from palestre p join lezioni l on l.palestra_id = p.id where l.id = p_lezione;
  v_liberi := posti_liberi(p_lezione);
  select c.nome, to_char(l.inizio at time zone v_pal.fuso_orario, 'DD/MM alle HH24:MI')
    into v_corso, v_quando
    from lezioni l join corsi c on c.id = l.corso_id where l.id = p_lezione;

  for r in
    select la.* from liste_attesa la
     where la.lezione_id = p_lezione and la.stato = 'in_attesa'
     order by la.created_at
     limit greatest(coalesce((v_liberi->>'posti')::int, 99), 0)
  loop
    exit when (r.tipo = 'prova' and coalesce((v_liberi->>'posti_prova')::int, 0) <= 0);
    perform accoda_messaggio(r.palestra_id, 'posto_libero', r.account_id, r.allievo_id,
      r.id::text, now(),
      jsonb_build_object('corso', v_corso, 'data', v_quando, 'palestra', v_pal.nome,
                         'link_prenota', coalesce(v_pal.base_url, '') || case when r.tipo = 'prova' then '/prova' else '/area' end));
    -- chi ha le notifiche attive lo sa subito anche sul telefono
    if r.account_id is not null and r.tipo <> 'prova' then
      begin
        perform accoda_push(r.account_id, 'Si è liberato un posto', v_corso || ' del ' || v_quando || ': prenotalo dall''app', '/area', 'posto:' || r.id);
      exception when others then null; end;
    end if;
    update liste_attesa set stato = 'avvisato', avvisato_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ─── 5. Appello ──────────────────────────────────────────────────────────────
create or replace function aggiungi_in_appello(p_lezione uuid, p_allievo uuid)
returns text language plpgsql security definer set search_path = public as $$
declare l lezioni; v_isc uuid; v_cred crediti_recupero; v_tipo text := 'ingresso'; v_pren uuid; v_chi text; io uuid;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not is_staff(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  if not exists (select 1 from allievi where id = p_allievo and palestra_id = l.palestra_id) then raise exception 'allievo_non_trovato'; end if;
  if exists (select 1 from v_partecipanti_lezione where lezione_id = p_lezione and allievo_id = p_allievo) then
    raise exception 'gia_presente';
  end if;
  select id, coalesce(nome || coalesce(' ' || cognome, ''), 'staff') into io, v_chi from staff where user_id = auth.uid() and palestra_id = l.palestra_id limit 1;

  -- aveva disdetto questa lezione? allora la disdetta si toglie
  if exists (select 1 from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo) then
    delete from crediti_recupero where id in (select credito_id from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo)
      and usato_in is null;
    delete from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo;
    v_tipo := 'iscritto';
  else
    select i.id into v_isc from iscrizioni i
     where i.allievo_id = p_allievo and i.stato = 'attiva' and l.data between i.data_inizio and i.data_fine
     order by (i.corso_id = l.corso_id) desc limit 1;
    -- un recupero ancora valido che vale per questo corso
    select cr.* into v_cred from crediti_recupero cr
     where cr.allievo_id = p_allievo and not cr.annullato and cr.usato_in is null and cr.scadenza >= l.data
       and exists (select 1 from corsi_recupero(cr.iscrizione_id) x where x.corso_id = l.corso_id)
     order by cr.scadenza limit 1;
    if v_cred.id is not null then v_tipo := 'recupero'; v_isc := v_cred.iscrizione_id; end if;

    insert into prenotazioni (palestra_id, lezione_id, allievo_id, iscrizione_id, tipo, origine, note)
    values (l.palestra_id, p_lezione, p_allievo, v_isc, v_tipo, 'segreteria', 'aggiunta in appello da ' || coalesce(v_chi, 'staff'))
    on conflict (lezione_id, allievo_id) do update set stato = 'confermata', tipo = excluded.tipo,
      iscrizione_id = excluded.iscrizione_id, note = excluded.note
    returning id into v_pren;
    if v_cred.id is not null then update crediti_recupero set usato_in = v_pren where id = v_cred.id; end if;
  end if;

  insert into presenze (palestra_id, lezione_id, allievo_id, presente, registrata_da, registrata_at)
  values (l.palestra_id, p_lezione, p_allievo, true, auth.uid(), now())
  on conflict (lezione_id, allievo_id) do update set presente = true, registrata_da = auth.uid(), registrata_at = now();
  update lezioni set appello_da = coalesce(appello_da, io), appello_at = coalesce(appello_at, now()),
                     appello_mod_da = io, appello_mod_at = now()
   where id = l.id;
  return v_tipo;
end $$;

create or replace function segnala_nuovo_in_appello(p_lezione uuid, p_nome text, p_telefono text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l lezioni; v_corso text; v_chi text; v_id uuid; v_testo text;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not is_staff(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  if length(trim(coalesce(p_nome, ''))) < 3 then raise exception 'nome_mancante'; end if;
  select nome into v_corso from corsi where id = l.corso_id;
  select coalesce(nome || coalesce(' ' || cognome, ''), 'staff') into v_chi from staff where user_id = auth.uid() and palestra_id = l.palestra_id limit 1;
  v_testo := 'Nuova persona in appello da registrare: ' || initcap(trim(p_nome))
            || coalesce(' · tel. ' || nullif(trim(p_telefono), ''), '')
            || ' — ' || coalesce(v_corso, 'lezione') || ' del ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');

  insert into promemoria (palestra_id, data, testo, creato_da, lezione_id)
  values (l.palestra_id, (now() at time zone 'Europe/Rome')::date, v_testo, v_chi, p_lezione)
  returning id into v_id;
  begin
    perform accoda_push_staff(l.palestra_id, 'compito', 'Persona nuova da registrare', v_testo || ' · da ' || coalesce(v_chi, 'staff'),
                              '/gestione/persone/nuova', array['admin', 'segreteria'], null, 'nuovo-appello:' || v_id);
  exception when others then null; end;
  return v_id;
end $$;

-- ─── 6. Conferma su una lezione di un'altra insegnante ────────────────────────
create or replace function conferma_lezione(p_lezione uuid, p_staff uuid default null, p_togli boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l lezioni; io staff; v_chi uuid; v_gest boolean; v_corso text; v_quando text;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not is_staff(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  if l.stato = 'annullata' then raise exception 'lezione_annullata'; end if;
  v_gest := is_gestione(l.palestra_id);
  select * into io from staff where user_id = auth.uid() and palestra_id = l.palestra_id and attivo limit 1;

  if p_togli then
    if not v_gest then raise exception 'non_autorizzato'; end if;
    update lezioni set svolta_da = null, svolta_at = null, svolta_come = null where id = l.id;
    return jsonb_build_object('svolta_da', null);
  end if;

  if p_staff is not null and p_staff is distinct from io.id then
    if not v_gest then raise exception 'non_autorizzato'; end if;      -- solo la segreteria assegna ad altri
    if not exists (select 1 from staff where id = p_staff and palestra_id = l.palestra_id) then raise exception 'staff_non_trovato'; end if;
    v_chi := p_staff;
  else
    if io.id is null then raise exception 'non_autorizzato'; end if;
    -- si conferma da mezz'ora prima dell'inizio in poi
    if now() < l.inizio - interval '30 minutes' then raise exception 'troppo_presto'; end if;
    -- già confermata da un'altra persona: solo la segreteria cambia
    if l.svolta_da is not null and l.svolta_da <> io.id and not v_gest then raise exception 'gia_confermata'; end if;
    v_chi := io.id;
  end if;

  update lezioni set svolta_da = v_chi, svolta_at = now(),
                     svolta_come = case when v_chi = io.id and p_staff is null then 'appello' else 'segreteria' end
   where id = l.id;

  -- un'insegnante dice di aver tenuto la lezione di un'altra: lo sanno la titolare e la segreteria
  if not v_gest and l.insegnante_id is not null and l.insegnante_id <> v_chi and l.svolta_da is distinct from v_chi then
    begin
      select nome into v_corso from corsi where id = l.corso_id;
      v_quando := coalesce(v_corso, 'Lezione') || ' del ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');
      perform accoda_push_staff(l.palestra_id, 'lezione', 'La tua lezione risulta tenuta da ' || io.nome,
        v_quando || '. Se non è così avvisa la segreteria.', '/gestione/calendario', null, l.insegnante_id, 'lez-svolta-altra:' || l.id || ':' || v_chi);
      perform accoda_push_staff(l.palestra_id, 'lezione', 'Sostituzione confermata in appello',
        trim(io.nome || ' ' || coalesce(io.cognome, '')) || ' ha confermato di aver tenuto ' || v_quando
          || ' (era di ' || coalesce((select nome from staff where id = l.insegnante_id), '?') || ')',
        '/gestione/appello/' || l.id, array['admin', 'segreteria'], null, 'lez-svolta-altra-g:' || l.id || ':' || v_chi);
    exception when others then null; end;
  end if;
  return jsonb_build_object('svolta_da', v_chi,
    'sostituzione', l.insegnante_id is not null and l.insegnante_id <> v_chi);
end $$;

-- ─── 7. Riservatezza: pagamenti e contatti solo a segreteria e amministrazione ─
drop policy if exists staff_legge on pagamenti;
drop policy if exists staff_legge on contatti_lead;

-- ─── 8. Eventi a pagamento ───────────────────────────────────────────────────
alter table iscrizioni_evento add column if not exists pagamento_id uuid references pagamenti(id) on delete set null;

create or replace function iscrivi_evento(p_evento uuid, p_allievo uuid, p_persone integer default 1, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare e eventi; a allievi; v_posti int; v_id uuid; v_mio boolean; v_pag uuid;
begin
  select * into e from eventi where id = p_evento for update;
  if not found then raise exception 'evento_non_trovato'; end if;
  if not e.prenotabile then raise exception 'evento_non_prenotabile'; end if;
  if e.inizio < now() then raise exception 'evento_gia_passato'; end if;

  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  select a.account_id in (select miei_account()) into v_mio;
  if auth.uid() is not null and not is_gestione(e.palestra_id) and not v_mio then
    raise exception 'non_autorizzato';
  end if;

  if exists (select 1 from iscrizioni_evento where evento_id = p_evento and allievo_id = p_allievo and stato <> 'annullato') then
    raise exception 'gia_iscritto';
  end if;
  if coalesce(p_persone, 1) > 10 then raise exception 'troppe_persone'; end if;

  if e.posti is not null then
    select coalesce(sum(persone), 0) into v_posti from iscrizioni_evento
     where evento_id = p_evento and stato <> 'annullato';
    if v_posti + greatest(p_persone, 1) > e.posti then raise exception 'posti_esauriti'; end if;
  end if;

  -- se l'evento è a pagamento resta il dovuto in segreteria, legato all'iscrizione
  if e.prezzo_cent > 0 then
    insert into pagamenti (palestra_id, account_id, allievo_id, causale, descrizione, importo_cent, stato)
    values (e.palestra_id, a.account_id, a.id, 'evento',
            e.titolo || ' — ' || a.nome || ' ' || a.cognome || case when greatest(p_persone, 1) > 1 then ' (' || greatest(p_persone, 1) || ' persone)' else '' end,
            e.prezzo_cent * greatest(p_persone, 1), 'in_attesa'::stato_pagamento)
    returning id into v_pag;
  end if;

  insert into iscrizioni_evento (palestra_id, evento_id, allievo_id, nome, email, telefono, persone, note, pagamento_id)
  select e.palestra_id, e.id, a.id, a.nome || ' ' || a.cognome, acc.email, acc.telefono,
         greatest(p_persone, 1), p_note, v_pag
  from account acc where acc.id = a.account_id
  returning id into v_id;
  return v_id;
end $$;

create or replace function annulla_iscrizione_evento(p_iscrizione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i iscrizioni_evento; v_mio boolean; e eventi; p pagamenti;
begin
  select * into i from iscrizioni_evento where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  select exists (select 1 from allievi a where a.id = i.allievo_id and a.account_id in (select miei_account()))
    into v_mio;
  if auth.uid() is not null and not is_gestione(i.palestra_id) and not v_mio then raise exception 'non_autorizzato'; end if;
  select * into e from eventi where id = i.evento_id;
  if not is_gestione(i.palestra_id) and e.inizio < now() then raise exception 'evento_gia_passato'; end if;

  update iscrizioni_evento set stato = 'annullato' where id = p_iscrizione;
  -- il dovuto non ancora pagato si chiude; se era già pagato la segreteria decide il rimborso
  select * into p from pagamenti where id = i.pagamento_id;
  if p.id is not null and p.stato = 'in_attesa' then
    update pagamenti set stato = 'annullato' where id = p.id;
  elsif p.id is not null and p.stato = 'pagato' then
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (i.palestra_id, current_date,
            i.nome || ' non partecipa più a "' || e.titolo || '" ma aveva già pagato ' || to_char(p.importo_cent / 100.0, 'FM9990.00')
              || ' €: decidi se rimborsare.', 'App');
  end if;
end $$;

-- i dovuti degli eventi già esistenti: si legano all'iscrizione quando si riconoscono (stesso evento, stessa persona)
update iscrizioni_evento ie set pagamento_id = p.id
  from eventi e, allievi a, pagamenti p
 where ie.pagamento_id is null and e.id = ie.evento_id and a.id = ie.allievo_id
   and p.causale = 'evento' and p.account_id = a.account_id and p.descrizione like e.titolo || ' — ' || a.nome || ' ' || a.cognome || '%'
   and not exists (select 1 from iscrizioni_evento x where x.pagamento_id = p.id);

-- ─── 9. Nuova persona: c'era già? ────────────────────────────────────────────
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('crea_persona(jsonb)'::regprocedure); v0 := v;
  if v not ilike '%allievo_nuovo%' then
    v := replace(v, 'v_acc uuid; v_all uuid; v_nuovo_acc boolean := false;', 'v_acc uuid; v_all uuid; v_nuovo_acc boolean := false; v_nuovo_all boolean := false;');
    v := replace(v, '            ''iscritto'', nullif(p->>''note_allievo'', ''''))
    returning id into v_all;', '            ''iscritto'', nullif(p->>''note_allievo'', ''''))
    returning id into v_all;
    v_nuovo_all := true;');
    v := replace(v, '''account_nuovo'', v_nuovo_acc)', '''account_nuovo'', v_nuovo_acc, ''allievo_nuovo'', v_nuovo_all)');
    if v = v0 or v not ilike '%v_nuovo_all := true%' then raise notice 'crea_persona: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- ─── 10. Lezione annullata: chi non ha le notifiche riceve un'email ──────────
create or replace function trg_lezioni_annullata_clienti()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; n int; v_testo text; pal palestre;
begin
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

-- ─── 11. Lista d'attesa di un corso: l'avviso porta all'acquisto, e arriva anche sul telefono ─
create or replace function avvisa_attesa(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare la liste_attesa; v_pal palestre; v_corso text; v_quando text; v_link text;
begin
  select * into la from liste_attesa where id = p_id;
  if not found then raise exception 'attesa_non_trovata'; end if;
  if not is_gestione(la.palestra_id) and not e_sistema() then raise exception 'non_autorizzato'; end if;

  select * into v_pal from palestre where id = la.palestra_id;
  select c.nome into v_corso from corsi c where c.id = la.corso_id;
  select to_char(l.inizio at time zone v_pal.fuso_orario, 'DD/MM alle HH24:MI')
    into v_quando from lezioni l where l.id = la.lezione_id;
  v_link := coalesce(v_pal.base_url, '') || case when la.tipo = 'prova' then '/prova'
                                                 when la.tipo = 'iscrizione' then '/area/acquista?corso=' || la.corso_id
                                                 else '/area' end;

  perform accoda_messaggio(la.palestra_id, 'posto_libero', la.account_id, la.allievo_id,
    'attesa:' || la.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'), now(),
    jsonb_build_object('corso', v_corso, 'data', coalesce(v_quando, 'i prossimi giorni'),
                       'palestra', v_pal.nome, 'link_prenota', v_link));
  if la.account_id is not null and la.tipo <> 'prova' then
    begin
      perform accoda_push(la.account_id, 'Si è liberato un posto', coalesce(v_corso, 'Il corso') || ': entra dall''app prima che lo prenda un altro',
                          case when la.tipo = 'iscrizione' then '/area/acquista?corso=' || la.corso_id else '/area' end,
                          'attesa-push:' || la.id || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
    exception when others then null; end;
  end if;

  update liste_attesa set stato = 'avvisato', avvisato_at = now() where id = p_id;
end $$;

-- ─── 12. Iscrizione annullata con rinnovo automatico: il rinnovo va disdetto su Stripe ─
alter table abbonamenti_ricorrenti drop constraint if exists abbonamenti_ricorrenti_stato_check;
alter table abbonamenti_ricorrenti add constraint abbonamenti_ricorrenti_stato_check check (stato in ('attivo', 'in_ritardo', 'da_disdire', 'annullato'));

do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('annulla_iscrizione(uuid,text,uuid[])'::regprocedure); v0 := v;
  if v not ilike '%da_disdire%' then
    v := replace(v, 'n := annulla_incassi_iscrizione(i, p_pagamenti, p_motivo);
  return jsonb_build_object(''incassi_annullati'', n);',
    'n := annulla_incassi_iscrizione(i, p_pagamenti, p_motivo);
  -- il rinnovo automatico di questo abbonamento si ferma (l''app lo disdice subito su Stripe)
  update abbonamenti_ricorrenti set stato = ''da_disdire''
   where stato in (''attivo'', ''in_ritardo'')
     and (ultima_iscrizione_id = i.id or (allievo_id = i.allievo_id and corso_id = i.corso_id and tipo_abbonamento_id = i.tipo_abbonamento_id));
  return jsonb_build_object(''incassi_annullati'', n,
    ''da_disdire'', (select coalesce(jsonb_agg(id), ''[]''::jsonb) from abbonamenti_ricorrenti where allievo_id = i.allievo_id and stato = ''da_disdire''));');
    if v = v0 then raise notice 'annulla_iscrizione: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- Stripe addebita un rinnovo di un abbonamento già disdetto (succede se la disdetta non è arrivata in tempo):
-- l'incasso si registra ma l'abbonamento non riparte, e la segreteria trova il promemoria per il rimborso
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('rinnova_ricorrente(text,integer,text)'::regprocedure); v0 := v;
  if v not ilike '%dopo la disdetta%' then
    v := replace(v, '  v_iscr := crea_iscrizione(r.allievo_id, r.tipo_abbonamento_id, r.corso_id, v_inizio, r.orari, 0, false, ''Rinnovo automatico'');',
      '  if r.stato in (''annullato'', ''da_disdire'') then
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (r.palestra_id, current_date, ''Rinnovo automatico addebitato dopo la disdetta: '' || a.nome || '' '' || coalesce(a.cognome, '''')
            || '' ('' || to_char(p_importo_cent / 100.0, ''FM9990.00'') || '' €). Rimborsalo dalla scheda (Pagamenti → Rimborsa).'', ''Stripe'');
    return v_pag;
  end if;
  v_iscr := crea_iscrizione(r.allievo_id, r.tipo_abbonamento_id, r.corso_id, v_inizio, r.orari, 0, false, ''Rinnovo automatico'');');
    if v = v0 then raise notice 'rinnova_ricorrente: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- ─── 13. Lista d'attesa del corso: si avvisa solo se il posto si libera davvero adesso ─
-- (prima bastava annullare un abbonamento che partiva fra un mese per avvisare chi aspetta)
create or replace function trg_iscrizioni_attesa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.stato = 'attiva' and new.stato in ('annullata', 'scaduta')
     and new.data_fine >= current_date and new.data_inizio <= current_date + 14 then
    perform avvisa_attesa_corso(new.corso_id, 1);
  end if;
  return new;
end $$;

-- ─── 14. Rinnovo automatico non riuscito: lo sanno la segreteria e il cliente ─
create or replace function stato_ricorrente(p_subscription text, p_stato text)
returns void language plpgsql security definer set search_path = public as $$
declare r abbonamenti_ricorrenti; a allievi; t tipi_abbonamento; acc account; pal palestre; v_prima text;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into r from abbonamenti_ricorrenti where stripe_subscription_id = p_subscription;
  v_prima := r.stato;
  update abbonamenti_ricorrenti set stato = p_stato,
         annullato_at = case when p_stato = 'annullato' then coalesce(annullato_at, now()) end
   where stripe_subscription_id = p_subscription;

  if r.id is not null and p_stato = 'in_ritardo' and v_prima is distinct from 'in_ritardo' then
    select * into a from allievi where id = r.allievo_id;
    select * into t from tipi_abbonamento where id = r.tipo_abbonamento_id;
    select * into acc from account where id = r.account_id;
    select * into pal from palestre where id = r.palestra_id;
    begin
      perform accoda_push_staff(r.palestra_id, 'pagamento', 'Rinnovo automatico non riuscito',
        trim(a.nome || ' ' || coalesce(a.cognome, '')) || ' · ' || coalesce(t.nome, 'abbonamento') || ': la carta è stata rifiutata. Stripe riprova nei prossimi giorni.',
        '/gestione/persone/' || a.id, array['admin', 'segreteria'], null, 'ric-ko:' || r.id || ':' || to_char(now(), 'YYYYMMDD'));
      if accoda_push(r.account_id, 'Pagamento non riuscito', 'Il rinnovo di ' || coalesce(t.nome, 'abbonamento') || ' non è andato a buon fine: aggiorna la carta dall''app.',
                     '/area/pagamenti', 'ric-ko:' || r.id || ':' || to_char(now(), 'YYYYMMDD')) = 0 and acc.email is not null then
        insert into messaggi_coda (palestra_id, account_id, allievo_id, evento, canale, destinatario, oggetto, corpo, chiave)
        values (r.palestra_id, acc.id, a.id, 'rinnovo_non_riuscito', 'email', acc.email, 'Pagamento del rinnovo non riuscito',
                'Ciao ' || a.nome || ',' || E'\n\n' || 'il rinnovo automatico di ' || coalesce(t.nome, 'abbonamento')
                  || ' non è andato a buon fine (carta rifiutata o scaduta). Aggiorna la carta dall''app, nella sezione Pagamenti.'
                  || E'\n\n' || pal.nome,
                'ric-ko-mail:' || r.id || ':' || to_char(now(), 'YYYYMMDD'))
        on conflict (palestra_id, chiave) do nothing;
      end if;
    exception when others then null; end;
  end if;
end $$;

-- ─── 15. Evento eliminato: chi era iscritto viene avvisato, i dovuti si chiudono ─
create or replace function elimina_evento(p_evento uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e eventi; i record; pal palestre; n int := 0; v_testo text;
begin
  select * into e from eventi where id = p_evento;
  if not found then raise exception 'evento_non_trovato'; end if;
  if not is_gestione(e.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into pal from palestre where id = e.palestra_id;
  v_testo := '"' || e.titolo || '" del ' || to_char(e.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ' è stato annullato.';

  for i in select ie.*, a.account_id from iscrizioni_evento ie left join allievi a on a.id = ie.allievo_id
            where ie.evento_id = e.id and ie.stato <> 'annullato' loop
    perform annulla_iscrizione_evento(i.id);
    n := n + 1;
    if e.inizio > now() then
      begin
        if i.account_id is null or accoda_push(i.account_id, 'Evento annullato', v_testo, '/area/eventi', 'ev-ann:' || e.id || ':' || i.id) = 0 then
          if coalesce(i.email, '') <> '' then
            insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
            values (e.palestra_id, i.account_id, 'evento_annullato', 'email', i.email, 'Evento annullato: ' || e.titolo,
                    'Ciao,' || E'\n\n' || v_testo || ' Ci scusiamo per il disagio.' || E'\n\n' || pal.nome,
                    'ev-ann-mail:' || e.id || ':' || i.id)
            on conflict (palestra_id, chiave) do nothing;
          end if;
        end if;
      exception when others then null; end;
    end if;
  end loop;
  delete from eventi where id = e.id;
  return jsonb_build_object('avvisati', n);
end $$;
revoke execute on function elimina_evento(uuid) from public, anon;
grant execute on function elimina_evento(uuid) to authenticated;

-- presenza all'evento segnata dalla segreteria
create or replace function presenza_evento(p_iscrizione uuid, p_presente boolean)
returns void language plpgsql security definer set search_path = public as $$
declare i iscrizioni_evento;
begin
  select * into i from iscrizioni_evento where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  if i.stato = 'annullato' then raise exception 'iscrizione_annullata'; end if;
  update iscrizioni_evento set stato = case when p_presente then 'presente' else 'iscritto' end where id = p_iscrizione;
end $$;
revoke execute on function presenza_evento(uuid, boolean) from public, anon;
grant execute on function presenza_evento(uuid, boolean) to authenticated;
