-- =====================================================================
-- RMHouse — 031 ABBONAMENTI VERI E IMPORT DA APP PALESTRE
--
-- 1. Gli abbonamenti diventano quelli di APP Palestre (83 tipi) con codice,
--    prezzo al banco e prezzo web, durata in mesi, in giorni o a mese solare,
--    famiglia e corsi coperti ricostruiti dal nome (non copiati da APP
--    Palestre, dove erano spuntati a caso).
-- 2. Nasce il LISTINO delle altre voci (contributi, rimborsi, campus): non
--    sono abbonamenti, si incassano e basta.
-- 3. Quota d'iscrizione annuale: 45 €.
-- 4. Via i 120 clienti finti di demo.sql, con tutto ciò che è loro.
-- 5. Prepara il database all'IMPORT dei clienti veri: i dati NON sono in
--    questo file (il repository è pubblico). Si caricano dal gestionale,
--    Persone → Importa da CSV → Da APP Palestre, e si possono ricaricare
--    tutte le volte che serve: chi c'è già viene aggiornato, non duplicato.
-- Tutto in un colpo: se un passaggio fallisce non cambia niente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nuove colonne e tabelle
-- ---------------------------------------------------------------------
alter table tipi_abbonamento add column if not exists codice text;
alter table tipi_abbonamento add column if not exists prezzo_web_cent int check (prezzo_web_cent is null or prezzo_web_cent >= 0);
alter table tipi_abbonamento add column if not exists durata_giorni int check (durata_giorni is null or durata_giorni > 0);
alter table tipi_abbonamento add column if not exists famiglia text;
alter table tipi_abbonamento add column if not exists archiviato boolean not null default false;

-- Chi arriva da un altro gestionale può non avere email o data di nascita
alter table account alter column email drop not null;
alter table allievi alter column data_nascita drop not null;

alter table account add column if not exists codice_esterno text;
alter table allievi add column if not exists codice_esterno text;
alter table allievi add column if not exists codice_fiscale text;
alter table allievi add column if not exists sesso text;
alter table allievi add column if not exists luogo_nascita text;
alter table allievi add column if not exists tessera text;
alter table iscrizioni add column if not exists codice_esterno text;
create unique index if not exists account_codice_esterno on account (palestra_id, codice_esterno) where codice_esterno is not null;
create unique index if not exists allievi_codice_esterno on allievi (palestra_id, codice_esterno) where codice_esterno is not null;
create unique index if not exists iscrizioni_codice_esterno on iscrizioni (palestra_id, codice_esterno) where codice_esterno is not null;

-- Voci a listino: si incassano ma non sono abbonamenti
create table if not exists voci_listino (
  id               uuid primary key default gen_random_uuid(),
  palestra_id      uuid not null references palestre(id) on delete cascade,
  codice           text,
  nome             text not null,
  categoria        text not null default 'altro' check (categoria in ('contributo', 'rimborso', 'evento', 'quota', 'altro')),
  prezzo_cent      int  not null default 0 check (prezzo_cent >= 0),
  prezzo_web_cent  int  check (prezzo_web_cent is null or prezzo_web_cent >= 0),
  attiva           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (palestra_id, nome)
);
alter table voci_listino enable row level security;
drop policy if exists staff_legge on voci_listino;
create policy staff_legge on voci_listino for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on voci_listino;
create policy gestione_scrive on voci_listino for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Storico degli abbonamenti venduti con il gestionale precedente
create table if not exists storico_abbonamenti (
  id                   uuid primary key default gen_random_uuid(),
  palestra_id          uuid not null references palestre(id) on delete cascade,
  allievo_id           uuid references allievi(id) on delete cascade,
  chiave               text not null,                 -- nome|cognome|email del file
  abbonamento          text not null,
  tipo_abbonamento_id  uuid references tipi_abbonamento(id) on delete set null,
  dal                  date,
  al                   date,
  stato                text,                          -- attivo / scaduto
  esaurito             boolean,
  restanti             int,
  valore_cent          int,
  iscrizione_id        uuid references iscrizioni(id) on delete set null,
  fonte                text not null default 'app_palestre',
  created_at           timestamptz not null default now()
);
create index if not exists storico_allievo on storico_abbonamenti (allievo_id, dal desc);
create index if not exists storico_palestra on storico_abbonamenti (palestra_id, dal);
alter table storico_abbonamenti enable row level security;
drop policy if exists gestione_legge on storico_abbonamenti;
create policy gestione_legge on storico_abbonamenti for select to authenticated using (is_gestione(palestra_id));
drop policy if exists gestione_scrive on storico_abbonamenti;
create policy gestione_scrive on storico_abbonamenti for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- La ricerca delle persone funziona anche per chi non ha email,
-- e trova anche per codice fiscale
create or replace view v_persone with (security_invoker = true) as
  select a.id, a.palestra_id, a.nome, a.cognome, a.data_nascita, a.stato_lead, a.certificato_scadenza,
         a.is_titolare, a.token, a.created_at, a.foto_url,
         acc.id as account_id, acc.nome as titolare_nome, acc.cognome as titolare_cognome,
         acc.email, acc.telefono,
         lower(concat_ws(' ', a.nome, a.cognome, acc.nome, acc.cognome, acc.email, acc.telefono, a.codice_fiscale)) as ricerca,
         (select count(*) from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva') as iscrizioni_attive,
         (a.certificato_scadenza is null or a.certificato_scadenza < current_date) as certificato_da_sistemare
  from allievi a
  join account acc on acc.id = a.account_id;

-- ---------------------------------------------------------------------
-- 2. Durata in giorni: la scadenza la calcola sempre il database
-- ---------------------------------------------------------------------
create or replace function trg_iscrizioni_before()
returns trigger language plpgsql as $$
declare t tipi_abbonamento;
begin
  select * into t from tipi_abbonamento where id = new.tipo_abbonamento_id;
  if new.data_fine is null then
    if t.durata_giorni is not null then
      new.data_fine := new.data_inizio + t.durata_giorni - 1;
    else
      new.data_fine := fine_periodo(new.data_inizio, t.durata_mesi, t.scadenza_fine_mese);
    end if;
  end if;
  if new.ingressi_residui is null and t.modalita = 'ingressi' then
    new.ingressi_residui := t.num_ingressi;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Import da APP Palestre (chiamate dal gestionale, a blocchi)
-- ---------------------------------------------------------------------

-- Persone: una riga per chi frequenta. Chi c'è già (stesso codice, oppure
-- stessa email e stesso nome) viene aggiornato.
create or replace function importa_app_palestre_clienti(p_palestra uuid, p_righe jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_all allievi; v_acc uuid; v_mese int; v_quota int;
  n_nuovi int := 0; n_aggiornati int := 0; n_account int := 0;
begin
  if auth.uid() is not null and not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select mese_inizio_stagione, quota_iscrizione_cent into v_mese, v_quota from palestre where id = p_palestra;

  for r in select * from jsonb_to_recordset(p_righe) as x(
      chiave text, nome text, cognome text, email text, telefono text, nascita date, luogo text,
      cf text, sesso text, indirizzo text, cap text, citta text, provincia text, intestatario text,
      tessera text, certificato date, prima date, quota_dal date, nota text, bloccato boolean)
  loop
    if coalesce(trim(r.nome), '') = '' then continue; end if;
    v_all := null; v_acc := null;

    select * into v_all from allievi where palestra_id = p_palestra and codice_esterno = r.chiave;
    if v_all.id is null and r.email is not null then
      select a.* into v_all from allievi a join account ac on ac.id = a.account_id
       where a.palestra_id = p_palestra and ac.email = r.email
         and lower(a.nome) = lower(r.nome) and lower(a.cognome) = lower(r.cognome)
       limit 1;
    end if;

    -- chi paga
    if v_all.id is not null then
      v_acc := v_all.account_id;
    elsif r.email is not null then
      select id into v_acc from account where palestra_id = p_palestra and email = r.email;
    else
      select id into v_acc from account where palestra_id = p_palestra and codice_esterno = 'noemail|' || r.chiave;
    end if;

    if v_acc is null then
      insert into account (palestra_id, nome, cognome, email, telefono, codice_fiscale, indirizzo, cap, citta,
                           provincia, fonte, codice_esterno)
      values (p_palestra, coalesce(r.intestatario, r.nome), case when r.intestatario is null then r.cognome else '' end,
              r.email, r.telefono, case when r.intestatario is null then r.cf end, r.indirizzo, r.cap, r.citta,
              r.provincia, 'app_palestre', case when r.email is null then 'noemail|' || r.chiave end)
      returning id into v_acc;
      n_account := n_account + 1;
    else
      update account set
        telefono  = coalesce(r.telefono, telefono),
        indirizzo = coalesce(r.indirizzo, indirizzo),
        cap       = coalesce(r.cap, cap),
        citta     = coalesce(r.citta, citta),
        provincia = coalesce(r.provincia, provincia)
      where id = v_acc;
    end if;

    -- chi frequenta
    if v_all.id is null then
      insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare, certificato_scadenza,
                           note, codice_fiscale, sesso, luogo_nascita, tessera, codice_esterno, created_at)
      values (p_palestra, v_acc, r.nome, r.cognome, r.nascita, r.intestatario is null, r.certificato,
              nullif(concat_ws(E'\n', case when r.bloccato then 'Bloccato in APP Palestre' end, r.nota), ''),
              r.cf, r.sesso, r.luogo, r.tessera, r.chiave, coalesce(r.prima::timestamptz, now()))
      returning * into v_all;
      n_nuovi := n_nuovi + 1;
    else
      update allievi set
        nome = r.nome, cognome = r.cognome,
        data_nascita = coalesce(r.nascita, data_nascita),
        certificato_scadenza = greatest(r.certificato, certificato_scadenza),
        codice_fiscale = coalesce(r.cf, codice_fiscale),
        sesso = coalesce(r.sesso, sesso),
        luogo_nascita = coalesce(r.luogo, luogo_nascita),
        tessera = coalesce(r.tessera, tessera),
        note = coalesce(note, nullif(concat_ws(E'\n', case when r.bloccato then 'Bloccato in APP Palestre' end, r.nota), '')),
        codice_esterno = r.chiave
      where id = v_all.id;
      n_aggiornati := n_aggiornati + 1;
    end if;

    -- quota annuale già pagata
    if r.quota_dal is not null then
      insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, data)
      values (p_palestra, v_all.id, stagione_di(r.quota_dal, v_mese), coalesce(v_quota, 0), r.quota_dal)
      on conflict (allievo_id, stagione) do nothing;
    end if;
  end loop;

  return jsonb_build_object('nuovi', n_nuovi, 'aggiornati', n_aggiornati, 'account_nuovi', n_account);
end $$;

