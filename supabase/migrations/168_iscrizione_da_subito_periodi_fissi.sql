-- 168 — Iscriversi dall'app da subito (paga in segreteria il prezzo giusto), periodi fissi, avviso di scadenza in home
-- • Abbonamenti "a periodi fissi": nel tipo di abbonamento si scelgono i mesi in cui partono i periodi (es. trimestrale
--   ottobre, gennaio, aprile → ott–dic, gen–mar, apr–giu). Chi si iscrive a novembre scade il 31 dicembre, non a gennaio.
--   Senza mesi scelti tutto come prima (mensile a mese solare, trimestrale dal mese d'inizio).
-- • Dall'app il cliente può iscriversi DA OGGI anche a periodo avviato: l'abbonamento parte subito, le lezioni ci sono,
--   e il pagamento resta "da saldare" con il prezzo per le lezioni che restano (lo stesso calcolo dello Sportello):
--   lo paga in segreteria, che può correggerlo. Pagando online invece si parte sempre dall'inizio di un periodo.
-- • In home il cliente vede l'avviso "il tuo abbonamento scade il …" da tanti giorni prima quanti ne ha il primo
--   promemoria "Abbonamento in scadenza" in Messaggi (se non ce ne sono: 7). I promemoria possono essere più d'uno.
-- • La segreteria lo vede subito: in home ("Richieste dall'app"), nelle notizie e in Richieste, con abbonamento, giorni,
--   date, lezioni che restano e prezzo indicativo; si chiude da sola quando l'incasso viene registrato.
-- Ridefinisce per intero: scadenza_abbonamento, prepara_acquisto, richiedi_abbonamento, rinnova_iscrizione, area_home.
-- Si può rilanciare.

alter table tipi_abbonamento add column if not exists mesi_inizio smallint[];

-- il periodo "pieno" che contiene un giorno: per i periodi fissi quello dei mesi scelti, per gli abbonamenti a mese
-- solare dal 1° del mese. Niente per annuali, pacchetti a ingressi, durate in giorni.
create or replace function periodo_abbonamento(p_tipo uuid, p_data date)
returns table(inizio date, fine date, fisso boolean)
language plpgsql stable set search_path = public as $$
declare t tipi_abbonamento; s date; e date;
begin
  select * into t from tipi_abbonamento where id = p_tipo;
  if not found or p_data is null or t.modalita = 'ingressi' or coalesce(t.durata_mesi, 1) >= 9
     or (t.durata_giorni is not null and t.durata_giorni < 28) then return; end if;
  if coalesce(array_length(t.mesi_inizio, 1), 0) > 0 then
    select max(make_date(y, m, 1)) into s
      from unnest(t.mesi_inizio) m, generate_series(extract(year from p_data)::int - 1, extract(year from p_data)::int) y
     where m between 1 and 12 and make_date(y, m, 1) <= p_data;
    if s is not null then
      e := (s + make_interval(months => greatest(coalesce(t.durata_mesi, 1), 1)) - interval '1 day')::date;
      if e >= p_data then inizio := s; fine := e; fisso := true; return next; return; end if;
    end if;
  end if;
  if a_mese_solare(p_tipo) then
    inizio := date_trunc('month', p_data)::date;
    fine := fine_periodo(inizio, greatest(coalesce(t.durata_mesi, 1), 1), true);
    fisso := false; return next;
  end if;
end $$;
grant execute on function periodo_abbonamento(uuid, date) to authenticated;

-- la scadenza: come prima, più i periodi fissi
create or replace function scadenza_abbonamento(p_tipo uuid, p_inizio date)
returns date
language sql stable set search_path = public as $$
  select case
    -- l'annuale (9 mesi o più) finisce sempre con la stagione, da qualunque mese parta
    when t.modalita <> 'ingressi' and coalesce(t.durata_mesi, 1) >= 9 and (t.durata_giorni is null or t.durata_giorni >= 28)
      then fine_stagione(t.palestra_id, p_inizio)
    -- periodi fissi (es. ott–dic, gen–mar, apr–giu): finisce con il periodo in cui parte
    when (select p.fine from periodo_abbonamento(t.id, p_inizio) p where p.fisso) is not null
      then least((select p.fine from periodo_abbonamento(t.id, p_inizio) p where p.fisso), fine_stagione(t.palestra_id, p_inizio))
    when t.durata_giorni is not null and (t.durata_giorni < 28 or not t.scadenza_fine_mese)
      then least(p_inizio + t.durata_giorni - 1, fine_stagione(t.palestra_id, p_inizio))
    else least(fine_periodo(p_inizio, greatest(coalesce(t.durata_mesi, 1), 1), t.scadenza_fine_mese), fine_stagione(t.palestra_id, p_inizio))
  end
  from tipi_abbonamento t where t.id = p_tipo;
$$;

-- dall'app (pagando online) si parte solo all'inizio di un periodo: il 1° del mese, o il 1° del periodo fisso
create or replace function fuori_inizio_periodo(p_tipo uuid, p_data date)
returns boolean
language sql stable set search_path = public as $$
  select (a_mese_solare(p_tipo) and extract(day from p_data) <> 1)
      or coalesce((select p_data <> p.inizio from periodo_abbonamento(p_tipo, p_data) p where p.fisso), false);
$$;

-- il prezzo partendo a periodo avviato, lo stesso calcolo dello Sportello:
--   a mese solare: il primo mese conta per le lezioni che restano (prezzo - un mese + un mese × restano/del mese)
--   a periodi fissi: tutto il periodo conta per le lezioni che restano (prezzo × restano/del periodo)
-- con i giorni scelti si contano le lezioni (feste e chiusure tolte da quelle che restano), senza giorni i giorni.
-- Dà anche le prossime partenze (inizio dei periodi dopo), per la scelta "da quando" dell'app.
create or replace function prezzo_parziale(p_tipo uuid, p_orari uuid[], p_dal date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t tipi_abbonamento; per record; nx record; c_s date; c_e date; v_tot int; v_rim int; v_prezzo int; v_pm int; v_p numeric;
        v_giorni int[]; v_prossimi date[] := '{}'; d date; k int; v_dal date := coalesce(p_dal, current_date);
begin
  select * into t from tipi_abbonamento where id = p_tipo;
  if not found then return null; end if;
  -- le prossime partenze
  select * into per from periodo_abbonamento(p_tipo, v_dal);
  -- periodi fissi: il periodo dopo; a mese solare: il 1° del mese dopo (anche un trimestrale può partire ogni mese)
  d := case when per.inizio is null then null when per.inizio = v_dal then v_dal
            when per.fisso then per.fine + 1 else (per.inizio + interval '1 month')::date end;
  for k in 1..3 loop
    exit when d is null;
    select * into nx from periodo_abbonamento(p_tipo, d);
    exit when nx.inizio is null;
    v_prossimi := v_prossimi || greatest(nx.inizio, d);
    d := case when nx.fisso then nx.fine + 1 else (greatest(nx.inizio, d) + interval '1 month')::date end;
  end loop;
  if per.inizio is null then
    return jsonb_build_object('periodo', false, 'parziale', false, 'prossimi', to_jsonb(v_prossimi),
                              'prezzo_pieno_cent', t.prezzo_cent, 'prezzo_cent', t.prezzo_cent);
  end if;
  if per.fisso then c_s := per.inizio; c_e := per.fine;
  else c_s := date_trunc('month', v_dal)::date; c_e := (date_trunc('month', v_dal) + interval '1 month' - interval '1 day')::date; end if;
  if t.modalita = 'orari_fissi' and coalesce(array_length(p_orari, 1), 0) > 0 then
    select array_agg(distinct giorno_settimana::int) into v_giorni from orari where id = any(p_orari);
  end if;
  select count(*) filter (where true),
         count(*) filter (where g >= v_dal and not exists (select 1 from chiusure ch where ch.palestra_id = t.palestra_id and g between ch.dal and ch.al))
    into v_tot, v_rim
    from generate_series(c_s, c_e, interval '1 day') x(g0), lateral (select g0::date g) y
   where v_giorni is null or extract(isodow from g) = any(v_giorni);
  v_prezzo := t.prezzo_cent;
  if per.fisso then v_p := v_prezzo::numeric * v_rim / greatest(v_tot, 1);
  else
    v_pm := round(v_prezzo::numeric / greatest(coalesce(t.durata_mesi, 1), 1));
    v_p := (v_prezzo - v_pm) + v_pm::numeric * v_rim / greatest(v_tot, 1);
  end if;
  return jsonb_build_object(
    'periodo', true, 'fisso', per.fisso, 'inizio_periodo', per.inizio, 'fine', scadenza_abbonamento(p_tipo, v_dal),
    'parziale', v_dal > per.inizio and v_rim > 0, 'nessuna_rimasta', v_rim = 0,
    'totale', v_tot, 'rimaste', v_rim, 'a_giorni', v_giorni is null,
    'prossimi', to_jsonb(v_prossimi),
    'prezzo_pieno_cent', v_prezzo,
    'prezzo_cent', case when v_dal > per.inizio and v_rim > 0 then (round(v_p / 100) * 100)::int else v_prezzo end);
end $$;
revoke all on function prezzo_parziale(uuid, uuid[], date) from public, anon;
grant execute on function prezzo_parziale(uuid, uuid[], date) to authenticated;

-- le richieste "da incassare": chi si è iscritto dall'app e passa in segreteria a pagare (in home della segreteria)
alter table richieste_cliente drop constraint if exists richieste_cliente_tipo_check;
alter table richieste_cliente add constraint richieste_cliente_tipo_check check (tipo in ('abbonamento', 'personal', 'da_incassare'));

-- dall'app: iscritto da subito (periodo avviato), da pagare in segreteria. L'abbonamento c'è e le lezioni anche;
-- l'incasso resta "da saldare" (in rosso in tutto il gestionale finché la segreteria non incassa).
create or replace function iscriviti_paga_in_segreteria(p_allievo uuid, p_tipo uuid, p_corso uuid, p_orari uuid[], p_data_inizio date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a allievi; t tipi_abbonamento; c corsi; v_inizio date := greatest(coalesce(p_data_inizio, current_date), current_date);
        v_o uuid; pp jsonb; v_isc uuid; v_pag uuid; v_quota int := 0; v_qpag uuid; v_mese smallint; v_prezzo int; v_chi text;
begin
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  select * into t from tipi_abbonamento where id = p_tipo and palestra_id = a.palestra_id and attivo and not coalesce(archiviato, false);
  if not found then raise exception 'abbonamento_non_disponibile'; end if;
  select * into c from corsi where id = p_corso and palestra_id = a.palestra_id and attivo;
  if not found then raise exception 'corso_non_disponibile'; end if;
  if c.iscrizioni_app <> 'aperte' then raise exception 'corso_non_aperto'; end if;
  if not eta_adatta(a.id, c.id, v_inizio) then raise exception 'eta_non_adatta'; end if;
  if t.modalita = 'orari_fissi' and coalesce(array_length(p_orari, 1), 0) = 0 then raise exception 'scegli_i_giorni'; end if;
  if exists (select 1 from unnest(coalesce(p_orari, '{}')) o where not exists (select 1 from orari x where x.id = o and x.attivo and (x.corso_id = p_corso or exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = p_tipo and tc.corso_id = x.corso_id)))) then
    raise exception 'orario_non_attivo';
  end if;
  if t.lezioni_settimanali is not null and coalesce(array_length(p_orari, 1), 0) > t.lezioni_settimanali then raise exception 'troppi_giorni'; end if;
  if (select count(distinct lower(btrim(coalesce(x.gruppo, '')))) from orari x where x.id = any (coalesce(p_orari, '{}')) and x.corso_id = p_corso) > 1 then
    raise exception 'gruppi_diversi';
  end if;
  -- dopo quello in corso sullo stesso corso
  v_inizio := greatest(v_inizio, coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = a.id and corso_id = c.id and stato = 'attiva'), v_inizio));
  if annuale_a_stagione_avviata(t.id, v_inizio) then raise exception 'annuale_in_segreteria'; end if;
  pp := prezzo_parziale(t.id, p_orari, v_inizio);
  if not coalesce((pp->>'parziale')::boolean, false) then raise exception 'paga_online'; end if;
  foreach v_o in array coalesce(p_orari, '{}') loop
    if orario_pieno(v_o, v_inizio, scadenza_abbonamento(t.id, v_inizio), a.id) then raise exception 'orario_pieno'; end if;
  end loop;

  v_prezzo := (pp->>'prezzo_cent')::int;
  v_isc := crea_iscrizione(a.id, t.id, c.id, v_inizio, p_orari, 0, false,
             'Dall''app: iscritto dal ' || to_char(v_inizio, 'DD/MM') || ', da pagare in segreteria (restano ' || (pp->>'rimaste') ||
             case when (pp->>'a_giorni')::boolean then ' giorni' else ' lezioni' end || ' su ' || (pp->>'totale') ||
             ', prezzo indicativo ' || to_char(v_prezzo / 100.0, 'FM9990') || ' €)');
  insert into pagamenti (palestra_id, account_id, allievo_id, corso_id, causale, descrizione, importo_cent, metodo, stato)
  values (a.palestra_id, a.account_id, a.id, c.id, 'abbonamento', t.nome || ' · ' || c.nome || ' (dal ' || to_char(v_inizio, 'DD/MM') || ')',
          v_prezzo, 'contanti', 'in_attesa')
  returning id into v_pag;
  update iscrizioni set pagamento_id = v_pag where id = v_isc;

  -- la quota annuale, se non c'è ancora: anche lei da pagare in segreteria
  if not quota_pagata(a.id, v_inizio) then
    select coalesce(quota_iscrizione_cent, 0), mese_inizio_stagione into v_quota, v_mese from palestre where id = a.palestra_id;
    if v_quota > 0 then
      insert into pagamenti (palestra_id, account_id, allievo_id, causale, descrizione, importo_cent, metodo, stato)
      values (a.palestra_id, a.account_id, a.id, 'quota_iscrizione', 'Quota associativa annuale', v_quota, 'contanti', 'in_attesa')
      returning id into v_qpag;
      insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, pagamento_id, data)
      values (a.palestra_id, a.id, stagione_di(v_inizio, coalesce(v_mese, 9)), v_quota, v_qpag, v_inizio)
      on conflict do nothing;
    end if;
  end if;

  v_chi := trim(a.nome || ' ' || coalesce(a.cognome, ''));
  -- per la segreteria: in home ("Richieste dall'app") e nelle notizie, con tutto quello che ha preso
  insert into richieste_cliente (palestra_id, allievo_id, tipo, dati, importo_cent, iscrizione_id)
  values (a.palestra_id, a.id, 'da_incassare', jsonb_build_object(
      'tipo_abbonamento_id', t.id, 'abbonamento', t.nome, 'corso_id', c.id, 'corso', c.nome,
      'orari', to_jsonb(coalesce(p_orari, '{}')), 'data_inizio', v_inizio, 'data_fine', (select data_fine from iscrizioni where id = v_isc),
      'rimaste', (pp->>'rimaste')::int, 'totale', (pp->>'totale')::int, 'a_giorni', (pp->>'a_giorni')::boolean, 'fisso', (pp->>'fisso')::boolean,
      'prezzo_cent', v_prezzo, 'prezzo_pieno_cent', (pp->>'prezzo_pieno_cent')::int, 'quota_cent', v_quota,
      'pagamento_id', v_pag, 'quota_pagamento_id', v_qpag), v_prezzo + v_quota, v_isc);
  begin
    perform accoda_push_staff(a.palestra_id, 'richiesta', 'Iscritto dall''app: da incassare',
      v_chi || ': ' || t.nome || ' dal ' || to_char(v_inizio, 'DD/MM') || ' · ' || to_char((v_prezzo + v_quota) / 100.0, 'FM9990') || ' € in segreteria',
      '/gestione/sportello?persona=' || a.id, array['admin', 'segreteria'], null, 'segr:' || v_isc);
  exception when others then null; end;
  return jsonb_build_object('iscrizione_id', v_isc, 'data_inizio', v_inizio, 'data_fine', (select data_fine from iscrizioni where id = v_isc),
                            'prezzo_cent', v_prezzo, 'quota_cent', v_quota, 'rimaste', (pp->>'rimaste')::int, 'totale', (pp->>'totale')::int);
