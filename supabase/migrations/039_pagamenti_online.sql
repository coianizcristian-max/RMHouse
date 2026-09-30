-- =====================================================================
-- RMHouse — 039 PAGAMENTI ONLINE CON STRIPE (pronto, spento)
--
-- Tutto il necessario per incassare online: prove a pagamento, acquisto
-- degli abbonamenti dall'area clienti con i giorni scelti, rate pagate
-- online, link di pagamento mandati dalla segreteria, rinnovo automatico
-- mensile, rimborsi, commissioni, ricevuta emessa da sola.
-- NON SI ACCENDE finché su Vercel non ci sono le chiavi di Stripe e
-- PAGAMENTI_ONLINE=true: fino ad allora tutto funziona come oggi.
-- Da eseguire dopo la 038. Si può rieseguire.
-- =====================================================================

alter table palestre add column if not exists stripe jsonb not null default '{}'::jsonb;
alter table pagamenti add column if not exists commissione_cent int;
alter table account add column if not exists stripe_customer_id text;
alter table tipi_abbonamento add column if not exists rinnovo_automatico boolean not null default false;

-- Acquisti partiti dall'area clienti, in attesa che Stripe confermi il pagamento
create table if not exists acquisti_online (
  id                  uuid primary key default gen_random_uuid(),
  palestra_id         uuid not null references palestre(id) on delete cascade,
  pagamento_id        uuid references pagamenti(id) on delete set null,
  account_id          uuid references account(id) on delete set null,
  allievo_id          uuid not null references allievi(id) on delete cascade,
  tipo_abbonamento_id uuid not null references tipi_abbonamento(id),
  corso_id            uuid not null references corsi(id),
  orari               uuid[] not null default '{}',
  data_inizio         date not null,
  quota               boolean not null default false,
  ricorrente          boolean not null default false,
  stato               text not null default 'in_attesa' check (stato in ('in_attesa', 'completato', 'scaduto', 'errore')),
  iscrizione_id       uuid references iscrizioni(id) on delete set null,
  stripe_session_id   text,
  errore              text,
  created_at          timestamptz not null default now()
);
alter table acquisti_online enable row level security;
drop policy if exists gestione_legge on acquisti_online;
create policy gestione_legge on acquisti_online for select to authenticated using (is_gestione(palestra_id));
drop policy if exists cliente_legge on acquisti_online;
create policy cliente_legge on acquisti_online for select to authenticated using (account_id in (select miei_account()));

-- Rinnovi automatici (abbonamenti Stripe)
create table if not exists abbonamenti_ricorrenti (
  id                     uuid primary key default gen_random_uuid(),
  palestra_id            uuid not null references palestre(id) on delete cascade,
  account_id             uuid references account(id) on delete set null,
  allievo_id             uuid not null references allievi(id) on delete cascade,
  tipo_abbonamento_id    uuid not null references tipi_abbonamento(id),
  corso_id               uuid not null references corsi(id),
  orari                  uuid[] not null default '{}',
  importo_cent           int not null,
  stripe_subscription_id text unique,
  stato                  text not null default 'attivo' check (stato in ('attivo', 'in_ritardo', 'annullato')),
  ultima_iscrizione_id   uuid references iscrizioni(id) on delete set null,
  created_at             timestamptz not null default now(),
  annullato_at           timestamptz
);
alter table abbonamenti_ricorrenti enable row level security;
drop policy if exists gestione_legge on abbonamenti_ricorrenti;
create policy gestione_legge on abbonamenti_ricorrenti for select to authenticated using (is_gestione(palestra_id));
drop policy if exists cliente_legge on abbonamenti_ricorrenti;
create policy cliente_legge on abbonamenti_ricorrenti for select to authenticated using (account_id in (select miei_account()));

-- Eventi già ricevuti da Stripe: se ne arriva uno due volte, il secondo si ignora
create table if not exists stripe_eventi (
  id          text primary key,
  tipo        text not null,
  esito       text,
  ricevuto_at timestamptz not null default now()
);
alter table stripe_eventi enable row level security;
drop policy if exists gestione_legge on stripe_eventi;
create policy gestione_legge on stripe_eventi for select to authenticated using (
  exists (select 1 from staff s where s.user_id = auth.uid() and s.ruolo = 'admin'));

-- chi chiama con la chiave di servizio (il webhook, lato server) conta come sistema
create or replace function e_sistema()
returns boolean language sql stable as $$ select coalesce(auth.jwt() ->> 'role', '') = 'service_role' $$;

