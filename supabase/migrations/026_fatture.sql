-- =====================================================================
-- RMHouse — 026 FATTURE ELETTRONICHE
-- Il registro delle fatture che passano dallo SDI: quelle dei fornitori
-- (passive) e quelle emesse (attive). Ogni fattura passiva diventa una
-- riga di spesa, che a sua volta si abbina al movimento bancario.
-- Da eseguire dopo 001…025.
-- =====================================================================

create table if not exists fatture (
  id              uuid primary key default gen_random_uuid(),
  palestra_id     uuid not null references palestre(id) on delete cascade,
  tipo            text not null check (tipo in ('passiva', 'attiva')),
  numero          text not null,
  data            date not null,
  -- controparte: fornitore se passiva, cliente se attiva
  controparte     text not null,
  piva            text,
  codice_fiscale  text,
  fornitore_id    uuid references fornitori(id) on delete set null,
  account_id      uuid references account(id) on delete set null,
  imponibile_cent int not null default 0,
  iva_cent        int not null default 0,
  totale_cent     int not null default 0,
  valuta          text not null default 'EUR',
  scadenza        date,
  tipo_documento  text,                      -- TD01, TD24…
  identificativo_sdi text,
  xml_url         text,                      -- copia del file, se caricata
  stato           text not null default 'da_registrare'
                  check (stato in ('da_registrare', 'registrata', 'pagata', 'ignorata')),
  spesa_id        uuid references spese(id) on delete set null,
  note            text,
  impronta        text not null,
  created_at      timestamptz not null default now(),
  unique (palestra_id, impronta)
);
create index if not exists fatture_data on fatture (palestra_id, tipo, data desc);

create table if not exists fatture_righe (
  id           uuid primary key default gen_random_uuid(),
  fattura_id   uuid not null references fatture(id) on delete cascade,
  descrizione  text not null,
  quantita     numeric(12, 3),
  prezzo_cent  int,
  totale_cent  int not null default 0,
  aliquota     numeric(5, 2)
);

alter table fatture enable row level security;
alter table fatture_righe enable row level security;

drop policy if exists gestione_tutto on fatture;
create policy gestione_tutto on fatture for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

drop policy if exists gestione_tutto on fatture_righe;
create policy gestione_tutto on fatture_righe for all to authenticated
  using (exists (select 1 from fatture f where f.id = fattura_id and is_gestione(f.palestra_id)))
  with check (exists (select 1 from fatture f where f.id = fattura_id and is_gestione(f.palestra_id)));

