-- =====================================================================
-- RMHouse — 021 PRENOTAZIONE SPAZI DALLA SEGRETERIA
-- Salvare una prenotazione al banco: controllo immediato della
-- disponibilità, prezzo calcolato dal listino, nessuna email di mezzo.
-- Da eseguire dopo 001…020.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DA DOVE ARRIVA LA PRENOTAZIONE
--    Le richieste dal sito mandano le email; quelle fatte al banco no.
-- ---------------------------------------------------------------------
alter table prenotazioni_spazi add column if not exists origine text not null default 'sito'
  check (origine in ('sito', 'segreteria'));

create or replace function trg_spazi_messaggi()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_vars jsonb; v_pal palestre;
begin
  -- quello che inserisce la segreteria non manda niente a nessuno
  if new.origine = 'segreteria' and tg_op = 'INSERT' then return new; end if;

  v_vars := vars_spazio(new.id);
  select * into v_pal from palestre where id = new.palestra_id;

  if tg_op = 'INSERT' then
    perform accoda_a_indirizzo(new.palestra_id, 'spazio_richiesta_ricevuta', new.email, new.id::text, now(), v_vars);
    perform accoda_a_indirizzo(new.palestra_id, 'spazio_avviso_interno', v_pal.email, new.id::text, now(), v_vars);
  elsif new.stato is distinct from old.stato then
    -- se non c'è un'email a cui scrivere (blocco interno) non si manda nulla
    if new.email is null then return new; end if;
    if new.stato = 'confermata' then
      perform accoda_a_indirizzo(new.palestra_id, 'spazio_confermato', new.email, new.id::text, now(), v_vars);
    elsif new.stato = 'annullata' then
      perform accoda_a_indirizzo(new.palestra_id, 'spazio_annullato', new.email, new.id::text, now(), v_vars);
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1bis. INCASSI SENZA UN CLIENTE COLLEGATO
--    Un affitto sala o una vendita al banco possono non avere un account:
--    finora il pagamento non si poteva nemmeno registrare.
-- ---------------------------------------------------------------------
alter table pagamenti alter column account_id drop not null;

-- ---------------------------------------------------------------------
-- 2. VERIFICA IMMEDIATA
--    Dice se è libero, cosa c'è di traverso e quanto costerebbe.
-- ---------------------------------------------------------------------
create or replace function verifica_spazio(
  p_palestra uuid, p_sala uuid, p_inizio timestamptz, p_fine timestamptz, p_escludi uuid default null
) returns jsonb language plpgsql stable security invoker as $$
declare v_libero boolean; v_prezzo int;
begin
  if p_fine <= p_inizio then
    return jsonb_build_object('ok', false, 'motivo', 'La fine deve venire dopo l''inizio.');
  end if;

  v_libero := sala_libera(p_sala, p_inizio, p_fine, p_escludi);
  begin
    v_prezzo := prezzo_spazio(p_palestra, p_sala, p_inizio, p_fine);
  exception when others then v_prezzo := null;
  end;

  return jsonb_build_object(
    'ok', v_libero,
    'prezzo_cent', v_prezzo,
    'conflitti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', a.tipo, 'titolo', a.titolo,
        'dalle', to_char(a.inizio at time zone 'Europe/Rome', 'HH24:MI'),
        'alle', to_char(a.fine at time zone 'Europe/Rome', 'HH24:MI')) order by a.inizio)
      from v_agenda_sale a
      where a.sala_id = p_sala and a.stato <> 'annullata'
        and (p_escludi is null or a.id <> p_escludi)
        and a.inizio < p_fine and a.fine > p_inizio), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 3. SALVARE AL BANCO
