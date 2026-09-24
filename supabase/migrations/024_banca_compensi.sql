-- =====================================================================
-- RMHouse — 024 BANCA, CEDOLINI E FLUSSO DI CASSA
-- Tre cose collegate: i movimenti del conto importati da CSV, i compensi
-- degli insegnanti calcolati sulle lezioni fatte, e il flusso di cassa
-- che mette insieme tutto (banca, contanti, uscite).
-- Da eseguire dopo 001…023.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. I CONTI (banca, cassa contanti, POS…)
-- ---------------------------------------------------------------------
create table if not exists conti (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  nome        text not null,
  tipo        text not null default 'banca' check (tipo in ('banca', 'cassa', 'pos', 'altro')),
  iban        text,
  saldo_iniziale_cent int not null default 0,
  attivo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (palestra_id, nome)
);

do $$
declare p record;
begin
  for p in select id from palestre loop
    insert into conti (palestra_id, nome, tipo) select p.id, 'Conto corrente', 'banca'
     where not exists (select 1 from conti c where c.palestra_id = p.id and c.tipo = 'banca');
    insert into conti (palestra_id, nome, tipo) select p.id, 'Cassa contanti', 'cassa'
     where not exists (select 1 from conti c where c.palestra_id = p.id and c.tipo = 'cassa');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. MOVIMENTI DEL CONTO
--    L'impronta evita di importare due volte la stessa riga.
-- ---------------------------------------------------------------------
create table if not exists movimenti_banca (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  conto_id     uuid not null references conti(id) on delete cascade,
  data         date not null,
  valuta       date,
  importo_cent int not null,                    -- positivo = entrata, negativo = uscita
  descrizione  text not null default '',
  controparte  text,
  iban         text,
  impronta     text not null,
  stato        text not null default 'da_verificare'
               check (stato in ('da_verificare', 'abbinato', 'ignorato')),
  note         text,
  created_at   timestamptz not null default now(),
  unique (palestra_id, impronta)
);
create index if not exists movimenti_data on movimenti_banca (palestra_id, data desc);

-- Che cosa c'è dietro un movimento: incassi, spese, compensi
create table if not exists abbinamenti (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  movimento_id  uuid not null references movimenti_banca(id) on delete cascade,
  pagamento_id  uuid references pagamenti(id) on delete cascade,
  spesa_id      uuid references spese(id) on delete cascade,
  compenso_id   uuid,
  importo_cent  int not null,
  automatico    boolean not null default false,
  created_at    timestamptz not null default now(),
  check (pagamento_id is not null or spesa_id is not null or compenso_id is not null)
);
create index if not exists abbinamenti_mov on abbinamenti (movimento_id);
create unique index if not exists abbinamenti_pagamento on abbinamenti (pagamento_id) where pagamento_id is not null;

