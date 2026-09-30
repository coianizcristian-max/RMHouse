-- =====================================================================
-- RMHouse — 051 MESE SOLARE
-- Se un abbonamento ha "Scade a fine mese solare", vale il mese solare
-- anche quando ha una durata in giorni da 28 in su:
-- chi paga il 10 settembre scade il 30 settembre (trimestrale: 30 novembre).
-- La durata in giorni sotto i 28 (lezione singola, settimane) vale sempre.
-- Si può eseguire più volte. Va dopo la 050.
-- =====================================================================

-- La scadenza di un abbonamento, in un posto solo
create or replace function scadenza_abbonamento(p_tipo uuid, p_inizio date)
returns date language sql stable set search_path = public as $$
  select case
    when t.durata_giorni is not null and (t.durata_giorni < 28 or not t.scadenza_fine_mese)
      then p_inizio + t.durata_giorni - 1
    else fine_periodo(p_inizio, greatest(coalesce(t.durata_mesi, 1), 1), t.scadenza_fine_mese)
  end
  from tipi_abbonamento t where t.id = p_tipo;
$$;
grant execute on function scadenza_abbonamento(uuid, date) to authenticated;

create or replace function trg_iscrizioni_before()
returns trigger language plpgsql as $$
declare t tipi_abbonamento;
begin
  select * into t from tipi_abbonamento where id = new.tipo_abbonamento_id;
  if new.data_fine is null then
    new.data_fine := scadenza_abbonamento(new.tipo_abbonamento_id, new.data_inizio);
  end if;
  if new.ingressi_residui is null and t.modalita = 'ingressi' then
    new.ingressi_residui := t.num_ingressi;
  end if;
  return new;
end $$;

-- La modifica dell'iscrizione usa la stessa regola
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('modifica_iscrizione(uuid, jsonb)'::regprocedure);
  if v_def not ilike '%scadenza_abbonamento%' then
    v_def := replace(v_def,
      $a$when t.durata_giorni is not null then v_inizio + t.durata_giorni - 1
                   else fine_periodo(v_inizio, t.durata_mesi, t.scadenza_fine_mese) end;$a$,
      $a$else scadenza_abbonamento(t.id, v_inizio) end;$a$);
    execute v_def;
  end if;
end $$;

-- Sistema le iscrizioni in corso che hanno preso "28 giorni" al posto del mese solare:
-- solo quelle con la scadenza calcolata in automatico (mai toccata a mano) e senza sospensioni.
update iscrizioni i set data_fine = scadenza_abbonamento(i.tipo_abbonamento_id, i.data_inizio)
  from tipi_abbonamento t
 where t.id = i.tipo_abbonamento_id
   and t.scadenza_fine_mese and t.durata_giorni >= 28
   and i.stato in ('attiva', 'sospesa') and i.data_fine >= current_date
   and i.data_fine = i.data_inizio + t.durata_giorni - 1
   and not exists (select 1 from sospensioni s where s.iscrizione_id = i.id);
