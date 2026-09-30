-- =====================================================================
-- RMHouse — 036 RUOLI, REGISTRO DELLE AZIONI, PRIVACY
--
-- 1. Ruoli su misura: sopra i tre ruoli di base (amministrazione,
--    segreteria, insegnante) si possono creare profili che nascondono
--    parti del gestionale, per esempio una segreteria che non vede i Conti.
-- 2. Registro delle azioni: chi ha incassato, emesso, annullato, iscritto,
--    modificato o cancellato cosa, e quando.
-- 3. Privacy: anonimizzare una persona su richiesta, tenendo i documenti
--    fiscali che per legge vanno conservati.
-- Da eseguire dopo la 035. Si può rieseguire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ruoli su misura
-- ---------------------------------------------------------------------
create table if not exists ruoli (
  id             uuid primary key default gen_random_uuid(),
  palestra_id    uuid not null references palestre(id) on delete cascade,
  nome           text not null,
  descrizione    text,
  voci_nascoste  text[] not null default '{}',   -- indirizzi delle pagine del menù da non mostrare
  created_at     timestamptz not null default now(),
  unique (palestra_id, nome)
);
alter table ruoli enable row level security;
drop policy if exists staff_legge on ruoli;
create policy staff_legge on ruoli for select to authenticated using (is_staff(palestra_id));
drop policy if exists admin_scrive on ruoli;
create policy admin_scrive on ruoli for all to authenticated
  using (ha_ruolo(palestra_id, array['admin'])) with check (ha_ruolo(palestra_id, array['admin']));

alter table staff add column if not exists ruolo_id uuid references ruoli(id) on delete set null;

-- Ruolo e profilo di una persona dello staff li cambia solo l'amministrazione
-- (altrimenti chi ha un profilo ristretto potrebbe togliersi le restrizioni)
create or replace function trg_staff_ruolo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.ruolo is distinct from old.ruolo or new.ruolo_id is distinct from old.ruolo_id)
     and not ha_ruolo(new.palestra_id, array['admin']) then
    raise exception 'solo_amministrazione';
  end if;
  return new;
end $$;
drop trigger if exists staff_ruolo on staff;
create trigger staff_ruolo before update of ruolo, ruolo_id on staff
  for each row execute function trg_staff_ruolo();

-- ---------------------------------------------------------------------
-- 2. Registro delle azioni
-- ---------------------------------------------------------------------
create table if not exists registro_azioni (
  id           bigint generated always as identity primary key,
  palestra_id  uuid not null,
  quando       timestamptz not null default now(),
  utente_id    uuid,
  chi          text,                     -- nome di chi l'ha fatto, congelato
  tabella      text not null,
  operazione   text not null,            -- inserimento / modifica / cancellazione
  record_id    uuid,
  descrizione  text,
  modifiche    jsonb                     -- solo i campi cambiati: {campo: [prima, dopo]}
);
create index if not exists registro_palestra_quando on registro_azioni (palestra_id, quando desc);
create index if not exists registro_record on registro_azioni (record_id);
alter table registro_azioni enable row level security;
drop policy if exists gestione_legge on registro_azioni;
create policy gestione_legge on registro_azioni for select to authenticated using (is_gestione(palestra_id));
-- nessuno scrive a mano: solo i trigger

