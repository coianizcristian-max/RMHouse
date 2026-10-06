-- =====================================================================
-- RMHouse — 124 IMPORT DELLA NUOVA STAGIONE DA APP PALESTRE + ELENCO "DA SISTEMARE"
--
-- L'import da APP Palestre (Persone → Importa → APP Palestre) impara a leggere altri due file:
--   • le PRENOTAZIONI (Prenotazioni → esporta CSV): da lì si ricava in quale corso e a che orari va
--     ognuno, così le iscrizioni in corso nascono già con corso e orari giusti;
--   • i PAGAMENTI CLIENTI: diventano incassi con la loro ricevuta, con lo STESSO numero e la stessa data
--     di APP Palestre (così la numerazione di RMHouse continua da lì, senza buchi né doppioni).
-- Alla fine l'import scrive l'elenco "DA SISTEMARE" (tabella anomalie_import): per ogni persona,
-- abbonamento, corso o ricevuta che non torna dice cosa c'è che non va, così la segreteria lo
-- sistema o lo verifica e lo segna come fatto.
-- L'import si può rifare tutte le volte che serve: niente viene doppiato, le anomalie già segnate
-- come fatte restano fatte, quelle che non si ripresentano si chiudono da sole.
-- Si può eseguire più volte. Va dopo la 123.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------
create table if not exists importazioni (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  fonte        text not null default 'app_palestre',
  iniziata_at  timestamptz not null default now(),
  finita_at    timestamptz,
  fatta_da     uuid default auth.uid(),
  riepilogo    jsonb not null default '{}'::jsonb
);
create index if not exists importazioni_palestra on importazioni (palestra_id, iniziata_at desc);
-- quando dal "Da sistemare" si rifà solo il controllo finale (dopo aver abbinato un abbonamento)
alter table importazioni add column if not exists ricalcolata_at timestamptz;

-- prenotazioni di APP Palestre: servono solo durante l'import (si cancellano all'import seguente)
create table if not exists import_prenotazioni (
  importazione_id uuid not null references importazioni(id) on delete cascade,
  palestra_id     uuid not null,
  chiave          text not null,          -- nome|cognome|email, come nella lista clienti
  giorno          timestamp not null,     -- ora locale della lezione
  corso           text not null,
  abbonamento     text,                   -- null = "No abbonamento"
  abb_dal         date,
  cancellata      boolean not null default false
);
create index if not exists import_prenotazioni_chiave on import_prenotazioni (importazione_id, chiave);

-- i pagamenti importati, con quello che serve per abbinarli agli abbonamenti
create table if not exists import_pagamenti (
  importazione_id uuid not null references importazioni(id) on delete cascade,
  palestra_id     uuid not null,
  pagamento_id    uuid references pagamenti(id) on delete cascade,
  ricevuta_id     uuid references ricevute(id) on delete set null,
  allievo_id      uuid references allievi(id) on delete set null,
  cliente         text,
  voce            text,
  dal             date,
  al              date,
  importo_cent    int,
  causale         text,
  data_pagamento  date
);
create index if not exists import_pagamenti_allievo on import_pagamenti (importazione_id, allievo_id);

alter table pagamenti add column if not exists codice_esterno text;
create unique index if not exists pagamenti_codice_esterno on pagamenti (palestra_id, codice_esterno) where codice_esterno is not null;

-- l'elenco delle cose da sistemare dopo l'import
create table if not exists anomalie_import (
  id               uuid primary key default gen_random_uuid(),
  palestra_id      uuid not null references palestre(id) on delete cascade,
  importazione_id  uuid references importazioni(id) on delete set null,
  allievo_id       uuid references allievi(id) on delete cascade,
  categoria        text not null check (categoria in ('persone', 'abbonamenti', 'corsi', 'pagamenti', 'ricevute')),
  gravita          text not null default 'da_sistemare' check (gravita in ('da_sistemare', 'da_verificare')),
  titolo           text not null,
  dettaglio        text,
  link             text,
  chiave           text not null,
  risolta          boolean not null default false,
  risolta_at       timestamptz,
  risolta_da       uuid,
  nota             text,
  created_at       timestamptz not null default now(),
  aggiornata_at    timestamptz not null default now(),
  unique (palestra_id, chiave)
);
alter table anomalie_import add column if not exists chiusa_sola boolean not null default false;  -- chiusa perché non si è più presentata
create index if not exists anomalie_import_aperte on anomalie_import (palestra_id, risolta, categoria);
create index if not exists anomalie_import_allievo on anomalie_import (allievo_id);

-- abbonamenti che in RMHouse hanno un nome diverso da APP Palestre
-- (es. "AEREA Kids/Teen 2 volte Trimestrale" diventato "ATTREZZI Kids/Teen 2 volte Trimestrale"):
-- si imparano dagli abbonamenti già importati e si scelgono a mano dal "Da sistemare"
create table if not exists abbonamenti_alias (
  palestra_id          uuid not null references palestre(id) on delete cascade,
  nome_norm            text not null,          -- il nome in APP Palestre, normalizzato
  nome                 text not null,          -- il nome in APP Palestre, come è scritto
  tipo_abbonamento_id  uuid not null references tipi_abbonamento(id) on delete cascade,
  origine              text not null default 'scelto' check (origine in ('scelto', 'imparato')),
  created_at           timestamptz not null default now(),
  primary key (palestra_id, nome_norm)
);