end $$;
revoke all on function iscriviti_paga_in_segreteria(uuid, uuid, uuid, uuid[], date) from public, anon;
grant execute on function iscriviti_paga_in_segreteria(uuid, uuid, uuid, uuid[], date) to authenticated;

-- incassato (dalla lista "da saldare", dallo Sportello…): la richiesta "da incassare" si chiude da sola
create or replace function trg_chiudi_da_incassare()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'pagato' and old.stato is distinct from 'pagato' then
    update richieste_cliente set stato = 'confermata', gestita_at = now(), gestita_da = auth.uid(), risposta = coalesce(risposta, 'Incassato')
     where tipo = 'da_incassare' and stato = 'da_confermare' and dati->>'pagamento_id' = new.id::text;
  end if;
  return new;
end $$;
drop trigger if exists pagamenti_chiudi_da_incassare on pagamenti;
create trigger pagamenti_chiudi_da_incassare after update of stato on pagamenti
  for each row execute function trg_chiudi_da_incassare();

-- la segreteria la toglie a mano (es. ha sistemato in altro modo, o il cliente non è venuto e l'abbonamento è stato tolto)
create or replace function chiudi_da_incassare(p_id uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r richieste_cliente;
begin
  select * into r from richieste_cliente where id = p_id and tipo = 'da_incassare';
  if not found then raise exception 'richiesta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  update richieste_cliente set stato = 'confermata', gestita_at = now(), gestita_da = auth.uid(),
         risposta = coalesce(nullif(trim(p_nota), ''), 'Sistemato in segreteria')
   where id = p_id and stato = 'da_confermare';
end $$;
revoke all on function chiudi_da_incassare(uuid, text) from public, anon;
grant execute on function chiudi_da_incassare(uuid, text) to authenticated;

-- da quanti giorni prima compare l'avviso di scadenza in home: il promemoria "Abbonamento in scadenza" più lontano
create or replace function giorni_avviso_scadenza(p_palestra uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select max(giorni) from messaggi_template
                    where palestra_id = p_palestra and evento = 'scadenza_abbonamento' and attivo and giorni > 0), 7);
$$;
grant execute on function giorni_avviso_scadenza(uuid) to authenticated;

-- gli abbonamenti che stanno per finire, per la home del cliente: niente se c'è già il rinnovo (un altro abbonamento
-- allo stesso corso dopo) o il rinnovo automatico con la carta
create or replace function in_scadenza_area()
returns jsonb
language sql stable security definer set search_path = public as $$
  with mie as (select id, palestra_id from account where id in (select miei_account())),
  g as (select giorni_avviso_scadenza((select palestra_id from mie limit 1)) n)
  select coalesce(jsonb_agg(jsonb_build_object('allievo_id', a.id, 'nome', a.nome, 'corso_id', c.id, 'corso', c.nome,
                                               'al', i.data_fine, 'giorni', i.data_fine - current_date) order by i.data_fine, a.nome), '[]'::jsonb)
    from iscrizioni i join allievi a on a.id = i.allievo_id join corsi c on c.id = i.corso_id, g
   where a.account_id in (select id from mie) and i.stato = 'attiva'
     and i.data_fine between current_date and current_date + g.n
     and not exists (select 1 from iscrizioni j where j.allievo_id = i.allievo_id and j.corso_id = i.corso_id
                       and j.stato = 'attiva' and j.data_inizio > i.data_fine)
     and not exists (select 1 from abbonamenti_ricorrenti ar where ar.allievo_id = i.allievo_id and ar.corso_id = i.corso_id
                       and ar.stato in ('attivo', 'in_ritardo'));