create or replace function trg_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nuovo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_vecchio jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_riga jsonb := coalesce(v_nuovo, v_vecchio);
  v_mod jsonb := '{}'::jsonb; k text; v_chi text; v_descr text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_nuovo) loop
      if k not in ('updated_at', 'created_at') and v_nuovo -> k is distinct from v_vecchio -> k then
        v_mod := v_mod || jsonb_build_object(k, jsonb_build_array(v_vecchio -> k, v_nuovo -> k));
      end if;
    end loop;
    if v_mod = '{}'::jsonb then return new; end if;
  end if;

  select trim(nome || ' ' || coalesce(cognome, '')) into v_chi from staff
   where user_id = auth.uid() and palestra_id = (v_riga ->> 'palestra_id')::uuid limit 1;

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
    when 'orari' then 'Orario del corso'
    else tg_table_name end;

  insert into registro_azioni (palestra_id, utente_id, chi, tabella, operazione, record_id, descrizione, modifiche)
  values ((v_riga ->> 'palestra_id')::uuid, auth.uid(), coalesce(v_chi, case when auth.uid() is null then 'automatico' end),
          tg_table_name,
          case tg_op when 'INSERT' then 'inserimento' when 'UPDATE' then 'modifica' else 'cancellazione' end,
          (v_riga ->> 'id')::uuid, v_descr,
          case when tg_op = 'UPDATE' then v_mod end);
  return coalesce(new, old);
end $$;

-- Soldi e documenti: tutto. Anagrafiche e struttura: modifiche e cancellazioni
-- (gli inserimenti sarebbero troppi, per esempio con un import).
do $$
declare t text;
begin
  foreach t in array array['pagamenti', 'ricevute', 'iscrizioni', 'rate'] loop
    execute format('drop trigger if exists registro on %I', t);
    execute format('create trigger registro after insert or update or delete on %I for each row execute function trg_registro()', t);
  end loop;
  foreach t in array array['allievi', 'account', 'staff', 'certificati', 'tipi_abbonamento', 'corsi', 'orari'] loop
    execute format('drop trigger if exists registro on %I', t);
    execute format('create trigger registro after update or delete on %I for each row execute function trg_registro()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Privacy: anonimizzare una persona
-- ---------------------------------------------------------------------
-- Tiene: ricevute e incassi (obbligo di conservazione dei documenti
-- contabili), con il nome già stampato sulle ricevute emesse.
-- Toglie: nome, contatti, data e luogo di nascita, codice fiscale, foto,
-- note, etichette, certificati (anche i file), notifiche, diario dei contatti.
create or replace function anonimizza_persona(p_allievo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; v_acc uuid; v_altri int; v_file text[];
begin
  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  if not ha_ruolo(a.palestra_id, array['admin']) then raise exception 'solo_amministrazione'; end if;
  v_acc := a.account_id;

  select coalesce(array_agg(file_path), '{}') into v_file from certificati where allievo_id = a.id;
  delete from certificati where allievo_id = a.id;
  delete from allievi_etichette where allievo_id = a.id;
  delete from contatti_lead where allievo_id = a.id;
  delete from liste_attesa where allievo_id = a.id;

  update allievi set nome = 'Persona', cognome = 'anonimizzata', data_nascita = null, luogo_nascita = null,
         codice_fiscale = null, sesso = null, tessera = null, note = null, foto_url = null,
         certificato_scadenza = null, codice_esterno = null, stato_lead = 'perso',
         motivo_perso = 'Dati cancellati su richiesta'
   where id = a.id;

  -- chi paga si anonimizza solo se non paga anche per altri
  select count(*) into v_altri from allievi where account_id = v_acc and id <> a.id and cognome <> 'anonimizzata';
  if v_altri = 0 then
    delete from push_iscrizioni where account_id = v_acc;
    update account set nome = 'Cliente', cognome = 'anonimizzato', email = null, telefono = null, codice_fiscale = null,
           indirizzo = null, cap = null, citta = null, provincia = null, note = null, utm = null,
           consenso_marketing = false, codice_esterno = null, user_id = null
     where id = v_acc;
    update messaggi_coda set stato = 'annullato' where account_id = v_acc and stato = 'in_coda';
  end if;

  return jsonb_build_object('file_da_cancellare', to_jsonb(v_file), 'account_anonimizzato', v_altri = 0);
end $$;
revoke execute on function anonimizza_persona(uuid) from public, anon;
grant execute on function anonimizza_persona(uuid) to authenticated;

select 'ruoli' as cosa, count(*) from ruoli
union all select 'trigger del registro', count(*) from pg_trigger where tgname = 'registro';