-- ---------------------------------------------------------------------
-- 3. CEDOLINI DEGLI INSEGNANTI
--    Un foglio per insegnante e per mese: ore fatte, compenso, extra.
-- ---------------------------------------------------------------------
create table if not exists compensi (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  staff_id     uuid not null references staff(id) on delete cascade,
  anno         int not null,
  mese         int not null check (mese between 1 and 12),
  ore          numeric(6, 2) not null default 0,
  tariffa_cent int not null default 0,
  lezioni      int not null default 0,
  extra_cent   int not null default 0,
  extra_nota   text,
  totale_cent  int not null default 0,
  stato        text not null default 'bozza' check (stato in ('bozza', 'approvato', 'pagato')),
  pagato_at    timestamptz,
  metodo       text,
  spesa_id     uuid references spese(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  unique (staff_id, anno, mese)
);
create index if not exists compensi_periodo on compensi (palestra_id, anno, mese);

do $$ declare t text;
begin
  foreach t in array array['conti', 'movimenti_banca', 'abbinamenti', 'compensi'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists gestione_tutto on %I', t);
    execute format('create policy gestione_tutto on %I for all to authenticated using (is_gestione(palestra_id)) with check (is_gestione(palestra_id))', t);
  end loop;
end $$;

-- L'insegnante vede il proprio cedolino
drop policy if exists insegnante_suo on compensi;
create policy insegnante_suo on compensi for select to authenticated
  using (staff_id in (select id from staff where user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 4. CALCOLO DEI COMPENSI DEL MESE
--    Si basa sulle lezioni non annullate e sulla tariffa oraria dello
--    staff. I cedolini già pagati non si toccano.
-- ---------------------------------------------------------------------
create or replace function calcola_compensi(p_palestra uuid, p_anno int, p_mese int)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_dal date; v_al date;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  v_dal := make_date(p_anno, p_mese, 1);
  v_al := (v_dal + interval '1 month - 1 day')::date;

  for r in
    select st.id as staff_id, coalesce(st.compenso_ora_cent, 0) as tariffa,
           round(coalesce(sum(o.ore), 0), 2) as ore,
           count(o.lezione_id)::int as lezioni
    from staff st
    left join v_occupazione o
      on o.insegnante_id = st.id and o.data between v_dal and v_al and o.stato = 'programmata'
    where st.palestra_id = p_palestra and st.attivo and not st.archiviato
    group by st.id, st.compenso_ora_cent
  loop
    insert into compensi (palestra_id, staff_id, anno, mese, ore, tariffa_cent, lezioni, totale_cent)
    values (p_palestra, r.staff_id, p_anno, p_mese, r.ore, r.tariffa, r.lezioni,
            round(r.ore * r.tariffa)::int)
    on conflict (staff_id, anno, mese) do update
      set ore = excluded.ore,
          tariffa_cent = excluded.tariffa_cent,
          lezioni = excluded.lezioni,
          totale_cent = round(excluded.ore * excluded.tariffa_cent)::int + compensi.extra_cent
      where compensi.stato <> 'pagato';
    n := n + 1;
  end loop;
  return n;
end $$;

-- Aggiungere un extra (sostituzione, saggio, rimborso) o una nota
create or replace function aggiorna_compenso(
  p_id uuid, p_extra_cent int default null, p_extra_nota text default null,
  p_ore numeric default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare c compensi;
begin
  select * into c from compensi where id = p_id;
  if not found then raise exception 'compenso_non_trovato'; end if;
  if not is_gestione(c.palestra_id) then raise exception 'non_autorizzato'; end if;
  if c.stato = 'pagato' then raise exception 'gia_pagato'; end if;

  update compensi
     set extra_cent = coalesce(p_extra_cent, extra_cent),
         extra_nota = coalesce(p_extra_nota, extra_nota),
         ore = coalesce(p_ore, ore),
         note = coalesce(p_note, note),
         totale_cent = round(coalesce(p_ore, ore) * tariffa_cent)::int + coalesce(p_extra_cent, extra_cent)
   where id = p_id;
end $$;

-- Pagare un cedolino: diventa una spesa, quindi entra nei costi e in cassa
create or replace function paga_compenso(p_id uuid, p_metodo text default 'bonifico', p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare c compensi; v_nome text; v_spesa uuid;
begin
  select * into c from compensi where id = p_id;
  if not found then raise exception 'compenso_non_trovato'; end if;
  if not is_gestione(c.palestra_id) then raise exception 'non_autorizzato'; end if;
  if c.stato = 'pagato' then raise exception 'gia_pagato'; end if;
  if c.totale_cent <= 0 then raise exception 'importo_zero'; end if;

  select nome || ' ' || coalesce(cognome, '') into v_nome from staff where id = c.staff_id;

  insert into spese (palestra_id, descrizione, categoria, importo_cent, data, periodicita, pagata, note)
  values (c.palestra_id,
          'Compenso ' || trim(v_nome) || ' — ' || lpad(c.mese::text, 2, '0') || '/' || c.anno,
          'compensi', c.totale_cent, p_data, 'una_tantum', true,
          c.ore || ' ore su ' || c.lezioni || ' lezioni')
  returning id into v_spesa;

  update compensi
     set stato = 'pagato', pagato_at = now(), metodo = p_metodo, spesa_id = v_spesa
   where id = p_id;

  return v_spesa;
end $$;

create or replace function approva_compensi(p_palestra uuid, p_anno int, p_mese int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  update compensi set stato = 'approvato'
   where palestra_id = p_palestra and anno = p_anno and mese = p_mese
     and stato = 'bozza' and totale_cent > 0;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function calcola_compensi(uuid, int, int) to authenticated;
grant execute on function aggiorna_compenso(uuid, int, text, numeric, text) to authenticated;
grant execute on function paga_compenso(uuid, text, date) to authenticated;
grant execute on function approva_compensi(uuid, int, int) to authenticated;

-- Il dettaglio delle lezioni di un cedolino, per controllare i conti
create or replace function dettaglio_compenso(p_id uuid)
returns table (data date, corso text, inizio timestamptz, ore numeric, sala text, iscritti int)
language sql stable security invoker as $$
  select o.data, o.corso_nome, o.inizio, o.ore, o.sala_nome, o.iscritti::int
  from compensi c
  join v_occupazione o on o.insegnante_id = c.staff_id
   and o.data between make_date(c.anno, c.mese, 1)
                  and (make_date(c.anno, c.mese, 1) + interval '1 month - 1 day')::date
   and o.stato = 'programmata'
  where c.id = p_id
  order by o.inizio;
$$;

-- ---------------------------------------------------------------------
-- 5. RICONCILIAZIONE: abbinare i movimenti agli incassi e alle uscite
-- ---------------------------------------------------------------------
create or replace function abbina_movimento(p_movimento uuid, p_pagamento uuid default null,
                                            p_spesa uuid default null, p_compenso uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare m movimenti_banca;
begin
  select * into m from movimenti_banca where id = p_movimento;
  if not found then raise exception 'movimento_non_trovato'; end if;
  if not is_gestione(m.palestra_id) then raise exception 'non_autorizzato'; end if;

  insert into abbinamenti (palestra_id, movimento_id, pagamento_id, spesa_id, compenso_id, importo_cent, automatico)
  values (m.palestra_id, p_movimento, p_pagamento, p_spesa, p_compenso, m.importo_cent, false);

  update movimenti_banca set stato = 'abbinato' where id = p_movimento;
end $$;

create or replace function stacca_abbinamento(p_abbinamento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a abbinamenti;
begin
  select * into a from abbinamenti where id = p_abbinamento;
  if not found then raise exception 'abbinamento_non_trovato'; end if;
  if not is_gestione(a.palestra_id) then raise exception 'non_autorizzato'; end if;

  delete from abbinamenti where id = p_abbinamento;
  update movimenti_banca m set stato = 'da_verificare'
   where m.id = a.movimento_id
     and not exists (select 1 from abbinamenti x where x.movimento_id = m.id);
end $$;

create or replace function ignora_movimento(p_movimento uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update movimenti_banca set stato = 'ignorato', note = coalesce(p_nota, note)
   where id = p_movimento and is_gestione(palestra_id);
end $$;

-- Proposte di abbinamento per un movimento in entrata:
-- incassi non ancora abbinati, di importo uguale e data vicina
create or replace function proposte_movimento(p_movimento uuid)
returns table (pagamento_id uuid, descrizione text, cliente text, importo_cent int,
               data date, metodo text, punteggio int)
language sql stable security invoker as $$
  select pg.id, pg.descrizione,
         coalesce(acc.nome || ' ' || coalesce(acc.cognome, ''), '—'),
         pg.importo_cent, coalesce(pg.pagato_at::date, pg.created_at::date), pg.metodo,
         (case when pg.importo_cent = m.importo_cent then 60 else 0 end
          + case when abs(coalesce(pg.pagato_at::date, pg.created_at::date) - m.data) <= 1 then 25
                 when abs(coalesce(pg.pagato_at::date, pg.created_at::date) - m.data) <= 5 then 15 else 0 end
          + case when acc.cognome is not null
                  and lower(m.descrizione || ' ' || coalesce(m.controparte, '')) like '%' || lower(acc.cognome) || '%'
                 then 30 else 0 end)::int as punteggio
  from movimenti_banca m
  join pagamenti pg on pg.palestra_id = m.palestra_id and pg.stato = 'pagato'
  left join account acc on acc.id = pg.account_id
  where m.id = p_movimento
    and m.importo_cent > 0
    and not exists (select 1 from abbinamenti a where a.pagamento_id = pg.id)
    and coalesce(pg.pagato_at::date, pg.created_at::date) between m.data - 15 and m.data + 15
  order by punteggio desc, abs(pg.importo_cent - m.importo_cent)
  limit 10;
$$;

-- Abbina da solo quello che è sicuro: importo identico, data vicina,
-- e un solo incasso possibile.
create or replace function riconcilia_automatica(p_palestra uuid, p_dal date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; v_pag uuid; v_quanti int; n int := 0;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;

  for m in
    select * from movimenti_banca
     where palestra_id = p_palestra and stato = 'da_verificare' and importo_cent > 0
       and (p_dal is null or data >= p_dal)
  loop
    select count(*), min(pg.id) into v_quanti, v_pag
    from pagamenti pg
    where pg.palestra_id = p_palestra and pg.stato = 'pagato'
      and pg.importo_cent = m.importo_cent
      and coalesce(pg.pagato_at::date, pg.created_at::date) between m.data - 5 and m.data + 5
      and not exists (select 1 from abbinamenti a where a.pagamento_id = pg.id);

    if v_quanti = 1 then
      insert into abbinamenti (palestra_id, movimento_id, pagamento_id, importo_cent, automatico)
      values (p_palestra, m.id, v_pag, m.importo_cent, true);
      update movimenti_banca set stato = 'abbinato' where id = m.id;
      n := n + 1;
    end if;
  end loop;

  return jsonb_build_object('abbinati', n);
end $$;

grant execute on function abbina_movimento(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function stacca_abbinamento(uuid) to authenticated;
grant execute on function ignora_movimento(uuid, text) to authenticated;
grant execute on function riconcilia_automatica(uuid, date) to authenticated;

-- Quello che non torna: incassi senza movimento e movimenti senza incasso
create or replace function differenze_banca(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'movimenti_senza_incasso', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'data', m.data, 'importo_cent', m.importo_cent,
                                          'descrizione', m.descrizione) order by m.data desc)
      from movimenti_banca m
      where m.palestra_id = p_palestra and m.data between p_dal and p_al
        and m.stato = 'da_verificare' and m.importo_cent > 0), '[]'::jsonb),
    'incassi_senza_movimento', coalesce((
      select jsonb_agg(jsonb_build_object('id', pg.id, 'data', coalesce(pg.pagato_at::date, pg.created_at::date),
                                          'importo_cent', pg.importo_cent, 'descrizione', pg.descrizione,
                                          'metodo', pg.metodo) order by pg.pagato_at desc)
      from pagamenti pg
      where pg.palestra_id = p_palestra and pg.stato = 'pagato'
        and coalesce(pg.pagato_at::date, pg.created_at::date) between p_dal and p_al
        and coalesce(pg.metodo, '') in ('bonifico', 'pos')
        and not exists (select 1 from abbinamenti a where a.pagamento_id = pg.id)), '[]'::jsonb),
    'contanti_non_versati_cent', coalesce((
      select sum(pg.importo_cent) from pagamenti pg
      where pg.palestra_id = p_palestra and pg.stato = 'pagato' and pg.metodo = 'contanti'
        and coalesce(pg.pagato_at::date, pg.created_at::date) between p_dal and p_al
        and not exists (select 1 from abbinamenti a where a.pagamento_id = pg.id)), 0)
  );
$$;

-- ---------------------------------------------------------------------
-- 6. FLUSSO DI CASSA
--    Entrate e uscite davvero avvenute, per metodo e per mese.
-- ---------------------------------------------------------------------
create or replace function flusso_cassa(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker as $$
  with entrate as (
    select coalesce(metodo, 'non indicato') as metodo, sum(importo_cent) as tot
    from pagamenti
    where palestra_id = p_palestra and stato = 'pagato'
      and coalesce(pagato_at::date, created_at::date) between p_dal and p_al
    group by 1
  ),
  uscite as (
    select coalesce(categoria, 'altro') as categoria, sum(importo_cent) as tot
    from spese
    where palestra_id = p_palestra and pagata and data between p_dal and p_al
    group by 1
  ),
  mesi as (
    select to_char(d, 'YYYY-MM') as mese,
           coalesce((select sum(importo_cent) from pagamenti pg
                      where pg.palestra_id = p_palestra and pg.stato = 'pagato'
                        and date_trunc('month', coalesce(pg.pagato_at, pg.created_at)) = d), 0) as entrate,
           coalesce((select sum(importo_cent) from spese s
                      where s.palestra_id = p_palestra and s.pagata
                        and date_trunc('month', s.data) = d), 0) as uscite
    from generate_series(date_trunc('month', p_dal::timestamp), date_trunc('month', p_al::timestamp), interval '1 month') d
  )
  select jsonb_build_object(
    'entrate_cent', coalesce((select sum(tot) from entrate), 0),
    'uscite_cent', coalesce((select sum(tot) from uscite), 0),
    'saldo_cent', coalesce((select sum(tot) from entrate), 0) - coalesce((select sum(tot) from uscite), 0),
    'entrate_per_metodo', coalesce((select jsonb_object_agg(metodo, tot) from entrate), '{}'::jsonb),
    'uscite_per_categoria', coalesce((select jsonb_object_agg(categoria, tot) from uscite), '{}'::jsonb),
    'compensi_da_pagare_cent', coalesce((
      select sum(totale_cent) from compensi
       where palestra_id = p_palestra and stato in ('bozza', 'approvato')), 0),
    'da_incassare_cent', coalesce((
      select sum(importo_cent) from pagamenti
       where palestra_id = p_palestra and stato = 'in_attesa'), 0),
    'per_mese', coalesce((
      select jsonb_agg(jsonb_build_object('mese', mese, 'entrate_cent', entrate,
                                          'uscite_cent', uscite, 'saldo_cent', entrate - uscite) order by mese)
      from mesi), '[]'::jsonb)
  );
$$;

grant execute on function flusso_cassa(uuid, date, date) to authenticated;
grant execute on function differenze_banca(uuid, date, date) to authenticated;
grant execute on function dettaglio_compenso(uuid) to authenticated;