$$;
revoke all on function in_scadenza_area() from public, anon;
grant execute on function in_scadenza_area() to authenticated;

-- la home del cliente: come prima, più gli abbonamenti in scadenza
create or replace function area_home()
returns jsonb
language plpgsql set search_path = public as $$
declare r jsonb; n int;
begin
  -- come faceva la pagina: se il collegamento non riesce (es. utente senza email) si va avanti lo stesso
  begin
    perform collega_account();
  exception when others then null;
  end;
  r := area_riepilogo();
  select count(*) into n
    from jsonb_array_elements(coalesce(r -> 'allievi', '[]'::jsonb)) a
    cross join lateral moduli_da_firmare((a ->> 'id')::uuid) m
   where m.obbligatorio and m.firmata_versione is distinct from m.versione;
  return jsonb_build_object(
    'riepilogo', r,
    'materiali', materiali_area(),
    'in_verifica', coalesce((select jsonb_agg(jsonb_build_object('allievo_id', allievo_id, 'scadenza', scadenza, 'caricato_at', caricato_at))
                      from certificati where stato = 'da_verificare'), '[]'::jsonb),
    'consenso', (select jsonb_build_object('consenso_marketing', consenso_marketing, 'consenso_chiesto_at', consenso_chiesto_at)
                   from account where user_id = auth.uid() limit 1),
    'disdette', disdette_area(),
    'workshop', workshop_area(),
    'moduli_da_firmare', coalesce(n, 0),
    'in_scadenza', in_scadenza_area()
  );
