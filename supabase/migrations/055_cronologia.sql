-- =====================================================================
-- RMHouse — 055 CRONOLOGIA DELLE MODIFICHE (solo amministratori)
--  1. Il registro lo leggono solo gli amministratori
--  2. Si sa anche a quale persona e a quale lezione si riferisce ogni riga,
--     così ogni pagina mostra solo la sua cronologia
--  3. Si registrano molte più cose: impostazioni, listino, recuperi,
--     presenze, prenotazioni, disdette, sale, discipline, aliquote…
--  4. Chi l'ha fatto: lo staff per nome, il cliente come "cliente: Nome"
-- Si può eseguire più volte. Va dopo la 054.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SOLO GLI AMMINISTRATORI
-- ---------------------------------------------------------------------
create or replace function is_admin(p_palestra uuid)
returns boolean language sql stable as $$
  select ha_ruolo(p_palestra, array['admin']);
$$;

drop policy if exists gestione_legge on registro_azioni;
drop policy if exists admin_legge on registro_azioni;
create policy admin_legge on registro_azioni for select to authenticated using (is_admin(palestra_id));

-- ---------------------------------------------------------------------
-- 2. A CHI E A COSA SI RIFERISCE
-- ---------------------------------------------------------------------
alter table registro_azioni add column if not exists persona_id uuid;
alter table registro_azioni add column if not exists lezione_id uuid;
create index if not exists registro_persona on registro_azioni (persona_id, quando desc) where persona_id is not null;
create index if not exists registro_lezione on registro_azioni (lezione_id, quando desc) where lezione_id is not null;
create index if not exists registro_tabella on registro_azioni (palestra_id, tabella, quando desc);

-- le righe già registrate: la persona dalle iscrizioni, dagli incassi e dalle anagrafiche
update registro_azioni r set persona_id = r.record_id where r.persona_id is null and r.tabella = 'allievi';
update registro_azioni r set persona_id = i.allievo_id from iscrizioni i
 where r.persona_id is null and r.tabella = 'iscrizioni' and i.id = r.record_id;
update registro_azioni r set persona_id = p.allievo_id from pagamenti p
 where r.persona_id is null and r.tabella = 'pagamenti' and p.id = r.record_id;

-- ---------------------------------------------------------------------
-- 3 e 4. IL TRIGGER
-- ---------------------------------------------------------------------
create or replace function trg_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nuovo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_vecchio jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_riga jsonb := coalesce(v_nuovo, v_vecchio);
  v_mod jsonb := '{}'::jsonb; k text; v_chi text; v_descr text; v_pal uuid; v_persona uuid; v_lezione uuid; v_nome text;
