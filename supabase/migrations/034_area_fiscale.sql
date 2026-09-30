-- =====================================================================
-- RMHouse — 034 AREA FISCALE
--
-- 1. Correzioni agli incassi: metodi "online", "altro", "assegno" ammessi
--    (prima il modulo li offriva ma il database li rifiutava) e incassi
--    anche senza una persona (una vendita al banco, un contributo).
--    L'incasso ricorda anche per quale allievo è.
-- 2. Aliquote e regimi IVA: un elenco modificabile. Ogni abbonamento e voce
--    a listino può avere la sua; i documenti la riportano.
-- 3. Numerazioni separate per tipo di documento (ricevute non fiscali, note
--    di credito, e quelle che servissero in futuro): ognuna riparte da 1
--    ogni anno, senza buchi.
-- 4. Note di credito: rimborsi totali o parziali legati alla ricevuta.
-- 5. Rate: un importo diviso in più scadenze, con incasso rata per rata.
-- 6. Scadenze: le rate da pagare entrano nella pagina Scadenze.
-- 7. Rendiconto staff su un periodo libero.
-- 8. Estrazioni per il commercialista: documenti, corrispettivi per giorno
--    e aliquota, registro acquisti, incassi, compensi.
-- 9. Attestati per la detrazione delle spese sportive dei ragazzi 5-18.
-- Non cambia gli importi già registrati. Si può rieseguire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Incassi
-- ---------------------------------------------------------------------
alter table pagamenti drop constraint if exists pagamenti_metodo_check;
alter table pagamenti add constraint pagamenti_metodo_check
  check (metodo in ('stripe', 'online', 'contanti', 'pos', 'bonifico', 'assegno', 'altro'));
alter table pagamenti alter column account_id drop not null;
alter table pagamenti add column if not exists allievo_id uuid references allievi(id) on delete set null;
alter table pagamenti add column if not exists rata_id uuid;

create or replace function registra_incasso(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pal uuid := (p->>'palestra_id')::uuid; v_id uuid; v_importo int; v_acc uuid; v_all uuid;
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  v_importo := coalesce((p->>'importo_cent')::int, 0);
  if v_importo <= 0 then raise exception 'importo_non_valido'; end if;
  v_all := nullif(p->>'allievo_id', '')::uuid;
  v_acc := coalesce(nullif(p->>'account_id', '')::uuid, (select account_id from allievi where id = v_all));

  insert into pagamenti (palestra_id, account_id, allievo_id, corso_id, causale, descrizione, importo_cent,
                         metodo, stato, pagato_at)
  values (v_pal, v_acc, v_all, nullif(p->>'corso_id', '')::uuid,
          coalesce(nullif(p->>'causale', ''), 'altro'),
          coalesce(nullif(trim(p->>'descrizione'), ''), 'Incasso'),
          v_importo,
          coalesce(nullif(p->>'metodo', ''), 'contanti'),
          (case when coalesce((p->>'incassato')::boolean, true) then 'pagato' else 'in_attesa' end)::stato_pagamento,
          case when coalesce((p->>'incassato')::boolean, true) then now() end)
  returning id into v_id;

  if p->>'causale' = 'quota_iscrizione' and v_all is not null then
    insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, pagamento_id, data)
    select v_pal, v_all, stagione_di(current_date, coalesce(pa.mese_inizio_stagione, 9)), v_importo, v_id, current_date
    from palestre pa where pa.id = v_pal
    on conflict do nothing;
  end if;
  return v_id;