-- ---------------------------------------------------------------------
-- Preparare un acquisto dall'area clienti
-- ---------------------------------------------------------------------
create or replace function prepara_acquisto(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; t tipi_abbonamento; c corsi; pal palestre; v_orari uuid[]; v_inizio date; v_importo int;
        v_quota boolean := false; v_pag uuid; v_acq uuid; righe jsonb := '[]'::jsonb; v_prezzo int; v_ric boolean;
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
grant execute on function prepara_acquisto(jsonb) to authenticated;

-- Pagamento arrivato: nasce l'iscrizione con i giorni scelti (chiamata dal webhook)
create or replace function completa_acquisto(p_acquisto uuid, p_session text, p_intent text, p_customer text default null,
                                             p_subscription text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare q acquisti_online; v_iscr uuid; v_pal palestre; t tipi_abbonamento;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into q from acquisti_online where id = p_acquisto for update;
  if not found then raise exception 'acquisto_non_trovato'; end if;
  if q.stato = 'completato' then return q.iscrizione_id; end if;

  update pagamenti set stato = 'pagato', pagato_at = now(), metodo = 'online',
         stripe_session_id = coalesce(p_session, stripe_session_id), stripe_payment_intent = coalesce(p_intent, stripe_payment_intent)
   where id = q.pagamento_id;
  if p_customer is not null then update account set stripe_customer_id = p_customer where id = q.account_id; end if;

  begin
    v_iscr := crea_iscrizione(q.allievo_id, q.tipo_abbonamento_id, q.corso_id, q.data_inizio, q.orari, 0, false,
                              'Acquistato online' || case when p_subscription is not null then ' con rinnovo automatico' else '' end);
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

  if p_subscription is not null then
    select * into t from tipi_abbonamento where id = q.tipo_abbonamento_id;
    insert into abbonamenti_ricorrenti (palestra_id, account_id, allievo_id, tipo_abbonamento_id, corso_id, orari, importo_cent,
                                        stripe_subscription_id, ultima_iscrizione_id)
    values (q.palestra_id, q.account_id, q.allievo_id, q.tipo_abbonamento_id, q.corso_id, q.orari,
            coalesce(nullif(t.prezzo_web_cent, 0), t.prezzo_cent), p_subscription, v_iscr)
    on conflict (stripe_subscription_id) do nothing;
  end if;
  return v_iscr;
end $$;

-- Rinnovo automatico del mese: nuovo pagamento e nuova iscrizione dal giorno dopo la fine
create or replace function rinnova_ricorrente(p_subscription text, p_importo_cent int, p_intent text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r abbonamenti_ricorrenti; v_pag uuid; v_iscr uuid; v_inizio date; t tipi_abbonamento; c corsi; a allievi;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into r from abbonamenti_ricorrenti where stripe_subscription_id = p_subscription for update;
  if not found then return null; end if;
  if exists (select 1 from pagamenti where stripe_payment_intent = p_intent) then return null; end if;
  select * into t from tipi_abbonamento where id = r.tipo_abbonamento_id;
  select * into c from corsi where id = r.corso_id;
  select * into a from allievi where id = r.allievo_id;
  v_inizio := greatest(current_date,
    coalesce((select max(data_fine) + 1 from iscrizioni where allievo_id = r.allievo_id and corso_id = r.corso_id and stato = 'attiva'), current_date));

  insert into pagamenti (palestra_id, account_id, allievo_id, corso_id, causale, descrizione, importo_cent, metodo, stato,
                         pagato_at, stripe_payment_intent)
  values (r.palestra_id, r.account_id, r.allievo_id, r.corso_id, 'abbonamento',
          t.nome || ' · ' || c.nome || ' · ' || a.nome || ' (rinnovo automatico)', p_importo_cent, 'online', 'pagato', now(), p_intent)
  returning id into v_pag;
  v_iscr := crea_iscrizione(r.allievo_id, r.tipo_abbonamento_id, r.corso_id, v_inizio, r.orari, 0, false, 'Rinnovo automatico');
  update iscrizioni set pagamento_id = v_pag where id = v_iscr;
  update abbonamenti_ricorrenti set ultima_iscrizione_id = v_iscr, stato = 'attivo' where id = r.id;
  return v_pag;
end $$;

-- Rata pagata online
create or replace function paga_rata_online(p_rata uuid, p_session text, p_intent text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r rate; v_pag uuid;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into r from rate where id = p_rata for update;
  if not found or r.stato <> 'da_pagare' then return null; end if;
  insert into pagamenti (palestra_id, account_id, allievo_id, causale, descrizione, importo_cent, metodo, stato, pagato_at,
                         rata_id, stripe_session_id, stripe_payment_intent)
  values (r.palestra_id, r.account_id, r.allievo_id, case when r.iscrizione_id is not null then 'abbonamento' else 'altro' end,
          r.descrizione || ' · rata ' || r.numero || ' di ' || r.di, r.importo_cent, 'online', 'pagato', now(), r.id, p_session, p_intent)
  returning id into v_pag;
  update rate set stato = 'pagata', pagamento_id = v_pag where id = r.id;
  if r.iscrizione_id is not null then
    update iscrizioni set pagamento_id = coalesce(pagamento_id, v_pag) where id = r.iscrizione_id;
  end if;
  return v_pag;
end $$;

-- Pagamento qualsiasi (prova, link mandato dalla segreteria) andato a buon fine
create or replace function conferma_pagamento_online(p_pagamento uuid, p_session text, p_intent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  perform conferma_pagamento(p_pagamento, p_session, p_intent);
  update pagamenti set metodo = 'online' where id = p_pagamento;
end $$;

-- Sessione di pagamento scaduta senza pagare: si libera il posto della prova
create or replace function scadi_pagamento_online(p_pagamento uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  update pagamenti set stato = 'annullato' where id = p_pagamento and stato = 'in_attesa'
     and exists (select 1 from prove where pagamento_id = p_pagamento union select 1 from acquisti_online where pagamento_id = p_pagamento);
  update prove set stato = 'annullata' where pagamento_id = p_pagamento and stato = 'in_attesa_pagamento';
  update acquisti_online set stato = 'scaduto' where pagamento_id = p_pagamento and stato = 'in_attesa';
end $$;

-- Rimborso fatto da Stripe
create or replace function segna_rimborso_online(p_intent text, p_rimborsato_cent int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  update pagamenti set stato = case when p_rimborsato_cent >= importo_cent then 'rimborsato'::stato_pagamento else stato end,
         descrizione = descrizione || ' — rimborsati ' || replace(to_char(p_rimborsato_cent / 100.0, 'FM99999990.00'), '.', ',') || ' € su Stripe'
   where stripe_payment_intent = p_intent and descrizione not like '%rimborsati%';
end $$;

-- Rinnovo automatico annullato o non pagato
create or replace function stato_ricorrente(p_subscription text, p_stato text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  update abbonamenti_ricorrenti set stato = p_stato,
         annullato_at = case when p_stato = 'annullato' then coalesce(annullato_at, now()) end
   where stripe_subscription_id = p_subscription;
end $$;

do $$
declare f text;
begin
  foreach f in array array['completa_acquisto(uuid, text, text, text, text)', 'rinnova_ricorrente(text, int, text)',
                           'paga_rata_online(uuid, text, text)', 'conferma_pagamento_online(uuid, text, text)',
                           'scadi_pagamento_online(uuid)', 'segna_rimborso_online(text, int)', 'stato_ricorrente(text, text)'] loop
    execute 'revoke execute on function ' || f || ' from public, anon, authenticated';
  end loop;
end $$;

-- Le prove prenotate online e mai pagate liberano il posto dopo un'ora
create or replace function annulla_prove_non_pagate()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with x as (
    update prove set stato = 'annullata'
     where stato = 'in_attesa_pagamento' and created_at < now() - interval '1 hour'
    returning pagamento_id)
  update pagamenti set stato = 'annullato' where id in (select pagamento_id from x) and stato = 'in_attesa';
  get diagnostics n = row_count;
  update acquisti_online set stato = 'scaduto' where stato = 'in_attesa' and created_at < now() - interval '1 day';
  return n;
end $$;
revoke execute on function annulla_prove_non_pagate() from public, anon, authenticated;
do $$
begin
  perform cron.unschedule('rmhouse-prove-non-pagate');
exception when others then null;
end $$;
do $$
begin
  perform cron.schedule('rmhouse-prove-non-pagate', '*/15 * * * *', 'select public.annulla_prove_non_pagate();');
exception when others then raise notice 'pg_cron non disponibile (%).', sqlerrm;
end $$;

-- La ricevuta la può emettere anche il sistema, dopo un pagamento online
create or replace function emetti_ricevuta(p_pagamento uuid, p_data date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pg pagamenti; v_num int; v_anno int; v_id uuid; acc account; v_allievo uuid; v_numerazione uuid;
        al aliquote_iva; v_imponibile int; v_iva int;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not (is_gestione(pg.palestra_id) or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then raise exception 'non_autorizzato'; end if;
  if pg.stato <> 'pagato' then raise exception 'pagamento_non_incassato'; end if;
  if exists (select 1 from ricevute r where r.pagamento_id = p_pagamento and not r.annullata and r.tipo_documento = 'ricevuta') then
    raise exception 'ricevuta_gia_emessa';
  end if;

  select id into v_numerazione from numerazioni
   where palestra_id = pg.palestra_id and tipo_documento = 'ricevuta' and predefinita and attiva limit 1;
  if v_numerazione is null then raise exception 'numerazione_mancante'; end if;

  v_anno := extract(year from coalesce(p_data, current_date))::int;
  v_num := prossimo_numero(v_numerazione, v_anno);

  select * into acc from account where id = pg.account_id;
  v_allievo := coalesce(pg.allievo_id,
    (select allievo_id from iscrizioni where pagamento_id = pg.id limit 1),
    (select allievo_id from quote_iscrizione where pagamento_id = pg.id limit 1),
    (select id from allievi where account_id = acc.id order by created_at limit 1));

  select * into al from aliquote_iva where id = aliquota_di_pagamento(pg.id);
  v_imponibile := round(pg.importo_cent / (1 + coalesce(al.percentuale, 0) / 100.0));
  v_iva := pg.importo_cent - v_imponibile;

  insert into ricevute (palestra_id, numerazione_id, tipo_documento, numero, anno, data, pagamento_id, account_id, allievo_id,
                        intestatario, codice_fiscale, indirizzo, descrizione, importo_cent, iva_cent, aliquota,
                        aliquota_id, natura, metodo, note)
  values (pg.palestra_id, v_numerazione, 'ricevuta', v_num, v_anno, coalesce(p_data, current_date), p_pagamento,
          acc.id, v_allievo,
          coalesce(nullif(trim(coalesce(acc.nome, '') || ' ' || coalesce(acc.cognome, '')), ''), 'Cliente'),
          acc.codice_fiscale,
          nullif(concat_ws(', ', acc.indirizzo, nullif(concat_ws(' ', acc.cap, acc.citta), ''), acc.provincia), ''),
          pg.descrizione, v_imponibile, v_iva, coalesce(al.nome, 'esente'), al.id, al.natura, pg.metodo,
          nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Il riepilogo per il commercialista riporta anche le commissioni dei pagamenti online
create or replace function riepilogo_fiscale(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'incassato_cent', (select coalesce(sum(importo_cent), 0) from pagamenti where palestra_id = p_palestra
                         and stato = 'pagato' and pagato_at::date between p_dal and p_al),
    'documenti_cent', (select coalesce(sum(totale_cent), 0) from registro_documenti(p_palestra, p_dal, p_al) where not annullata),
    'ricevute', (select count(*) from ricevute where palestra_id = p_palestra and tipo_documento = 'ricevuta'
                   and not annullata and data between p_dal and p_al),
    'note_credito', (select count(*) from ricevute where palestra_id = p_palestra and tipo_documento = 'nota_credito'
                       and not annullata and data between p_dal and p_al),
    'senza_ricevuta', (select count(*) from ricevute_mancanti(p_palestra, p_dal, p_al)),
    'acquisti_cent', (select coalesce(sum(totale_cent), 0) from registro_acquisti(p_palestra, p_dal, p_al)),
    'iva_acquisti_cent', (select coalesce(sum(iva_cent), 0) from registro_acquisti(p_palestra, p_dal, p_al)),
    'per_aliquota', (select coalesce(jsonb_agg(jsonb_build_object('aliquota', aliquota, 'natura', natura,
                        'imponibile_cent', imp, 'iva_cent', iva, 'totale_cent', tot) order by tot desc), '[]'::jsonb)
                     from (select aliquota, natura, sum(imponibile_cent) imp, sum(iva_cent) iva, sum(totale_cent) tot
                             from corrispettivi_giornalieri(p_palestra, p_dal, p_al) group by aliquota, natura) x),
    'commissioni_cent', (select coalesce(sum(commissione_cent), 0) from pagamenti where palestra_id = p_palestra
                           and stato in ('pagato', 'rimborsato') and pagato_at::date between p_dal and p_al),
    'compensi_cent', (select coalesce(sum(totale_cent), 0) from compensi where palestra_id = p_palestra
                        and make_date(anno, mese, 1) between date_trunc('month', p_dal)::date and p_al)
  );
$$;
select 'pagamenti online pronti' as cosa, count(*) from pg_proc
 where proname in ('prepara_acquisto', 'completa_acquisto', 'rinnova_ricorrente', 'paga_rata_online', 'scadi_pagamento_online');