-- ---------------------------------------------------------------------
-- 1. REGISTRARE UNA FATTURA PASSIVA COME SPESA
--    È il punto in cui la contabilità e il gestionale si toccano.
-- ---------------------------------------------------------------------
create or replace function registra_fattura_spesa(
  p_fattura uuid, p_categoria text default 'altro', p_sala uuid default null,
  p_corso uuid default null, p_pagata boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare f fatture; v_fornitore uuid; v_spesa uuid;
begin
  select * into f from fatture where id = p_fattura;
  if not found then raise exception 'fattura_non_trovata'; end if;
  if not is_gestione(f.palestra_id) then raise exception 'non_autorizzato'; end if;
  if f.tipo <> 'passiva' then raise exception 'non_e_una_fattura_di_acquisto'; end if;
  if f.spesa_id is not null then raise exception 'gia_registrata'; end if;

  -- il fornitore si riusa se esiste già, altrimenti nasce adesso
  v_fornitore := f.fornitore_id;
  if v_fornitore is null then
    select id into v_fornitore from fornitori
     where palestra_id = f.palestra_id and lower(nome) = lower(f.controparte) limit 1;
    if v_fornitore is null then
      insert into fornitori (palestra_id, nome, categoria, note)
      values (f.palestra_id, f.controparte, p_categoria, nullif('P.IVA ' || f.piva, 'P.IVA '))
      returning id into v_fornitore;
    end if;
  end if;

  insert into spese (palestra_id, descrizione, categoria, importo_cent, data,
                     fornitore_id, sala_id, corso_id, periodicita, pagata, note)
  values (f.palestra_id,
          'Fattura ' || f.numero || ' — ' || f.controparte,
          p_categoria, f.totale_cent, f.data, v_fornitore, p_sala, p_corso,
          'una_tantum', p_pagata,
          nullif(concat_ws(' · ',
                   'imponibile ' || to_char(f.imponibile_cent / 100.0, 'FM999G999D00') || ' €',
                   'IVA ' || to_char(f.iva_cent / 100.0, 'FM999G999D00') || ' €',
                   case when f.scadenza is not null
                        then 'scadenza ' || to_char(f.scadenza, 'DD/MM/YYYY') end), ''))
  returning id into v_spesa;

  update fatture
     set spesa_id = v_spesa, fornitore_id = v_fornitore,
         stato = case when p_pagata then 'pagata' else 'registrata' end
   where id = p_fattura;

  return v_spesa;
end $$;

create or replace function ignora_fattura(p_fattura uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update fatture set stato = 'ignorata', note = coalesce(p_nota, note)
   where id = p_fattura and is_gestione(palestra_id);
end $$;

grant execute on function registra_fattura_spesa(uuid, text, uuid, uuid, boolean) to authenticated;
grant execute on function ignora_fattura(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. LA CATENA COMPLETA: fattura → spesa → movimento bancario
-- ---------------------------------------------------------------------
create or replace function quadratura_fatture(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'passive_totale_cent', coalesce(sum(totale_cent) filter (where tipo = 'passiva' and stato <> 'ignorata'), 0),
    'passive_da_registrare', count(*) filter (where tipo = 'passiva' and stato = 'da_registrare'),
    'attive_totale_cent', coalesce(sum(totale_cent) filter (where tipo = 'attiva'), 0),
    'attive_quante', count(*) filter (where tipo = 'attiva'),
    'iva_acquisti_cent', coalesce(sum(iva_cent) filter (where tipo = 'passiva' and stato <> 'ignorata'), 0),
    'iva_vendite_cent', coalesce(sum(iva_cent) filter (where tipo = 'attiva'), 0),
    -- spese registrate da fattura ma senza un movimento in banca che le copra
    'spese_non_pagate_cent', coalesce((
      select sum(s.importo_cent) from spese s
      join fatture f on f.spesa_id = s.id
      where s.palestra_id = p_palestra and s.data between p_dal and p_al and not s.pagata), 0),
    'spese_senza_movimento', coalesce((
      select count(*) from spese s
      join fatture f on f.spesa_id = s.id
      where s.palestra_id = p_palestra and s.data between p_dal and p_al and s.pagata
        and not exists (select 1 from abbinamenti a where a.spesa_id = s.id)), 0)
  )
  from fatture where palestra_id = p_palestra and data between p_dal and p_al;
$$;

-- Movimenti in uscita che potrebbero essere quella fattura
create or replace function proposte_uscita(p_movimento uuid)
returns table (spesa_id uuid, descrizione text, fornitore text, importo_cent int, data date, punteggio int)
language sql stable security invoker as $$
  select s.id, s.descrizione, fo.nome, s.importo_cent, s.data,
         (case when s.importo_cent = abs(m.importo_cent) then 60 else 0 end
          + case when abs(s.data - m.data) <= 3 then 25 when abs(s.data - m.data) <= 15 then 10 else 0 end
          + case when fo.nome is not null
                  and lower(m.descrizione || ' ' || coalesce(m.controparte, '')) like '%' || lower(split_part(fo.nome, ' ', 1)) || '%'
                 then 30 else 0 end)::int
  from movimenti_banca m
  join spese s on s.palestra_id = m.palestra_id
  left join fornitori fo on fo.id = s.fornitore_id
  where m.id = p_movimento and m.importo_cent < 0
    and not exists (select 1 from abbinamenti a where a.spesa_id = s.id)
    and s.data between m.data - 60 and m.data + 30
  order by 6 desc, abs(s.importo_cent - abs(m.importo_cent))
  limit 10;
$$;

grant execute on function quadratura_fatture(uuid, date, date) to authenticated;
grant execute on function proposte_uscita(uuid) to authenticated;

-- Quando un movimento in uscita viene abbinato a una spesa, la spesa
-- risulta pagata: così non resta in giro come "da pagare".
create or replace function trg_abbinamenti_spesa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.spesa_id is not null then
    update spese set pagata = true where id = new.spesa_id;
    update fatture set stato = 'pagata' where spesa_id = new.spesa_id and stato <> 'ignorata';
  end if;
  return new;
end $$;

drop trigger if exists abbinamenti_spesa on abbinamenti;
create trigger abbinamenti_spesa after insert on abbinamenti
  for each row execute function trg_abbinamenti_spesa();
