-- =====================================================================
-- RMHouse — 148 IMPORT DA APP PALESTRE: VENDITE E PRODOTTI + FATTURATO IN HOME
--
-- L'import da APP Palestre (Persone → Importa → APP Palestre) impara a leggere altri due file:
--   • le VENDITE ("acquisti clienti": Fatture/ricevute → Vendite → Scarica): una riga per ogni cosa
--     venduta, con il prezzo davvero fatto (dopo gli sconti) e il periodo. Servono a:
--       - trovare quello che è stato venduto ma non pagato (con "Metti da incassare" nel Da sistemare);
--       - trovare i pagamenti diversi dal venduto;
--       - registrare le quote annuali anche quando erano pagate insieme all'abbonamento
--         (nel file dei pagamenti in quel caso si vede solo la prima voce);
--       - trovare gli abbonamenti attivi che non risultano venduti;
--       - proporre da abbinare i prodotti venduti in questa stagione che in RMHouse non hanno un abbonamento.
--   • i PRODOTTI (listino di APP Palestre: Fatture/ricevute → Prodotti → Scarica): nome, categoria,
--     prezzo, prezzo online, reparto IVA. Servono a confrontare il listino di RMHouse con quello di
--     APP Palestre (prezzi e IVA diversi, quota annuale) e a dare il prezzo di listino alle vendite.
-- Le vendite e i prodotti restano nel database (l'ultimo file caricato): il controllo si rifà ogni volta
-- che si rifà il controllo dell'import, anche dal "Da sistemare" dopo un abbinamento.
-- Nuova categoria "Listino" nel Da sistemare e azioni con un clic su alcune voci.
--
-- Riepilogo (home): il fatturato (incassato) della stagione in corso, dell'anno solare e del mese,
-- con il confronto allo stesso giorno dell'anno prima.
--
-- Si può eseguire più volte. Va dopo la 147.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------
alter table anomalie_import add column if not exists dati jsonb;   -- per le azioni con un clic ("Metti da incassare"…)
alter table anomalie_import drop constraint if exists anomalie_import_categoria_check;
alter table anomalie_import add constraint anomalie_import_categoria_check
  check (categoria in ('persone', 'abbonamenti', 'corsi', 'pagamenti', 'ricevute', 'listino'));

-- le vendite di APP Palestre (l'ultimo file caricato): una riga per voce venduta
create table if not exists import_vendite (
  id                uuid primary key default gen_random_uuid(),
  palestra_id       uuid not null references palestre(id) on delete cascade,
  importazione_id   uuid references importazioni(id) on delete set null,
  riga              int not null,              -- la riga del file (1, 2, 3…)
  parte             int not null default 0,    -- la voce dentro la riga (0 = la prima)
  parti             int not null default 1,    -- quante voci ha la riga (es. abbonamento + quota annuale)
  cliente           text,
  cf                text,
  tessera           text,
  piva              text,
  data              date,                      -- "Data acquisto"
  importo_cent      int,                       -- l'importo della riga intera
  importo_voce_cent int,                       -- la parte di questa voce (diversa solo se la riga ha più voci)
  voce              text,
  dal               date,
  al                date,
  descrizione       text,                      -- "Informazioni acquisti" intero
  allievo_id        uuid references allievi(id) on delete set null,
  pagamento_id      uuid references pagamenti(id) on delete set null,
  ricevuta_id       uuid references ricevute(id) on delete set null,
  pagato_cent       int,
  esito             text,                      -- pagata, diversa, non_pagata, prima, dopo, senza_pagamenti, gratis, storno
  unique (palestra_id, riga, parte)
);
create index if not exists import_vendite_voce on import_vendite (palestra_id, (testo_norm(voce)));
create index if not exists import_vendite_allievo on import_vendite (allievo_id);

-- il listino di APP Palestre (l'ultimo file "prodotti" caricato)
create table if not exists listino_app (
  palestra_id        uuid not null references palestre(id) on delete cascade,
  posizione          int not null,
  nome               text not null,
  nome_norm          text not null,
  tipo               text,
  categoria          text,
  reparto            text,
  prezzo_cent        int,
  prezzo_web_cent    int,
  prezzo_online_cent int,
  descrizione        text,
  varianti           text,
  sku                text,
  barcode            text,
  quantita           int,
  importazione_id    uuid references importazioni(id) on delete set null,
  caricato_at        timestamptz not null default now(),
  primary key (palestra_id, posizione)
);
create index if not exists listino_app_nome on listino_app (palestra_id, nome_norm);

alter table import_vendite enable row level security;
alter table listino_app enable row level security;
grant select, insert, update, delete on import_vendite, listino_app to authenticated;
grant select, insert, update, delete on import_vendite, listino_app to service_role;
revoke all on import_vendite, listino_app from anon;
drop policy if exists gestione_tutto on import_vendite;
create policy gestione_tutto on import_vendite for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists gestione_tutto on listino_app;
create policy gestione_tutto on listino_app for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- piccoli aiuti
create or replace function euro_testo(c int) returns text language sql immutable strict as $$
  select replace(to_char(c / 100.0, 'FM999999990.00'), '.', ',')
$$;
-- le voci che non sono abbonamenti (non si propongono da abbinare)
create or replace function voce_non_abbonamento(t text) returns boolean language sql immutable as $$
  select coalesce(testo_norm(t) ~ '^(iscrizione annuale|quota|contribut|rimbors|storno|evento|festa di compleanno|noleggio|servizi|giornata dello sport)', false)
$$;

-- ---------------------------------------------------------------------
-- 2. Prodotti (listino di APP Palestre): si sostituisce tutto con l'ultimo file
-- ---------------------------------------------------------------------
create or replace function importa_ap_listino(p_imp uuid, p_righe jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pal uuid; n int; n_abb int;
begin
  select palestra_id into v_pal from importazioni where id = p_imp;
  if v_pal is null then raise exception 'importazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  delete from listino_app where palestra_id = v_pal;
  insert into listino_app (palestra_id, posizione, nome, nome_norm, tipo, categoria, reparto, prezzo_cent, prezzo_web_cent,
                           prezzo_online_cent, descrizione, varianti, sku, barcode, quantita, importazione_id)
  select v_pal, e.ord::int, trim(e.r->>'nome'), testo_norm(e.r->>'nome'), nullif(trim(e.r->>'tipo'), ''), nullif(trim(e.r->>'categoria'), ''),
         nullif(trim(e.r->>'reparto'), ''), (e.r->>'prezzo_cent')::int, (e.r->>'prezzo_web_cent')::int, (e.r->>'prezzo_online_cent')::int,
         nullif(trim(e.r->>'descrizione'), ''), nullif(trim(e.r->>'varianti'), ''), nullif(trim(e.r->>'sku'), ''), nullif(trim(e.r->>'barcode'), ''),
         (e.r->>'quantita')::int, p_imp
    from jsonb_array_elements(p_righe) with ordinality as e(r, ord)
   where testo_norm(e.r->>'nome') is not null;
  get diagnostics n = row_count;
  select count(*) into n_abb from listino_app l
   where l.palestra_id = v_pal and not voce_non_abbonamento(l.nome) and tipo_da_nome(v_pal, l.nome) is not null;
  update importazioni set riepilogo = riepilogo || jsonb_build_object('prodotti', n) where id = p_imp;
  return jsonb_build_object('prodotti', n, 'abbinati', n_abb);
end $$;

-- ---------------------------------------------------------------------
-- 3. Vendite: si caricano a blocchi (il primo blocco cancella il file precedente)
-- ---------------------------------------------------------------------
create or replace function importa_ap_vendite(p_imp uuid, p_righe jsonb, p_azzera boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pal uuid; v_quota int; n int; n_senza int;
begin
  select palestra_id into v_pal from importazioni where id = p_imp;
  if v_pal is null then raise exception 'importazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if p_azzera then delete from import_vendite where palestra_id = v_pal; end if;

  -- la quota annuale di listino: serve a dividere le righe "abbonamento + quota annuale"
  v_quota := coalesce(
    (select l.prezzo_cent from listino_app l where l.palestra_id = v_pal and l.prezzo_cent > 0
        and (l.categoria ilike 'iscrizione%' or l.nome_norm like 'iscrizione annuale%') order by l.posizione limit 1),
    (select quota_iscrizione_cent from palestre where id = v_pal), 0);

  insert into import_vendite (palestra_id, importazione_id, riga, parte, parti, cliente, cf, tessera, piva, data, importo_cent,
                              voce, dal, al, descrizione)
  select v_pal, p_imp, x.riga, coalesce(x.parte, 0), coalesce(x.parti, 1), nullif(trim(x.cliente), ''), nullif(upper(trim(x.cf)), ''),
         nullif(trim(x.tessera), ''), nullif(trim(x.piva), ''), x.data, x.importo_cent, nullif(trim(x.voce), ''), x.dal, x.al,
         nullif(trim(x.descrizione), '')
    from jsonb_to_recordset(p_righe) as x(riga int, parte int, parti int, cliente text, cf text, tessera text, piva text, data date,
                                          importo_cent int, voce text, dal date, al date, descrizione text)
   where x.riga is not null
  on conflict (palestra_id, riga, parte) do update set
    importazione_id = excluded.importazione_id, parti = excluded.parti, cliente = excluded.cliente, cf = excluded.cf,
    tessera = excluded.tessera, piva = excluded.piva, data = excluded.data, importo_cent = excluded.importo_cent,
    voce = excluded.voce, dal = excluded.dal, al = excluded.al, descrizione = excluded.descrizione,
    importo_voce_cent = null, allievo_id = null;
  get diagnostics n = row_count;

  -- la persona (come per i pagamenti: nome, tessera, codice fiscale)
  update import_vendite v set allievo_id = trova_allievo_importato(v_pal, v.cliente, null, v.tessera, v.cf)
   where v.palestra_id = v_pal and v.importazione_id = p_imp and v.allievo_id is null and v.cliente is not null;

  -- quanto è di ogni voce: nelle righe con più voci la quota annuale vale il suo prezzo di listino, il resto è dell'altra voce
  update import_vendite v set importo_voce_cent = case
      when v.parti = 1 then v.importo_cent
      when testo_norm(v.voce) like 'iscrizione annuale%' then least(v_quota, greatest(v.importo_cent, 0))
      when v.parte = (select min(x.parte) from import_vendite x where x.palestra_id = v.palestra_id and x.riga = v.riga
                         and coalesce(testo_norm(x.voce), '') not like 'iscrizione annuale%')
        then v.importo_cent - coalesce((select sum(least(v_quota, greatest(x.importo_cent, 0))) from import_vendite x
                                          where x.palestra_id = v.palestra_id and x.riga = v.riga
                                            and testo_norm(x.voce) like 'iscrizione annuale%'), 0)
      else 0 end
   where v.palestra_id = v_pal and v.importazione_id = p_imp and v.importo_voce_cent is null;

  select count(*) into n_senza from import_vendite
   where palestra_id = v_pal and importazione_id = p_imp and parte = 0 and allievo_id is null;
  return jsonb_build_object('righe', n, 'senza_persona', n_senza);
end $$;

-- ---------------------------------------------------------------------
-- 4. Controllo delle vendite: pagate o no, quote annuali, abbonamenti senza vendita
--    (lo chiama importa_ap_anomalie: gira a ogni import e a ogni "rifai il controllo")
-- ---------------------------------------------------------------------
create or replace function controlla_vendite(p_imp uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid; v_mese int; v_inizio_stag date; v_primo_pag date; v_ultimo_pag date; v_primo_ven date; v_ultimo_ven date;
  c record; r record; v_usate uuid[] := '{}'; v_usati uuid[] := '{}'; v_chiave text; v_anom uuid; v_causale text;
  n_vendite int; n_pagate int; n_diverse int; n_non int; n_prima int; n_dopo int; n_quote int := 0; n_senza_abb int := 0;
  v_tot int; v_stat jsonb;
begin
  select palestra_id into v_pal from importazioni where id = p_imp;
  if v_pal is null then return '{}'::jsonb; end if;
  if not exists (select 1 from import_vendite where palestra_id = v_pal) then return jsonb_build_object('vendite', 0); end if;
  select coalesce(mese_inizio_stagione, 9) into v_mese from palestre where id = v_pal;
  v_inizio_stag := make_date(stagione_di(current_date, v_mese), v_mese, 1);

  -- la persona, se all'ultimo giro non era stata trovata (nel frattempo la scheda può essere stata sistemata)
  update import_vendite v set allievo_id = trova_allievo_importato(v_pal, v.cliente, null, v.tessera, v.cf)
   where v.palestra_id = v_pal and v.allievo_id is null and v.cliente is not null;

  -- i pagamenti arrivati da APP Palestre (uno per incasso; per gli storni la nota di credito)
  drop table if exists _cv_pag;
  create temp table _cv_pag on commit drop as
    select distinct on (coalesce(ip.pagamento_id, ip.ricevuta_id)) coalesce(ip.pagamento_id, ip.ricevuta_id) as k,
           ip.pagamento_id, ip.ricevuta_id, ip.allievo_id, testo_norm(ip.cliente) as cliente_n, testo_norm(ip.voce) as voce_n,
           ip.dal, ip.al, ip.importo_cent, ip.data_pagamento
      from import_pagamenti ip
     where ip.palestra_id = v_pal and coalesce(ip.pagamento_id, ip.ricevuta_id) is not null
     order by coalesce(ip.pagamento_id, ip.ricevuta_id), ip.data_pagamento;
  select min(data_pagamento), max(data_pagamento) into v_primo_pag, v_ultimo_pag from _cv_pag;
  select min(data), max(data) into v_primo_ven, v_ultimo_ven from import_vendite where palestra_id = v_pal;

  update import_vendite set pagamento_id = null, ricevuta_id = null, pagato_cent = null, esito = null where palestra_id = v_pal;

  -- abbinamento uno a uno vendita ↔ pagamento: stessa persona (o stesso nome), stessa prima voce e stesso periodo;
  -- prima quelli con lo stesso importo, poi la data più vicina (APP Palestre registra la vendita anche giorni dopo l'incasso)
  for c in
    select v.id as vid, p.k, p.pagamento_id, p.ricevuta_id, p.importo_cent, p.allievo_id
      from import_vendite v
      join _cv_pag p on p.voce_n = testo_norm(v.voce) and p.dal is not distinct from v.dal and p.al is not distinct from v.al
                    and (p.allievo_id = v.allievo_id or p.cliente_n = testo_norm(v.cliente))
     where v.palestra_id = v_pal and v.parte = 0
     order by (p.importo_cent = v.importo_cent) desc, abs(p.data_pagamento - v.data), v.riga, p.k
  loop
    continue when c.vid = any(v_usate) or c.k = any(v_usati);
    v_usate := v_usate || c.vid; v_usati := v_usati || c.k;
    update import_vendite set pagamento_id = c.pagamento_id, ricevuta_id = c.ricevuta_id, pagato_cent = c.importo_cent,
           allievo_id = coalesce(allievo_id, c.allievo_id)
     where id = c.vid;
  end loop;
  -- le altre voci della stessa riga seguono la prima
  update import_vendite x set pagamento_id = v.pagamento_id, ricevuta_id = v.ricevuta_id, pagato_cent = v.pagato_cent,
         allievo_id = coalesce(x.allievo_id, v.allievo_id)
    from import_vendite v
   where v.palestra_id = v_pal and x.palestra_id = v_pal and v.riga = x.riga and v.parte = 0 and x.parte > 0;

  update import_vendite set esito = case
      when importo_cent < 0 then 'storno'
      when coalesce(importo_cent, 0) = 0 then 'gratis'
      when pagamento_id is not null or ricevuta_id is not null then case when pagato_cent = importo_cent then 'pagata' else 'diversa' end
      when v_primo_pag is null then 'senza_pagamenti'
      when data < v_primo_pag + 31 or coalesce(dal, data) < v_primo_pag then 'prima'
      -- l'ultimo giorno del file dei pagamenti può essere a metà (scaricato al mattino): conta come "dopo"
      when data >= v_ultimo_pag then 'dopo'
      else 'non_pagata' end
   where palestra_id = v_pal;

  -- le quote annuali vendute e pagate (anche quelle pagate insieme all'abbonamento) e quelle vendute prima del file dei pagamenti
  with q as (
    select distinct on (v.allievo_id, stagione_di(v.dal, v_mese)) v.allievo_id, stagione_di(v.dal, v_mese) as stagione,
           v.dal, coalesce(v.importo_voce_cent, 0) as importo, v.pagamento_id
      from import_vendite v
     where v.palestra_id = v_pal and v.allievo_id is not null and v.dal is not null
       and testo_norm(v.voce) like 'iscrizione annuale%' and v.esito in ('pagata', 'diversa', 'prima')
     order by v.allievo_id, stagione_di(v.dal, v_mese), v.dal desc),
  ins as (
    insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, pagamento_id, data)
    select v_pal, q.allievo_id, q.stagione, q.importo, q.pagamento_id, q.dal from q
    on conflict (allievo_id, stagione) do update
      set pagamento_id = coalesce(quote_iscrizione.pagamento_id, excluded.pagamento_id),
          importo_cent = case when quote_iscrizione.importo_cent = 0 then excluded.importo_cent else quote_iscrizione.importo_cent end
    returning (xmax = 0) as nuova)
  select count(*) filter (where nuova) into n_quote from ins;

  select count(*) filter (where parte = 0),
         count(*) filter (where parte = 0 and esito = 'pagata'), count(*) filter (where parte = 0 and esito = 'diversa'),
         count(*) filter (where parte = 0 and esito = 'non_pagata'), count(*) filter (where parte = 0 and esito = 'prima'),
         count(*) filter (where parte = 0 and esito = 'dopo')
    into n_vendite, n_pagate, n_diverse, n_non, n_prima, n_dopo
    from import_vendite where palestra_id = v_pal;

  -- vendute ma non pagate
  for r in
    select v.*, (select string_agg(x.voce, ' + ' order by x.parte) from import_vendite x where x.palestra_id = v_pal and x.riga = v.riga) as voci,
           (select bool_and(testo_norm(x.voce) like 'iscrizione annuale%') from import_vendite x where x.palestra_id = v_pal and x.riga = v.riga) as solo_quota,
           row_number() over (partition by testo_norm(v.cliente), v.data, testo_norm(v.descrizione), v.importo_cent order by v.riga) as occ
      from import_vendite v
     where v.palestra_id = v_pal and v.parte = 0 and v.esito = 'non_pagata'
  loop
    v_chiave := 'ven_non_pagata|' || coalesce(testo_norm(r.cliente), '') || '|' || r.data || '|' || coalesce(testo_norm(r.descrizione), '') || '|' ||
                r.importo_cent || '|' || r.occ;
    if r.allievo_id is null then
      perform anomalia_import(v_pal, p_imp, null, 'pagamenti', 'da_sistemare',
        'Vendita senza persona e senza pagamento: ' || coalesce(r.cliente, '?'),
        'In APP Palestre il ' || to_char(r.data, 'DD/MM/YYYY') || ' risulta venduto «' || coalesce(r.descrizione, r.voce, '') || '» per ' ||
        euro_testo(r.importo_cent) || ' € a ' || coalesce(r.cliente, '?') || ', ma il nome non corrisponde a una sola scheda della lista clienti ' ||
        'e tra i pagamenti non c''è. Cerca la persona in Persone: se è da incassare, registra il pagamento dalla sua scheda.',
        v_chiave, '/gestione/persone');
      continue;
    end if;
    -- c'è già la voce "Nessun pagamento trovato" per lo stesso abbonamento in corso: si completa quella (niente doppioni)
    select a.id into v_anom from anomalie_import a
     where a.palestra_id = v_pal and a.allievo_id = r.allievo_id and not a.risolta and a.chiave like 'non\_pagato|%'
       and split_part(a.chiave, '|', 5) = testo_norm(r.voce) and split_part(a.chiave, '|', 6) = coalesce(r.dal::text, '')
     limit 1;
    v_causale := case when r.solo_quota then 'quota_iscrizione'
                      when tipo_da_nome(v_pal, r.voce) is not null then 'abbonamento'
                      when testo_norm(r.voce) like 'lezione prova%' then 'prova' else 'altro' end;
    if v_anom is not null then
      update anomalie_import set
        dettaglio = case when dettaglio like '%Tra le vendite di APP Palestre%' then dettaglio
                         else dettaglio || ' Tra le vendite di APP Palestre c''è, del ' || to_char(r.data, 'DD/MM/YYYY') || ', per ' ||
                              euro_testo(r.importo_cent) || ' €: «Metti da incassare» lo aggiunge agli incassi in attesa.' end,
        dati = jsonb_build_object('azione', 'da_incassare', 'allievo_id', r.allievo_id, 'importo_cent', r.importo_cent,
                                  'descrizione', coalesce(r.descrizione, r.voce), 'causale', v_causale)
       where id = v_anom;
      continue;
    end if;
    perform anomalia_import(v_pal, p_imp, r.allievo_id, 'pagamenti',
      case when coalesce(r.al, r.data) >= current_date or r.data >= v_inizio_stag then 'da_sistemare' else 'da_verificare' end,
      'Venduto ma non pagato: ' || coalesce(r.voci, r.voce, ''),
      'In APP Palestre il ' || to_char(r.data, 'DD/MM/YYYY') || ' risulta venduto «' || coalesce(r.descrizione, r.voce, '') || '» per ' ||
      euro_testo(r.importo_cent) || ' €, ma tra i pagamenti (dal ' || to_char(v_primo_pag, 'DD/MM/YYYY') || ' al ' || to_char(v_ultimo_pag, 'DD/MM/YYYY') ||
      ') non c''è. Se è ancora da incassare, «Metti da incassare» lo aggiunge agli incassi in attesa della scheda; ' ||
      'se era già stato pagato (per esempio senza ricevuta), segna come fatto.',
      v_chiave);
    update anomalie_import set dati = jsonb_build_object('azione', 'da_incassare', 'allievo_id', r.allievo_id, 'importo_cent', r.importo_cent,
                                                          'descrizione', coalesce(r.descrizione, r.voce), 'causale', v_causale)
     where palestra_id = v_pal and chiave = v_chiave;
  end loop;

  -- pagate con un importo diverso dal venduto
  for r in
    select v.*, row_number() over (partition by testo_norm(v.cliente), v.data, testo_norm(v.descrizione), v.importo_cent order by v.riga) as occ,
           (select ri.numero || '/' || ri.anno from ricevute ri where ri.id = v.ricevuta_id
            union all select ri.numero || '/' || ri.anno from ricevute ri where ri.pagamento_id = v.pagamento_id and v.ricevuta_id is null
            limit 1) as ricevuta
      from import_vendite v
     where v.palestra_id = v_pal and v.parte = 0 and v.esito = 'diversa'
  loop
    perform anomalia_import(v_pal, p_imp, r.allievo_id, 'pagamenti', 'da_verificare',
      'Pagato diverso dal venduto: ' || coalesce(r.voce, ''),
      'In APP Palestre «' || coalesce(r.descrizione, r.voce, '') || '» risulta venduto per ' || euro_testo(r.importo_cent) || ' € (il ' ||
      to_char(r.data, 'DD/MM/YYYY') || '), ma il pagamento abbinato è di ' || euro_testo(r.pagato_cent) || ' €' ||
      coalesce(' (ricevuta n. ' || r.ricevuta || ')', '') || '. Controlla se manca una parte del pagamento o se la vendita è stata cambiata dopo.',
      'ven_diversa|' || coalesce(testo_norm(r.cliente), '') || '|' || r.data || '|' || coalesce(testo_norm(r.descrizione), '') || '|' ||
      r.importo_cent || '|' || r.occ);
  end loop;

  -- vendite che il file dei pagamenti non copre: una voce sola per gruppo
  if v_primo_pag is null then
    perform anomalia_import(v_pal, p_imp, null, 'pagamenti', 'da_verificare',
      'Vendite caricate senza i pagamenti',
      'Hai caricato le vendite di APP Palestre ma nessun file dei pagamenti: senza quello non posso dire cosa è stato pagato. ' ||
      'Scarica da app titolare anche i pagamenti (Fatture/ricevute → Pagamenti ricevuti → Scarica) e rifai l''import.',
      'ven_senza_pag|' || v_pal, '/gestione/importa');
  else
    if n_prima > 0 then
      select coalesce(sum(importo_cent), 0) into v_tot from import_vendite where palestra_id = v_pal and parte = 0 and esito = 'prima';
      perform anomalia_import(v_pal, p_imp, null, 'pagamenti', 'da_verificare',
        'Vendite di inizio periodo senza pagamento nel file: ' || n_prima,
        n_prima || ' vendite (' || euro_testo(v_tot) || ' €) fatte nelle prime settimane del file non hanno un pagamento: il file dei pagamenti parte dal ' ||
        to_char(v_primo_pag, 'DD/MM/YYYY') || ', quindi probabilmente sono state pagate prima. Le quote annuali di queste vendite le ho registrate lo stesso. ' ||
        'Per esserne sicuro scarica da app titolare i pagamenti da un mese prima e rifai l''import.',
        'ven_prima|' || v_pal, '/gestione/importa');
    end if;
    if n_dopo > 0 then
      select coalesce(sum(importo_cent), 0) into v_tot from import_vendite where palestra_id = v_pal and parte = 0 and esito = 'dopo';
      perform anomalia_import(v_pal, p_imp, null, 'pagamenti', 'da_verificare',
        'Vendite più recenti dei pagamenti: ' || n_dopo,
        'Il file delle vendite arriva al ' || to_char(v_ultimo_ven, 'DD/MM/YYYY') || ', quello dei pagamenti al ' || to_char(v_ultimo_pag, 'DD/MM/YYYY') ||
        ': ' || n_dopo || ' vendite (' || euro_testo(v_tot) || ' €) fatte da quel giorno in poi non hanno un pagamento e non si possono controllare. ' ||
        'Scarica da app titolare i pagamenti aggiornati (stesso giorno delle vendite) e rifai l''import.',
        'ven_dopo|' || v_pal, '/gestione/importa');
    end if;
  end if;

  -- abbonamenti attivi in APP Palestre che tra le vendite non ci sono
  for r in
    select st.* from storico_abbonamenti st
     where st.palestra_id = v_pal and st.fonte = 'app_palestre' and st.stato = 'attivo' and st.al >= current_date and st.allievo_id is not null
       and st.dal >= v_primo_ven + 31 and st.dal <= v_ultimo_ven
       and not exists (select 1 from import_vendite v
                        where v.palestra_id = v_pal and v.allievo_id = st.allievo_id and testo_norm(v.voce) = testo_norm(st.abbonamento)
                          and (v.dal = st.dal or v.al = st.al
                               or (v.dal is not null and daterange(v.dal, coalesce(v.al, v.dal), '[]') && daterange(st.dal, st.al, '[]'))))
  loop
    n_senza_abb := n_senza_abb + 1;
    perform anomalia_import(v_pal, p_imp, r.allievo_id, 'abbonamenti', 'da_verificare',
      'Abbonamento attivo senza vendita: ' || trim(r.abbonamento),
      'In APP Palestre l''abbonamento ' || trim(r.abbonamento) || ' dal ' || to_char(r.dal, 'DD/MM/YYYY') || ' al ' || to_char(r.al, 'DD/MM/YYYY') ||
      ' è attivo, ma tra le vendite (dal ' || to_char(v_primo_ven, 'DD/MM/YYYY') || ' al ' || to_char(v_ultimo_ven, 'DD/MM/YYYY') || ') non c''è. ' ||
      'Forse è stato regalato, cambiato o venduto con un altro nome: controlla che sia stato pagato.',
      'abb_senza_vendita|' || r.chiave || '|' || testo_norm(r.abbonamento) || '|' || r.dal);
  end loop;

  v_stat := jsonb_build_object('vendite', n_vendite, 'pagate', n_pagate, 'diverse', n_diverse, 'non_pagate', n_non,
                               'prima', n_prima, 'dopo', n_dopo, 'quote_nuove', n_quote, 'senza_vendita', n_senza_abb,
                               'dal', v_primo_ven, 'al', v_ultimo_ven);
  update importazioni set riepilogo = riepilogo || jsonb_build_object('vendite', v_stat) where id = p_imp;
  return v_stat;
end $$;

-- ---------------------------------------------------------------------
-- 5. Controllo del listino: prezzi e IVA diversi, quota annuale
-- ---------------------------------------------------------------------
create or replace function controlla_listino(p_imp uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid; v_mese int; v_inizio_stag date; v_iva_pred numeric; v_quota_pal int; v_quota_app int; r record;
  n_prezzi int := 0; n_iva int := 0; n_abb int := 0; n_prod int; v_vendite int; v_moda int; v_app_iva numeric; v_rmh_iva numeric;
  v_stat jsonb;
begin
  select palestra_id into v_pal from importazioni where id = p_imp;
  if v_pal is null then return '{}'::jsonb; end if;
  select count(*) into n_prod from listino_app where palestra_id = v_pal;
  if n_prod = 0 then return jsonb_build_object('prodotti', 0); end if;
  select coalesce(mese_inizio_stagione, 9), coalesce(quota_iscrizione_cent, 0) into v_mese, v_quota_pal from palestre where id = v_pal;
  v_inizio_stag := make_date(stagione_di(current_date, v_mese), v_mese, 1);
  select percentuale into v_iva_pred from aliquote_iva where palestra_id = v_pal and predefinita and attiva order by ordine limit 1;

  for r in
    select t.id as tipo_id, t.nome as tipo_nome, t.prezzo_cent as t_prezzo, t.prezzo_web_cent as t_web, t.aliquota_id,
           l.nome_norm, min(l.nome) as nome, array_agg(distinct l.prezzo_cent) filter (where l.prezzo_cent > 0) as prezzi,
           max(l.prezzo_web_cent) filter (where l.prezzo_web_cent > 0) as web, max(l.reparto) as reparto
      from listino_app l
      join tipi_abbonamento t on t.id = tipo_da_nome(v_pal, l.nome)
     where l.palestra_id = v_pal and not t.archiviato and not voce_non_abbonamento(l.nome)
       and coalesce(l.categoria, '') not in ('Iscrizione', 'Rimborso', 'attività commerciale')
     group by t.id, t.nome, t.prezzo_cent, t.prezzo_web_cent, t.aliquota_id, l.nome_norm
  loop
    n_abb := n_abb + 1;
    select count(distinct v.riga), mode() within group (order by v.importo_voce_cent) into v_vendite, v_moda
      from import_vendite v
     where v.palestra_id = v_pal and testo_norm(v.voce) = r.nome_norm and coalesce(v.dal, v.data) >= v_inizio_stag and v.importo_voce_cent > 0;
    -- prezzo
    if r.prezzi is not null and not (r.t_prezzo = any(r.prezzi)) then
      n_prezzi := n_prezzi + 1;
      perform anomalia_import(v_pal, p_imp, null, 'listino', 'da_verificare',
        'Prezzo diverso da APP Palestre: ' || r.tipo_nome,
        'In APP Palestre «' || r.nome || '» costa ' || (select string_agg(euro_testo(x), ' o ') from unnest(r.prezzi) x) || ' €' ||
        coalesce(' (online ' || euro_testo(r.web) || ' €)', '') || ', in RMHouse «' || r.tipo_nome || '» costa ' || euro_testo(r.t_prezzo) || ' €' ||
        coalesce(' (online ' || euro_testo(r.t_web) || ' €)', '') || '.' ||
        case when v_vendite > 0 then ' In questa stagione APP Palestre l''ha venduto ' || v_vendite ||
                                     case when v_vendite = 1 then ' volta' else ' volte' end ||
                                     coalesce(case when v_vendite = 1 then ', a ' else ', di solito a ' end || euro_testo(v_moda) || ' €', '') || '.' else '' end ||
        ' Se il prezzo giusto è quello di RMHouse segna come fatto; se è quello di APP Palestre, «Metti il prezzo di APP» lo cambia ' ||
        'nel listino di RMHouse (vale per le vendite da adesso in poi).',
        'listino_prezzo|' || r.tipo_id || '|' || r.nome_norm, '/gestione/abbonamenti');
      update anomalie_import set dati = jsonb_build_object('azione', 'prezzo_app', 'tipo_id', r.tipo_id, 'prezzo_cent', r.prezzi[1],
                                                            'prezzo_web_cent', r.web, 'nome_app', r.nome)
       where palestra_id = v_pal and chiave = 'listino_prezzo|' || r.tipo_id || '|' || r.nome_norm;
    end if;
    -- IVA: in APP Palestre il reparto (N/A = come la scuola, senza IVA); in RMHouse l'aliquota dell'abbonamento o quella predefinita
    v_app_iva := case when r.reparto ~* 'iva\s*22' then 22 when r.reparto ~* 'iva\s*10' then 10 when r.reparto ~* 'iva\s*5\M' then 5
                      when r.reparto ~* 'iva\s*4\M' then 4 else 0 end;
    v_rmh_iva := coalesce((select percentuale from aliquote_iva where id = r.aliquota_id), v_iva_pred, 0);
    if v_app_iva <> v_rmh_iva then
      n_iva := n_iva + 1;
      perform anomalia_import(v_pal, p_imp, null, 'listino', 'da_verificare',
        'IVA diversa da APP Palestre: ' || r.tipo_nome,
        'In APP Palestre «' || r.nome || '» ' ||
        case when v_app_iva = 0 then 'è senza IVA (reparto ' || coalesce(r.reparto, 'N/A') || ')' else 'ha l''IVA al ' || v_app_iva::int || '%' end ||
        ', in RMHouse «' || r.tipo_nome || '» ' ||
        case when v_rmh_iva = 0 then 'è senza IVA' else 'ha l''IVA al ' || v_rmh_iva::int || '%' end ||
        ': le ricevute di RMHouse usano la sua. Verifica con il commercialista quale è giusta e, se serve, cambiala nell''abbonamento.',
        'listino_iva|' || r.tipo_id || '|' || r.nome_norm, '/gestione/abbonamenti');
    end if;
  end loop;

  -- la quota annuale
  select l.prezzo_cent into v_quota_app from listino_app l
   where l.palestra_id = v_pal and l.prezzo_cent > 0 and (l.categoria ilike 'iscrizione%' or l.nome_norm like 'iscrizione annuale%')
   order by l.posizione limit 1;
  if v_quota_app is not null and v_quota_app <> v_quota_pal then
    perform anomalia_import(v_pal, p_imp, null, 'listino', 'da_verificare',
      'Quota annuale diversa da APP Palestre',
      'In APP Palestre l''iscrizione annuale costa ' || euro_testo(v_quota_app) || ' €, in RMHouse ' || euro_testo(v_quota_pal) ||
      ' € (Impostazioni → Regole e prenotazioni → Quota e stagione). Controlla quale è giusta.',
      'listino_quota|' || v_pal, '/gestione/impostazioni');
  end if;

  v_stat := jsonb_build_object('prodotti', n_prod, 'abbinati', n_abb, 'prezzi_diversi', n_prezzi, 'iva_diverse', n_iva);
  update importazioni set riepilogo = riepilogo || jsonb_build_object('listino', v_stat) where id = p_imp;
  return v_stat;
end $$;

revoke execute on function controlla_vendite(uuid) from public, anon, authenticated;
revoke execute on function controlla_listino(uuid) from public, anon, authenticated;
grant execute on function controlla_vendite(uuid) to service_role;
grant execute on function controlla_listino(uuid) to service_role;
revoke execute on function importa_ap_vendite(uuid, jsonb, boolean) from public, anon;
revoke execute on function importa_ap_listino(uuid, jsonb) from public, anon;
grant execute on function importa_ap_vendite(uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function importa_ap_listino(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Il controllo finale dell'import chiama anche i due controlli nuovi
--    (si aggiunge una riga a importa_ap_anomalie della 124, senza riscriverla)
-- ---------------------------------------------------------------------
-- Le funzioni della 124 si "ritoccano" senza riscriverle: se il loro testo è stato incollato con gli a capo di Windows
-- (\r\n, succede con l'SQL Editor) i \r si tolgono prima, e i punti da cambiare si cercano senza badare agli spazi.
do $$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('importa_ap_anomalie(uuid)'::regprocedure), chr(13), '');
  if position('controlla_vendite' in v_def) = 0 then
    -- subito dopo il controllo dei permessi (il primo "raise exception 'non_autorizzato'")
    v_def := regexp_replace(v_def,
      '(if\s+auth\.uid\(\)\s+is\s+not\s+null\s+and\s+not\s+is_gestione\(v_pal\)\s+then\s+raise\s+exception\s+''non_autorizzato''\s*;\s*end\s+if\s*;)',
      E'\\1\n  -- 148: vendite e listino di APP Palestre (se caricati)\n  perform controlla_vendite(p_imp);\n  perform controlla_listino(p_imp);');
    if position('controlla_vendite' in v_def) = 0 then
      raise exception 'importa_ap_anomalie: non trovo dove aggiungere il controllo delle vendite';
    end if;
    execute v_def;
  end if;
end $$;

-- 6b. Import fatto senza alcuni file (es. solo vendite e prodotti): niente voci false e niente voci chiuse per sbaglio.
--     • senza le prenotazioni, importa_ap_chiudi non segnala più "Corso e orari da assegnare", "Mancano N orari"… (non può saperlo);
--     • alla fine, le voci che dipendono da un file non caricato questa volta (prenotazioni o pagamenti) restano com'erano
--       invece di chiudersi da sole perché "non si sono più presentate".
do $$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('importa_ap_chiudi(uuid)'::regprocedure), chr(13), '');
  if position('v_pren' in v_def) = 0 then
    v_def := regexp_replace(v_def, '(v_fuso\s+text\s*;)(\s*begin)', '\1 v_pren boolean;\2');
    v_def := regexp_replace(v_def,
      '(select\s+min\(data_pagamento\)\s+into\s+v_primo_pag\s+from\s+import_pagamenti\s+where\s+importazione_id\s*=\s*p_imp\s*;)',
      E'\\1\n  -- 148: le anomalie sugli orari solo se questa volta sono state caricate le prenotazioni\n' ||
      E'  v_pren := exists (select 1 from import_prenotazioni where importazione_id = p_imp);');
    v_def := regexp_replace(v_def,
      'if\s+t\.modalita\s*=\s*''orari_fissi''\s+then(\s+if\s+cardinality\(v_orari\)\s*=\s*0\s+and\s+cardinality\(v_fuori\)\s*=\s*0\s+then)',
      'if t.modalita = ''orari_fissi'' and v_pren then\1');
    if (length(v_def) - length(replace(v_def, 'v_pren', ''))) / length('v_pren') <> 3 then
      raise exception 'importa_ap_chiudi: non trovo i punti da cambiare (prenotazioni)';
    end if;
    execute v_def;
  end if;

  v_def := replace(pg_get_functiondef('importa_ap_anomalie(uuid)'::regprocedure), chr(13), '');
  if position('148: voci di file non caricati' in v_def) = 0 then
    -- la chiusura automatica delle voci "non più uscite": "... chiave not like 'ric\_doppia|%'));"
    v_def := regexp_replace(v_def,
      '(chiave\s+not\s+like\s+''ric.{1,2}doppia\|%''\s*\)\s*\))\s*;',
      E'\\1\n' ||
      E'     -- 148: voci di file non caricati questa volta: restano com''erano\n' ||
      E'     and (exists (select 1 from import_prenotazioni x where x.importazione_id = p_imp)\n' ||
      E'          or split_part(chiave, ''|'', 1) not in (''da_pren'', ''senza_orari'', ''pochi_orari'', ''orari_in_piu'', ''orario_manca'',\n' ||
      E'                                                 ''orari_diversi'', ''pren_senza_abb'', ''corso_non_coperto'', ''date''))\n' ||
      E'     and (exists (select 1 from import_pagamenti x where x.importazione_id = p_imp)\n' ||
      E'          or split_part(chiave, ''|'', 1) not in (''non_pagato'', ''pag_diverso'', ''pag_senza_persona'', ''storno''));');
    if position('148: voci di file non caricati' in v_def) = 0 then
      raise exception 'importa_ap_anomalie: non trovo dove proteggere le voci dei file non caricati';
    end if;
    execute v_def;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Prodotti venduti in questa stagione che in RMHouse non hanno un abbonamento (per "Abbonamenti da abbinare")
-- ---------------------------------------------------------------------
create or replace function vendite_da_abbinare(p_palestra uuid)
returns table (nome text, vendite int, persone int, ultima date, prezzo_cent int)
language plpgsql stable security definer set search_path = public as $$
declare v_mese int; v_inizio date;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select coalesce(mese_inizio_stagione, 9) into v_mese from palestre where id = p_palestra;
  v_inizio := make_date(stagione_di(current_date, v_mese), v_mese, 1);
  return query
    select min(trim(v.voce)), count(distinct v.riga)::int,
           count(distinct coalesce(v.allievo_id::text, testo_norm(v.cliente)))::int, max(v.data),
           (select l.prezzo_cent from listino_app l where l.palestra_id = p_palestra and l.nome_norm = testo_norm(min(v.voce))
             order by l.posizione limit 1)
      from import_vendite v
     where v.palestra_id = p_palestra and testo_norm(v.voce) is not null
       and (coalesce(v.dal, v.data) >= v_inizio or v.al >= current_date)
       and not voce_non_abbonamento(v.voce)
       and not exists (select 1 from listino_app l where l.palestra_id = p_palestra and l.nome_norm = testo_norm(v.voce)
                          and l.categoria in ('Iscrizione', 'Rimborso', 'attività commerciale'))
       and tipo_da_nome(p_palestra, v.voce) is null
     group by testo_norm(v.voce)
     order by count(distinct v.riga) desc, min(trim(v.voce));
end $$;
revoke execute on function vendite_da_abbinare(uuid) from public, anon;
grant execute on function vendite_da_abbinare(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Azioni con un clic dal "Da sistemare"
--    da_incassare: crea l'incasso in attesa sulla scheda (lo si incassa poi come gli altri)
--    prezzo_app:   mette nel listino di RMHouse il prezzo di APP Palestre
-- ---------------------------------------------------------------------
create or replace function risolvi_anomalia_import(p_id uuid, p_azione text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a anomalie_import; al allievi; v_pag uuid; v_nota text; v_tipo tipi_abbonamento;
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
  else
    raise exception 'azione_non_valida';
  end if;

  update anomalie_import set risolta = true, risolta_at = now(), risolta_da = auth.uid(), nota = v_nota, chiusa_sola = false
   where id = p_id;
  return jsonb_build_object('pagamento_id', v_pag, 'nota', v_nota);
end $$;
revoke execute on function risolvi_anomalia_import(uuid, text) from public, anon;
grant execute on function risolvi_anomalia_import(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Riepilogo (home): anche il fatturato di stagione, anno solare e mese
--    (stessa funzione della 144 con in più la chiave "fatturato": incassi registrati, come in Conti)
-- ---------------------------------------------------------------------
create or replace function home_dati(p_palestra uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s staff; v_oggi date := (now() at time zone 'Europe/Rome')::date; v_gest boolean; v_mese int; v_is date;
begin
  select * into s from staff where palestra_id = p_palestra and user_id = auth.uid() and attivo limit 1;
  if not found then raise exception 'non_autorizzato'; end if;
  v_gest := s.ruolo <> 'insegnante';
  select coalesce(mese_inizio_stagione, 9) into v_mese from palestre where id = p_palestra;
  v_is := make_date(stagione_di(v_oggi, v_mese), v_mese, 1);
  return jsonb_build_object(
    'k', case when v_gest then cruscotto(p_palestra) end,
    'fatturato', case when v_gest then (
      select jsonb_build_object(
        'inizio_stagione', v_is,
        'stagione', coalesce(sum(x.importo_cent) filter (where x.d between v_is and v_oggi), 0),
        'stagione_prima', coalesce(sum(x.importo_cent) filter (where x.d between (v_is - interval '1 year')::date and (v_oggi - interval '1 year')::date), 0),
        'anno', coalesce(sum(x.importo_cent) filter (where x.d between date_trunc('year', v_oggi)::date and v_oggi), 0),
        'anno_prima', coalesce(sum(x.importo_cent) filter (where x.d between (date_trunc('year', v_oggi) - interval '1 year')::date
                                                                    and (v_oggi - interval '1 year')::date), 0),
        'mese', coalesce(sum(x.importo_cent) filter (where x.d between date_trunc('month', v_oggi)::date and v_oggi), 0),
        'mese_prima', coalesce(sum(x.importo_cent) filter (where x.d between (date_trunc('month', v_oggi) - interval '1 month')::date
                                                                     and (v_oggi - interval '1 month')::date), 0))
        from (select (pg.pagato_at at time zone 'Europe/Rome')::date as d, pg.importo_cent
                from pagamenti pg
               where pg.palestra_id = p_palestra and pg.stato = 'pagato'
                 and pg.pagato_at >= (least(v_is, date_trunc('year', v_oggi)::date) - interval '1 year 1 month')) x
    ) end,
    'lezioni', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', o.lezione_id, 'corso_id', o.corso_id, 'corso_nome', o.corso_nome, 'inizio', o.inizio, 'fine', o.fine,
                  'stato', o.stato, 'capienza', o.capienza, 'iscritti', o.iscritti, 'prove', o.prove, 'presenti', o.presenti, 'assenti', o.assenti,
                  'insegnante_id', o.insegnante_id, 'insegnante_nome', o.insegnante_nome, 'sala_nome', o.sala_nome) order by o.inizio)
                from v_occupazione o where o.palestra_id = p_palestra and o.data = v_oggi and (v_gest or o.insegnante_id = s.id)), '[]'::jsonb),
    'corsi', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'colore', c.colore)) from corsi c where c.palestra_id = p_palestra), '[]'::jsonb),
    'scadenze', case when v_gest then coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('tipo', v.tipo, 'allievo_id', v.allievo_id, 'nome', v.nome, 'cognome', v.cognome, 'data', v.data, 'giorni', v.giorni,
                    'dettaglio', v.dettaglio, 'importo_cent', v.importo_cent) as x
                  from v_scadenze v where v.palestra_id = p_palestra and v.gestito = false and v.tipo in ('abbonamento', 'ingressi', 'rata')
                    and v.giorni >= -3 and v.giorni <= 7 order by v.data limit 9) q), '[]'::jsonb) else '[]'::jsonb end,
    'rate_scadute', case when v_gest then (select count(*) from v_rate r where r.palestra_id = p_palestra and r.scaduta) else 0 end,
    'richieste', (select count(*) from richieste_cliente r where r.palestra_id = p_palestra and r.stato = 'da_confermare'),
    'promemoria', coalesce((select jsonb_agg(to_jsonb(m)) from promemoria_miei(p_palestra) m), '[]'::jsonb),
    'staff', case when v_gest then coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'cognome', x.cognome) order by x.nome)
                  from staff x where x.palestra_id = p_palestra and x.attivo and x.archiviato is not true), '[]'::jsonb) else '[]'::jsonb end,
    'sostituzioni', case when v_gest then coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('id', l.id, 'data', l.data, 'inizio', l.inizio, 'insegnante_id', l.insegnante_id, 'insegnante_titolare', l.insegnante_titolare,
                    'sostituzione_da', l.sostituzione_da, 'corsi', (select jsonb_build_object('nome', c.nome) from corsi c where c.id = l.corso_id)) as x
                  from lezioni l where l.palestra_id = p_palestra and l.insegnante_titolare is not null and l.stato <> 'annullata'
                    and l.data >= v_oggi and l.data <= v_oggi + 14 order by l.inizio limit 30) q), '[]'::jsonb) else '[]'::jsonb end,
    'prossime', case when v_gest then null else coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('lezione_id', o.lezione_id, 'corso_id', o.corso_id, 'corso_nome', o.corso_nome, 'inizio', o.inizio, 'capienza', o.capienza,
                    'iscritti', o.iscritti, 'sala_nome', o.sala_nome) as x
                  from v_occupazione o where o.palestra_id = p_palestra and o.insegnante_id = s.id and o.data > v_oggi and o.stato <> 'annullata'
                  order by o.inizio limit 6) q), '[]'::jsonb) end,
    'da_sistemare', case when v_gest then (select count(*) from anomalie_import x where x.palestra_id = p_palestra and not x.risolta and x.gravita = 'da_sistemare') else 0 end,
    'da_verificare', case when v_gest then (select count(*) from anomalie_import x where x.palestra_id = p_palestra and not x.risolta and x.gravita = 'da_verificare') else 0 end
  );