end $$;

-- prepara_acquisto: come prima, ma l'inizio va controllato anche sui periodi fissi
CREATE OR REPLACE FUNCTION public.prepara_acquisto(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not eta_adatta(a.id, c.id, coalesce((p ->> 'data_inizio')::date, current_date)) then raise exception 'eta_non_adatta'; end if;
  if exists (select 1 from tipi_abbonamento_corsi where tipo_abbonamento_id = t.id)
     and not exists (select 1 from tipi_abbonamento_corsi where tipo_abbonamento_id = t.id and corso_id = c.id) then
    raise exception 'corso_non_compreso';
  end if;

  v_orari := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'orari', '[]'::jsonb))::uuid), '{}');
  if exists (select 1 from unnest(v_orari) o where not exists (select 1 from orari x where x.id = o and (x.corso_id = c.id or exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = t.id and tc.corso_id = x.corso_id)))) then
    raise exception 'orario_non_del_corso';
  end if;
  if exists (select 1 from unnest(v_orari) o where not exists (select 1 from orari x where x.id = o and x.attivo)) then
    raise exception 'orario_non_attivo';
  end if;
  if t.modalita = 'orari_fissi' and cardinality(v_orari) = 0 then raise exception 'scegli_i_giorni'; end if;
  if t.lezioni_settimanali is not null and cardinality(v_orari) > t.lezioni_settimanali then raise exception 'troppi_giorni'; end if;
  -- i giorni del corso scelto devono essere tutti dello stesso gruppo (mescolare lo fa la segreteria)
  if (select count(distinct lower(btrim(coalesce(x.gruppo, '')))) from orari x where x.id = any (v_orari) and x.corso_id = c.id) > 1 then
    raise exception 'gruppi_diversi';
  end if;

  -- si parte oggi, o il giorno dopo la fine dell'abbonamento in corso sullo stesso corso
  v_inizio := greatest(coalesce((p ->> 'data_inizio')::date, current_date), current_date,
    coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = a.id and corso_id = c.id and stato = 'attiva'), current_date));

  -- mese solare: dall'app si parte il 1° del mese (a metà mese l'importo lo decide la segreteria)
  if fuori_inizio_periodo(t.id, v_inizio) then raise exception 'inizio_meta_mese'; end if;
  if annuale_a_stagione_avviata(t.id, v_inizio) then raise exception 'annuale_in_segreteria'; end if;

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
end $function$;