--    Nasce già confermata, senza passare dalla richiesta.
-- ---------------------------------------------------------------------
create or replace function crea_prenotazione_spazio(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid := (p->>'palestra_id')::uuid;
  v_sala uuid := (p->>'sala_id')::uuid;
  v_inizio timestamptz := (p->>'inizio')::timestamptz;
  v_fine timestamptz := (p->>'fine')::timestamptz;
  v_prezzo int; v_id uuid;
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if v_fine <= v_inizio then raise exception 'orario_non_valido'; end if;
  if coalesce(trim(p->>'titolo'), '') = '' then raise exception 'titolo_mancante'; end if;
  if not sala_libera(v_sala, v_inizio, v_fine, null) then raise exception 'sala_occupata'; end if;

  -- prezzo: quello scritto a mano, altrimenti quello del listino
  if p ? 'prezzo_cent' and p->>'prezzo_cent' is not null then
    v_prezzo := (p->>'prezzo_cent')::int;
  else
    begin v_prezzo := prezzo_spazio(v_pal, v_sala, v_inizio, v_fine);
    exception when others then v_prezzo := 0; end;
  end if;

  insert into prenotazioni_spazi (
    palestra_id, sala_id, tipo, pacchetto_id, titolo, account_id,
    contatto_nome, email, telefono, inizio, fine, ospiti, stato,
    prezzo_cent, acconto_cent, incassato_cent, note, note_interne, origine)
  values (
    v_pal, v_sala, coalesce(nullif(p->>'tipo', ''), 'noleggio'),
    nullif(p->>'pacchetto_id', '')::uuid, trim(p->>'titolo'),
    nullif(p->>'account_id', '')::uuid,
    coalesce(nullif(trim(p->>'contatto_nome'), ''), 'Interno'),
    nullif(trim(p->>'email'), ''), nullif(trim(p->>'telefono'), ''),
    v_inizio, v_fine, nullif(p->>'ospiti', '')::int,
    coalesce(nullif(p->>'stato', ''), 'confermata'),
    coalesce(v_prezzo, 0),
    coalesce((p->>'acconto_cent')::int, 0),
    coalesce((p->>'incassato_cent')::int, 0),
    nullif(p->>'note', ''), nullif(p->>'note_interne', ''), 'segreteria')
  returning id into v_id;

  -- se ha già incassato qualcosa, resta scritto anche negli incassi
  if coalesce((p->>'incassato_cent')::int, 0) > 0 then
    insert into pagamenti (palestra_id, account_id, causale, descrizione, importo_cent,
                           metodo, stato, pagato_at)
    values (v_pal, nullif(p->>'account_id', '')::uuid, 'spazio',
            'Affitto sala — ' || trim(p->>'titolo'),
            (p->>'incassato_cent')::int,
            coalesce(nullif(p->>'metodo', ''), 'contanti'), 'pagato'::stato_pagamento, now());
  end if;

  return v_id;
end $$;

-- Spostare o allungare una prenotazione già salvata
create or replace function sposta_prenotazione_spazio(
  p_prenotazione uuid, p_inizio timestamptz, p_fine timestamptz, p_sala uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare ps prenotazioni_spazi; v_sala uuid;
begin
  select * into ps from prenotazioni_spazi where id = p_prenotazione;
  if not found then raise exception 'prenotazione_non_trovata'; end if;
  if not is_gestione(ps.palestra_id) then raise exception 'non_autorizzato'; end if;

  v_sala := coalesce(p_sala, ps.sala_id);
  if p_fine <= p_inizio then raise exception 'orario_non_valido'; end if;
  if not sala_libera(v_sala, p_inizio, p_fine, p_prenotazione) then raise exception 'sala_occupata'; end if;

  update prenotazioni_spazi
     set inizio = p_inizio, fine = p_fine, sala_id = v_sala
   where id = p_prenotazione;
end $$;

grant execute on function verifica_spazio(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function crea_prenotazione_spazio(jsonb) to authenticated;
grant execute on function sposta_prenotazione_spazio(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. LA GIORNATA DI TUTTE LE SALE
--    Lezioni e affitti insieme, per disegnare il calendario.
-- ---------------------------------------------------------------------
create or replace function agenda_sale(p_palestra uuid, p_data date)
returns table (
  id uuid, sala_id uuid, sala text, tipo text, titolo text,
  inizio timestamptz, fine timestamptz, stato text, contatto text, prezzo_cent int
)
language sql stable security invoker as $$
  select a.id, a.sala_id, s.nome, a.tipo, a.titolo, a.inizio, a.fine, a.stato, a.contatto, a.prezzo_cent
  from v_agenda_sale a
  join sale s on s.id = a.sala_id
  where a.palestra_id = p_palestra
    and (a.inizio at time zone 'Europe/Rome')::date = p_data
    and a.stato <> 'annullata'
  order by s.nome, a.inizio;
$$;