end $$;
revoke all on function home_dati(uuid) from public, anon;
grant execute on function home_dati(uuid) to authenticated;

-- come le altre funzioni dell'import (126): senza JIT, che sui calcoli brevi fa solo perdere tempo
alter function importa_ap_vendite(uuid, jsonb, boolean) set jit = off;
alter function controlla_vendite(uuid) set jit = off;
alter function controlla_listino(uuid) set jit = off;

-- ---------------------------------------------------------------------
-- 10. Workshop: descrizione e "cosa sapere" con un po' di formattazione (**grassetto**, _corsivo_, ## titolo, - elenco,
--     [testo](link)). Nelle email il testo va senza segni: workshop_email usa testo_semplice.
-- ---------------------------------------------------------------------
create or replace function testo_semplice(t text) returns text language plpgsql immutable as $f$
declare s text := replace(coalesce(t, ''), chr(13), '');
begin
  s := regexp_replace(s, '^[ \t]*#{1,3}[ \t]+', '', 'gn');                                  -- ## titolo
  s := regexp_replace(s, '^[ \t]*[-*][ \t]+', '• ', 'gn');                                   -- - elenco
  s := regexp_replace(s, '\*\*([^*\n]+?)\*\*', '\1', 'g');                                  -- **grassetto**
  s := regexp_replace(s, '\[([^]\n]+)\]\(([^ )\n]+)\)', '\1 (\2)', 'g');                    -- [testo](link)
  s := regexp_replace(s, '(^|[ \t(«"''])_([^_\n]+?)_($|[ \t.,;:!?)»"''])', '\1\2\3', 'gn');  -- _corsivo_
  return nullif(btrim(s), '');
