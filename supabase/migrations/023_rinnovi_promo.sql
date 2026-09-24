-- =====================================================================
-- RMHouse — 023 RINNOVI, PROMOZIONI, ESPORTAZIONE CONTABILE
-- Tre cose che il database sapeva già fare a metà e che adesso hanno
-- tutto quello che serve per avere una schermata.
-- Da eseguire dopo 001…022.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CHI È IN SCADENZA
--    Un elenco pronto per il rinnovo di fine mese.
-- ---------------------------------------------------------------------
create or replace function da_rinnovare(p_palestra uuid, p_giorni int default 20)
returns table (
  iscrizione_id uuid, allievo_id uuid, nome text, cognome text, foto_url text,
  corso_id uuid, corso text, colore text,
  tipo_abbonamento_id uuid, abbonamento text, prezzo_cent int, sconto_cent int,
  data_inizio date, data_fine date, giorni_alla_scadenza int,
  gia_rinnovata boolean, certificato_ok boolean, quota_ok boolean,
  telefono text, email text, orari uuid[]
)
language sql stable security invoker as $$
  select i.id, a.id, a.nome, a.cognome, a.foto_url,
         c.id, c.nome, c.colore,
         t.id, t.nome, t.prezzo_cent, i.sconto_cent,
         i.data_inizio, i.data_fine, (i.data_fine - current_date)::int,
         exists (select 1 from iscrizioni r where r.rinnovo_di = i.id),
         certificato_valido(a.id, i.data_fine + 1),
         quota_pagata(a.id, i.data_fine + 1),
         acc.telefono, acc.email,
         coalesce(array(select io.orario_id from iscrizioni_orari io where io.iscrizione_id = i.id), '{}')
  from iscrizioni i
  join allievi a on a.id = i.allievo_id
  join account acc on acc.id = a.account_id
  join corsi c on c.id = i.corso_id
  join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
  where i.palestra_id = p_palestra
    and i.stato = 'attiva'
    and i.data_fine between current_date - 7 and current_date + p_giorni
  order by i.data_fine, c.nome, a.cognome;
$$;

-- ---------------------------------------------------------------------
-- 2. RINNOVARE
--    Il nuovo periodo parte dal giorno dopo la scadenza, con lo stesso
--    abbonamento e gli stessi orari. Resta scritto da cosa nasce.
-- ---------------------------------------------------------------------
create or replace function rinnova_iscrizione(
  p_iscrizione uuid, p_tipo_abbonamento uuid default null,
  p_sconto_cent int default null, p_dal date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare i iscrizioni; v_orari uuid[]; v_tipo uuid; v_dal date; v_id uuid;
begin
  select * into i from iscrizioni where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  if exists (select 1 from iscrizioni r where r.rinnovo_di = p_iscrizione) then
    raise exception 'gia_rinnovata';
  end if;

  v_tipo := coalesce(p_tipo_abbonamento, i.tipo_abbonamento_id);
  v_dal := coalesce(p_dal, greatest(i.data_fine + 1, current_date));
  select coalesce(array_agg(io.orario_id), '{}') into v_orari
    from iscrizioni_orari io where io.iscrizione_id = p_iscrizione;

  v_id := crea_iscrizione(i.allievo_id, v_tipo, i.corso_id, v_dal, v_orari,
                          coalesce(p_sconto_cent, i.sconto_cent), false,
                          'Rinnovo automatico');
  update iscrizioni set rinnovo_di = p_iscrizione where id = v_id;
  return v_id;
end $$;

-- Più rinnovi in un colpo: restituisce quanti sono andati e quali no
create or replace function rinnova_blocco(p_iscrizioni uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int := 0; saltati jsonb := '[]'::jsonb; v_motivo text;
begin
  foreach v_id in array coalesce(p_iscrizioni, '{}') loop
    begin
      perform rinnova_iscrizione(v_id);
      n := n + 1;
    exception when others then
      v_motivo := sqlerrm;
      saltati := saltati || jsonb_build_object(
        'iscrizione_id', v_id,
        'chi', (select a.nome || ' ' || a.cognome from iscrizioni i join allievi a on a.id = i.allievo_id where i.id = v_id),
        'motivo', v_motivo);
    end;
  end loop;
  return jsonb_build_object('rinnovate', n, 'saltate', saltati);
end $$;

grant execute on function da_rinnovare(uuid, int) to authenticated;
grant execute on function rinnova_iscrizione(uuid, uuid, int, date) to authenticated;
grant execute on function rinnova_blocco(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 3. PROMOZIONI: sapere a quante persone arriverebbe, prima di mandarla
-- ---------------------------------------------------------------------
create or replace function conta_promo(p_palestra uuid, p_corsi uuid[] default null)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'destinatari', count(distinct acc.id),
    'senza_consenso', (
      select count(distinct acc2.id)
      from iscrizioni i2
      join allievi a2 on a2.id = i2.allievo_id
      join account acc2 on acc2.id = a2.account_id
      where i2.palestra_id = p_palestra and i2.stato = 'attiva' and not acc2.consenso_marketing
        and (p_corsi is null or i2.corso_id = any (p_corsi)))
  )
  from iscrizioni i
  join allievi a on a.id = i.allievo_id
  join account acc on acc.id = a.account_id
  where i.palestra_id = p_palestra and i.stato = 'attiva' and acc.consenso_marketing
    and (p_corsi is null or i.corso_id = any (p_corsi));
$$;

grant execute on function conta_promo(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 4. ESPORTAZIONE CONTABILE
--    Una riga per incasso, con tutto quello che serve al commercialista.
-- ---------------------------------------------------------------------
create or replace function esporta_incassi(p_palestra uuid, p_dal date, p_al date)
returns table (
  data date, causale text, descrizione text, importo_cent int, metodo text, stato text,
  cliente text, codice_fiscale text, email text, corso text
)
language sql stable security invoker as $$
  select coalesce(pg.pagato_at::date, pg.created_at::date),
         pg.causale, pg.descrizione, pg.importo_cent,
         coalesce(pg.metodo, 'non indicato'), pg.stato::text,
         coalesce(acc.nome || ' ' || coalesce(acc.cognome, ''), '—'),
         acc.codice_fiscale, acc.email, c.nome
  from pagamenti pg
  left join account acc on acc.id = pg.account_id
  left join corsi c on c.id = pg.corso_id
  where pg.palestra_id = p_palestra
    and coalesce(pg.pagato_at::date, pg.created_at::date) between p_dal and p_al
    and pg.stato <> 'annullato'
  order by 1, pg.created_at;
$$;

grant execute on function esporta_incassi(uuid, date, date) to authenticated;