-- Storico: il primo blocco (p_azzera) cancella lo storico importato prima
create or replace function importa_app_palestre_storico(p_palestra uuid, p_righe jsonb, p_azzera boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; n_senza int;
begin
  if auth.uid() is not null and not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_azzera then
    delete from storico_abbonamenti where palestra_id = p_palestra and fonte = 'app_palestre';
  end if;

  insert into storico_abbonamenti (palestra_id, allievo_id, chiave, abbonamento, tipo_abbonamento_id,
                                   dal, al, stato, esaurito, restanti, valore_cent)
  select p_palestra,
         (select id from allievi a where a.palestra_id = p_palestra and a.codice_esterno = x.chiave),
         x.chiave, x.abbonamento,
         (select id from tipi_abbonamento t where t.palestra_id = p_palestra
             and lower(regexp_replace(trim(t.nome), '\s+', ' ', 'g')) = lower(regexp_replace(trim(x.abbonamento), '\s+', ' ', 'g'))
           order by t.archiviato limit 1),
         x.dal, x.al, x.stato, x.esaurito, x.restanti, x.valore_cent
  from jsonb_to_recordset(p_righe) as x(chiave text, abbonamento text, dal date, al date, stato text,
                                        esaurito boolean, restanti int, valore_cent int);
  get diagnostics n = row_count;
  select count(*) into n_senza from jsonb_to_recordset(p_righe) as x(chiave text)
   where not exists (select 1 from allievi a where a.palestra_id = p_palestra and a.codice_esterno = x.chiave);
  return jsonb_build_object('righe', n, 'senza_persona', n_senza);
end $$;

-- Chiusura: abbonamenti in corso → iscrizioni vere, stato delle persone,
-- e nessuna email parte per effetto dell'import
create or replace function importa_app_palestre_chiudi(p_palestra uuid, p_dal timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s record; v_corso uuid; v_isc uuid; v_modalita modalita_abb; v_sede uuid;
  n_isc int := 0; v_non_abbinati jsonb;
begin
  if auth.uid() is not null and not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select id into v_sede from sedi where palestra_id = p_palestra and principale order by ordine limit 1;

  for s in
    select st.*, a.data_nascita
    from storico_abbonamenti st join allievi a on a.id = st.allievo_id
    where st.palestra_id = p_palestra and st.fonte = 'app_palestre' and st.stato = 'attivo'
      and st.tipo_abbonamento_id is not null and st.al >= current_date
  loop
    -- il corso più adatto tra quelli coperti: età giusta, sede principale, con orari
    select c.id into v_corso
    from tipi_abbonamento_corsi tc
    join corsi c on c.id = tc.corso_id and c.attivo
    join fasce_eta f on f.id = c.fascia_eta_id
    where tc.tipo_abbonamento_id = s.tipo_abbonamento_id
    order by (s.data_nascita is not null and extract(year from age(current_date, s.data_nascita))
                between f.eta_min and coalesce(f.eta_max, 200)) desc,
             (c.sede_id = v_sede) desc,
             (select count(*) from orari o where o.corso_id = c.id and o.attivo) desc,
             c.nome
    limit 1;
    if v_corso is null then continue; end if;

    select modalita into v_modalita from tipi_abbonamento where id = s.tipo_abbonamento_id;
    insert into iscrizioni (palestra_id, allievo_id, tipo_abbonamento_id, corso_id, data_inizio, data_fine, stato,
                            ingressi_residui, note, codice_esterno)
    values (p_palestra, s.allievo_id, s.tipo_abbonamento_id, v_corso, s.dal, s.al, 'attiva',
            case when v_modalita = 'ingressi' then s.restanti end,
            'Importata da APP Palestre: verifica corso e orari',
            s.chiave || '|' || s.abbonamento || '|' || s.dal)
    on conflict do nothing
    returning id into v_isc;
    if v_isc is not null then
      update storico_abbonamenti set iscrizione_id = v_isc where id = s.id;
      n_isc := n_isc + 1;
    end if;
    v_isc := null;
  end loop;

  -- stato delle persone importate
  update allievi a set stato_lead = 'iscritto', motivo_perso = null
   where a.palestra_id = p_palestra and a.codice_esterno is not null
     and exists (select 1 from storico_abbonamenti st where st.allievo_id = a.id);
  update allievi a set stato_lead = 'perso', motivo_perso = 'Registrato in APP Palestre, mai iscritto'
   where a.palestra_id = p_palestra and a.codice_esterno is not null and a.stato_lead = 'nuovo'
     and not exists (select 1 from storico_abbonamenti st where st.allievo_id = a.id);

  -- nessun messaggio automatico per effetto dell'import
  update messaggi_coda set stato = 'annullato'
   where palestra_id = p_palestra and stato = 'in_coda' and created_at >= p_dal;

  select coalesce(jsonb_agg(jsonb_build_object('abbonamento', abbonamento, 'quanti', quanti)), '[]'::jsonb)
    into v_non_abbinati
  from (select abbonamento, count(*) as quanti from storico_abbonamenti
         where palestra_id = p_palestra and fonte = 'app_palestre' and stato = 'attivo'
           and al >= current_date and iscrizione_id is null
         group by abbonamento order by count(*) desc) x;

  return jsonb_build_object('iscrizioni', n_isc, 'non_abbinati', v_non_abbinati);
end $$;

revoke execute on function importa_app_palestre_clienti(uuid, jsonb) from public, anon;
revoke execute on function importa_app_palestre_storico(uuid, jsonb, boolean) from public, anon;
revoke execute on function importa_app_palestre_chiudi(uuid, timestamptz) from public, anon;
grant execute on function importa_app_palestre_clienti(uuid, jsonb) to authenticated;
grant execute on function importa_app_palestre_storico(uuid, jsonb, boolean) to authenticated;
grant execute on function importa_app_palestre_chiudi(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Dati: abbonamenti, listino, quota, via i clienti finti
-- ---------------------------------------------------------------------
do $$
declare p palestre; v_inizio timestamptz := now(); n_demo int; n_tipi_vecchi int;
begin
  select * into p from palestre where slug = 'rmhouse';
  if not found then raise exception 'Palestra rmhouse non trovata'; end if;

  -- 4.1 via i clienti finti (come la 028 con v_via_clienti = true)
  create temp table _acc_demo on commit drop as
    select id from account where palestra_id = p.id and (note = 'DEMO' or email like 'demo%@esempio.it');
  select count(*) into n_demo from _acc_demo;
  delete from ricevute where palestra_id = p.id and account_id in (select id from _acc_demo);
  delete from documenti_fiscali where pagamento_id in (select id from pagamenti where account_id in (select id from _acc_demo));
  delete from allievi where account_id in (select id from _acc_demo);
  delete from pagamenti where account_id in (select id from _acc_demo);
  delete from account where id in (select id from _acc_demo);

  -- 4.2 abbonamenti
  create temp table _tipi (codice text, nome text, famiglia text, modalita text, durata_mesi int, durata_giorni int,
                           fine_mese boolean, lezioni int, ingressi int, prezzo int, web int) on commit drop;
  insert into _tipi values
      (null, 'AFRO 90 MIN TRIMESTRALE', 'Afro', 'orari_fissi', 1, null, false, 1, null, 16500, 16800),
      ('12LEZ4MESI', 'INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Corpo libero', 'ingressi', 4, null, false, null, 12, 16000, 16300),
      ('16 lez', 'ATTREZZI 60 MINUTI Open mensile', 'Con attrezzi / Open', 'libero', 1, null, true, null, null, 16000, 16300),
      ('A 1,5h 12 lez', 'AEREA 90 MIN 1 volta Trimestrale', 'Aerea adulti', 'orari_fissi', 3, null, false, 1, null, 22100, 22400),
      ('A 1,5h 24 lez', 'AEREA 90 min 2 volte Trimestrale', 'Aerea adulti', 'orari_fissi', 3, null, false, 2, null, 38500, 38800),
      ('A 1,5h 36 Lez.', 'AEREA 90 min 1 volta Annuale', 'Aerea adulti', 'orari_fissi', 10, null, false, 1, null, 66000, 66300),
      ('A 1,5h 4 lez', 'AEREA 90 min 1 volta Mensile', 'Aerea adulti', 'orari_fissi', 1, 28, false, 1, null, 7500, 7800),
      ('A 1,5h 8 lez', 'AEREA 90 min 2 volte Mensile', 'Aerea adulti', 'orari_fissi', 1, null, true, 2, null, 13500, 13800),
      ('A 12 lez K/T', 'AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Kids e Teen', 'orari_fissi', 3, null, false, 1, null, 15000, 15300),
      ('A 24 lez K/T', 'AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Kids e Teen', 'orari_fissi', 3, null, false, 2, null, 25500, 25800),
      ('A 4 lez', 'AEREA Kids/Teen 1 volta Mensile', 'Aerea Kids e Teen', 'orari_fissi', 1, 28, false, 1, null, 6000, 6300),
      ('A 8 lez K/T', 'AEREA Kids/Teen 2 volte Mensile', 'Aerea Kids e Teen', 'orari_fissi', 1, 28, false, 2, null, 9000, 9300),
      ('A ANN 36 lez', 'AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Kids e Teen', 'orari_fissi', 9, null, false, 1, null, 40500, 40800),
      ('A ANN. 72 lez', 'AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Kids e Teen', 'orari_fissi', 9, null, false, 2, null, 68400, 68700),
      ('A1.5 72 LEZIONI', 'AEREA 90min 2 volte ANNUALE', 'Aerea adulti', 'orari_fissi', 10, null, false, 2, null, 120000, null),
      ('A60mintrim', 'Cerchio 60 minuti trimestrale', 'Cerchio', 'orari_fissi', 3, null, false, 1, null, 16100, null),
      ('AGY 4 lez', 'ANTIGRAVITY 1 volta Mensile', 'Antigravity', 'orari_fissi', 1, null, true, 1, null, 6000, 6300),
      ('AGY 8 LEZ', 'ANTIGRAVITY 2 volte Mensile', 'Antigravity', 'orari_fissi', 1, null, false, 2, null, 9700, 10000),
      ('AGY A 1volta', 'Antigravity ANNUALE 1 volta', 'Antigravity', 'orari_fissi', 10, null, false, 1, null, 48000, 48300),
      ('AP 36 lez', 'AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea e Pole Kids e Teen', 'orari_fissi', 3, null, false, 3, null, 35000, 35300),
      ('AgoAerea', 'Aerea Agonismo Trimestrale', 'Aerea Agonismo', 'orari_fissi', 3, null, false, 2, null, 43200, 43500),
      ('Agy 12 lez', 'ANTIGRAVITY 1 volta Trimestrale', 'Antigravity', 'orari_fissi', 3, null, false, 1, null, 16100, 16400),
      ('Agy 24 lez', 'ANTIGRAVITY 2 volte Trimestrale', 'Antigravity', 'orari_fissi', 3, null, false, 2, null, 26100, 26400),
      ('BQ 10 lez', 'BURLESQUE 10 lezioni', 'Burlesque', 'ingressi', 3, null, false, null, 10, 15000, 15300),
      ('I 12 lez', 'INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Con attrezzi / Open', 'ingressi', 4, null, false, null, 12, 22800, 23100),
      ('I L 12 Lez', 'INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Corpo libero', 'ingressi', 4, null, false, null, 12, 16000, 16300),
      ('I L 12 lez', 'INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Con attrezzi / Open', 'ingressi', 4, null, false, null, 12, 17000, 17300),
      ('I L 5 Lez', 'INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Ingressi liberi', 'ingressi', 2, null, false, null, 5, 7500, 7800),
      ('I L 5 Lez', 'INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Con attrezzi / Open', 'ingressi', 3, null, false, null, 5, 9500, 9800),
      ('L 1', 'LEZIONE SINGOLA 60 min corpo libero', 'Corpo libero', 'ingressi', 1, 1, false, null, 1, 1500, 1600),
      ('L 1 lez', 'LEZIONE PROVA 60 min', 'Corpo libero', 'ingressi', 1, 1, false, null, 1, 1200, 1300),
      ('L 1 lez', 'LEZIONE PROVA 90 min', 'Con attrezzi / Open', 'ingressi', 1, 1, false, null, 1, 1500, 1600),
      ('L 1 lez', 'LEZIONE SINGOLA 90 min con attrezzi', 'Con attrezzi / Open', 'ingressi', 1, 1, false, null, 1, 2000, 2100),
      ('MINI', 'MINI 4-6 ANNI', 'Mini', 'orari_fissi', 3, null, false, 1, null, 12000, null),
      ('O90MIN', 'Attrezzi 90 min OPEN MENSILE', 'Con attrezzi / Open', 'libero', 1, null, false, null, null, 16000, 16300),
      ('O90T', 'ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Con attrezzi / Open', 'libero', 3, null, false, null, null, 47000, 47300),
      ('OPEN MENSILE', 'STREETDANCE Open Mensile', 'Street', 'libero', 1, 28, false, null, null, 14000, 14300),
      ('OpenAnn90minu', 'Open Annuale 90 minuti', 'Con attrezzi / Open', 'libero', 12, null, false, null, null, 135000, 135300),
      ('P', 'POLE/ATTREZZI 60 min OPEN Trimestrale', 'Con attrezzi / Open', 'libero', 3, null, false, null, null, 42600, 42900),
      ('P 12 lez', 'POLE DANCE 1 volta Trimestrale', 'Pole Dance', 'orari_fissi', 3, null, false, 1, null, 16100, 16400),
      ('P 12 lez', 'POLE DANCE 3 volte Mensile', 'Pole Dance', 'orari_fissi', 1, 28, false, 3, null, 13000, 13300),
      ('P 24 lez', 'POLE DANCE 2 volte Trimestrale', 'Pole Dance', 'orari_fissi', 3, null, false, 2, null, 26100, 26400),
      ('P 36 lez', 'POLE DANCE 3 volte Trimestrale', 'Pole Dance', 'orari_fissi', 3, null, false, 3, null, 35100, 35400),
      ('P 4 lez', 'POLE DANCE 1 volta Mensile', 'Pole Dance', 'orari_fissi', 1, 28, false, 1, null, 6000, 6300),
      ('P 8 lez', 'POLE DANCE 2 volte Mensile', 'Pole Dance', 'orari_fissi', 1, 28, false, 2, null, 9700, 10000),
      ('P ANN. 40 lez', 'POLE ANNUALE 1 volta', 'Pole Dance', 'orari_fissi', 10, null, false, 1, null, 48000, 48300),
      ('P Ann. 80 lez', 'POLE ANNUALE 2 volte', 'Pole Dance', 'orari_fissi', 10, null, false, 2, null, 80000, 80300),
      ('PD 12 lez', 'POLE YOUNG 1 volta Trimestrale', 'Pole Young', 'orari_fissi', 3, null, false, 1, null, 15000, 15300),
      ('PD 24 lez', 'POLE YOUNG 2 volte Trimestrale', 'Pole Young', 'orari_fissi', 3, null, false, 2, null, 25500, 25800),
      ('PYANN 80 lez', 'POLE YOUNG ANNUALE 2 volte', 'Pole Young', 'orari_fissi', 12, null, false, 2, null, 68400, 68700),
      ('S 12 lez', 'STREET ADULTI 3 volte Mensile', 'Street adulti', 'orari_fissi', 1, 28, false, 3, null, 9600, 9900),
      ('S 12 lez', 'STREET ADULTI 1 volta Trimestrale', 'Street adulti', 'orari_fissi', 3, null, false, 1, null, 13200, 13500),
      ('S 12 lez', 'STREET Kids e Teen 1 volta Trimestrale', 'Street Kids e Teen', 'orari_fissi', 3, null, false, 1, null, 13200, 13500),
      ('S 24 lez', 'STREET ADULTI 2 volte Trimestrale', 'Street adulti', 'orari_fissi', 3, null, false, 2, null, 21600, 21900),
      ('S 24 lez', 'STREET Kids e Teen 2 volte Trimestrale', 'Street Kids e Teen', 'orari_fissi', 3, null, false, 2, null, 20400, 20700),
      ('S 36 lez', 'STREET ADULTI 3 volte Trimestrale', 'Street adulti', 'orari_fissi', 3, null, false, 3, null, 29500, 29800),
      ('S 36 lez', 'STREETDANCE Kids/Teen 3 volte Trimestrale', 'Street Kids e Teen', 'orari_fissi', 3, null, false, 3, null, 28000, 28300),
      ('S 4 lez', 'STREET 1 volta Mensile 60 min', 'Street', 'orari_fissi', 1, 28, false, 1, null, 5000, 5300),
      ('S 4 lez', 'STREET ADULTI 1 volta Mensile', 'Street adulti', 'orari_fissi', 1, 28, false, 1, null, 5000, 5200),
      ('S 48 lez', 'STREET OPEN Trimestrale', 'Street', 'libero', 3, null, false, null, null, 39000, 39400),
      ('S 8 lez', 'STREET 2 volte Mensile', 'Street', 'orari_fissi', 1, 28, false, 2, null, 8000, 8300),
      ('S ANN. 1', 'STREET ANNUALE ADULTI 1 volta', 'Street adulti', 'orari_fissi', 10, null, false, 1, null, 36000, 36300),
      ('S ANN. 1 K/T', 'STREET ANNUALE Kids e Teen 1 volta', 'Street Kids e Teen', 'orari_fissi', 9, null, false, 1, null, 36000, 36300),
      ('S ANN. 2', 'STREET ANNUALE ADULTI 2 volte', 'Street adulti', 'orari_fissi', 10, null, false, 2, null, 62000, 62300),
      ('S ANN. 2 K/T', 'STREET ANNUALE Kids e Teen 2 volte', 'Street Kids e Teen', 'orari_fissi', 9, null, false, 2, null, 54000, 54300),
      ('S ANN. 3', 'STREET ANNUALE ADULTI 3 volte', 'Street adulti', 'orari_fissi', 10, null, false, 3, null, 86400, 86700),
      ('S ANN. 3 K/T', 'STREET ANNUALE Kids e Teen 3 volte', 'Street Kids e Teen', 'orari_fissi', 9, null, false, 3, null, 75600, 75900),
      ('S ANN. 4', 'STREET ANNUALE ADULTI 4 volte', 'Street adulti', 'orari_fissi', 10, null, false, 4, null, 112000, 112300),
      ('S ANN. 4 K/T', 'STREET ANNUALE Kids e Teen 4 volte', 'Street Kids e Teen', 'orari_fissi', 9, null, false, 4, null, 100800, 111100),
      ('SH60+9024LEZ', 'STREET HEELS 60+90MIN TRIMESTRALE', 'Heels', 'orari_fissi', 3, null, false, 2, null, 27700, 28000),
      ('SH90min12LEZ', 'STREET HEELS 90min TRIMESTRALE', 'Heels', 'orari_fissi', 3, null, false, 1, null, 16500, 16800),
      ('ST 4 lez', 'STREET kids e Teen 1 volta mensile', 'Street Kids e Teen', 'orari_fissi', 1, null, true, 1, null, 5000, 5300),
      ('ST 8 lez', 'STREET Kids e Teen 2 volte mensile', 'Street Kids e Teen', 'orari_fissi', 1, null, true, 2, null, 7000, 7300),
      ('St 12 lez', 'STREET Kids e Teen 3 volte mensile', 'Street Kids e Teen', 'orari_fissi', 1, null, true, 3, null, 10000, 10300),
      ('T 4 lez', 'TAI CHI O SHALIN 1 lez Mensile', 'Tai Chi e Shaolin', 'orari_fissi', 1, 28, false, 1, null, 5000, 5300),
      ('T 12 LEZ', 'TAI CHI O SHAOLIN 1 lez Trimestrale', 'Tai Chi e Shaolin', 'orari_fissi', 1, null, false, 1, null, 12000, 12300),
      ('T 16 LEZ', 'TAI CHI E SHAOLIN 4 lez Mensile', 'Tai Chi e Shaolin', 'orari_fissi', 1, null, false, 4, null, 8500, 8800),
      ('T 24 lez', 'TAI CHI O SHAOLIN 2 lez Trimestrale', 'Tai Chi e Shaolin', 'orari_fissi', 3, null, false, 2, null, 16200, 16500),
      ('T 48 lez.', 'TAI CHI E SHAOLIN 4 lez Trimestrale', 'Tai Chi e Shaolin', 'orari_fissi', 3, null, false, 4, null, 23000, 23300),
      ('T 8 lez', 'TAI CHI O SHAOLIN 2 lez Mensile', 'Tai Chi e Shaolin', 'orari_fissi', 1, 28, false, 2, null, 6000, 6300),
      ('Y 12 lez', 'YOGA 1 volta Trimestrale', 'Yoga', 'orari_fissi', 3, null, false, 1, null, 16100, 16400),
      ('Y 4 lez', 'YOGA 1 volta Mensile', 'Yoga', 'orari_fissi', 1, null, true, 1, null, 6000, 6300),
      ('ap12l', 'aerea pacchetto 12 lezioni', 'Aerea', 'ingressi', 4, null, false, null, 12, 22800, 23000);

  create temp table _tipi_corsi (tipo text, corso text) on commit drop;
  insert into _tipi_corsi values
      ('AFRO 90 MIN TRIMESTRALE', 'Afro'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Afro'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Burlesque Liv.1'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Burlesque Liv.2'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Country Dance'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Danza classica amatoriale'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Danza contemporanea amatoriale'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Danza moderna'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Ginnastica posturale'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Heels'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Heels liv. 2'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Hip Hop 2'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Hip Hop Open Class'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Hip Hop adulti'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Hustle Dance'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Pilates'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Shaolin Kung Fu 1'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Shaolin Kung Fu 2'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Tai Chi'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Yoga'),
      ('INGRESSI LIBERI 12 LEZIONI 60min CORPO LIBERO (4 MESI)', 'Zumba'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea 1 Schio'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea 2 Schio'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea Agonismo'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea Cerchio'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea Cerchio 2'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea Performance Team'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea adulti 1'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea adulti 2'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerea adulti 3'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Aerial Fusion'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Antigravity 3'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Antigravity Bolzano Vicentino'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Antigravity Restorative'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Antigravity® Liv.1'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Antigravity® Liv.2'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Antigravity® Pausa Pranzo'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Exotic Pole Open Level'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Flexy'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Open Training'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Pole Dance Liv.1'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Pole Dance Liv.2'),
      ('ATTREZZI 60 MINUTI Open mensile', 'Pole Dance Liv.3'),
      ('AEREA 90 MIN 1 volta Trimestrale', 'Aerea 1 Schio'),
      ('AEREA 90 MIN 1 volta Trimestrale', 'Aerea 2 Schio'),
      ('AEREA 90 MIN 1 volta Trimestrale', 'Aerea Cerchio'),
      ('AEREA 90 MIN 1 volta Trimestrale', 'Aerea Cerchio 2'),
      ('AEREA 90 MIN 1 volta Trimestrale', 'Aerea adulti 1'),
      ('AEREA 90 MIN 1 volta Trimestrale', 'Aerea adulti 2'),
      ('AEREA 90 MIN 1 volta Trimestrale', 'Aerea adulti 3'),
      ('AEREA 90 MIN 1 volta Trimestrale', 'Aerial Fusion'),
      ('AEREA 90 min 2 volte Trimestrale', 'Aerea 1 Schio'),
      ('AEREA 90 min 2 volte Trimestrale', 'Aerea 2 Schio'),
      ('AEREA 90 min 2 volte Trimestrale', 'Aerea Cerchio'),
      ('AEREA 90 min 2 volte Trimestrale', 'Aerea Cerchio 2'),
      ('AEREA 90 min 2 volte Trimestrale', 'Aerea adulti 1'),
      ('AEREA 90 min 2 volte Trimestrale', 'Aerea adulti 2'),
      ('AEREA 90 min 2 volte Trimestrale', 'Aerea adulti 3'),
      ('AEREA 90 min 2 volte Trimestrale', 'Aerial Fusion'),
      ('AEREA 90 min 1 volta Annuale', 'Aerea 1 Schio'),
      ('AEREA 90 min 1 volta Annuale', 'Aerea 2 Schio'),
      ('AEREA 90 min 1 volta Annuale', 'Aerea Cerchio'),
      ('AEREA 90 min 1 volta Annuale', 'Aerea Cerchio 2'),
      ('AEREA 90 min 1 volta Annuale', 'Aerea adulti 1'),
      ('AEREA 90 min 1 volta Annuale', 'Aerea adulti 2'),
      ('AEREA 90 min 1 volta Annuale', 'Aerea adulti 3'),
      ('AEREA 90 min 1 volta Annuale', 'Aerial Fusion'),
      ('AEREA 90 min 1 volta Mensile', 'Aerea 1 Schio'),
      ('AEREA 90 min 1 volta Mensile', 'Aerea 2 Schio'),
      ('AEREA 90 min 1 volta Mensile', 'Aerea Cerchio'),
      ('AEREA 90 min 1 volta Mensile', 'Aerea Cerchio 2'),
      ('AEREA 90 min 1 volta Mensile', 'Aerea adulti 1'),
      ('AEREA 90 min 1 volta Mensile', 'Aerea adulti 2'),
      ('AEREA 90 min 1 volta Mensile', 'Aerea adulti 3'),
      ('AEREA 90 min 1 volta Mensile', 'Aerial Fusion'),
      ('AEREA 90 min 2 volte Mensile', 'Aerea 1 Schio'),
      ('AEREA 90 min 2 volte Mensile', 'Aerea 2 Schio'),
      ('AEREA 90 min 2 volte Mensile', 'Aerea Cerchio'),
      ('AEREA 90 min 2 volte Mensile', 'Aerea Cerchio 2'),
      ('AEREA 90 min 2 volte Mensile', 'Aerea adulti 1'),
      ('AEREA 90 min 2 volte Mensile', 'Aerea adulti 2'),
      ('AEREA 90 min 2 volte Mensile', 'Aerea adulti 3'),
      ('AEREA 90 min 2 volte Mensile', 'Aerial Fusion'),
      ('AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Kids 1'),
      ('AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Kids 2'),
      ('AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Kids Bolzano Vicentino'),
      ('AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Teen 1'),
      ('AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Teen 2'),
      ('AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Teen 3'),
      ('AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Teen Bolzano Vicentino'),
      ('AEREA Kids/Teen 1 volta Trimestrale', 'Aerea Young 1 Schio'),
      ('AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Kids 1'),
      ('AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Kids 2'),
      ('AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Kids Bolzano Vicentino'),
      ('AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Teen 1'),
      ('AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Teen 2'),
      ('AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Teen 3'),
      ('AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Teen Bolzano Vicentino'),
      ('AEREA Kids/Teen 2 volte Trimestrale', 'Aerea Young 1 Schio'),
      ('AEREA Kids/Teen 1 volta Mensile', 'Aerea Kids 1'),
      ('AEREA Kids/Teen 1 volta Mensile', 'Aerea Kids 2'),
      ('AEREA Kids/Teen 1 volta Mensile', 'Aerea Kids Bolzano Vicentino'),
      ('AEREA Kids/Teen 1 volta Mensile', 'Aerea Teen 1'),
      ('AEREA Kids/Teen 1 volta Mensile', 'Aerea Teen 2'),
      ('AEREA Kids/Teen 1 volta Mensile', 'Aerea Teen 3'),
      ('AEREA Kids/Teen 1 volta Mensile', 'Aerea Teen Bolzano Vicentino'),
      ('AEREA Kids/Teen 1 volta Mensile', 'Aerea Young 1 Schio'),
      ('AEREA Kids/Teen 2 volte Mensile', 'Aerea Kids 1'),
      ('AEREA Kids/Teen 2 volte Mensile', 'Aerea Kids 2'),
      ('AEREA Kids/Teen 2 volte Mensile', 'Aerea Kids Bolzano Vicentino'),
      ('AEREA Kids/Teen 2 volte Mensile', 'Aerea Teen 1'),
      ('AEREA Kids/Teen 2 volte Mensile', 'Aerea Teen 2'),
      ('AEREA Kids/Teen 2 volte Mensile', 'Aerea Teen 3'),
      ('AEREA Kids/Teen 2 volte Mensile', 'Aerea Teen Bolzano Vicentino'),
      ('AEREA Kids/Teen 2 volte Mensile', 'Aerea Young 1 Schio'),
      ('AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Kids 1'),
      ('AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Kids 2'),
      ('AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Kids Bolzano Vicentino'),
      ('AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Teen 1'),
      ('AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Teen 2'),
      ('AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Teen 3'),
      ('AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Teen Bolzano Vicentino'),
      ('AEREA ANNUALE Kids/Teen 1 volta', 'Aerea Young 1 Schio'),
      ('AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Kids 1'),
      ('AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Kids 2'),
      ('AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Kids Bolzano Vicentino'),
      ('AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Teen 1'),
      ('AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Teen 2'),
      ('AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Teen 3'),
      ('AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Teen Bolzano Vicentino'),
      ('AEREA ANNUALE Kids/Teen 2 volte', 'Aerea Young 1 Schio'),
      ('AEREA 90min 2 volte ANNUALE', 'Aerea 1 Schio'),
      ('AEREA 90min 2 volte ANNUALE', 'Aerea 2 Schio'),
      ('AEREA 90min 2 volte ANNUALE', 'Aerea Cerchio'),
      ('AEREA 90min 2 volte ANNUALE', 'Aerea Cerchio 2'),
      ('AEREA 90min 2 volte ANNUALE', 'Aerea adulti 1'),
      ('AEREA 90min 2 volte ANNUALE', 'Aerea adulti 2'),
      ('AEREA 90min 2 volte ANNUALE', 'Aerea adulti 3'),
      ('AEREA 90min 2 volte ANNUALE', 'Aerial Fusion'),
      ('Cerchio 60 minuti trimestrale', 'Aerea Cerchio'),
      ('Cerchio 60 minuti trimestrale', 'Aerea Cerchio 2'),
      ('ANTIGRAVITY 1 volta Mensile', 'Antigravity 3'),
      ('ANTIGRAVITY 1 volta Mensile', 'Antigravity Bolzano Vicentino'),
      ('ANTIGRAVITY 1 volta Mensile', 'Antigravity Restorative'),
      ('ANTIGRAVITY 1 volta Mensile', 'Antigravity® Liv.1'),
      ('ANTIGRAVITY 1 volta Mensile', 'Antigravity® Liv.2'),
      ('ANTIGRAVITY 1 volta Mensile', 'Antigravity® Pausa Pranzo'),
      ('ANTIGRAVITY 2 volte Mensile', 'Antigravity 3'),
      ('ANTIGRAVITY 2 volte Mensile', 'Antigravity Bolzano Vicentino'),
      ('ANTIGRAVITY 2 volte Mensile', 'Antigravity Restorative'),
      ('ANTIGRAVITY 2 volte Mensile', 'Antigravity® Liv.1'),
      ('ANTIGRAVITY 2 volte Mensile', 'Antigravity® Liv.2'),
      ('ANTIGRAVITY 2 volte Mensile', 'Antigravity® Pausa Pranzo'),
      ('Antigravity ANNUALE 1 volta', 'Antigravity 3'),
      ('Antigravity ANNUALE 1 volta', 'Antigravity Bolzano Vicentino'),
      ('Antigravity ANNUALE 1 volta', 'Antigravity Restorative'),
      ('Antigravity ANNUALE 1 volta', 'Antigravity® Liv.1'),
      ('Antigravity ANNUALE 1 volta', 'Antigravity® Liv.2'),
      ('Antigravity ANNUALE 1 volta', 'Antigravity® Pausa Pranzo'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea Kids 1'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea Kids 2'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea Kids Bolzano Vicentino'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea Teen 1'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea Teen 2'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea Teen 3'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea Teen Bolzano Vicentino'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Aerea Young 1 Schio'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Pole Young 1'),
      ('AEREA/POLE Kids/Teen 3 volte Trimestrale', 'Pole Young 2'),
      ('Aerea Agonismo Trimestrale', 'Aerea Agonismo'),
      ('Aerea Agonismo Trimestrale', 'Aerea Performance Team'),
      ('ANTIGRAVITY 1 volta Trimestrale', 'Antigravity 3'),
      ('ANTIGRAVITY 1 volta Trimestrale', 'Antigravity Bolzano Vicentino'),
      ('ANTIGRAVITY 1 volta Trimestrale', 'Antigravity Restorative'),
      ('ANTIGRAVITY 1 volta Trimestrale', 'Antigravity® Liv.1'),
      ('ANTIGRAVITY 1 volta Trimestrale', 'Antigravity® Liv.2'),
      ('ANTIGRAVITY 1 volta Trimestrale', 'Antigravity® Pausa Pranzo'),
      ('ANTIGRAVITY 2 volte Trimestrale', 'Antigravity 3'),
      ('ANTIGRAVITY 2 volte Trimestrale', 'Antigravity Bolzano Vicentino'),
      ('ANTIGRAVITY 2 volte Trimestrale', 'Antigravity Restorative'),
      ('ANTIGRAVITY 2 volte Trimestrale', 'Antigravity® Liv.1'),
      ('ANTIGRAVITY 2 volte Trimestrale', 'Antigravity® Liv.2'),
      ('ANTIGRAVITY 2 volte Trimestrale', 'Antigravity® Pausa Pranzo'),
      ('BURLESQUE 10 lezioni', 'Burlesque Liv.1'),
      ('BURLESQUE 10 lezioni', 'Burlesque Liv.2'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea 1 Schio'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea 2 Schio'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea Agonismo'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea Cerchio'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea Cerchio 2'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea Performance Team'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea adulti 1'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea adulti 2'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerea adulti 3'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Aerial Fusion'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Antigravity 3'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Antigravity Bolzano Vicentino'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Antigravity Restorative'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Antigravity® Liv.1'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Antigravity® Liv.2'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Antigravity® Pausa Pranzo'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Exotic Pole Open Level'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Flexy'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Open Training'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Pole Dance Liv.1'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Pole Dance Liv.2'),
      ('INGRESSI LIBERI 12 Lez 90 min con Attrezzi (validità 4 mesi)', 'Pole Dance Liv.3'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Afro'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Burlesque Liv.1'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Burlesque Liv.2'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Country Dance'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Danza classica amatoriale'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Danza contemporanea amatoriale'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Danza moderna'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Ginnastica posturale'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Heels'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Heels liv. 2'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Hip Hop 2'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Hip Hop Open Class'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Hip Hop adulti'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Hustle Dance'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Pilates'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Shaolin Kung Fu 1'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Shaolin Kung Fu 2'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Tai Chi'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Yoga'),
      ('INGRESSI LIBERI 12 lez. da 60 min corpo libero (validità 4 mesi)', 'Zumba'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea 1 Schio'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea 2 Schio'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea Agonismo'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea Cerchio'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea Cerchio 2'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea Performance Team'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea adulti 1'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea adulti 2'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerea adulti 3'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Aerial Fusion'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Antigravity 3'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Antigravity Bolzano Vicentino'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Antigravity Restorative'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Antigravity® Liv.1'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Antigravity® Liv.2'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Antigravity® Pausa Pranzo'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Exotic Pole Open Level'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Flexy'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Open Training'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Pole Dance Liv.1'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Pole Dance Liv.2'),
      ('INGRESSI LIBERI 12 lezioni da 60 min con attrezzi (validità 4 mesi)', 'Pole Dance Liv.3'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea 1 Schio'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea 2 Schio'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea Agonismo'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea Cerchio'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea Cerchio 2'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea Performance Team'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea adulti 1'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea adulti 2'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerea adulti 3'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Aerial Fusion'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Afro'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Antigravity 3'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Antigravity Bolzano Vicentino'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Antigravity Restorative'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Antigravity® Liv.1'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Antigravity® Liv.2'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Antigravity® Pausa Pranzo'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Burlesque Liv.1'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Burlesque Liv.2'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Country Dance'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Danza classica amatoriale'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Danza contemporanea amatoriale'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Danza moderna'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Exotic Pole Open Level'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Flexy'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Ginnastica posturale'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Heels'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Heels liv. 2'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Hip Hop 2'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Hip Hop Open Class'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Hip Hop adulti'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Hustle Dance'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Open Training'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Pilates'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Pole Dance Liv.1'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Pole Dance Liv.2'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Pole Dance Liv.3'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Shaolin Kung Fu 1'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Shaolin Kung Fu 2'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Tai Chi'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Yoga'),
      ('INGRESSI LIBERI 5 lezioni 60 min (validità 2 mesi)', 'Zumba'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea 1 Schio'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea 2 Schio'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea Agonismo'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea Cerchio'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea Cerchio 2'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea Performance Team'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea adulti 1'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea adulti 2'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerea adulti 3'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Aerial Fusion'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Antigravity 3'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Antigravity Bolzano Vicentino'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Antigravity Restorative'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Antigravity® Liv.1'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Antigravity® Liv.2'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Antigravity® Pausa Pranzo'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Exotic Pole Open Level'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Flexy'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Open Training'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Pole Dance Liv.1'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Pole Dance Liv.2'),
      ('INGRESSI LIBERI 5 lezioni 90 min (validità 3 mesi)', 'Pole Dance Liv.3'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Afro'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Burlesque Liv.1'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Burlesque Liv.2'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Country Dance'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Danza classica amatoriale'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Danza contemporanea amatoriale'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Danza moderna'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Ginnastica posturale'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Heels'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Heels liv. 2'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Hip Hop 2'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Hip Hop Open Class'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Hip Hop adulti'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Hustle Dance'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Pilates'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Shaolin Kung Fu 1'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Shaolin Kung Fu 2'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Tai Chi'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Yoga'),
      ('LEZIONE SINGOLA 60 min corpo libero', 'Zumba'),
      ('LEZIONE PROVA 60 min', 'Afro'),
      ('LEZIONE PROVA 60 min', 'Burlesque Liv.1'),
      ('LEZIONE PROVA 60 min', 'Burlesque Liv.2'),
      ('LEZIONE PROVA 60 min', 'Country Dance'),
      ('LEZIONE PROVA 60 min', 'Danza classica amatoriale'),
      ('LEZIONE PROVA 60 min', 'Danza contemporanea amatoriale'),
      ('LEZIONE PROVA 60 min', 'Danza moderna'),
      ('LEZIONE PROVA 60 min', 'Ginnastica posturale'),
      ('LEZIONE PROVA 60 min', 'Heels'),
      ('LEZIONE PROVA 60 min', 'Heels liv. 2'),
      ('LEZIONE PROVA 60 min', 'Hip Hop 2'),
      ('LEZIONE PROVA 60 min', 'Hip Hop Open Class'),
      ('LEZIONE PROVA 60 min', 'Hip Hop adulti'),
      ('LEZIONE PROVA 60 min', 'Hustle Dance'),
      ('LEZIONE PROVA 60 min', 'Pilates'),
      ('LEZIONE PROVA 60 min', 'Shaolin Kung Fu 1'),
      ('LEZIONE PROVA 60 min', 'Shaolin Kung Fu 2'),
      ('LEZIONE PROVA 60 min', 'Tai Chi'),
      ('LEZIONE PROVA 60 min', 'Yoga'),
      ('LEZIONE PROVA 60 min', 'Zumba'),
      ('LEZIONE PROVA 90 min', 'Aerea 1 Schio'),
      ('LEZIONE PROVA 90 min', 'Aerea 2 Schio'),
      ('LEZIONE PROVA 90 min', 'Aerea Agonismo'),
      ('LEZIONE PROVA 90 min', 'Aerea Cerchio'),
      ('LEZIONE PROVA 90 min', 'Aerea Cerchio 2'),
      ('LEZIONE PROVA 90 min', 'Aerea Performance Team'),
      ('LEZIONE PROVA 90 min', 'Aerea adulti 1'),
      ('LEZIONE PROVA 90 min', 'Aerea adulti 2'),
      ('LEZIONE PROVA 90 min', 'Aerea adulti 3'),
      ('LEZIONE PROVA 90 min', 'Aerial Fusion'),
      ('LEZIONE PROVA 90 min', 'Antigravity 3'),
      ('LEZIONE PROVA 90 min', 'Antigravity Bolzano Vicentino'),
      ('LEZIONE PROVA 90 min', 'Antigravity Restorative'),
      ('LEZIONE PROVA 90 min', 'Antigravity® Liv.1'),
      ('LEZIONE PROVA 90 min', 'Antigravity® Liv.2'),
      ('LEZIONE PROVA 90 min', 'Antigravity® Pausa Pranzo'),
      ('LEZIONE PROVA 90 min', 'Exotic Pole Open Level'),
      ('LEZIONE PROVA 90 min', 'Flexy'),
      ('LEZIONE PROVA 90 min', 'Open Training'),
      ('LEZIONE PROVA 90 min', 'Pole Dance Liv.1'),
      ('LEZIONE PROVA 90 min', 'Pole Dance Liv.2'),
      ('LEZIONE PROVA 90 min', 'Pole Dance Liv.3'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea 1 Schio'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea 2 Schio'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea Agonismo'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea Cerchio'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea Cerchio 2'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea Performance Team'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea adulti 1'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea adulti 2'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerea adulti 3'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Aerial Fusion'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Antigravity 3'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Antigravity Bolzano Vicentino'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Antigravity Restorative'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Antigravity® Liv.1'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Antigravity® Liv.2'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Antigravity® Pausa Pranzo'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Exotic Pole Open Level'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Flexy'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Open Training'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Pole Dance Liv.1'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Pole Dance Liv.2'),
      ('LEZIONE SINGOLA 90 min con attrezzi', 'Pole Dance Liv.3'),
      ('MINI 4-6 ANNI', 'Aerea Mini 5-6'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea 1 Schio'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea 2 Schio'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea Agonismo'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea Cerchio'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea Cerchio 2'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea Performance Team'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea adulti 1'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea adulti 2'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerea adulti 3'),
      ('Attrezzi 90 min OPEN MENSILE', 'Aerial Fusion'),
      ('Attrezzi 90 min OPEN MENSILE', 'Antigravity 3'),
      ('Attrezzi 90 min OPEN MENSILE', 'Antigravity Bolzano Vicentino'),
      ('Attrezzi 90 min OPEN MENSILE', 'Antigravity Restorative'),
      ('Attrezzi 90 min OPEN MENSILE', 'Antigravity® Liv.1'),
      ('Attrezzi 90 min OPEN MENSILE', 'Antigravity® Liv.2'),
      ('Attrezzi 90 min OPEN MENSILE', 'Antigravity® Pausa Pranzo'),
      ('Attrezzi 90 min OPEN MENSILE', 'Exotic Pole Open Level'),
      ('Attrezzi 90 min OPEN MENSILE', 'Flexy'),
      ('Attrezzi 90 min OPEN MENSILE', 'Open Training'),
      ('Attrezzi 90 min OPEN MENSILE', 'Pole Dance Liv.1'),
      ('Attrezzi 90 min OPEN MENSILE', 'Pole Dance Liv.2'),
      ('Attrezzi 90 min OPEN MENSILE', 'Pole Dance Liv.3'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea 1 Schio'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea 2 Schio'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea Agonismo'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea Cerchio'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea Cerchio 2'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea Performance Team'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea adulti 1'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea adulti 2'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerea adulti 3'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Aerial Fusion'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Antigravity 3'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Antigravity Bolzano Vicentino'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Antigravity Restorative'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Antigravity® Liv.1'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Antigravity® Liv.2'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Antigravity® Pausa Pranzo'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Exotic Pole Open Level'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Flexy'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Open Training'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Pole Dance Liv.1'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Pole Dance Liv.2'),
      ('ATTREZZI OPEN 90 MIN TRIMESTRALE', 'Pole Dance Liv.3'),
      ('STREETDANCE Open Mensile', 'Afro'),
      ('STREETDANCE Open Mensile', 'Breakdance 1'),
      ('STREETDANCE Open Mensile', 'Breakdance 2'),
      ('STREETDANCE Open Mensile', 'Danza classica amatoriale'),
      ('STREETDANCE Open Mensile', 'Danza classica young'),
      ('STREETDANCE Open Mensile', 'Danza contemporanea amatoriale'),
      ('STREETDANCE Open Mensile', 'Danza moderna'),
      ('STREETDANCE Open Mensile', 'Heels'),
      ('STREETDANCE Open Mensile', 'Heels liv. 2'),
      ('STREETDANCE Open Mensile', 'Hip Hop 2'),
      ('STREETDANCE Open Mensile', 'Hip Hop Kids'),
      ('STREETDANCE Open Mensile', 'Hip Hop Mini 5-6 anni'),
      ('STREETDANCE Open Mensile', 'Hip Hop Open Class'),
      ('STREETDANCE Open Mensile', 'Hip Hop Teen'),
      ('STREETDANCE Open Mensile', 'Hip Hop adulti'),
      ('STREETDANCE Open Mensile', 'K Pop'),
      ('Open Annuale 90 minuti', 'Aerea 1 Schio'),
      ('Open Annuale 90 minuti', 'Aerea 2 Schio'),
      ('Open Annuale 90 minuti', 'Aerea Agonismo'),
      ('Open Annuale 90 minuti', 'Aerea Cerchio'),
      ('Open Annuale 90 minuti', 'Aerea Cerchio 2'),
      ('Open Annuale 90 minuti', 'Aerea Performance Team'),
      ('Open Annuale 90 minuti', 'Aerea adulti 1'),
      ('Open Annuale 90 minuti', 'Aerea adulti 2'),
      ('Open Annuale 90 minuti', 'Aerea adulti 3'),
      ('Open Annuale 90 minuti', 'Aerial Fusion'),
      ('Open Annuale 90 minuti', 'Antigravity 3'),
      ('Open Annuale 90 minuti', 'Antigravity Bolzano Vicentino'),
      ('Open Annuale 90 minuti', 'Antigravity Restorative'),
      ('Open Annuale 90 minuti', 'Antigravity® Liv.1'),
      ('Open Annuale 90 minuti', 'Antigravity® Liv.2'),
      ('Open Annuale 90 minuti', 'Antigravity® Pausa Pranzo'),
      ('Open Annuale 90 minuti', 'Exotic Pole Open Level'),
      ('Open Annuale 90 minuti', 'Flexy'),
      ('Open Annuale 90 minuti', 'Open Training'),
      ('Open Annuale 90 minuti', 'Pole Dance Liv.1'),
      ('Open Annuale 90 minuti', 'Pole Dance Liv.2'),
      ('Open Annuale 90 minuti', 'Pole Dance Liv.3'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea 1 Schio'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea 2 Schio'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea Agonismo'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea Cerchio'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea Cerchio 2'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea Performance Team'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea adulti 1'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea adulti 2'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerea adulti 3'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Aerial Fusion'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Antigravity 3'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Antigravity Bolzano Vicentino'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Antigravity Restorative'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Antigravity® Liv.1'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Antigravity® Liv.2'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Antigravity® Pausa Pranzo'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Exotic Pole Open Level'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Flexy'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Open Training'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Pole Dance Liv.1'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Pole Dance Liv.2'),
      ('POLE/ATTREZZI 60 min OPEN Trimestrale', 'Pole Dance Liv.3'),
      ('POLE DANCE 1 volta Trimestrale', 'Exotic Pole Open Level'),
      ('POLE DANCE 1 volta Trimestrale', 'Pole Dance Liv.1'),
      ('POLE DANCE 1 volta Trimestrale', 'Pole Dance Liv.2'),
      ('POLE DANCE 1 volta Trimestrale', 'Pole Dance Liv.3'),
      ('POLE DANCE 3 volte Mensile', 'Exotic Pole Open Level'),
      ('POLE DANCE 3 volte Mensile', 'Pole Dance Liv.1'),
      ('POLE DANCE 3 volte Mensile', 'Pole Dance Liv.2'),
      ('POLE DANCE 3 volte Mensile', 'Pole Dance Liv.3'),
      ('POLE DANCE 2 volte Trimestrale', 'Exotic Pole Open Level'),
      ('POLE DANCE 2 volte Trimestrale', 'Pole Dance Liv.1'),
      ('POLE DANCE 2 volte Trimestrale', 'Pole Dance Liv.2'),
      ('POLE DANCE 2 volte Trimestrale', 'Pole Dance Liv.3'),
      ('POLE DANCE 3 volte Trimestrale', 'Exotic Pole Open Level'),
      ('POLE DANCE 3 volte Trimestrale', 'Pole Dance Liv.1'),
      ('POLE DANCE 3 volte Trimestrale', 'Pole Dance Liv.2'),
      ('POLE DANCE 3 volte Trimestrale', 'Pole Dance Liv.3'),
      ('POLE DANCE 1 volta Mensile', 'Exotic Pole Open Level'),
      ('POLE DANCE 1 volta Mensile', 'Pole Dance Liv.1'),
      ('POLE DANCE 1 volta Mensile', 'Pole Dance Liv.2'),
      ('POLE DANCE 1 volta Mensile', 'Pole Dance Liv.3'),
      ('POLE DANCE 2 volte Mensile', 'Exotic Pole Open Level'),
      ('POLE DANCE 2 volte Mensile', 'Pole Dance Liv.1'),
      ('POLE DANCE 2 volte Mensile', 'Pole Dance Liv.2'),
      ('POLE DANCE 2 volte Mensile', 'Pole Dance Liv.3'),
      ('POLE ANNUALE 1 volta', 'Exotic Pole Open Level'),
      ('POLE ANNUALE 1 volta', 'Pole Dance Liv.1'),
      ('POLE ANNUALE 1 volta', 'Pole Dance Liv.2'),
      ('POLE ANNUALE 1 volta', 'Pole Dance Liv.3'),
      ('POLE ANNUALE 2 volte', 'Exotic Pole Open Level'),
      ('POLE ANNUALE 2 volte', 'Pole Dance Liv.1'),
      ('POLE ANNUALE 2 volte', 'Pole Dance Liv.2'),
      ('POLE ANNUALE 2 volte', 'Pole Dance Liv.3'),
      ('POLE YOUNG 1 volta Trimestrale', 'Pole Young 1'),
      ('POLE YOUNG 1 volta Trimestrale', 'Pole Young 2'),
      ('POLE YOUNG 2 volte Trimestrale', 'Pole Young 1'),
      ('POLE YOUNG 2 volte Trimestrale', 'Pole Young 2'),
      ('POLE YOUNG ANNUALE 2 volte', 'Pole Young 1'),
      ('POLE YOUNG ANNUALE 2 volte', 'Pole Young 2'),
      ('STREET ADULTI 3 volte Mensile', 'Afro'),
      ('STREET ADULTI 3 volte Mensile', 'Danza classica amatoriale'),
      ('STREET ADULTI 3 volte Mensile', 'Danza contemporanea amatoriale'),
      ('STREET ADULTI 3 volte Mensile', 'Danza moderna'),
      ('STREET ADULTI 3 volte Mensile', 'Heels'),
      ('STREET ADULTI 3 volte Mensile', 'Heels liv. 2'),
      ('STREET ADULTI 3 volte Mensile', 'Hip Hop 2'),
      ('STREET ADULTI 3 volte Mensile', 'Hip Hop Open Class'),
      ('STREET ADULTI 3 volte Mensile', 'Hip Hop adulti'),
      ('STREET ADULTI 1 volta Trimestrale', 'Afro'),
      ('STREET ADULTI 1 volta Trimestrale', 'Danza classica amatoriale'),
      ('STREET ADULTI 1 volta Trimestrale', 'Danza contemporanea amatoriale'),
      ('STREET ADULTI 1 volta Trimestrale', 'Danza moderna'),
      ('STREET ADULTI 1 volta Trimestrale', 'Heels'),
      ('STREET ADULTI 1 volta Trimestrale', 'Heels liv. 2'),
      ('STREET ADULTI 1 volta Trimestrale', 'Hip Hop 2'),
      ('STREET ADULTI 1 volta Trimestrale', 'Hip Hop Open Class'),
      ('STREET ADULTI 1 volta Trimestrale', 'Hip Hop adulti'),
      ('STREET Kids e Teen 1 volta Trimestrale', 'Breakdance 1'),
      ('STREET Kids e Teen 1 volta Trimestrale', 'Breakdance 2'),
      ('STREET Kids e Teen 1 volta Trimestrale', 'Danza classica young'),
      ('STREET Kids e Teen 1 volta Trimestrale', 'Hip Hop Kids'),
      ('STREET Kids e Teen 1 volta Trimestrale', 'Hip Hop Mini 5-6 anni'),
      ('STREET Kids e Teen 1 volta Trimestrale', 'Hip Hop Teen'),
      ('STREET Kids e Teen 1 volta Trimestrale', 'K Pop'),
      ('STREET ADULTI 2 volte Trimestrale', 'Afro'),
      ('STREET ADULTI 2 volte Trimestrale', 'Danza classica amatoriale'),
      ('STREET ADULTI 2 volte Trimestrale', 'Danza contemporanea amatoriale'),
      ('STREET ADULTI 2 volte Trimestrale', 'Danza moderna'),
      ('STREET ADULTI 2 volte Trimestrale', 'Heels'),
      ('STREET ADULTI 2 volte Trimestrale', 'Heels liv. 2'),
      ('STREET ADULTI 2 volte Trimestrale', 'Hip Hop 2'),
      ('STREET ADULTI 2 volte Trimestrale', 'Hip Hop Open Class'),
      ('STREET ADULTI 2 volte Trimestrale', 'Hip Hop adulti'),
      ('STREET Kids e Teen 2 volte Trimestrale', 'Breakdance 1'),
      ('STREET Kids e Teen 2 volte Trimestrale', 'Breakdance 2'),
      ('STREET Kids e Teen 2 volte Trimestrale', 'Danza classica young'),
      ('STREET Kids e Teen 2 volte Trimestrale', 'Hip Hop Kids'),
      ('STREET Kids e Teen 2 volte Trimestrale', 'Hip Hop Mini 5-6 anni'),
      ('STREET Kids e Teen 2 volte Trimestrale', 'Hip Hop Teen'),
      ('STREET Kids e Teen 2 volte Trimestrale', 'K Pop'),
      ('STREET ADULTI 3 volte Trimestrale', 'Afro'),
      ('STREET ADULTI 3 volte Trimestrale', 'Danza classica amatoriale'),
      ('STREET ADULTI 3 volte Trimestrale', 'Danza contemporanea amatoriale'),
      ('STREET ADULTI 3 volte Trimestrale', 'Danza moderna'),
      ('STREET ADULTI 3 volte Trimestrale', 'Heels'),
      ('STREET ADULTI 3 volte Trimestrale', 'Heels liv. 2'),
      ('STREET ADULTI 3 volte Trimestrale', 'Hip Hop 2'),
      ('STREET ADULTI 3 volte Trimestrale', 'Hip Hop Open Class'),
      ('STREET ADULTI 3 volte Trimestrale', 'Hip Hop adulti'),
      ('STREETDANCE Kids/Teen 3 volte Trimestrale', 'Breakdance 1'),
      ('STREETDANCE Kids/Teen 3 volte Trimestrale', 'Breakdance 2'),
      ('STREETDANCE Kids/Teen 3 volte Trimestrale', 'Danza classica young'),
      ('STREETDANCE Kids/Teen 3 volte Trimestrale', 'Hip Hop Kids'),
      ('STREETDANCE Kids/Teen 3 volte Trimestrale', 'Hip Hop Mini 5-6 anni'),
      ('STREETDANCE Kids/Teen 3 volte Trimestrale', 'Hip Hop Teen'),
      ('STREETDANCE Kids/Teen 3 volte Trimestrale', 'K Pop'),
      ('STREET 1 volta Mensile 60 min', 'Afro'),
      ('STREET 1 volta Mensile 60 min', 'Breakdance 1'),
      ('STREET 1 volta Mensile 60 min', 'Breakdance 2'),
      ('STREET 1 volta Mensile 60 min', 'Danza classica amatoriale'),
      ('STREET 1 volta Mensile 60 min', 'Danza classica young'),
      ('STREET 1 volta Mensile 60 min', 'Danza contemporanea amatoriale'),
      ('STREET 1 volta Mensile 60 min', 'Danza moderna'),
      ('STREET 1 volta Mensile 60 min', 'Heels'),
      ('STREET 1 volta Mensile 60 min', 'Heels liv. 2'),
      ('STREET 1 volta Mensile 60 min', 'Hip Hop 2'),
      ('STREET 1 volta Mensile 60 min', 'Hip Hop Kids'),
      ('STREET 1 volta Mensile 60 min', 'Hip Hop Mini 5-6 anni'),
      ('STREET 1 volta Mensile 60 min', 'Hip Hop Open Class'),
      ('STREET 1 volta Mensile 60 min', 'Hip Hop Teen'),
      ('STREET 1 volta Mensile 60 min', 'Hip Hop adulti'),
      ('STREET 1 volta Mensile 60 min', 'K Pop'),
      ('STREET ADULTI 1 volta Mensile', 'Afro'),
      ('STREET ADULTI 1 volta Mensile', 'Danza classica amatoriale'),
      ('STREET ADULTI 1 volta Mensile', 'Danza contemporanea amatoriale'),
      ('STREET ADULTI 1 volta Mensile', 'Danza moderna'),
      ('STREET ADULTI 1 volta Mensile', 'Heels'),
      ('STREET ADULTI 1 volta Mensile', 'Heels liv. 2'),
      ('STREET ADULTI 1 volta Mensile', 'Hip Hop 2'),
      ('STREET ADULTI 1 volta Mensile', 'Hip Hop Open Class'),
      ('STREET ADULTI 1 volta Mensile', 'Hip Hop adulti'),
      ('STREET OPEN Trimestrale', 'Afro'),
      ('STREET OPEN Trimestrale', 'Breakdance 1'),
      ('STREET OPEN Trimestrale', 'Breakdance 2'),
      ('STREET OPEN Trimestrale', 'Danza classica amatoriale'),
      ('STREET OPEN Trimestrale', 'Danza classica young'),
      ('STREET OPEN Trimestrale', 'Danza contemporanea amatoriale'),
      ('STREET OPEN Trimestrale', 'Danza moderna'),
      ('STREET OPEN Trimestrale', 'Heels'),
      ('STREET OPEN Trimestrale', 'Heels liv. 2'),
      ('STREET OPEN Trimestrale', 'Hip Hop 2'),
      ('STREET OPEN Trimestrale', 'Hip Hop Kids'),
      ('STREET OPEN Trimestrale', 'Hip Hop Mini 5-6 anni'),
      ('STREET OPEN Trimestrale', 'Hip Hop Open Class'),
      ('STREET OPEN Trimestrale', 'Hip Hop Teen'),
      ('STREET OPEN Trimestrale', 'Hip Hop adulti'),
      ('STREET OPEN Trimestrale', 'K Pop'),
      ('STREET 2 volte Mensile', 'Afro'),
      ('STREET 2 volte Mensile', 'Breakdance 1'),
      ('STREET 2 volte Mensile', 'Breakdance 2'),
      ('STREET 2 volte Mensile', 'Danza classica amatoriale'),
      ('STREET 2 volte Mensile', 'Danza classica young'),
      ('STREET 2 volte Mensile', 'Danza contemporanea amatoriale'),
      ('STREET 2 volte Mensile', 'Danza moderna'),
      ('STREET 2 volte Mensile', 'Heels'),
      ('STREET 2 volte Mensile', 'Heels liv. 2'),
      ('STREET 2 volte Mensile', 'Hip Hop 2'),
      ('STREET 2 volte Mensile', 'Hip Hop Kids'),
      ('STREET 2 volte Mensile', 'Hip Hop Mini 5-6 anni'),
      ('STREET 2 volte Mensile', 'Hip Hop Open Class'),
      ('STREET 2 volte Mensile', 'Hip Hop Teen'),
      ('STREET 2 volte Mensile', 'Hip Hop adulti'),
      ('STREET 2 volte Mensile', 'K Pop'),
      ('STREET ANNUALE ADULTI 1 volta', 'Afro'),
      ('STREET ANNUALE ADULTI 1 volta', 'Danza classica amatoriale'),
      ('STREET ANNUALE ADULTI 1 volta', 'Danza contemporanea amatoriale'),
      ('STREET ANNUALE ADULTI 1 volta', 'Danza moderna'),
      ('STREET ANNUALE ADULTI 1 volta', 'Heels'),
      ('STREET ANNUALE ADULTI 1 volta', 'Heels liv. 2'),
      ('STREET ANNUALE ADULTI 1 volta', 'Hip Hop 2'),
      ('STREET ANNUALE ADULTI 1 volta', 'Hip Hop Open Class'),
      ('STREET ANNUALE ADULTI 1 volta', 'Hip Hop adulti'),
      ('STREET ANNUALE Kids e Teen 1 volta', 'Breakdance 1'),
      ('STREET ANNUALE Kids e Teen 1 volta', 'Breakdance 2'),
      ('STREET ANNUALE Kids e Teen 1 volta', 'Danza classica young'),
      ('STREET ANNUALE Kids e Teen 1 volta', 'Hip Hop Kids'),
      ('STREET ANNUALE Kids e Teen 1 volta', 'Hip Hop Mini 5-6 anni'),
      ('STREET ANNUALE Kids e Teen 1 volta', 'Hip Hop Teen'),
      ('STREET ANNUALE Kids e Teen 1 volta', 'K Pop'),
      ('STREET ANNUALE ADULTI 2 volte', 'Afro'),
      ('STREET ANNUALE ADULTI 2 volte', 'Danza classica amatoriale'),
      ('STREET ANNUALE ADULTI 2 volte', 'Danza contemporanea amatoriale'),
      ('STREET ANNUALE ADULTI 2 volte', 'Danza moderna'),
      ('STREET ANNUALE ADULTI 2 volte', 'Heels'),
      ('STREET ANNUALE ADULTI 2 volte', 'Heels liv. 2'),
      ('STREET ANNUALE ADULTI 2 volte', 'Hip Hop 2'),
      ('STREET ANNUALE ADULTI 2 volte', 'Hip Hop Open Class'),
      ('STREET ANNUALE ADULTI 2 volte', 'Hip Hop adulti'),
      ('STREET ANNUALE Kids e Teen 2 volte', 'Breakdance 1'),
      ('STREET ANNUALE Kids e Teen 2 volte', 'Breakdance 2'),
      ('STREET ANNUALE Kids e Teen 2 volte', 'Danza classica young'),
      ('STREET ANNUALE Kids e Teen 2 volte', 'Hip Hop Kids'),
      ('STREET ANNUALE Kids e Teen 2 volte', 'Hip Hop Mini 5-6 anni'),
      ('STREET ANNUALE Kids e Teen 2 volte', 'Hip Hop Teen'),
      ('STREET ANNUALE Kids e Teen 2 volte', 'K Pop'),
      ('STREET ANNUALE ADULTI 3 volte', 'Afro'),
      ('STREET ANNUALE ADULTI 3 volte', 'Danza classica amatoriale'),
      ('STREET ANNUALE ADULTI 3 volte', 'Danza contemporanea amatoriale'),
      ('STREET ANNUALE ADULTI 3 volte', 'Danza moderna'),
      ('STREET ANNUALE ADULTI 3 volte', 'Heels'),
      ('STREET ANNUALE ADULTI 3 volte', 'Heels liv. 2'),
      ('STREET ANNUALE ADULTI 3 volte', 'Hip Hop 2'),
      ('STREET ANNUALE ADULTI 3 volte', 'Hip Hop Open Class'),
      ('STREET ANNUALE ADULTI 3 volte', 'Hip Hop adulti'),
      ('STREET ANNUALE Kids e Teen 3 volte', 'Breakdance 1'),
      ('STREET ANNUALE Kids e Teen 3 volte', 'Breakdance 2'),
      ('STREET ANNUALE Kids e Teen 3 volte', 'Danza classica young'),
      ('STREET ANNUALE Kids e Teen 3 volte', 'Hip Hop Kids'),
      ('STREET ANNUALE Kids e Teen 3 volte', 'Hip Hop Mini 5-6 anni'),
      ('STREET ANNUALE Kids e Teen 3 volte', 'Hip Hop Teen'),
      ('STREET ANNUALE Kids e Teen 3 volte', 'K Pop'),
      ('STREET ANNUALE ADULTI 4 volte', 'Afro'),
      ('STREET ANNUALE ADULTI 4 volte', 'Danza classica amatoriale'),
      ('STREET ANNUALE ADULTI 4 volte', 'Danza contemporanea amatoriale'),
      ('STREET ANNUALE ADULTI 4 volte', 'Danza moderna'),
      ('STREET ANNUALE ADULTI 4 volte', 'Heels'),
      ('STREET ANNUALE ADULTI 4 volte', 'Heels liv. 2'),
      ('STREET ANNUALE ADULTI 4 volte', 'Hip Hop 2'),
      ('STREET ANNUALE ADULTI 4 volte', 'Hip Hop Open Class'),
      ('STREET ANNUALE ADULTI 4 volte', 'Hip Hop adulti'),
      ('STREET ANNUALE Kids e Teen 4 volte', 'Breakdance 1'),
      ('STREET ANNUALE Kids e Teen 4 volte', 'Breakdance 2'),
      ('STREET ANNUALE Kids e Teen 4 volte', 'Danza classica young'),
      ('STREET ANNUALE Kids e Teen 4 volte', 'Hip Hop Kids'),
      ('STREET ANNUALE Kids e Teen 4 volte', 'Hip Hop Mini 5-6 anni'),
      ('STREET ANNUALE Kids e Teen 4 volte', 'Hip Hop Teen'),
      ('STREET ANNUALE Kids e Teen 4 volte', 'K Pop'),
      ('STREET HEELS 60+90MIN TRIMESTRALE', 'Heels'),
      ('STREET HEELS 60+90MIN TRIMESTRALE', 'Heels liv. 2'),
      ('STREET HEELS 90min TRIMESTRALE', 'Heels'),
      ('STREET HEELS 90min TRIMESTRALE', 'Heels liv. 2'),
      ('STREET kids e Teen 1 volta mensile', 'Breakdance 1'),
      ('STREET kids e Teen 1 volta mensile', 'Breakdance 2'),
      ('STREET kids e Teen 1 volta mensile', 'Danza classica young'),
      ('STREET kids e Teen 1 volta mensile', 'Hip Hop Kids'),
      ('STREET kids e Teen 1 volta mensile', 'Hip Hop Mini 5-6 anni'),
      ('STREET kids e Teen 1 volta mensile', 'Hip Hop Teen'),
      ('STREET kids e Teen 1 volta mensile', 'K Pop'),
      ('STREET Kids e Teen 2 volte mensile', 'Breakdance 1'),
      ('STREET Kids e Teen 2 volte mensile', 'Breakdance 2'),
      ('STREET Kids e Teen 2 volte mensile', 'Danza classica young'),
      ('STREET Kids e Teen 2 volte mensile', 'Hip Hop Kids'),
      ('STREET Kids e Teen 2 volte mensile', 'Hip Hop Mini 5-6 anni'),
      ('STREET Kids e Teen 2 volte mensile', 'Hip Hop Teen'),
      ('STREET Kids e Teen 2 volte mensile', 'K Pop'),
      ('STREET Kids e Teen 3 volte mensile', 'Breakdance 1'),
      ('STREET Kids e Teen 3 volte mensile', 'Breakdance 2'),
      ('STREET Kids e Teen 3 volte mensile', 'Danza classica young'),
      ('STREET Kids e Teen 3 volte mensile', 'Hip Hop Kids'),
      ('STREET Kids e Teen 3 volte mensile', 'Hip Hop Mini 5-6 anni'),
      ('STREET Kids e Teen 3 volte mensile', 'Hip Hop Teen'),
      ('STREET Kids e Teen 3 volte mensile', 'K Pop'),
      ('TAI CHI O SHALIN 1 lez Mensile', 'Shaolin Kung Fu 1'),
      ('TAI CHI O SHALIN 1 lez Mensile', 'Shaolin Kung Fu 2'),
      ('TAI CHI O SHALIN 1 lez Mensile', 'Tai Chi'),
      ('TAI CHI O SHAOLIN 1 lez Trimestrale', 'Shaolin Kung Fu 1'),
      ('TAI CHI O SHAOLIN 1 lez Trimestrale', 'Shaolin Kung Fu 2'),
      ('TAI CHI O SHAOLIN 1 lez Trimestrale', 'Tai Chi'),
      ('TAI CHI E SHAOLIN 4 lez Mensile', 'Shaolin Kung Fu 1'),
      ('TAI CHI E SHAOLIN 4 lez Mensile', 'Shaolin Kung Fu 2'),
      ('TAI CHI E SHAOLIN 4 lez Mensile', 'Tai Chi'),
      ('TAI CHI O SHAOLIN 2 lez Trimestrale', 'Shaolin Kung Fu 1'),
      ('TAI CHI O SHAOLIN 2 lez Trimestrale', 'Shaolin Kung Fu 2'),
      ('TAI CHI O SHAOLIN 2 lez Trimestrale', 'Tai Chi'),
      ('TAI CHI E SHAOLIN 4 lez Trimestrale', 'Shaolin Kung Fu 1'),
      ('TAI CHI E SHAOLIN 4 lez Trimestrale', 'Shaolin Kung Fu 2'),
      ('TAI CHI E SHAOLIN 4 lez Trimestrale', 'Tai Chi'),
      ('TAI CHI O SHAOLIN 2 lez Mensile', 'Shaolin Kung Fu 1'),
      ('TAI CHI O SHAOLIN 2 lez Mensile', 'Shaolin Kung Fu 2'),
      ('TAI CHI O SHAOLIN 2 lez Mensile', 'Tai Chi'),
      ('YOGA 1 volta Trimestrale', 'Yoga'),
      ('YOGA 1 volta Mensile', 'Yoga'),
      ('aerea pacchetto 12 lezioni', 'Aerea 1 Schio'),
      ('aerea pacchetto 12 lezioni', 'Aerea 2 Schio'),
      ('aerea pacchetto 12 lezioni', 'Aerea Cerchio'),
      ('aerea pacchetto 12 lezioni', 'Aerea Cerchio 2'),
      ('aerea pacchetto 12 lezioni', 'Aerea Kids 1'),
      ('aerea pacchetto 12 lezioni', 'Aerea Kids 2'),
      ('aerea pacchetto 12 lezioni', 'Aerea Kids Bolzano Vicentino'),
      ('aerea pacchetto 12 lezioni', 'Aerea Teen 1'),
      ('aerea pacchetto 12 lezioni', 'Aerea Teen 2'),
      ('aerea pacchetto 12 lezioni', 'Aerea Teen 3'),
      ('aerea pacchetto 12 lezioni', 'Aerea Teen Bolzano Vicentino'),
      ('aerea pacchetto 12 lezioni', 'Aerea Young 1 Schio'),
      ('aerea pacchetto 12 lezioni', 'Aerea adulti 1'),
      ('aerea pacchetto 12 lezioni', 'Aerea adulti 2'),
      ('aerea pacchetto 12 lezioni', 'Aerea adulti 3'),
      ('aerea pacchetto 12 lezioni', 'Aerial Fusion');

  -- i tipi d'esempio: via se nessuno li usa, altrimenti archiviati
  delete from recuperi_ammessi ra where ra.palestra_id = p.id and ra.origine = 'abbonamento'
     and ra.origine_id in (select id from tipi_abbonamento t where t.palestra_id = p.id and t.nome not in (select nome from _tipi));
  select count(*) into n_tipi_vecchi from tipi_abbonamento t
   where t.palestra_id = p.id and t.nome not in (select nome from _tipi);
  delete from tipi_abbonamento t
   where t.palestra_id = p.id and t.nome not in (select nome from _tipi)
     and not exists (select 1 from iscrizioni i where i.tipo_abbonamento_id = t.id);
  update tipi_abbonamento set archiviato = true, attivo = false
   where palestra_id = p.id and nome not in (select nome from _tipi);

  update tipi_abbonamento t set codice = x.codice, famiglia = x.famiglia, modalita = x.modalita::modalita_abb,
         durata_mesi = x.durata_mesi, durata_giorni = x.durata_giorni, scadenza_fine_mese = x.fine_mese,
         lezioni_settimanali = x.lezioni, num_ingressi = x.ingressi, prezzo_cent = x.prezzo, prezzo_web_cent = x.web,
         attivo = true, archiviato = false
    from _tipi x where t.palestra_id = p.id and t.nome = x.nome;
  insert into tipi_abbonamento (palestra_id, codice, nome, famiglia, modalita, durata_mesi, durata_giorni,
                                scadenza_fine_mese, lezioni_settimanali, num_ingressi, prezzo_cent, prezzo_web_cent,
                                acquistabile_online, attivo)
  select p.id, x.codice, x.nome, x.famiglia, x.modalita::modalita_abb, x.durata_mesi, x.durata_giorni, x.fine_mese,
         x.lezioni, x.ingressi, x.prezzo, x.web, x.web is not null, true
  from _tipi x
  where not exists (select 1 from tipi_abbonamento t where t.palestra_id = p.id and t.nome = x.nome);

  -- corsi coperti, ricostruiti dal nome dell'abbonamento
  delete from tipi_abbonamento_corsi tc using tipi_abbonamento t
   where t.id = tc.tipo_abbonamento_id and t.palestra_id = p.id and t.nome in (select nome from _tipi);
  insert into tipi_abbonamento_corsi (tipo_abbonamento_id, corso_id)
  select t.id, c.id
  from _tipi_corsi x
  join tipi_abbonamento t on t.palestra_id = p.id and t.nome = x.tipo
  join corsi c on c.palestra_id = p.id and c.nome = x.corso
  on conflict do nothing;

  -- 4.3 listino e quota annuale
  insert into voci_listino (palestra_id, codice, nome, categoria, prezzo_cent, prezzo_web_cent) values
      (p.id, null, 'Campus estivo', 'evento', 13000, null),
      (p.id, null, 'Contributo istituzionale', 'contributo', 4500, null),
      (p.id, null, 'Contributo liberale', 'contributo', 6000, null),
      (p.id, null, 'Contributo liberale ridotto', 'contributo', 1200, null),
      (p.id, null, 'Rimborso spese per uso locali', 'rimborso', 200000, null),
      (p.id, 'Cprsus', 'Contributo per rimborso spese utilizzo sale', 'rimborso', 50000, null)
  on conflict (palestra_id, nome) do update set codice = excluded.codice, categoria = excluded.categoria,
     prezzo_cent = excluded.prezzo_cent;
  update palestre set quota_iscrizione_cent = 4500 where id = p.id;

  update messaggi_coda set stato = 'annullato'
   where palestra_id = p.id and stato = 'in_coda' and created_at >= v_inizio;

  raise notice 'Fatto: % clienti finti tolti, % abbonamenti caricati, % tipi d''esempio tolti o archiviati, % voci a listino.',
    n_demo, (select count(*) from _tipi), n_tipi_vecchi, (select count(*) from voci_listino where palestra_id = p.id);
end $$;

-- Controllo
select famiglia, count(*) as abbonamenti,
       min(prezzo_cent) / 100 as da_euro, max(prezzo_cent) / 100 as a_euro,
       (select count(distinct tc.corso_id) from tipi_abbonamento_corsi tc join tipi_abbonamento t2 on t2.id = tc.tipo_abbonamento_id
         where t2.famiglia = t.famiglia and t2.palestra_id = t.palestra_id) as corsi_coperti
from tipi_abbonamento t
where palestra_id = (select id from palestre where slug = 'rmhouse') and not archiviato
group by palestra_id, famiglia order by famiglia;