end $f$;

do $$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('workshop_email(uuid)'::regprocedure), chr(13), '');
  if position('testo_semplice(r.info_pratiche)' in v_def) = 0 then
    v_def := regexp_replace(v_def, '''info''\s*,\s*coalesce\(\s*r\.info_pratiche\s*,\s*''''\s*\)',
                            '''info'', coalesce(testo_semplice(r.info_pratiche), '''')');
    if position('testo_semplice(r.info_pratiche)' in v_def) = 0 then
      raise exception 'workshop_email: non trovo il testo "cosa sapere"';
    end if;
    execute v_def;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 11. Workshop nel calendario, nell'Appello e nell'agenda del giorno: i momenti con iscritti e presenti
--     (iscritti = chi ha un'opzione che comprende quel momento)
-- ---------------------------------------------------------------------
-- i momenti dei workshop (pubblicati o chiusi) tra due date: per il calendario, l'appello e l'agenda del giorno
create or replace function workshop_periodo(p_palestra uuid, p_dal date, p_al date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'workshop_id', w.id, 'titolo', w.titolo, 'insegnante', w.insegnante, 'momento_id', m.id, 'momento', m.titolo,
             'momenti', (select count(*) from workshop_momenti x where x.workshop_id = w.id),
             'data', (m.inizio at time zone 'Europe/Rome')::date,
             'inizio', m.inizio, 'fine', coalesce(m.fine, m.inizio + interval '1 hour'), 'sala_id', m.sala_id, 'sala', s.nome,
             'sede_id', w.sede_id, 'posti', m.posti,
             'iscritti', (select count(*) from workshop_iscrizioni i join workshop_opzioni o on o.id = i.opzione_id
                           where i.workshop_id = w.id and i.stato = 'iscritto' and m.id = any(o.momenti)),
             'presenti', (select count(*) from workshop_iscrizioni i
                           where i.workshop_id = w.id and i.stato = 'iscritto' and m.id = any(i.presenze)))
             order by m.inizio)
      from workshop_momenti m
      join workshop w on w.id = m.workshop_id
      left join sale s on s.id = m.sala_id
     where w.palestra_id = p_palestra and w.stato in ('pubblicato', 'chiuso')
       and (m.inizio at time zone 'Europe/Rome')::date between p_dal and p_al), '[]'::jsonb);
end $$;
revoke execute on function workshop_periodo(uuid, date, date) from public, anon;
grant execute on function workshop_periodo(uuid, date, date) to authenticated;

create or replace function workshop_del_giorno(p_palestra uuid, p_giorno date default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select workshop_periodo(p_palestra, coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date),
                          coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date));
$$;
revoke execute on function workshop_del_giorno(uuid, date) from public, anon;
grant execute on function workshop_del_giorno(uuid, date) to authenticated;
