-- =====================================================================
-- RMHouse — 025 RICEVUTE NON FISCALI
-- Per le quote e gli abbonamenti si emette una ricevuta non fiscale con
-- IVA a 0. Le fatture continua a farle il commercialista: qui restano
-- solo i dati pronti da girargli.
-- Da eseguire dopo 001…024.
-- =====================================================================

create table if not exists ricevute (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  numero        int not null,
  anno          int not null,
  data          date not null default current_date,
  pagamento_id  uuid references pagamenti(id) on delete set null,
  account_id    uuid references account(id) on delete set null,
  allievo_id    uuid references allievi(id) on delete set null,
  -- i dati di chi riceve si congelano: se domani cambia indirizzo,
  -- la ricevuta già emessa non deve cambiare
  intestatario  text not null,
  codice_fiscale text,
  indirizzo     text,
  descrizione   text not null,
  importo_cent  int not null,
  iva_cent      int not null default 0,
  aliquota      text not null default 'esente',
  metodo        text,
  note          text,
  annullata     boolean not null default false,
  motivo_annullo text,
  created_at    timestamptz not null default now(),
  unique (palestra_id, anno, numero)
);
create index if not exists ricevute_data on ricevute (palestra_id, data desc);

alter table ricevute enable row level security;
drop policy if exists gestione_tutto on ricevute;
create policy gestione_tutto on ricevute for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists cliente_legge on ricevute;
create policy cliente_legge on ricevute for select to authenticated
  using (account_id in (select miei_account()));

-- La dicitura che va stampata sotto l'importo, modificabile dalla scuola
alter table palestre add column if not exists dicitura_ricevuta text
  default 'Documento non fiscale. Operazione esente da IVA. La fattura, se richiesta, viene emessa separatamente.';
alter table palestre add column if not exists dati_fiscali text;   -- ragione sociale, P.IVA, CF, sede

-- ---------------------------------------------------------------------
-- EMETTERE UNA RICEVUTA
--    La numerazione riparte da 1 ogni anno ed è senza buchi.
-- ---------------------------------------------------------------------
create or replace function emetti_ricevuta(p_pagamento uuid, p_data date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pg pagamenti; v_num int; v_anno int; v_id uuid; acc account; v_allievo uuid;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
  if pg.stato <> 'pagato' then raise exception 'pagamento_non_incassato'; end if;
  if exists (select 1 from ricevute r where r.pagamento_id = p_pagamento and not r.annullata) then
    raise exception 'ricevuta_gia_emessa';
  end if;

  v_anno := extract(year from coalesce(p_data, current_date))::int;

  -- numero progressivo per anno, al riparo da due emissioni in contemporanea
  perform pg_advisory_xact_lock(hashtext(pg.palestra_id::text || v_anno::text));
  select coalesce(max(numero), 0) + 1 into v_num
    from ricevute where palestra_id = pg.palestra_id and anno = v_anno;

  select * into acc from account where id = pg.account_id;
  select id into v_allievo from allievi where account_id = acc.id order by created_at limit 1;

  insert into ricevute (palestra_id, numero, anno, data, pagamento_id, account_id, allievo_id,
                        intestatario, codice_fiscale, indirizzo, descrizione, importo_cent,
                        metodo, note)
  values (pg.palestra_id, v_num, v_anno, coalesce(p_data, current_date), p_pagamento, acc.id, v_allievo,
          coalesce(trim(acc.nome || ' ' || coalesce(acc.cognome, '')), 'Cliente'),
          acc.codice_fiscale,
          nullif(concat_ws(', ', acc.indirizzo, nullif(concat_ws(' ', acc.cap, acc.citta), ''), acc.provincia), ''),
          pg.descrizione, pg.importo_cent, pg.metodo, nullif(trim(p_note), ''))
  returning id into v_id;

  return v_id;
end $$;

-- Annullare una ricevuta: il numero resta occupato, com'è giusto
create or replace function annulla_ricevuta(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare r ricevute;
begin
  select * into r from ricevute where id = p_id;
  if not found then raise exception 'ricevuta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'motivo_mancante'; end if;

  update ricevute set annullata = true, motivo_annullo = trim(p_motivo) where id = p_id;
end $$;

-- Emettere in blocco: tutti gli incassi del periodo che non ce l'hanno
create or replace function ricevute_mancanti(p_palestra uuid, p_dal date, p_al date)
returns table (pagamento_id uuid, data date, descrizione text, importo_cent int,
               metodo text, cliente text, causale text)
language sql stable security invoker as $$
  select pg.id, coalesce(pg.pagato_at::date, pg.created_at::date), pg.descrizione, pg.importo_cent,
         pg.metodo, coalesce(acc.nome || ' ' || coalesce(acc.cognome, ''), '—'), pg.causale
  from pagamenti pg
  left join account acc on acc.id = pg.account_id
  where pg.palestra_id = p_palestra and pg.stato = 'pagato'
    and coalesce(pg.pagato_at::date, pg.created_at::date) between p_dal and p_al
    and not exists (select 1 from ricevute r where r.pagamento_id = pg.id and not r.annullata)
  order by 2, pg.created_at;
$$;

create or replace function emetti_ricevute_blocco(p_pagamenti uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int := 0; saltati jsonb := '[]'::jsonb;
begin
  foreach v_id in array coalesce(p_pagamenti, '{}') loop
    begin
      perform emetti_ricevuta(v_id);
      n := n + 1;
    exception when others then
      saltati := saltati || jsonb_build_object('pagamento_id', v_id, 'motivo', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('emesse', n, 'saltate', saltati);
end $$;

grant execute on function emetti_ricevuta(uuid, date, text) to authenticated;
grant execute on function annulla_ricevuta(uuid, text) to authenticated;
grant execute on function ricevute_mancanti(uuid, date, date) to authenticated;
grant execute on function emetti_ricevute_blocco(uuid[]) to authenticated;

-- Il riepilogo che si gira al commercialista
create or replace function riepilogo_ricevute(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'quante', count(*) filter (where not annullata),
    'annullate', count(*) filter (where annullata),
    'totale_cent', coalesce(sum(importo_cent) filter (where not annullata), 0),
    'dal_numero', min(numero) filter (where not annullata),
    'al_numero', max(numero) filter (where not annullata),
    'per_metodo', coalesce((
      select jsonb_object_agg(coalesce(metodo, 'non indicato'), tot)
      from (select metodo, sum(importo_cent) as tot from ricevute
             where palestra_id = p_palestra and data between p_dal and p_al and not annullata
             group by metodo) m), '{}'::jsonb)
  )
  from ricevute where palestra_id = p_palestra and data between p_dal and p_al;
$$;

grant execute on function riepilogo_ricevute(uuid, date, date) to authenticated;