end $$;
grant execute on function registra_incasso(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Aliquote e regimi IVA
-- ---------------------------------------------------------------------
create table if not exists aliquote_iva (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  nome          text not null,
  percentuale   numeric(5, 2) not null default 0 check (percentuale >= 0 and percentuale < 100),
  natura        text,                      -- codice per la fattura elettronica quando l'IVA è 0 (N1…N7)
  riferimento   text,                      -- la norma, stampata sul documento
  predefinita   boolean not null default false,
  attiva        boolean not null default true,
  ordine        int not null default 0,
  unique (palestra_id, nome)
);
alter table aliquote_iva enable row level security;
drop policy if exists staff_legge on aliquote_iva;
create policy staff_legge on aliquote_iva for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on aliquote_iva;
create policy gestione_scrive on aliquote_iva for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

alter table tipi_abbonamento add column if not exists aliquota_id uuid references aliquote_iva(id) on delete set null;
alter table voci_listino add column if not exists aliquota_id uuid references aliquote_iva(id) on delete set null;

insert into aliquote_iva (palestra_id, nome, percentuale, natura, riferimento, predefinita, ordine)
select p.id, x.nome, x.perc, x.natura, x.rif, x.pred, x.ordine
from palestre p cross join (values
  ('Esente IVA', 0::numeric, 'N4', 'Operazione esente da IVA', true, 1),
  ('Non soggetta IVA (corrispettivi specifici)', 0, 'N2.2', 'Operazione non soggetta a IVA', false, 2),
  ('IVA 22%', 22, null, null, false, 3),
  ('IVA 10%', 10, null, null, false, 4)
) as x(nome, perc, natura, rif, pred, ordine)
on conflict (palestra_id, nome) do nothing;

-- ---------------------------------------------------------------------
-- 3. Numerazioni e documenti
-- ---------------------------------------------------------------------
create table if not exists numerazioni (
  id              uuid primary key default gen_random_uuid(),
  palestra_id     uuid not null references palestre(id) on delete cascade,
  codice          text not null,              -- breve, stampato accanto al numero: RNF, NC…
  nome            text not null,
  tipo_documento  text not null check (tipo_documento in ('ricevuta', 'nota_credito')),
  predefinita     boolean not null default false,
  attiva          boolean not null default true,
  unique (palestra_id, codice)
);
alter table numerazioni enable row level security;
drop policy if exists staff_legge on numerazioni;
create policy staff_legge on numerazioni for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on numerazioni;
create policy gestione_scrive on numerazioni for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

insert into numerazioni (palestra_id, codice, nome, tipo_documento, predefinita)
select p.id, x.codice, x.nome, x.tipo, true
from palestre p cross join (values
  ('RNF', 'Ricevute non fiscali', 'ricevuta'),
  ('NC', 'Note di credito', 'nota_credito')
) as x(codice, nome, tipo)
on conflict (palestra_id, codice) do nothing;

alter table ricevute add column if not exists numerazione_id uuid references numerazioni(id);
alter table ricevute add column if not exists tipo_documento text not null default 'ricevuta'
  check (tipo_documento in ('ricevuta', 'nota_credito'));
alter table ricevute add column if not exists riferimento_id uuid references ricevute(id);
alter table ricevute add column if not exists aliquota_id uuid references aliquote_iva(id) on delete set null;
alter table ricevute add column if not exists natura text;

update ricevute r set numerazione_id = n.id
  from numerazioni n where n.palestra_id = r.palestra_id and n.codice = 'RNF' and r.numerazione_id is null;
alter table ricevute drop constraint if exists ricevute_palestra_id_anno_numero_key;
create unique index if not exists ricevute_numero_unico on ricevute (palestra_id, numerazione_id, anno, numero);

-- L'aliquota di un incasso: quella dell'abbonamento pagato, altrimenti la predefinita
create or replace function aliquota_di_pagamento(p_pagamento uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.aliquota_id from iscrizioni i join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
      where i.pagamento_id = p_pagamento and t.aliquota_id is not null limit 1),
    (select a.id from aliquote_iva a join pagamenti pg on pg.palestra_id = a.palestra_id
      where pg.id = p_pagamento and a.predefinita and a.attiva limit 1));
$$;

