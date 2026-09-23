-- =====================================================================
-- RMHouse — 006 OPERAZIONI DI SEGRETERIA
-- Funzioni usate dalle schermate di gestione (iscrizioni, recuperi, attese).
-- Da eseguire dopo 001/002/seed/004/005.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CREAZIONE ISCRIZIONE IN UN COLPO SOLO
--    iscrizione + orari scelti + eventuale quota annuale.
--    Gira con i permessi di chi la chiama: solo admin/segreteria ci riescono.
-- ---------------------------------------------------------------------
create or replace function crea_iscrizione(
  p_allievo uuid,
  p_tipo_abbonamento uuid,
  p_corso uuid,
  p_data_inizio date,
  p_orari uuid[],
  p_sconto_cent int default 0,
  p_quota boolean default false,
  p_note text default null
) returns uuid language plpgsql security invoker as $$
declare v_pal uuid; v_id uuid; v_orario uuid; v_quota int; v_mese smallint;
begin
  select palestra_id into v_pal from allievi where id = p_allievo;
  if v_pal is null then raise exception 'allievo_non_trovato'; end if;

  if exists (select 1 from iscrizioni
              where allievo_id = p_allievo and corso_id = p_corso and stato = 'attiva'
                and data_fine >= p_data_inizio) then
    raise exception 'iscrizione_gia_attiva';
  end if;

  insert into iscrizioni (palestra_id, allievo_id, tipo_abbonamento_id, corso_id, data_inizio, sconto_cent, note)
  values (v_pal, p_allievo, p_tipo_abbonamento, p_corso, coalesce(p_data_inizio, current_date),
          coalesce(p_sconto_cent, 0), p_note)
  returning id into v_id;

  foreach v_orario in array coalesce(p_orari, '{}') loop
    if not exists (select 1 from orari where id = v_orario and corso_id = p_corso) then
      raise exception 'orario_non_del_corso';
    end if;
    insert into iscrizioni_orari (iscrizione_id, orario_id) values (v_id, v_orario)
    on conflict do nothing;
  end loop;

  if p_quota then
    select quota_iscrizione_cent, mese_inizio_stagione into v_quota, v_mese from palestre where id = v_pal;
    insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent)
    values (v_pal, p_allievo, stagione_di(coalesce(p_data_inizio, current_date), v_mese), coalesce(v_quota, 0))
    on conflict (allievo_id, stagione) do nothing;
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 2. RECUPERI: solo lo staff può prenotarli al posto del cliente
-- ---------------------------------------------------------------------
create or replace function prenota_recupero(p_credito uuid, p_lezione uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c crediti_recupero; l lezioni; v_cap int; v_pren uuid;
begin
  select * into c from crediti_recupero where id = p_credito for update;
  if not found or c.annullato or c.usato_in is not null then raise exception 'credito_non_valido'; end if;
  if auth.uid() is not null and not is_staff(c.palestra_id) then raise exception 'non_autorizzato'; end if;

  select * into l from lezioni where id = p_lezione and stato = 'programmata' and inizio > now() for update;
  if not found then raise exception 'lezione_non_disponibile'; end if;
  if l.data > c.scadenza then raise exception 'credito_scaduto'; end if;
  if not exists (select 1 from corsi_recupero(c.iscrizione_id) cr where cr.corso_id = l.corso_id) then
    raise exception 'corso_non_ammesso_per_recupero';
  end if;
  if not certificato_valido(c.allievo_id, l.data) then raise exception 'certificato_scaduto'; end if;

  select coalesce(co.capienza, s.capienza) into v_cap
    from corsi co left join sale s on s.id = l.sala_id where co.id = l.corso_id;
  if v_cap is not null and (select count(*) from v_partecipanti_lezione where lezione_id = l.id) >= v_cap then
    raise exception 'lezione_al_completo';
  end if;

  insert into prenotazioni (palestra_id, lezione_id, allievo_id, iscrizione_id, tipo)
  values (l.palestra_id, l.id, c.allievo_id, c.iscrizione_id, 'recupero')
  returning id into v_pren;
  update crediti_recupero set usato_in = v_pren where id = c.id;
  return v_pren;
end $$;

-- Crediti leggibili con corso, data della lezione persa e stato
create or replace view v_crediti with (security_invoker = true) as
  select cr.id, cr.palestra_id, cr.allievo_id, cr.iscrizione_id, cr.scadenza, cr.annullato, cr.usato_in,
         l.data as data_persa, c.nome as corso_nome, i.corso_id,
         case when cr.annullato then 'annullato'
              when cr.usato_in is not null then 'usato'
              when cr.scadenza < current_date then 'scaduto'
              else 'disponibile' end as stato,
         lr.data as data_recupero, cr2.nome as corso_recupero
  from crediti_recupero cr
  join lezioni l on l.id = cr.lezione_persa_id
  join iscrizioni i on i.id = cr.iscrizione_id
  join corsi c on c.id = i.corso_id
  left join prenotazioni p on p.id = cr.usato_in
  left join lezioni lr on lr.id = p.lezione_id
  left join corsi cr2 on cr2.id = lr.corso_id;

-- ---------------------------------------------------------------------
-- 3. LISTA D'ATTESA aggiunta dalla segreteria
-- ---------------------------------------------------------------------
create or replace function aggiungi_in_attesa(
  p_allievo uuid, p_corso uuid, p_lezione uuid default null, p_tipo text default 'iscrizione'
) returns uuid language plpgsql security invoker as $$
declare a allievi; v_id uuid;
begin
  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  insert into liste_attesa (palestra_id, tipo, corso_id, lezione_id, allievo_id, account_id)
  values (a.palestra_id, p_tipo, p_corso, p_lezione, a.id, a.account_id)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 4. SCHEDA PERSONA: ricerca rapida per nome, cognome, email o telefono
-- ---------------------------------------------------------------------
create or replace view v_persone with (security_invoker = true) as
  select a.id, a.palestra_id, a.nome, a.cognome, a.data_nascita, a.stato_lead, a.certificato_scadenza,
         a.is_titolare, a.token, a.created_at,
         acc.id as account_id, acc.nome as titolare_nome, acc.cognome as titolare_cognome,
         acc.email, acc.telefono,
         lower(a.nome || ' ' || a.cognome || ' ' || acc.nome || ' ' || acc.cognome || ' ' ||
               acc.email || ' ' || coalesce(acc.telefono, '')) as ricerca,
         (select count(*) from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva') as iscrizioni_attive,
         (a.certificato_scadenza is null or a.certificato_scadenza < current_date) as certificato_da_sistemare
  from allievi a
  join account acc on acc.id = a.account_id;

grant execute on function crea_iscrizione(uuid, uuid, uuid, date, uuid[], int, boolean, text) to authenticated;
grant execute on function aggiungi_in_attesa(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. SICUREZZA: tabelle aggiunte in 004 rimaste senza regole
-- ---------------------------------------------------------------------
alter table recuperi_ammessi enable row level security;
drop policy if exists staff_legge on recuperi_ammessi;
create policy staff_legge on recuperi_ammessi for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on recuperi_ammessi;
create policy gestione_scrive on recuperi_ammessi for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

alter table crediti_recupero enable row level security;
drop policy if exists staff_legge on crediti_recupero;
create policy staff_legge on crediti_recupero for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on crediti_recupero;
create policy gestione_scrive on crediti_recupero for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists cliente_legge on crediti_recupero;
create policy cliente_legge on crediti_recupero for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));

-- Anche la segreteria (non solo l'admin) può cambiare le impostazioni della palestra
drop policy if exists admin_modifica on palestre;
drop policy if exists gestione_modifica on palestre;
create policy gestione_modifica on palestre for update to authenticated
  using (is_gestione(id)) with check (is_gestione(id));

-- Due corsi con lo stesso nome nella stessa palestra sarebbero indistinguibili in elenco
create unique index if not exists corsi_nome_unico on corsi (palestra_id, nome);