alter table importazioni enable row level security;
alter table import_prenotazioni enable row level security;
alter table import_pagamenti enable row level security;
alter table anomalie_import enable row level security;
alter table abbonamenti_alias enable row level security;
grant select, insert, update, delete on importazioni, import_prenotazioni, import_pagamenti, anomalie_import, abbonamenti_alias to authenticated;
drop policy if exists gestione_tutto on importazioni;
create policy gestione_tutto on importazioni for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists gestione_tutto on import_prenotazioni;
create policy gestione_tutto on import_prenotazioni for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists gestione_tutto on import_pagamenti;
create policy gestione_tutto on import_pagamenti for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists gestione_tutto on anomalie_import;
create policy gestione_tutto on anomalie_import for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists gestione_tutto on abbonamenti_alias;
create policy gestione_tutto on abbonamenti_alias for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- ---------------------------------------------------------------------
-- 2. Piccoli aiuti
-- ---------------------------------------------------------------------
create or replace function testo_norm(t text) returns text language sql immutable as $$
  select nullif(lower(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g')), '');
$$;
-- nomi dei corsi: "Acrodance/Acrobatica" = "Acrodance / Acrobatica", "Antigravity®" = "Antigravity"
create or replace function corso_norm(t text) returns text language sql immutable as $$
  select testo_norm(replace(regexp_replace(coalesce(t, ''), '\s*/\s*', '/', 'g'), '®', ''));
$$;

-- l'abbonamento di RMHouse che corrisponde a un nome di APP Palestre:
-- prima l'abbinamento scelto o imparato, poi lo stesso nome
create or replace function tipo_da_nome(p_palestra uuid, p_nome text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select al.tipo_abbonamento_id from abbonamenti_alias al join tipi_abbonamento t on t.id = al.tipo_abbonamento_id
      where al.palestra_id = p_palestra and al.nome_norm = testo_norm(p_nome) and not t.archiviato),
    (select t.id from tipi_abbonamento t where t.palestra_id = p_palestra and testo_norm(t.nome) = testo_norm(p_nome)
      order by t.archiviato limit 1));
$$;
revoke execute on function tipo_da_nome(uuid, text) from public, anon;
grant execute on function tipo_da_nome(uuid, text) to authenticated;

-- per trovare in fretta le persone per nome (anche scritto "Cognome Nome")
create index if not exists allievi_nome_norm on allievi (palestra_id, testo_norm(nome || ' ' || coalesce(cognome, '')));
create index if not exists allievi_cognome_nome_norm on allievi (palestra_id, testo_norm(coalesce(cognome, '') || ' ' || nome));

-- codice fiscale: formato e carattere di controllo
create or replace function cf_valido(p text) returns boolean language plpgsql immutable as $$
declare c text := upper(trim(coalesce(p, ''))); s int := 0; ch text; i int; v int;
  dispari int[] := array[1,0,5,7,9,13,15,17,19,21,2,4,18,20,11,3,6,8,12,14,16,10,22,25,24,23];
begin
  if c !~ '^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$' then return false; end if;
  for i in 1..15 loop
    ch := substr(c, i, 1);
    v := case when ch ~ '[0-9]' then ch::int else ascii(ch) - 65 end;   -- 0..25 per le lettere, 0..9 per le cifre
    if i % 2 = 1 then s := s + dispari[v + 1]; else s := s + v; end if;
  end loop;
  return chr(65 + s % 26) = substr(c, 16, 1);
end $$;

-- la data di nascita scritta nel codice fiscale (null se il codice non è valido)
create or replace function cf_nascita(p text) returns date language plpgsql stable as $$
declare c text := upper(trim(coalesce(p, ''))); aa int; mm int; gg int; anno int;
begin
  if not cf_valido(c) then return null; end if;
  aa := translate(substr(c, 7, 2), 'LMNPQRSTUV', '0123456789')::int;
  mm := strpos('ABCDEHLMPRST', substr(c, 9, 1));
  gg := translate(substr(c, 10, 2), 'LMNPQRSTUV', '0123456789')::int;
  if gg > 40 then gg := gg - 40; end if;
  anno := case when aa > extract(year from current_date)::int % 100 then 1900 + aa else 2000 + aa end;
  return make_date(anno, mm, gg);
exception when others then return null;
end $$;

-- scrive (o aggiorna) una anomalia; se era già stata segnata come fatta resta fatta
create or replace function anomalia_import(p_palestra uuid, p_imp uuid, p_allievo uuid, p_categoria text, p_gravita text,
                                           p_titolo text, p_dettaglio text, p_chiave text, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into anomalie_import (palestra_id, importazione_id, allievo_id, categoria, gravita, titolo, dettaglio, chiave, link)
  values (p_palestra, p_imp, p_allievo, p_categoria, p_gravita, p_titolo, p_dettaglio, p_chiave,
          coalesce(p_link, case when p_allievo is not null then '/gestione/persone/' || p_allievo end))
  on conflict (palestra_id, chiave) do update set
    importazione_id = excluded.importazione_id, allievo_id = excluded.allievo_id, categoria = excluded.categoria,
    gravita = excluded.gravita, titolo = excluded.titolo, dettaglio = excluded.dettaglio, link = excluded.link,
    aggiornata_at = now(),
    -- se si era chiusa da sola e si ripresenta, torna aperta; se l'aveva chiusa la segreteria resta chiusa
    risolta = case when anomalie_import.chiusa_sola then false else anomalie_import.risolta end,
    risolta_at = case when anomalie_import.chiusa_sola then null else anomalie_import.risolta_at end,
    nota = case when anomalie_import.chiusa_sola then null else anomalie_import.nota end,
    chiusa_sola = false;
$$;
revoke execute on function anomalia_import(uuid, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;

-- la persona di una riga di APP Palestre che ha "Nome Cognome" tutto insieme (pagamenti)
create or replace function trova_allievo_importato(p_palestra uuid, p_cliente text, p_email text, p_tessera text, p_cf text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid; n int; c text := testo_norm(p_cliente); ids uuid[];
begin
  select coalesce(array_agg(a.id order by (a.codice_esterno is not null) desc, a.created_at), '{}') into ids
    from allievi a
   where a.palestra_id = p_palestra
     and (testo_norm(a.nome || ' ' || coalesce(a.cognome, '')) = c or testo_norm(coalesce(a.cognome, '') || ' ' || a.nome) = c);
  -- stesso nome e stessa email (la più sicura)
  if testo_norm(p_email) is not null then
    select a.id into v from allievi a join account ac on ac.id = a.account_id
     where a.id = any(ids) and testo_norm(ac.email) = testo_norm(p_email)
     order by (a.codice_esterno is not null) desc limit 1;
    if v is not null then return v; end if;
  end if;
  -- stesso nome e stessa tessera o codice fiscale
  if testo_norm(p_tessera) is not null then
    select a.id into v from allievi a where a.id = any(ids) and testo_norm(a.tessera) = testo_norm(p_tessera) limit 1;
    if v is not null then return v; end if;
  end if;
  if testo_norm(p_cf) is not null then
    select a.id into v from allievi a where a.id = any(ids) and upper(trim(a.codice_fiscale)) = upper(trim(p_cf)) limit 1;
    if v is not null then return v; end if;
  end if;
  -- solo il nome, ma unico
  if cardinality(ids) = 1 then return ids[1]; end if;
  -- solo la tessera (il nome è scritto diverso)
  if testo_norm(p_tessera) is not null and cardinality(ids) = 0 then
    select count(*), min(id::text)::uuid into n, v from allievi where palestra_id = p_palestra and testo_norm(tessera) = testo_norm(p_tessera);
    if n = 1 then return v; end if;
  end if;
  return null;
end $$;
revoke execute on function trova_allievo_importato(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Inizio: una nuova importazione (via le prenotazioni delle importazioni vecchie)
-- ---------------------------------------------------------------------
create or replace function importa_ap_inizia(p_palestra uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is not null and not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  -- prima che lo storico venga rifatto: gli abbonamenti già abbinati che nel frattempo hanno cambiato nome
  insert into abbonamenti_alias (palestra_id, nome_norm, nome, tipo_abbonamento_id, origine)
  select distinct on (testo_norm(x.nome)) p_palestra, testo_norm(x.nome), trim(x.nome), x.tipo, 'imparato'
    from (select st.abbonamento as nome, st.tipo_abbonamento_id as tipo, st.dal as quando
            from storico_abbonamenti st
           where st.palestra_id = p_palestra and st.fonte = 'app_palestre' and st.tipo_abbonamento_id is not null
          union all
          select split_part(i.codice_esterno, '|', 4), i.tipo_abbonamento_id, i.data_inizio
            from iscrizioni i
           where i.palestra_id = p_palestra and i.codice_esterno is not null and i.tipo_abbonamento_id is not null
             and split_part(i.codice_esterno, '|', 4) <> '') x
    join tipi_abbonamento t on t.id = x.tipo and not t.archiviato
   where testo_norm(x.nome) is not null and testo_norm(x.nome) <> testo_norm(t.nome)
     and not exists (select 1 from tipi_abbonamento t2 where t2.palestra_id = p_palestra and not t2.archiviato
                        and testo_norm(t2.nome) = testo_norm(x.nome))
   order by testo_norm(x.nome), x.quando desc
  on conflict (palestra_id, nome_norm) do nothing;
  delete from import_prenotazioni where palestra_id = p_palestra;
  insert into importazioni (palestra_id) values (p_palestra) returning id into v;
  return v;
end $$;

-- lo storico degli abbonamenti (sostituisce quella della 031):
--   • riconosce anche gli abbonamenti rinominati;
--   • se il file copre solo un periodo (p_dal_da = il primo "dal" del file) rifà solo quel periodo
--     e lo storico più vecchio resta com'è
drop function if exists importa_app_palestre_storico(uuid, jsonb, boolean);
create or replace function importa_app_palestre_storico(p_palestra uuid, p_righe jsonb, p_azzera boolean default false,
                                                        p_dal_da date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; n_senza int;
begin
  if auth.uid() is not null and not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_azzera then
    delete from storico_abbonamenti where palestra_id = p_palestra and fonte = 'app_palestre'
       and (p_dal_da is null or dal >= p_dal_da);
  end if;

  insert into storico_abbonamenti (palestra_id, allievo_id, chiave, abbonamento, tipo_abbonamento_id,
                                   dal, al, stato, esaurito, restanti, valore_cent)
  select p_palestra,
         (select id from allievi a where a.palestra_id = p_palestra and a.codice_esterno = x.chiave),
         x.chiave, x.abbonamento, tipo_da_nome(p_palestra, x.abbonamento),
         x.dal, x.al, x.stato, x.esaurito, x.restanti, x.valore_cent
  from jsonb_to_recordset(p_righe) as x(chiave text, abbonamento text, dal date, al date, stato text,
                                        esaurito boolean, restanti int, valore_cent int);
  get diagnostics n = row_count;
  select count(*) into n_senza from jsonb_to_recordset(p_righe) as x(chiave text)
   where not exists (select 1 from allievi a where a.palestra_id = p_palestra and a.codice_esterno = x.chiave);
  return jsonb_build_object('righe', n, 'senza_persona', n_senza);
end $$;

-- ---------------------------------------------------------------------
-- 4. Prenotazioni: si caricano a blocchi
-- ---------------------------------------------------------------------
create or replace function importa_ap_prenotazioni(p_imp uuid, p_righe jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_pal uuid; n int;
begin
  select palestra_id into v_pal from importazioni where id = p_imp;
  if v_pal is null then raise exception 'importazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  insert into import_prenotazioni (importazione_id, palestra_id, chiave, giorno, corso, abbonamento, abb_dal, cancellata)
  select p_imp, v_pal, x.chiave, x.giorno, x.corso, nullif(x.abbonamento, ''), x.abb_dal, coalesce(x.cancellata, false)
    from jsonb_to_recordset(p_righe) as x(chiave text, giorno timestamp, corso text, abbonamento text, abb_dal date, cancellata boolean)
   where x.chiave is not null and x.giorno is not null and coalesce(x.corso, '') <> '';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 5. Pagamenti: incasso + ricevuta con il numero di APP Palestre
-- ---------------------------------------------------------------------
create or replace function importa_ap_pagamenti(p_imp uuid, p_righe jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid; r record; v_all allievi; v_acc uuid; v_tipo uuid; v_causale text; v_metodo text; v_codice text;
  v_pag uuid; v_ric uuid; v_num_rnf uuid; v_num_rf uuid; v_num uuid; v_anno int; v_esiste ricevute;
  v_quando timestamptz; v_fuso text; v_trovato uuid; v_al aliquote_iva; v_imp int; v_iva int; v_tipo_doc text;
  n_nuovi int := 0; n_gia int := 0; n_ric int := 0; n_senza int := 0; n_storni int := 0;
begin
  select palestra_id into v_pal from importazioni where id = p_imp;
  if v_pal is null then raise exception 'importazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  select coalesce(fuso_orario, 'Europe/Rome') into v_fuso from palestre where id = v_pal;

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
                                            when 'assegno' then 'assegno' when 'stripe' then 'online' else 'altro' end;
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

  return jsonb_build_object('nuovi', n_nuovi, 'gia', n_gia, 'ricevute', n_ric, 'senza_persona', n_senza, 'storni', n_storni);
end $$;

-- ---------------------------------------------------------------------
-- 6. Gli orari di una persona per un abbonamento, ricavati dalle prenotazioni
-- ---------------------------------------------------------------------
drop function if exists import_orari_prenotati(uuid, text, text, date);
create function import_orari_prenotati(p_imp uuid, p_chiave text, p_abbonamento text, p_dal date)
returns table (giorno int, ora time, corso text, quante int, orario_id uuid, corso_id uuid, corso_rmhouse text)
language sql stable security definer set search_path = public as $$
  with pr as (
    select b.* from import_prenotazioni b
     where b.importazione_id = p_imp and b.chiave = p_chiave and not b.cancellata
       and testo_norm(b.abbonamento) = testo_norm(p_abbonamento) and b.abb_dal is not distinct from p_dal
  ), scelta as (   -- le prenotazioni da oggi in poi; se non ce ne sono, tutte quelle dell'abbonamento
    select * from pr where giorno::date >= current_date
    union all
    select * from pr where not exists (select 1 from pr where giorno::date >= current_date)
  ), gruppi as (
    select extract(isodow from giorno)::int as giorno, corso_norm(corso) as cn, min(corso) as corso, count(*)::int as quante,
           mode() within group (order by giorno::time) as ora
      from scelta group by 1, 2
  ), tenuti as (   -- una prenotazione isolata (un recupero, uno spostamento) non fa un orario fisso
    select * from gruppi g where g.quante >= 2 or not exists (select 1 from gruppi x where x.quante >= 2)
  )
  select t.giorno, t.ora, t.corso, t.quante, o.id, o.corso_id, o.nome
    from tenuti t
    left join lateral (
      -- stesso corso, stesso giorno, ora vicina (APP Palestre a volte sposta di un quarto d'ora);
      -- se il corso in RMHouse ha cambiato nome, va bene anche un corso che comincia con la stessa parola
      -- (es. "Heels liv. 2" → "Heels open") purché giorno e ora siano gli stessi
      select o.id, o.corso_id, c.nome from orari o join corsi c on c.id = o.corso_id
       join importazioni i on i.id = p_imp and i.palestra_id = o.palestra_id
       where o.attivo and o.giorno_settimana = t.giorno
         and (o.valido_al is null or o.valido_al >= current_date)
         and (   (corso_norm(c.nome) = t.cn and abs(extract(epoch from (o.ora_inizio - t.ora))) <= 30 * 60)
              or (split_part(corso_norm(c.nome), ' ', 1) = split_part(t.cn, ' ', 1) and abs(extract(epoch from (o.ora_inizio - t.ora))) <= 15 * 60))
       order by (corso_norm(c.nome) = t.cn) desc, abs(extract(epoch from (o.ora_inizio - t.ora))), c.attivo desc, o.valido_dal desc
       limit 1) o on true
   order by t.quante desc, t.giorno, t.ora;
$$;

-- ---------------------------------------------------------------------
-- 7. Chiusura: iscrizioni in corso con corso e orari, quote, stato delle persone
-- ---------------------------------------------------------------------
create or replace function importa_ap_chiudi(p_imp uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid; v_inizio timestamptz; v_sede uuid; v_mese int; s record; t tipi_abbonamento; o record;
  v_corso uuid; v_isc iscrizioni; v_orari uuid[]; v_slot text[]; v_fuori text[]; v_n int; v_lez int;
  v_pag record; v_nome text; v_esistenti int; v_dett text; v_gg text[] := array['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'];
  n_nuove int := 0; n_aggiornate int := 0; n_con_orari int := 0; n_senza_orari int := 0; n_saltate int := 0; n_quote int := 0;
  v_primo_pag date; v_rifatta boolean; v_manuale boolean;
begin
  select palestra_id, iniziata_at, finita_at is not null into v_pal, v_inizio, v_rifatta from importazioni where id = p_imp;
  if v_pal is null then raise exception 'importazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  -- rifatta dal "Da sistemare": conta da adesso (per le anomalie e per i messaggi)
  if v_rifatta then
    update importazioni set ricalcolata_at = now() where id = p_imp;
    v_inizio := now();
  end if;
  select id into v_sede from sedi where palestra_id = v_pal and principale order by ordine limit 1;
  select mese_inizio_stagione into v_mese from palestre where id = v_pal;
  select min(data_pagamento) into v_primo_pag from import_pagamenti where importazione_id = p_imp;

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
        'Se in RMHouse ha un altro nome, abbinalo in cima a questa pagina ("Abbonamenti da abbinare"): l''iscrizione si crea da sola. ' ||
        'Se manca proprio, crealo nel listino (Abbonamenti) e poi abbinalo, oppure iscrivi la persona a mano.',
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
          if corso_norm(o.corso_rmhouse) <> corso_norm(o.corso) then
            perform anomalia_import(v_pal, p_imp, null, 'corsi', 'da_verificare',
              'Corso con nome diverso: "' || trim(o.corso) || '" in APP Palestre, "' || o.corso_rmhouse || '" in RMHouse',
              'Chi in APP Palestre è prenotato a "' || trim(o.corso) || '" il ' || v_gg[o.giorno] || ' alle ' || to_char(o.ora, 'HH24:MI') ||
              ' è stato messo su "' || o.corso_rmhouse || '" (stesso giorno e stessa ora). Controlla che sia lo stesso corso.',
              'nome_diverso|' || corso_norm(o.corso) || '|' || o.corso_id, '/gestione/corsi');
          end if;
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
            'Le persone prenotate in APP Palestre a questo orario non hanno potuto prenderlo in RMHouse. Aggiungi l''orario al corso ' ||
            '(Corsi → il corso → Orari) e rifai l''import, oppure assegnalo a mano a chi è nell''elenco con lo stesso orario.',
            'orario_manca|' || corso_norm(o.corso) || '|' || o.giorno || '|' || to_char(o.ora, 'HH24:MI'), '/gestione/corsi');
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
        'Collega i corsi all''abbonamento (Abbonamenti → Corsi coperti) e rifai l''import, oppure iscrivi la persona a mano.',
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
      update iscrizioni set data_inizio = s.dal, data_fine = s.al,
             codice_esterno = s.chiave || '|' || s.abbonamento || '|' || s.dal,
             corso_id = case when v_esistenti = 0 then v_corso else corso_id end,
             ingressi_residui = case when t.modalita = 'ingressi' then coalesce(s.restanti, ingressi_residui) else ingressi_residui end
       where id = v_isc.id;
      if v_esistenti = 0 then
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
    if t.modalita = 'orari_fissi' then
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
          'questo corso non è tra quelli coperti dall''abbonamento. Se è giusto aggiungilo ai corsi coperti, altrimenti cambia il corso.',
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
      'senza_orari', n_senza_orari, 'non_create', n_saltate, 'quote', n_quote)
   where id = p_imp;
  return jsonb_build_object('nuove', n_nuove, 'aggiornate', n_aggiornate, 'con_orari', n_con_orari,
                            'senza_orari', n_senza_orari, 'non_create', n_saltate, 'quote', n_quote);
end $$;

-- ---------------------------------------------------------------------
-- 8. Le anomalie su persone, pagamenti, ricevute e prenotazioni
-- ---------------------------------------------------------------------
create or replace function importa_ap_anomalie(p_imp uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pal uuid; r record; v_buchi text; v_tot int; v_aperte int; v_giro timestamptz;
begin
  select palestra_id, coalesce(ricalcolata_at, iniziata_at) into v_pal, v_giro from importazioni where id = p_imp;
  if v_pal is null then raise exception 'importazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;

  create temp table _imp_pers on commit drop as
    select a.id, a.nome, a.cognome, a.data_nascita, upper(trim(a.codice_fiscale)) as cf, a.tessera, a.codice_esterno,
           ac.email, ac.telefono, ac.id as account_id, a.is_titolare,
           testo_norm(a.nome || ' ' || coalesce(a.cognome, '')) as nc,
           exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa') and coalesce(i.data_fine, current_date) >= current_date) as attivo
      from allievi a left join account ac on ac.id = a.account_id
     where a.palestra_id = v_pal and a.codice_esterno is not null;

  -- doppioni: stesso nome e cognome su più schede
  for r in
    select p.*, (select string_agg(coalesce(q.email, 'senza email') || coalesce(', nato/a il ' || to_char(q.data_nascita, 'DD/MM/YYYY'), '') ||
                                   case when q.attivo then ', iscritto/a ora' else '' end, '; ')
                   from _imp_pers q where q.nc = p.nc and q.id <> p.id) as altri,
           exists (select 1 from _imp_pers q where q.nc = p.nc and q.id <> p.id
                     and ((q.data_nascita = p.data_nascita) or (q.telefono is not null and q.telefono = p.telefono) or (q.cf is not null and q.cf = p.cf))) as sicuro,
           exists (select 1 from _imp_pers q where q.nc = p.nc and q.id <> p.id and q.attivo) or p.attivo as qualcuno_attivo
      from _imp_pers p where exists (select 1 from _imp_pers q where q.nc = p.nc and q.id <> p.id)
  loop
    perform anomalia_import(v_pal, p_imp, r.id, 'persone', case when r.qualcuno_attivo then 'da_sistemare' else 'da_verificare' end,
      case when r.sicuro then 'Doppione: la stessa persona ha due schede' else 'Possibile doppione: stesso nome su due schede' end,
      'Questa scheda: ' || coalesce(r.email, 'senza email') || coalesce(', nato/a il ' || to_char(r.data_nascita, 'DD/MM/YYYY'), '') ||
      '. Altra scheda con lo stesso nome: ' || r.altri || '. ' ||
      case when r.sicuro then 'Unisci le due schede (tieni quella con l''email giusta).'
           else 'Se sono la stessa persona unisci le schede, se sono due persone diverse segna come fatto.' end,
      'doppione|' || r.id);
  end loop;

  -- codice fiscale non valido
  for r in select * from _imp_pers where cf is not null and cf <> '' and not cf_valido(cf) loop
    perform anomalia_import(v_pal, p_imp, r.id, 'persone', case when r.attivo then 'da_sistemare' else 'da_verificare' end,
      'Codice fiscale non valido', 'Sulla scheda c''è "' || r.cf || '", che non è un codice fiscale valido (lettere o cifre sbagliate o mancanti). ' ||
      'Correggilo: serve per le ricevute e per la detrazione delle spese sportive.', 'cf_errato|' || r.id);
  end loop;

  -- stesso codice fiscale su persone diverse (di solito il CF del genitore messo sul figlio)
  for r in
    select p.*, (select string_agg(q.nome || ' ' || coalesce(q.cognome, ''), ', ') from _imp_pers q where q.cf = p.cf and q.id <> p.id and q.nc <> p.nc) as altri
      from _imp_pers p where p.cf is not null and p.cf <> ''
       and exists (select 1 from _imp_pers q where q.cf = p.cf and q.id <> p.id and q.nc <> p.nc)
  loop
    perform anomalia_import(v_pal, p_imp, r.id, 'persone', case when r.attivo then 'da_sistemare' else 'da_verificare' end,
      'Codice fiscale uguale a quello di un''altra persona',
      'Il codice fiscale ' || r.cf || ' è anche su: ' || r.altri || '. Di solito è il codice del genitore messo sulla scheda del figlio: ' ||
      'sulla scheda va il codice di chi frequenta, quello del genitore va sul titolare che paga.', 'cf_doppio|' || r.id);
  end loop;

  -- data di nascita diversa da quella del codice fiscale
  for r in select * from _imp_pers where data_nascita is not null and cf_nascita(cf) is not null and cf_nascita(cf) <> data_nascita loop
    perform anomalia_import(v_pal, p_imp, r.id, 'persone', case when r.attivo then 'da_sistemare' else 'da_verificare' end,
      'Data di nascita diversa dal codice fiscale',
      'Sulla scheda è nato/a il ' || to_char(r.data_nascita, 'DD/MM/YYYY') || ', il codice fiscale ' || r.cf || ' dice ' ||
      to_char(cf_nascita(r.cf), 'DD/MM/YYYY') || '. Uno dei due è sbagliato (a volte il codice è quello del genitore): ' ||
      'la data serve per la fascia d''età dei corsi.', 'nascita_cf|' || r.id);
  end loop;

  -- chi è iscritto ora: dati che mancano
  for r in select * from _imp_pers where attivo and email is null and is_titolare loop
    perform anomalia_import(v_pal, p_imp, r.id, 'persone', 'da_sistemare', 'Senza email',
      'È iscritto/a ora ma non ha l''email: non riceve ricevute e avvisi e non può entrare nell''app. Chiedila e aggiungila alla scheda.',
      'senza_email|' || r.id);
  end loop;
  for r in select * from _imp_pers where attivo and data_nascita is null loop
    perform anomalia_import(v_pal, p_imp, r.id, 'persone', 'da_sistemare', 'Senza data di nascita',
      'È iscritto/a ora ma manca la data di nascita' || case when r.cf is null then ' (e anche il codice fiscale)' else '' end ||
      ': serve per la fascia d''età e per l''assicurazione. Aggiungila alla scheda.', 'senza_nascita|' || r.id);
  end loop;

  -- pagamenti senza persona
  for r in select * from import_pagamenti where importazione_id = p_imp and allievo_id is null loop
    perform anomalia_import(v_pal, p_imp, null, 'pagamenti', 'da_sistemare',
      'Pagamento senza persona: ' || coalesce(r.cliente, '?'),
      'Il pagamento di ' || replace(to_char(r.importo_cent / 100.0, 'FM999990.00'), '.', ',') || ' € del ' || to_char(r.data_pagamento, 'DD/MM/YYYY') ||
      ' (' || coalesce(r.voce, '') || ') non corrisponde a nessuna persona della lista clienti. È stato importato senza persona: ' ||
      'apri il pagamento e collegalo alla scheda giusta.',
      'pag_senza_persona|' || coalesce(r.pagamento_id::text, r.ricevuta_id::text, testo_norm(r.cliente) || r.data_pagamento), '/gestione/incassi');
  end loop;

  -- storni (in APP Palestre erano ricevute con l'importo negativo)
  for r in select ip.*, ri.numero, ri.anno, ri.id as rid from import_pagamenti ip join ricevute ri on ri.id = ip.ricevuta_id
            where ip.importazione_id = p_imp and ip.importo_cent < 0 loop
    perform anomalia_import(v_pal, p_imp, r.allievo_id, 'ricevute', 'da_verificare',
      'Storno importato come nota di credito: n. ' || r.numero || '/' || r.anno,
      'In APP Palestre la ricevuta n. ' || r.numero || ' è di ' || replace(to_char(r.importo_cent / 100.0, 'FM999990.00'), '.', ',') ||
      ' € (uno storno). In RMHouse è una nota di credito con lo stesso numero, ma non sa a quale ricevuta si riferisce e non toglie ' ||
      'l''importo dagli incassi: controlla con il commercialista.', 'storno|' || r.rid, '/gestione/ricevute/' || r.rid);
  end loop;

  -- buchi nella numerazione delle ricevute importate
  for r in
    select ri.numerazione_id, ri.anno, n.codice, min(ri.numero) as primo, max(ri.numero) as ultimo
      from ricevute ri join numerazioni n on n.id = ri.numerazione_id
     where ri.palestra_id = v_pal and ri.note like 'Importata da APP Palestre%'
     group by 1, 2, 3
  loop
    select string_agg(case when a = b then a::text else a || '–' || b end, ', ' order by a), sum(b - a + 1)
      into v_buchi, v_tot
      from (select min(g) as a, max(g) as b from (
              select g, g - row_number() over (order by g) as grp
                from generate_series(1, r.ultimo) g
               where not exists (select 1 from ricevute x where x.numerazione_id = r.numerazione_id and x.anno = r.anno and x.numero = g)
            ) z group by grp) y;
    if v_tot > 0 then
      perform anomalia_import(v_pal, p_imp, null, 'ricevute', 'da_verificare',
        'Numeri di ricevuta mancanti (' || r.codice || ' ' || r.anno || '): ' || v_tot,
        'Nelle ricevute ' || r.anno || ' arrivate da APP Palestre mancano questi numeri: ' || v_buchi || '. ' ||
        case when r.primo > 1 then 'I primi possono essere ricevute di pagamenti fatti prima del periodo esportato: se è così, scarica da APP Palestre ' ||
                                   'i pagamenti da un mese prima e rifai l''import. ' else '' end ||
        'Gli altri sono ricevute cancellate in APP Palestre: verifica con il commercialista.',
        'buchi|' || r.numerazione_id || '|' || r.anno, '/gestione/ricevute');
    end if;
  end loop;

  -- ricevute fatte in RMHouse con un numero che APP Palestre aveva già usato nello stesso anno
  for r in
    select ri.id, ri.numero, ri.anno, ri.data, ri.intestatario, ri.importo_cent, ri.annullata, ri.allievo_id, n.codice, mx.ultimo
      from ricevute ri join numerazioni n on n.id = ri.numerazione_id
      join (select numerazione_id, anno, max(numero) as ultimo from ricevute
             where palestra_id = v_pal and note like 'Importata da APP Palestre%' group by 1, 2) mx
        on mx.numerazione_id = ri.numerazione_id and mx.anno = ri.anno
     where ri.palestra_id = v_pal and coalesce(ri.note, '') not like 'Importata da APP Palestre%' and ri.numero < mx.ultimo
  loop
    perform anomalia_import(v_pal, p_imp, r.allievo_id, 'ricevute', case when r.annullata then 'da_verificare' else 'da_sistemare' end,
      'Ricevuta di RMHouse con un numero già usato da APP Palestre: n. ' || r.numero || '/' || r.anno,
      'La ricevuta n. ' || r.numero || '/' || r.anno || ' (' || r.codice || ') di ' || coalesce(r.intestatario, '?') || ' del ' || to_char(r.data, 'DD/MM/YYYY') ||
      ' (' || replace(to_char(r.importo_cent / 100.0, 'FM999990.00'), '.', ',') || ' €) è stata fatta in RMHouse, ma nel ' || r.anno ||
      ' APP Palestre è arrivato fino al n. ' || r.ultimo || ': la numerazione si sovrappone. ' ||
      case when r.annullata then 'È già annullata: verifica solo con il commercialista che vada bene così.'
           else 'Annullala e rifai la ricevuta (prenderà il numero ' || (r.ultimo + 1) || ' o successivo), poi verifica con il commercialista.' end,
      'ric_sovrapposta|' || r.id, '/gestione/ricevute/' || r.id);
  end loop;

  -- prenotazioni future fatte senza abbonamento
  for r in
    select b.chiave, a.id as allievo_id, count(*) as quante, string_agg(distinct trim(b.corso), ', ') as corsi, min(b.giorno) as prima
      from import_prenotazioni b left join allievi a on a.palestra_id = v_pal and a.codice_esterno = b.chiave
     where b.importazione_id = p_imp and b.abbonamento is null and not b.cancellata and b.giorno::date >= current_date
     group by 1, 2
  loop
    perform anomalia_import(v_pal, p_imp, r.allievo_id, 'abbonamenti', 'da_sistemare',
      'Prenotato/a senza abbonamento',
      'In APP Palestre ha ' || r.quante || ' prenotazioni future senza abbonamento (' || r.corsi || ', dal ' || to_char(r.prima, 'DD/MM/YYYY') ||
      '). In RMHouse queste prenotazioni non ci sono: verifica se deve comprare l''abbonamento o se è una prova.',
      'pren_senza_abb|' || r.chiave);
  end loop;

  -- le anomalie delle importazioni precedenti che questa volta non sono uscite: si chiudono da sole
  -- (se il controllo è stato rifatto, anche quelle di questa importazione non più uscite; i numeri di ricevuta
  --  già usati escono solo caricando i pagamenti, quindi restano)
  update anomalie_import set risolta = true, risolta_at = now(), chiusa_sola = true,
         nota = 'Non si è più presentata al controllo del ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI')
   where palestra_id = v_pal and not risolta
     and (importazione_id is distinct from p_imp or (aggiornata_at < v_giro and chiave not like 'ric\_doppia|%'));

  select count(*) into v_aperte from anomalie_import where palestra_id = v_pal and not risolta;
  update importazioni set finita_at = now(), riepilogo = riepilogo || jsonb_build_object('anomalie_aperte', v_aperte) where id = p_imp;
  return jsonb_build_object('aperte', v_aperte);
end $$;

-- abbinare un abbonamento di APP Palestre a uno del listino (o togliere l'abbinamento con p_tipo null);
-- poi si rifà il controllo finale (importa_ap_chiudi + importa_ap_anomalie) e le iscrizioni nascono
create or replace function abbina_abbonamento_import(p_palestra uuid, p_nome text, p_tipo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_storico int; n_pag int;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if testo_norm(p_nome) is null then raise exception 'nome_mancante'; end if;
  if p_tipo is not null and not exists (select 1 from tipi_abbonamento where id = p_tipo and palestra_id = p_palestra) then
    raise exception 'abbonamento_non_trovato';
  end if;
  if p_tipo is null then
    delete from abbonamenti_alias where palestra_id = p_palestra and nome_norm = testo_norm(p_nome);
  else
    insert into abbonamenti_alias (palestra_id, nome_norm, nome, tipo_abbonamento_id, origine)
    values (p_palestra, testo_norm(p_nome), trim(p_nome), p_tipo, 'scelto')
    on conflict (palestra_id, nome_norm) do update set tipo_abbonamento_id = excluded.tipo_abbonamento_id, origine = 'scelto',
                                                       nome = excluded.nome, created_at = now();
  end if;
  update storico_abbonamenti set tipo_abbonamento_id = tipo_da_nome(p_palestra, abbonamento)
   where palestra_id = p_palestra and fonte = 'app_palestre' and testo_norm(abbonamento) = testo_norm(p_nome);
  get diagnostics n_storico = row_count;
  -- i pagamenti importati con quel nome diventano (o tornano) pagamenti di abbonamento
  update pagamenti p set causale = case when p_tipo is null then 'altro' else 'abbonamento' end
    from import_pagamenti ip
   where ip.palestra_id = p_palestra and ip.pagamento_id = p.id and testo_norm(ip.voce) = testo_norm(p_nome)
     and p.causale in ('altro', 'abbonamento');
  get diagnostics n_pag = row_count;
  update import_pagamenti set causale = case when p_tipo is null then 'altro' else 'abbonamento' end
   where palestra_id = p_palestra and testo_norm(voce) = testo_norm(p_nome) and causale in ('altro', 'abbonamento');
  return jsonb_build_object('storico', n_storico, 'pagamenti', n_pag);
end $$;
revoke execute on function abbina_abbonamento_import(uuid, text, uuid) from public, anon;
revoke execute on function importa_app_palestre_storico(uuid, jsonb, boolean, date) from public, anon;
grant execute on function importa_app_palestre_storico(uuid, jsonb, boolean, date) to authenticated;
grant execute on function abbina_abbonamento_import(uuid, text, uuid) to authenticated;

-- segnare come fatta (o riaprire) una anomalia
create or replace function segna_anomalia(p_id uuid, p_risolta boolean, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_pal uuid;
begin
  select palestra_id into v_pal from anomalie_import where id = p_id;
  if v_pal is null then raise exception 'non_trovata'; end if;
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  update anomalie_import set risolta = p_risolta,
         risolta_at = case when p_risolta then now() end,
         risolta_da = case when p_risolta then auth.uid() end,
         nota = case when p_risolta then nullif(trim(coalesce(p_nota, '')), '') end,
         chiusa_sola = false
   where id = p_id;
end $$;

-- più anomalie insieme (dalla selezione multipla)
create or replace function segna_anomalie(p_ids uuid[], p_risolta boolean, p_nota text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update anomalie_import set risolta = p_risolta,
         risolta_at = case when p_risolta then now() end,
         risolta_da = case when p_risolta then auth.uid() end,
         nota = case when p_risolta then nullif(trim(coalesce(p_nota, '')), '') end,
         chiusa_sola = false
   where id = any(p_ids) and is_gestione(palestra_id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function segna_anomalie(uuid[], boolean, text) from public, anon;
grant execute on function segna_anomalie(uuid[], boolean, text) to authenticated;

revoke execute on function importa_ap_inizia(uuid) from public, anon;
revoke execute on function importa_ap_prenotazioni(uuid, jsonb) from public, anon;
revoke execute on function importa_ap_pagamenti(uuid, jsonb) from public, anon;
revoke execute on function importa_ap_chiudi(uuid) from public, anon;
revoke execute on function importa_ap_anomalie(uuid) from public, anon;
revoke execute on function segna_anomalia(uuid, boolean, text) from public, anon;
revoke execute on function import_orari_prenotati(uuid, text, text, date) from public, anon;
grant execute on function importa_ap_inizia(uuid) to authenticated;
grant execute on function importa_ap_prenotazioni(uuid, jsonb) to authenticated;
grant execute on function importa_ap_pagamenti(uuid, jsonb) to authenticated;
grant execute on function importa_ap_chiudi(uuid) to authenticated;
grant execute on function importa_ap_anomalie(uuid) to authenticated;
grant execute on function segna_anomalia(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. ESPORTA: gli stessi quattro elenchi, presi da RMHouse, con le colonne di APP Palestre
--    (così si possono dare a un altro gestionale, al commercialista, o reimportare qui).
--    Ogni funzione restituisce un array json con le colonne già nell'ordine del file.
-- ---------------------------------------------------------------------
create or replace function data_it(d date) returns text language sql immutable as $$ select to_char(d, 'DD-MM-YYYY') $$;
create or replace function euro_it(c int) returns text language sql immutable as $$
  select case when c is null then '' else replace(to_char(c / 100.0, 'FM9999990.00'), '.', ',') end $$;

-- 1. lista clienti: una riga per persona che frequenta (chi paga va in "RAGIONE SOCIALE")
create or replace function esporta_clienti(p_palestra uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v json;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select coalesce(json_agg(json_build_object(
      'NOME', a.nome, 'COGNOME', coalesce(a.cognome, ''), 'EMAIL', coalesce(ac.email, ''),
      'CELLULARE', coalesce(ac.telefono, ''),
      'VIA', coalesce(a.indirizzo, ac.indirizzo, ''), 'CAP', coalesce(ac.cap, ''), 'COMUNE', coalesce(ac.citta, ''),
      'PROVINCIA', coalesce(ac.provincia, ''),
      'NATO IL', coalesce(data_it(a.data_nascita), ''), 'LUOGO DI NASCITA', coalesce(a.luogo_nascita, ''),
      'CODICE FISCALE', coalesce(a.codice_fiscale, case when a.is_titolare then ac.codice_fiscale end, ''),
      'TESSERA', coalesce(a.tessera, ''),
      'SESSO', case a.sesso when 'F' then 'Femmina' when 'M' then 'Maschio' else '' end,
      'ATTESTATO MEDICO SCADENZA', coalesce(data_it(a.certificato_scadenza), ''),
      'NOTA', coalesce(a.note, ''),
      'STATO', case a.stato_lead::text when 'iscritto' then 'Iscritto' when 'perso' then 'Non iscritto' else 'Contatto' end,
      'ABBONAMENTI ATTIVI', coalesce((select string_agg(t.nome, ', ' order by i.data_inizio) from iscrizioni i
                                       join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
                                      where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa')
                                        and i.data_inizio <= current_date and coalesce(i.data_fine, current_date) >= current_date), ''),
      'ABBONAMENTI FUTURI', coalesce((select string_agg(t.nome, ', ' order by i.data_inizio) from iscrizioni i
                                       join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
                                      where i.allievo_id = a.id and i.stato = 'attiva' and i.data_inizio > current_date), ''),
      'RAGIONE SOCIALE', trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')),
      'CODICE FISCALE (CHI PAGA)', coalesce(ac.codice_fiscale, ''),
      'QUOTA ANNUALE PAGATA', coalesce((select string_agg(q.stagione::text, ', ' order by q.stagione) from quote_iscrizione q
                                         where q.allievo_id = a.id), ''),
      'CONSENSO FOTO', case when a.consenso_immagini then 'Si' when a.consenso_immagini = false then 'No' else '' end,
      'CONSENSO WHATSAPP', case when a.consenso_whatsapp then 'Si' when a.consenso_whatsapp = false then 'No' else '' end,
      'DATA INSERIMENTO', data_it((a.created_at at time zone 'Europe/Rome')::date)
    ) order by a.cognome, a.nome), '[]'::json) into v
    from allievi a left join account ac on ac.id = a.account_id
   where a.palestra_id = p_palestra;
  return v;
end $$;

-- 2. lista abbonamenti: le iscrizioni di RMHouse + lo storico arrivato da APP Palestre che non è diventato iscrizione
create or replace function esporta_abbonamenti(p_palestra uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v json;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  with righe as (
    select a.nome, a.cognome, a.sesso, ac.email, ac.telefono, trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')) as paga,
           t.nome as abbonamento, i.data_inizio as dal, i.data_fine as al,
           case when i.stato = 'annullata' then 'annullato' when i.stato = 'sospesa' then 'sospeso'
                when coalesce(i.data_fine, current_date) < current_date or i.stato = 'scaduta' then 'scaduto' else 'attivo' end as stato,
           i.ingressi_residui as restanti, coalesce(pg.importo_cent, t.prezzo_cent - coalesce(i.sconto_cent, 0)) as valore,
           c.nome as corso,
           (select string_agg(case o.giorno_settimana when 1 then 'Lun' when 2 then 'Mar' when 3 then 'Mer' when 4 then 'Gio'
                                when 5 then 'Ven' when 6 then 'Sab' else 'Dom' end || ' ' || to_char(o.ora_inizio, 'HH24:MI'), ', '
                              order by o.giorno_settimana, o.ora_inizio)
              from iscrizioni_orari io join orari o on o.id = io.orario_id where io.iscrizione_id = i.id) as orari,
           case when i.codice_esterno is not null then 'APP Palestre + RMHouse' else 'RMHouse' end as origine
      from iscrizioni i join allievi a on a.id = i.allievo_id left join account ac on ac.id = a.account_id
      left join tipi_abbonamento t on t.id = i.tipo_abbonamento_id left join corsi c on c.id = i.corso_id
      left join pagamenti pg on pg.id = i.pagamento_id
     where i.palestra_id = p_palestra
    union all
    select a.nome, a.cognome, a.sesso, ac.email, ac.telefono, trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')),
           st.abbonamento, st.dal, st.al, st.stato, st.restanti, st.valore_cent, null, null, 'APP Palestre (storico)'
      from storico_abbonamenti st left join allievi a on a.id = st.allievo_id left join account ac on ac.id = a.account_id
     where st.palestra_id = p_palestra and st.iscrizione_id is null
  )
  select coalesce(json_agg(json_build_object(
      'NOME', coalesce(nome, ''), 'COGNOME', coalesce(cognome, ''),
      'SESSO', case sesso when 'F' then 'F' when 'M' then 'M' else '' end,
      'EMAIL', coalesce(email, ''), 'CELLULARE', coalesce(telefono, ''), 'RAGIONE SOCIALE', paga,
      'ABBONAMENTO', coalesce(abbonamento, ''), 'DAL', coalesce(data_it(dal), ''), 'AL', coalesce(data_it(al), ''),
      'STATO', stato, 'RESTANTI', coalesce(restanti::text, ''), 'VALORE', coalesce(replace(euro_it(valore), ',', '.'), ''),
      'CORSO', coalesce(corso, ''), 'ORARI', coalesce(orari, ''), 'ORIGINE', origine
    ) order by dal desc, cognome, nome), '[]'::json) into v
    from righe;
  return v;
end $$;

-- 3. prenotazioni: chi è atteso a ogni lezione del periodo (iscritti con quell'orario, recuperi, ingressi, prove)
create or replace function esporta_prenotazioni(p_palestra uuid, p_dal date, p_al date)
returns json language plpgsql stable security definer set search_path = public as $$
declare v json; v_fuso text;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_al - p_dal > 62 then raise exception 'periodo_troppo_lungo'; end if;
  select coalesce(fuso_orario, 'Europe/Rome') into v_fuso from palestre where id = p_palestra;
  with lez as (
    select l.* from lezioni l where l.palestra_id = p_palestra and l.data between p_dal and p_al
  ), righe as (
    select l.inizio, l.stato as stato_lezione, c.nome as corso, b.tipo, b.allievo_id,
           coalesce(i.id, pr.iscrizione_id) as iscrizione_id, pr.stato as stato_pren, pr.created_at as prenotata_at,
           (select ps.presente from presenze ps where ps.lezione_id = l.id and ps.allievo_id = b.allievo_id limit 1) as presente
      from lez l join v_partecipanti_base b on b.lezione_id = l.id
      join corsi c on c.id = l.corso_id
      left join iscrizioni i on b.tipo = 'iscritto' and i.id = b.riferimento_id
      left join prenotazioni pr on b.tipo not in ('iscritto', 'prova') and pr.id = b.riferimento_id
    union all   -- chi aveva avvisato l'assenza (in APP Palestre: prenotazione cancellata)
    select l.inizio, l.stato, c.nome, 'iscritto', x.allievo_id, null, 'assenza_avvisata', x.created_at, false
      from lez l join assenze_avvisate x on x.lezione_id = l.id join corsi c on c.id = l.corso_id
  )
  select coalesce(json_agg(json_build_object(
      'Nome cliente', a.nome, 'Cognome cliente', coalesce(a.cognome, ''), 'Email', coalesce(ac.email, ''),
      'Data prenotazione', coalesce(to_char(r.prenotata_at at time zone v_fuso, 'DD-MM-YYYY HH24:MI'), ''),
      'Giorno prenotato', to_char(r.inizio at time zone v_fuso, 'DD-MM-YYYY HH24:MI'),
      'Cosa', r.corso,
      'Abbonamento', coalesce(t.nome || ' (Inizio ' || data_it(i.data_inizio) || ' Fine ' || coalesce(data_it(i.data_fine), '') || ')',
                              case r.tipo when 'prova' then 'Lezione di prova' else 'No abbonamento' end),
      'Stato', case when r.stato_pren = 'assenza_avvisata' then 'Assenza avvisata' when r.stato_lezione::text = 'annullata' then 'Lezione annullata'
                    else 'Prenotato' end,
      'Eliminato', case when r.stato_pren = 'assenza_avvisata' or r.stato_lezione::text = 'annullata' then 'Si' else 'No' end,
      'Presenza', case when r.presente then 'Si' when r.presente = false then 'No' else 'Non selezionata' end,
      'Tipo', case r.tipo when 'iscritto' then 'Orario fisso' when 'recupero' then 'Recupero' when 'ingresso' then 'Ingresso'
                          when 'prova' then 'Prova' else initcap(r.tipo) end
    ) order by r.inizio, r.corso, a.cognome), '[]'::json) into v
    from righe r join allievi a on a.id = r.allievo_id left join account ac on ac.id = a.account_id
    left join iscrizioni i on i.id = r.iscrizione_id left join tipi_abbonamento t on t.id = i.tipo_abbonamento_id;
  return v;
end $$;

-- 4. pagamenti clienti: un incasso per riga con la sua ricevuta (e le note di credito senza incasso)
create or replace function esporta_pagamenti(p_palestra uuid, p_dal date, p_al date)
returns json language plpgsql stable security definer set search_path = public as $$
declare v json; v_fuso text;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select coalesce(fuso_orario, 'Europe/Rome') into v_fuso from palestre where id = p_palestra;
  with righe as (
    select (p.pagato_at at time zone v_fuso)::date as quando, p.importo_cent, p.metodo, p.descrizione, p.stato::text as stato,
           coalesce(p.rimborsato_cent, 0) as rimborsato, p.allievo_id, p.account_id, p.causale,
           r.numero, r.data as data_doc, r.tipo_documento, n.codice as serie, r.intestatario, r.codice_fiscale as cf_ric, r.annullata
      from pagamenti p
      left join lateral (select * from ricevute r where r.pagamento_id = p.id and r.tipo_documento <> 'nota_credito'
                          order by r.annullata, r.created_at desc limit 1) r on true
      left join numerazioni n on n.id = r.numerazione_id
     where p.palestra_id = p_palestra and p.stato::text in ('pagato', 'rimborsato')
       and (p.pagato_at at time zone v_fuso)::date between p_dal and p_al
    union all
    select r.data, -r.importo_cent, r.metodo, r.descrizione, 'nota di credito', 0, r.allievo_id, r.account_id, null,
           r.numero, r.data, r.tipo_documento, n.codice, r.intestatario, r.codice_fiscale, r.annullata
      from ricevute r join numerazioni n on n.id = r.numerazione_id
     where r.palestra_id = p_palestra and r.tipo_documento = 'nota_credito' and r.data between p_dal and p_al
  )
  select coalesce(json_agg(json_build_object(
      'Cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, ''))),
      'Cellulare', coalesce(ac.telefono, ''), 'Email', coalesce(ac.email, ''),
      'CF', coalesce(r.cf_ric, a.codice_fiscale, ac.codice_fiscale, ''),
      'Tipo documento', case r.tipo_documento when 'ricevuta' then 'Ricevuta non fiscale' when 'fattura' then 'Fattura'
                                              when 'nota_credito' then 'Nota di credito' else 'Nessun documento' end,
      'Nomenclatura', case when r.numero is null then 'Nodocumento' when r.serie = 'RF' then 'RicevutaF'
                           when r.tipo_documento = 'nota_credito' then 'NotaCredito' when r.tipo_documento = 'fattura' then 'Fattura' else 'Ricevuta' end,
      'Numero', coalesce(r.numero::text, ''), 'Serie', coalesce(r.serie, ''),
      'Metodo pagamento', case r.metodo when 'contanti' then 'Contanti' when 'pos' then 'Bancomat' when 'bonifico' then 'Bonifico'
                                        when 'online' then 'Online' when 'stripe' then 'Stripe' when 'assegno' then 'Assegno'
                                        else coalesce(initcap(r.metodo), '') end,
      'Data fattura/ricevuta', coalesce(data_it(r.data_doc), ''), 'Data pagamento', coalesce(data_it(r.quando), ''),
      'Importo', euro_it(r.importo_cent),
      'Informazioni acquisti', coalesce(r.descrizione, ''),
      'Tessera', coalesce(a.tessera, ''),
      'RAGIONE SOCIALE', coalesce(r.intestatario, ''),
      'Causale', coalesce(r.causale, ''),
      'Stato', case when r.annullata then 'ricevuta annullata' else r.stato end,
      'Rimborsato', case when r.rimborsato > 0 then euro_it(r.rimborsato) else '' end
    ) order by r.quando, r.numero), '[]'::json) into v
    from righe r left join allievi a on a.id = r.allievo_id left join account ac on ac.id = coalesce(r.account_id, a.account_id);
  return v;
end $$;

revoke execute on function esporta_clienti(uuid) from public, anon;
revoke execute on function esporta_abbonamenti(uuid) from public, anon;
revoke execute on function esporta_prenotazioni(uuid, date, date) from public, anon;
revoke execute on function esporta_pagamenti(uuid, date, date) from public, anon;
grant execute on function esporta_clienti(uuid) to authenticated;
grant execute on function esporta_abbonamenti(uuid) to authenticated;
grant execute on function esporta_prenotazioni(uuid, date, date) to authenticated;
grant execute on function esporta_pagamenti(uuid, date, date) to authenticated;