-- Numero successivo di una numerazione, senza buchi anche con due emissioni insieme
create or replace function prossimo_numero(p_numerazione uuid, p_anno int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  perform pg_advisory_xact_lock(hashtext(p_numerazione::text || p_anno::text));
  select coalesce(max(numero), 0) + 1 into v from ricevute where numerazione_id = p_numerazione and anno = p_anno;
  return v;
end $$;

create or replace function emetti_ricevuta(p_pagamento uuid, p_data date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pg pagamenti; v_num int; v_anno int; v_id uuid; acc account; v_allievo uuid; v_numerazione uuid;
        al aliquote_iva; v_imponibile int; v_iva int;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
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

-- Nota di credito: rimborso totale o parziale di una ricevuta
create or replace function emetti_nota_credito(p_ricevuta uuid, p_importo_cent int, p_motivo text, p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare r ricevute; v_num int; v_anno int; v_id uuid; v_numerazione uuid; v_gia int; v_tot int;
        v_imponibile int; v_iva int; v_perc numeric;
begin
  select * into r from ricevute where id = p_ricevuta;
  if not found or r.tipo_documento <> 'ricevuta' then raise exception 'ricevuta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if r.annullata then raise exception 'ricevuta_annullata'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'motivo_mancante'; end if;

  v_tot := r.importo_cent + r.iva_cent;
  select coalesce(sum(importo_cent + iva_cent), 0) into v_gia from ricevute
   where riferimento_id = r.id and tipo_documento = 'nota_credito' and not annullata;
  if p_importo_cent is null or p_importo_cent <= 0 or p_importo_cent > v_tot - v_gia then
    raise exception 'importo_non_valido';
  end if;

  select id into v_numerazione from numerazioni
   where palestra_id = r.palestra_id and tipo_documento = 'nota_credito' and predefinita and attiva limit 1;
  if v_numerazione is null then raise exception 'numerazione_mancante'; end if;
  v_anno := extract(year from coalesce(p_data, current_date))::int;
  v_num := prossimo_numero(v_numerazione, v_anno);

  v_perc := coalesce((select percentuale from aliquote_iva where id = r.aliquota_id), 0);
  v_imponibile := round(p_importo_cent / (1 + v_perc / 100.0));
  v_iva := p_importo_cent - v_imponibile;

  insert into ricevute (palestra_id, numerazione_id, tipo_documento, riferimento_id, numero, anno, data,
                        pagamento_id, account_id, allievo_id, intestatario, codice_fiscale, indirizzo,
                        descrizione, importo_cent, iva_cent, aliquota, aliquota_id, natura, metodo, note)
  values (r.palestra_id, v_numerazione, 'nota_credito', r.id, v_num, v_anno, coalesce(p_data, current_date),
          r.pagamento_id, r.account_id, r.allievo_id, r.intestatario, r.codice_fiscale, r.indirizzo,
          'Rimborso relativo alla ricevuta n. ' || r.numero || '/' || r.anno || ': ' || trim(p_motivo),
          v_imponibile, v_iva, r.aliquota, r.aliquota_id, r.natura, r.metodo, null)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function emetti_ricevuta(uuid, date, text) to authenticated;
grant execute on function emetti_nota_credito(uuid, int, text, date) to authenticated;

-- Riepilogo: le note di credito si sottraggono
create or replace function riepilogo_ricevute(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'quante', count(*) filter (where not annullata and tipo_documento = 'ricevuta'),
    'note_credito', count(*) filter (where not annullata and tipo_documento = 'nota_credito'),
    'annullate', count(*) filter (where annullata),
    'totale_cent', coalesce(sum(case when tipo_documento = 'nota_credito' then -(importo_cent + iva_cent)
                                     else importo_cent + iva_cent end) filter (where not annullata), 0),
    'rimborsi_cent', coalesce(sum(importo_cent + iva_cent) filter (where not annullata and tipo_documento = 'nota_credito'), 0),
    'dal_numero', min(numero) filter (where not annullata and tipo_documento = 'ricevuta'),
    'al_numero', max(numero) filter (where not annullata and tipo_documento = 'ricevuta'),
    'per_metodo', coalesce((
      select jsonb_object_agg(coalesce(metodo, 'non indicato'), tot)
      from (select metodo, sum(case when tipo_documento = 'nota_credito' then -(importo_cent + iva_cent)
                                    else importo_cent + iva_cent end) as tot
              from ricevute where palestra_id = p_palestra and data between p_dal and p_al and not annullata
             group by metodo) m), '{}'::jsonb)
  )
  from ricevute where palestra_id = p_palestra and data between p_dal and p_al;
$$;

-- Una sola predefinita: quando se ne sceglie una, le altre smettono di esserlo
create or replace function trg_una_predefinita()
returns trigger language plpgsql as $$
begin
  if new.predefinita then
    if tg_table_name = 'aliquote_iva' then
      update aliquote_iva set predefinita = false where palestra_id = new.palestra_id and id <> new.id and predefinita;
    else
      update numerazioni set predefinita = false
       where palestra_id = new.palestra_id and tipo_documento = new.tipo_documento and id <> new.id and predefinita;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists una_predefinita on aliquote_iva;
create trigger una_predefinita after insert or update of predefinita on aliquote_iva
  for each row when (new.predefinita) execute function trg_una_predefinita();
drop trigger if exists una_predefinita on numerazioni;
create trigger una_predefinita after insert or update of predefinita, tipo_documento on numerazioni
  for each row when (new.predefinita) execute function trg_una_predefinita();

-- ---------------------------------------------------------------------
-- 5. Rate
-- ---------------------------------------------------------------------
create table if not exists rate (
  id             uuid primary key default gen_random_uuid(),
  palestra_id    uuid not null references palestre(id) on delete cascade,
  piano          uuid not null,                    -- le rate dello stesso piano
  account_id     uuid references account(id) on delete set null,
  allievo_id     uuid references allievi(id) on delete set null,
  iscrizione_id  uuid references iscrizioni(id) on delete set null,
  descrizione    text not null,
  numero         int not null,
  di             int not null,
  importo_cent   int not null check (importo_cent > 0),
  scadenza       date not null,
  stato          text not null default 'da_pagare' check (stato in ('da_pagare', 'pagata', 'annullata')),
  pagamento_id   uuid references pagamenti(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists rate_scadenza on rate (palestra_id, stato, scadenza);
alter table rate enable row level security;
drop policy if exists gestione_tutto on rate;
create policy gestione_tutto on rate for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists cliente_legge on rate;
create policy cliente_legge on rate for select to authenticated using (account_id in (select miei_account()));

create or replace function crea_piano_rate(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pal uuid := (p->>'palestra_id')::uuid; v_piano uuid := gen_random_uuid();
        v_tot int := (p->>'totale_cent')::int; v_n int := greatest(coalesce((p->>'rate')::int, 2), 1);
        v_ogni int := greatest(coalesce((p->>'ogni_mesi')::int, 1), 1); v_prima date := (p->>'prima_scadenza')::date;
        v_all uuid := nullif(p->>'allievo_id', '')::uuid; v_acc uuid; v_quota int; i int;
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if v_tot is null or v_tot <= 0 then raise exception 'importo_non_valido'; end if;
  if v_prima is null then raise exception 'scadenza_mancante'; end if;
  v_acc := coalesce(nullif(p->>'account_id', '')::uuid, (select account_id from allievi where id = v_all));
  v_quota := floor(v_tot / v_n);
  for i in 1..v_n loop
    insert into rate (palestra_id, piano, account_id, allievo_id, iscrizione_id, descrizione, numero, di, importo_cent, scadenza)
    values (v_pal, v_piano, v_acc, v_all, nullif(p->>'iscrizione_id', '')::uuid,
            coalesce(nullif(trim(p->>'descrizione'), ''), 'Rate'), i, v_n,
            case when i = v_n then v_tot - v_quota * (v_n - 1) else v_quota end,
            (v_prima + make_interval(months => v_ogni * (i - 1)))::date);
  end loop;
  return v_piano;
end $$;

create or replace function incassa_rata(p_rata uuid, p_metodo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r rate; v_pag uuid;
begin
  select * into r from rate where id = p_rata;
  if not found then raise exception 'rata_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if r.stato <> 'da_pagare' then raise exception 'rata_non_da_pagare'; end if;
  insert into pagamenti (palestra_id, account_id, allievo_id, causale, descrizione, importo_cent, metodo, stato, pagato_at, rata_id)
  values (r.palestra_id, r.account_id, r.allievo_id,
          case when r.iscrizione_id is not null then 'abbonamento' else 'altro' end,
          r.descrizione || ' · rata ' || r.numero || ' di ' || r.di, r.importo_cent,
          coalesce(nullif(p_metodo, ''), 'contanti'), 'pagato', now(), r.id)
  returning id into v_pag;
  update rate set stato = 'pagata', pagamento_id = v_pag where id = r.id;
  if r.iscrizione_id is not null then
    update iscrizioni set pagamento_id = coalesce(pagamento_id, v_pag) where id = r.iscrizione_id;
  end if;
  return v_pag;
end $$;
grant execute on function crea_piano_rate(jsonb) to authenticated;
grant execute on function incassa_rata(uuid, text) to authenticated;

create or replace view v_rate with (security_invoker = true) as
  select r.*, r.scadenza - current_date as giorni,
         (r.stato = 'da_pagare' and r.scadenza < current_date) as scaduta,
         acc.nome as titolare_nome, acc.cognome as titolare_cognome, acc.email, acc.telefono,
         a.nome as allievo_nome, a.cognome as allievo_cognome
  from rate r
  left join account acc on acc.id = r.account_id
  left join allievi a on a.id = r.allievo_id;

-- ---------------------------------------------------------------------
-- 6. Scadenze: anche le rate
-- ---------------------------------------------------------------------
drop view if exists v_scadenze;
create view v_scadenze with (security_invoker = true) as
with voci as (
  select i.palestra_id, 'abbonamento'::text as tipo, i.allievo_id, i.id::text as riferimento,
         i.data_fine as data, t.nome || ' · ' || c.nome as dettaglio, t.prezzo_cent as importo_cent
  from iscrizioni i
  join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
  join corsi c on c.id = i.corso_id
  where i.stato in ('attiva', 'scaduta')
    and i.data_fine between current_date - 30 and current_date + 30
    and not exists (select 1 from iscrizioni n where n.allievo_id = i.allievo_id and n.id <> i.id
                      and n.stato in ('attiva', 'sospesa') and n.data_fine > i.data_fine)
  union all
  select i.palestra_id, 'ingressi', i.allievo_id, i.id::text || ':' || i.ingressi_residui,
         i.data_fine, t.nome || ' · restano ' || i.ingressi_residui || ' ingressi', t.prezzo_cent
  from iscrizioni i
  join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
  join palestre p on p.id = i.palestra_id
  where i.stato = 'attiva' and i.data_fine >= current_date and t.modalita = 'ingressi'
    and i.ingressi_residui <= soglia(p.soglie, 'esaurimento_ingressi')
  union all
  select a.palestra_id, 'certificato', a.id, 'cert:' || coalesce(a.certificato_scadenza::text, 'mancante'),
         a.certificato_scadenza,
         case when a.certificato_scadenza is null then 'Certificato mancante'
              when a.certificato_scadenza < current_date then 'Certificato scaduto'
              else 'Certificato in scadenza' end, null
  from allievi a
  where exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva' and i.data_fine >= current_date)
    and (a.certificato_scadenza is null or a.certificato_scadenza <= current_date + 30)
  union all
  select a.palestra_id, 'quota', a.id, 'quota:' || stagione_di(current_date, p.mese_inizio_stagione),
         null::date, 'Quota ' || stagione_di(current_date, p.mese_inizio_stagione) || '/'
                     || (stagione_di(current_date, p.mese_inizio_stagione) + 1 - 2000), p.quota_iscrizione_cent
  from allievi a join palestre p on p.id = a.palestra_id
  where p.quota_iscrizione_cent > 0
    and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva' and i.data_fine >= current_date)
    and not exists (select 1 from quote_iscrizione q where q.allievo_id = a.id
                      and (q.stagione = stagione_di(current_date, p.mese_inizio_stagione) or q.data > current_date - 365))
  union all
  select r.palestra_id, 'rata', coalesce(r.allievo_id, (select id from allievi x where x.account_id = r.account_id order by created_at limit 1)),
         r.id::text, r.scadenza, r.descrizione || ' · rata ' || r.numero || ' di ' || r.di, r.importo_cent
  from rate r
  where r.stato = 'da_pagare' and r.scadenza <= current_date + 30
)
select v.palestra_id, v.tipo, v.allievo_id, v.riferimento, v.data,
       case when v.data is null then null else v.data - current_date end as giorni,
       v.dettaglio, v.importo_cent,
       a.nome, a.cognome, acc.nome as titolare_nome, acc.cognome as titolare_cognome, acc.email, acc.telefono,
       a.is_titolare, g.id is not null as gestito, g.nota as nota_gestione, g.gestito_at
from voci v
join allievi a on a.id = v.allievo_id
join account acc on acc.id = a.account_id
left join scadenze_gestite g on g.allievo_id = v.allievo_id and g.tipo = v.tipo and g.riferimento = v.riferimento;

-- ---------------------------------------------------------------------
-- 7. Rendiconto staff
-- ---------------------------------------------------------------------
create or replace function rendiconto_staff(p_palestra uuid, p_dal date, p_al date)
returns table (staff_id uuid, nome text, cognome text, foto_url text, lezioni bigint, minuti bigint,
               presenze bigint, clienti bigint, tariffa_cent int, compenso_cent bigint)
language sql stable security invoker set search_path = public as $$
  select s.id, s.nome, s.cognome, s.foto_url,
         count(distinct l.id),
         coalesce(sum(extract(epoch from (l.fine - l.inizio)) / 60), 0)::bigint,
         (select count(*) from presenze ps join lezioni l2 on l2.id = ps.lezione_id
           where l2.insegnante_id = s.id and ps.presente and l2.data between p_dal and p_al),
         (select count(distinct ps.allievo_id) from presenze ps join lezioni l2 on l2.id = ps.lezione_id
           where l2.insegnante_id = s.id and ps.presente and l2.data between p_dal and p_al),
         s.compenso_ora_cent,
         round(coalesce(sum(extract(epoch from (l.fine - l.inizio)) / 3600), 0) * coalesce(s.compenso_ora_cent, 0))::bigint
  from staff s
  join lezioni l on l.insegnante_id = s.id and l.stato = 'programmata' and l.data between p_dal and p_al
  where s.palestra_id = p_palestra
  group by s.id
  order by 6 desc;
$$;
grant execute on function rendiconto_staff(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Estrazioni per il commercialista
-- ---------------------------------------------------------------------
create or replace function registro_documenti(p_palestra uuid, p_dal date, p_al date)
returns table (data date, tipo text, sezionale text, numero text, intestatario text, codice_fiscale text,
               descrizione text, imponibile_cent int, iva_cent int, totale_cent int, aliquota text, natura text,
               metodo text, annullata boolean, riferimento text)
language sql stable security invoker set search_path = public as $$
  select r.data, case r.tipo_documento when 'nota_credito' then 'Nota di credito' else 'Ricevuta' end,
         n.codice, r.numero || '/' || r.anno, r.intestatario, r.codice_fiscale, r.descrizione,
         case when r.tipo_documento = 'nota_credito' then -r.importo_cent else r.importo_cent end,
         case when r.tipo_documento = 'nota_credito' then -r.iva_cent else r.iva_cent end,
         case when r.tipo_documento = 'nota_credito' then -(r.importo_cent + r.iva_cent) else r.importo_cent + r.iva_cent end,
         r.aliquota, r.natura, r.metodo, r.annullata,
         (select rr.numero || '/' || rr.anno from ricevute rr where rr.id = r.riferimento_id)
  from ricevute r left join numerazioni n on n.id = r.numerazione_id
  where r.palestra_id = p_palestra and r.data between p_dal and p_al
  order by r.data, n.codice, r.anno, r.numero;
$$;

create or replace function corrispettivi_giornalieri(p_palestra uuid, p_dal date, p_al date)
returns table (data date, aliquota text, natura text, documenti bigint, imponibile_cent bigint, iva_cent bigint,
               totale_cent bigint, contanti_cent bigint, elettronici_cent bigint)
language sql stable security invoker set search_path = public as $$
  select r.data, r.aliquota, r.natura, count(*),
         sum(case when r.tipo_documento = 'nota_credito' then -r.importo_cent else r.importo_cent end),
         sum(case when r.tipo_documento = 'nota_credito' then -r.iva_cent else r.iva_cent end),
         sum(case when r.tipo_documento = 'nota_credito' then -(r.importo_cent + r.iva_cent) else r.importo_cent + r.iva_cent end),
         sum(case when r.metodo = 'contanti' then (case when r.tipo_documento = 'nota_credito' then -1 else 1 end) * (r.importo_cent + r.iva_cent) else 0 end),
         sum(case when coalesce(r.metodo, '') <> 'contanti' then (case when r.tipo_documento = 'nota_credito' then -1 else 1 end) * (r.importo_cent + r.iva_cent) else 0 end)
  from ricevute r
  where r.palestra_id = p_palestra and r.data between p_dal and p_al and not r.annullata
  group by r.data, r.aliquota, r.natura
  order by r.data, r.aliquota;
$$;

create or replace function registro_acquisti(p_palestra uuid, p_dal date, p_al date)
returns table (data date, numero text, fornitore text, piva text, codice_fiscale text, tipo_documento text,
               imponibile_cent int, iva_cent int, totale_cent int, scadenza date, stato text)
language sql stable security invoker set search_path = public as $$
  select f.data, f.numero, f.controparte, f.piva, f.codice_fiscale, f.tipo_documento,
         f.imponibile_cent, f.iva_cent, f.totale_cent, f.scadenza, f.stato
  from fatture f
  where f.palestra_id = p_palestra and f.tipo = 'passiva' and f.data between p_dal and p_al and f.stato <> 'ignorata'
  order by f.data, f.numero;
$$;

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
    'compensi_cent', (select coalesce(sum(totale_cent), 0) from compensi where palestra_id = p_palestra
                        and make_date(anno, mese, 1) between date_trunc('month', p_dal)::date and p_al)
  );
$$;
grant execute on function registro_documenti(uuid, date, date) to authenticated;
grant execute on function corrispettivi_giornalieri(uuid, date, date) to authenticated;
grant execute on function registro_acquisti(uuid, date, date) to authenticated;
grant execute on function riepilogo_fiscale(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Detrazione spese sportive dei ragazzi 5-18 anni
-- ---------------------------------------------------------------------
create or replace function versamenti_ragazzi(p_palestra uuid, p_anno int, p_storico boolean default true)
returns table (allievo_id uuid, nome text, cognome text, codice_fiscale text, data_nascita date,
               pagante text, pagante_cf text, totale_cent bigint, voci jsonb)
language sql stable security invoker set search_path = public as $$
  with v as (
    -- incassi fatti con RMHouse, ricondotti all'allievo
    select coalesce(pg.allievo_id,
                    (select i.allievo_id from iscrizioni i where i.pagamento_id = pg.id limit 1),
                    (select q.allievo_id from quote_iscrizione q where q.pagamento_id = pg.id limit 1),
                    (select a.id from allievi a where a.account_id = pg.account_id
                       and (select count(*) from allievi a2 where a2.account_id = pg.account_id) = 1)) as allievo_id,
           pg.pagato_at::date as data, pg.descrizione, pg.importo_cent as importo
    from pagamenti pg
    where pg.palestra_id = p_palestra and pg.stato = 'pagato'
      and extract(year from pg.pagato_at) = p_anno
      and pg.causale in ('abbonamento', 'quota_iscrizione', 'prova')
    union all
    -- abbonamenti venduti con APP Palestre (se richiesto)
    select st.allievo_id, st.dal, st.abbonamento, st.valore_cent
    from storico_abbonamenti st
    where p_storico and st.palestra_id = p_palestra and st.iscrizione_id is null
      and extract(year from st.dal) = p_anno and coalesce(st.valore_cent, 0) > 0
  )
  select a.id, a.nome, a.cognome, a.codice_fiscale, a.data_nascita,
         case when a.is_titolare then trim(a.nome || ' ' || a.cognome) else trim(acc.nome || ' ' || coalesce(acc.cognome, '')) end,
         case when a.is_titolare then a.codice_fiscale else acc.codice_fiscale end,
         sum(v.importo),
         jsonb_agg(jsonb_build_object('data', v.data, 'descrizione', v.descrizione, 'importo_cent', v.importo) order by v.data)
  from v
  join allievi a on a.id = v.allievo_id
  join account acc on acc.id = a.account_id
  where a.data_nascita is not null
    and extract(year from a.data_nascita) between p_anno - 18 and p_anno - 5
  group by a.id, acc.id
  order by a.cognome, a.nome;
$$;
grant execute on function versamenti_ragazzi(uuid, int, boolean) to authenticated;

select 'aliquote' as cosa, count(*) from aliquote_iva
union all select 'numerazioni', count(*) from numerazioni
union all select 'ricevute senza numerazione', count(*) from ricevute where numerazione_id is null;