-- richiedi_abbonamento: come prima, ma l'inizio va controllato anche sui periodi fissi
CREATE OR REPLACE FUNCTION public.richiedi_abbonamento(p_allievo uuid, p_tipo uuid, p_corso uuid, p_orari uuid[], p_data_inizio date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not eta_adatta(a.id, c.id, v_inizio) then raise exception 'eta_non_adatta'; end if;
  if t.modalita = 'orari_fissi' and coalesce(array_length(p_orari, 1), 0) = 0 then raise exception 'scegli_i_giorni'; end if;
  if exists (select 1 from unnest(coalesce(p_orari, '{}')) o where not exists (select 1 from orari x where x.id = o and x.attivo and (x.corso_id = p_corso or exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = p_tipo and tc.corso_id = x.corso_id)))) then
    raise exception 'orario_non_attivo';
  end if;
  if t.lezioni_settimanali is not null and coalesce(array_length(p_orari, 1), 0) > t.lezioni_settimanali then raise exception 'troppi_giorni'; end if;
  if (select count(distinct lower(btrim(coalesce(x.gruppo, '')))) from orari x where x.id = any (coalesce(p_orari, '{}')) and x.corso_id = p_corso) > 1 then
    raise exception 'gruppi_diversi';
  end if;
  if exists (select 1 from richieste_cliente where allievo_id = p_allievo and tipo = 'abbonamento' and stato = 'da_confermare'
               and dati->>'tipo_abbonamento_id' = p_tipo::text and dati->>'corso_id' = p_corso::text) then
    raise exception 'richiesta_gia_inviata';
  end if;

  -- dopo quello in corso sullo stesso corso
  v_inizio := greatest(v_inizio, coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = a.id and corso_id = c.id and stato = 'attiva'), v_inizio));
  if fuori_inizio_periodo(t.id, v_inizio) then raise exception 'inizio_meta_mese'; end if;
  if annuale_a_stagione_avviata(t.id, v_inizio) then raise exception 'annuale_in_segreteria'; end if;
  foreach v_o in array coalesce(p_orari, '{}') loop
    if orario_pieno(v_o, v_inizio, scadenza_abbonamento(t.id, v_inizio), a.id) then raise exception 'orario_pieno'; end if;
  end loop;
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
end $function$;

-- rinnova_iscrizione: come prima, ma l'inizio va controllato anche sui periodi fissi
CREATE OR REPLACE FUNCTION public.rinnova_iscrizione(p_iscrizione uuid, p_tipo_abbonamento uuid DEFAULT NULL::uuid, p_sconto_cent integer DEFAULT NULL::integer, p_dal date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_meta := fuori_inizio_periodo(v_tipo, v_dal);
  if v_meta and p_sconto_cent is null then raise exception 'inizio_meta_mese'; end if;
  select coalesce(array_agg(io.orario_id), '{}') into v_orari
    from iscrizioni_orari io where io.iscrizione_id = p_iscrizione;

  v_id := crea_iscrizione(i.allievo_id, v_tipo, i.corso_id, v_dal, v_orari,
                          coalesce(p_sconto_cent, i.sconto_cent), false,
                          case when v_meta then 'Rinnovo da metà mese' else 'Rinnovo' end);
  update iscrizioni set rinnovo_di = p_iscrizione where id = v_id;
  return v_id;
end $function$;

notify pgrst, 'reload schema';