begin
  -- gli inserimenti fatti dagli import (senza utente) non si registrano: sarebbero migliaia
  if tg_op = 'INSERT' and auth.uid() is null and tg_table_name in ('allievi', 'account', 'certificati', 'presenze', 'prenotazioni') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_nuovo) loop
      if k not in ('updated_at', 'created_at', 'ultimo_accesso', 'token', 'stripe_customer_id') and v_nuovo -> k is distinct from v_vecchio -> k then
        -- le chiavi di pagamento non si copiano nel registro: si scrive solo che sono cambiate
        if k = 'stripe' then
          v_mod := v_mod || jsonb_build_object(k, jsonb_build_array('(nascosto)', '(cambiato)'));
        else
          v_mod := v_mod || jsonb_build_object(k, jsonb_build_array(v_vecchio -> k, v_nuovo -> k));
        end if;
      end if;
    end loop;
    if v_mod = '{}'::jsonb then return new; end if;
  end if;

  v_pal := coalesce((v_riga ->> 'palestra_id')::uuid, case when tg_table_name = 'palestre' then (v_riga ->> 'id')::uuid end);
  if v_pal is null then return coalesce(new, old); end if;

  v_persona := case when tg_table_name = 'allievi' then (v_riga ->> 'id')::uuid else (v_riga ->> 'allievo_id')::uuid end;
  v_lezione := case when tg_table_name = 'lezioni' then (v_riga ->> 'id')::uuid else (v_riga ->> 'lezione_id')::uuid end;
  if v_persona is null and tg_table_name in ('iscrizioni_orari', 'sospensioni') then
    select allievo_id into v_persona from iscrizioni where id = (v_riga ->> 'iscrizione_id')::uuid;
  end if;
  if v_persona is not null and tg_table_name <> 'allievi' then
    select trim(nome || ' ' || coalesce(cognome, '')) into v_nome from allievi where id = v_persona;
  end if;

  select trim(nome || ' ' || coalesce(cognome, '')) into v_chi from staff
   where user_id = auth.uid() and palestra_id = v_pal limit 1;
  if v_chi is null and auth.uid() is not null then
    select 'cliente: ' || trim(nome || ' ' || coalesce(cognome, '')) into v_chi from account
     where user_id = auth.uid() and palestra_id = v_pal limit 1;
  end if;

  v_descr := case tg_table_name
    when 'pagamenti' then coalesce(v_riga ->> 'descrizione', 'Incasso') || ' · ' ||
                          replace(to_char((v_riga ->> 'importo_cent')::int / 100.0, 'FM99999990.00'), '.', ',') || ' €'
    when 'ricevute' then case when v_riga ->> 'tipo_documento' = 'nota_credito' then 'Nota di credito' else 'Ricevuta' end
                          || ' n. ' || (v_riga ->> 'numero') || '/' || (v_riga ->> 'anno') || ' · ' || coalesce(v_riga ->> 'intestatario', '')
    when 'iscrizioni' then 'Iscrizione dal ' || (v_riga ->> 'data_inizio') || ' al ' || coalesce(v_riga ->> 'data_fine', '…')
    when 'rate' then coalesce(v_riga ->> 'descrizione', 'Rata') || ' · rata ' || (v_riga ->> 'numero') || ' di ' || (v_riga ->> 'di')
    when 'allievi' then trim(coalesce(v_riga ->> 'nome', '') || ' ' || coalesce(v_riga ->> 'cognome', ''))
    when 'account' then trim(coalesce(v_riga ->> 'nome', '') || ' ' || coalesce(v_riga ->> 'cognome', '')) || ' (chi paga)'
    when 'staff' then trim(coalesce(v_riga ->> 'nome', '') || ' ' || coalesce(v_riga ->> 'cognome', ''))
    when 'certificati' then 'Certificato · ' || coalesce(v_riga ->> 'stato', '')
    when 'tipi_abbonamento' then coalesce(v_riga ->> 'nome', 'Abbonamento')
    when 'corsi' then coalesce(v_riga ->> 'nome', 'Corso')
    when 'orari' then 'Orario di ' || coalesce((select nome from corsi where id = (v_riga ->> 'corso_id')::uuid), 'un corso')
    when 'lezioni' then 'Lezione di ' || coalesce((select nome from corsi where id = (v_riga ->> 'corso_id')::uuid), '') || ' del ' || (v_riga ->> 'data')
    when 'presenze' then case when (v_riga ->> 'presente')::boolean then 'Presente' else 'Assente' end
    when 'prenotazioni' then 'Prenotazione (' || coalesce(v_riga ->> 'tipo', '') || ')'
    when 'assenze_avvisate' then case when v_riga ->> 'da' = 'cliente' then 'Disdetta dall''app' else 'Ha avvisato (segreteria)' end
    when 'sospensioni' then 'Sospensione dal ' || (v_riga ->> 'dal') || ' al ' || (v_riga ->> 'al')
    when 'crediti_recupero' then 'Recupero da usare entro il ' || coalesce(v_riga ->> 'scadenza', '…')
    when 'voci_listino' then coalesce(v_riga ->> 'nome', 'Voce a listino')
    when 'gruppi_listino' then 'Gruppo di listino ' || coalesce(v_riga ->> 'nome', '')
    when 'recuperi_ammessi' then 'Regola di recupero: '
         || coalesce((select nome from tipi_abbonamento where id = (v_riga ->> 'origine_id')::uuid),
                     (select nome from corsi where id = (v_riga ->> 'origine_id')::uuid), '…')
         || ' → ' || coalesce((select nome from corsi where id = (v_riga ->> 'corso_ammesso_id')::uuid), '…')
    when 'palestre' then 'Impostazioni della scuola'
    when 'aliquote_iva' then 'Aliquota IVA ' || coalesce(v_riga ->> 'nome', '')
    when 'numerazioni' then 'Numerazione ' || coalesce(v_riga ->> 'nome', '')
    when 'sale' then 'Sala ' || coalesce(v_riga ->> 'nome', '')
    when 'discipline' then 'Disciplina ' || coalesce(v_riga ->> 'nome', '')
    when 'livelli' then 'Livello ' || coalesce(v_riga ->> 'nome', '')
    when 'fasce_eta' then 'Fascia d''età ' || coalesce(v_riga ->> 'nome', '')
    when 'chiusure' then 'Chiusura ' || coalesce(v_riga ->> 'motivo', v_riga ->> 'nome', '')
    when 'ruoli' then 'Ruolo ' || coalesce(v_riga ->> 'nome', '')
    when 'quote_iscrizione' then 'Quota annuale'
    else tg_table_name end;
  if v_nome is not null and tg_table_name not in ('account') then v_descr := v_descr || ' · ' || v_nome; end if;

  insert into registro_azioni (palestra_id, utente_id, chi, tabella, operazione, record_id, descrizione, modifiche, persona_id, lezione_id)
  values (v_pal, auth.uid(), coalesce(v_chi, case when auth.uid() is null then 'automatico' end),
          tg_table_name,
          case tg_op when 'INSERT' then 'inserimento' when 'UPDATE' then 'modifica' else 'cancellazione' end,
          (v_riga ->> 'id')::uuid, v_descr,
          case when tg_op = 'UPDATE' then v_mod end, v_persona, v_lezione);
  return coalesce(new, old);
end $$;

-- Tutto (inserimento, modifica, cancellazione)
do $$
declare t text;
begin
  foreach t in array array['pagamenti', 'ricevute', 'iscrizioni', 'rate', 'allievi', 'account', 'staff', 'certificati',
                           'tipi_abbonamento', 'corsi', 'orari', 'sospensioni', 'voci_listino', 'gruppi_listino',
                           'recuperi_ammessi', 'aliquote_iva', 'numerazioni', 'sale', 'discipline', 'livelli', 'fasce_eta',
                           'chiusure', 'ruoli', 'assenze_avvisate', 'presenze', 'prenotazioni', 'quote_iscrizione'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists registro on %I', t);
      execute format('create trigger registro after insert or update or delete on %I for each row execute function trg_registro()', t);
    end if;
  end loop;
  -- solo modifiche e cancellazioni: le lezioni nascono a centinaia dal palinsesto,
  -- i recuperi li crea il sistema, le impostazioni non si inseriscono
  foreach t in array array['lezioni', 'crediti_recupero', 'palestre'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists registro on %I', t);
      execute format('create trigger registro after update or delete on %I for each row execute function trg_registro()', t);
    end if;
  end loop;
end $$;
