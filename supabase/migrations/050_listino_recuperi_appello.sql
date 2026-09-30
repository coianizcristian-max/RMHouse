-- =====================================================================
-- RMHouse — 050 LISTINO, RECUPERI SOLO A CHI DISDICE, APPELLO
--  1. Nuovo abbonamento: i campi lasciati vuoti prendono il valore di base
--  2. Recupero solo a chi disdice (o ha avvisato): chi manca senza
--     avvisare perde la lezione
--  3. Appello: anche l'insegnante aggiunge una persona già registrata,
--     e segnala alla segreteria chi è nuovo
-- Si può eseguire più volte. Va dopo la 049.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TIPI DI ABBONAMENTO: valori di base al posto dei vuoti
--    (prima "Validità recupero" vuota faceva fallire il salvataggio)
-- ---------------------------------------------------------------------
create or replace function trg_tipi_abbonamento_base()
returns trigger language plpgsql as $$
begin
  new.giorni_validita_recupero := coalesce(new.giorni_validita_recupero, 30);
  if new.durata_giorni is not null and new.durata_giorni <= 0 then new.durata_giorni := null; end if;
  -- con la durata in giorni, i mesi non contano: basta che non siano vuoti o zero
  if new.durata_mesi is null or new.durata_mesi <= 0 then
    new.durata_mesi := 1;
  end if;
  new.modalita := coalesce(new.modalita, 'orari_fissi');
  new.scadenza_fine_mese := coalesce(new.scadenza_fine_mese, true);
  new.acquistabile_online := coalesce(new.acquistabile_online, false);
  new.attivo := coalesce(new.attivo, true);
  new.archiviato := coalesce(new.archiviato, false);
  new.rinnovo_automatico := coalesce(new.rinnovo_automatico, false);
  return new;
end $$;
drop trigger if exists tipi_abbonamento_base on tipi_abbonamento;
create trigger tipi_abbonamento_base before insert or update on tipi_abbonamento
  for each row execute function trg_tipi_abbonamento_base();

-- ---------------------------------------------------------------------
-- 2. RECUPERO SOLO A CHI DISDICE
-- ---------------------------------------------------------------------
alter table palestre add column if not exists recupero_solo_disdetta boolean not null default true;

-- L'assenza segnata in appello dà il recupero solo se la scuola lo vuole.
-- (Il recupero di chi disdice lo crea disdici_lezione, non questo trigger.)
create or replace function trg_presenze_credito()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_isc iscrizioni; v_tipo tipi_abbonamento; v_data date; v_usati int; v_solo boolean;
begin
  if new.presente then
    -- se torna presente, il credito dato per l'assenza non vale più
    -- (non tocca quello di chi aveva disdetto)
    update crediti_recupero cr set annullato = true
     where cr.lezione_persa_id = new.lezione_id and cr.allievo_id = new.allievo_id and cr.usato_in is null
       and not exists (select 1 from assenze_avvisate x where x.credito_id = cr.id);
    return new;
  end if;

  select recupero_solo_disdetta into v_solo from palestre where id = new.palestra_id;
  if coalesce(v_solo, true) then return new; end if;

  select l.data into v_data from lezioni l where l.id = new.lezione_id;
  select i.* into v_isc from iscrizioni i
   join iscrizioni_orari io on io.iscrizione_id = i.id
   join lezioni l on l.orario_id = io.orario_id and l.id = new.lezione_id
   where i.allievo_id = new.allievo_id and i.stato = 'attiva' and v_data between i.data_inizio and i.data_fine
   limit 1;
  if not found then return new; end if;

  select * into v_tipo from tipi_abbonamento where id = v_isc.tipo_abbonamento_id;
  if v_tipo.recuperi_max = 0 then return new; end if;
  if v_tipo.recuperi_max is not null then
    select count(*) into v_usati from crediti_recupero where iscrizione_id = v_isc.id and not annullato;
    if v_usati >= v_tipo.recuperi_max then return new; end if;
  end if;

  insert into crediti_recupero (palestra_id, iscrizione_id, allievo_id, lezione_persa_id, scadenza)
  values (new.palestra_id, v_isc.id, new.allievo_id, new.lezione_id, v_data + v_tipo.giorni_validita_recupero)
  on conflict (iscrizione_id, lezione_persa_id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. APPELLO
-- ---------------------------------------------------------------------
alter table promemoria add column if not exists lezione_id uuid references lezioni(id) on delete set null;

-- Aggiunge in appello una persona già registrata, e la segna presente.
-- La usa anche l'insegnante: se la persona ha un recupero valido per
-- questo corso lo usa, altrimenti entra come ingresso; i controlli
-- (abbonamento, certificato) li sistema poi la segreteria.
create or replace function aggiungi_in_appello(p_lezione uuid, p_allievo uuid)
returns text language plpgsql security definer set search_path = public as $$
declare l lezioni; v_isc uuid; v_cred crediti_recupero; v_tipo text := 'ingresso'; v_pren uuid; v_chi text;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not is_staff(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  if not exists (select 1 from allievi where id = p_allievo and palestra_id = l.palestra_id) then raise exception 'allievo_non_trovato'; end if;
  if exists (select 1 from v_partecipanti_lezione where lezione_id = p_lezione and allievo_id = p_allievo) then
    raise exception 'gia_presente';
  end if;
  select coalesce(nome || coalesce(' ' || cognome, ''), 'staff') into v_chi from staff where user_id = auth.uid() and palestra_id = l.palestra_id limit 1;

  -- aveva disdetto questa lezione? allora la disdetta si toglie
  if exists (select 1 from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo) then
    delete from crediti_recupero where id in (select credito_id from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo)
      and usato_in is null;
    delete from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo;
    v_tipo := 'iscritto';
  else
    select i.id into v_isc from iscrizioni i
     where i.allievo_id = p_allievo and i.stato = 'attiva' and l.data between i.data_inizio and i.data_fine
     order by (i.corso_id = l.corso_id) desc limit 1;
    -- un recupero ancora valido che vale per questo corso
    select cr.* into v_cred from crediti_recupero cr
     where cr.allievo_id = p_allievo and not cr.annullato and cr.usato_in is null and cr.scadenza >= l.data
       and exists (select 1 from corsi_recupero(cr.iscrizione_id) x where x.corso_id = l.corso_id)
     order by cr.scadenza limit 1;
    if v_cred.id is not null then v_tipo := 'recupero'; v_isc := v_cred.iscrizione_id; end if;

    insert into prenotazioni (palestra_id, lezione_id, allievo_id, iscrizione_id, tipo, origine, note)
    values (l.palestra_id, p_lezione, p_allievo, v_isc, v_tipo, 'segreteria', 'aggiunto in appello da ' || coalesce(v_chi, 'staff'))
    on conflict (lezione_id, allievo_id) do update set stato = 'confermata', tipo = excluded.tipo,
      iscrizione_id = excluded.iscrizione_id, note = excluded.note
    returning id into v_pren;
    if v_cred.id is not null then update crediti_recupero set usato_in = v_pren where id = v_cred.id; end if;
  end if;

  insert into presenze (palestra_id, lezione_id, allievo_id, presente)
  values (l.palestra_id, p_lezione, p_allievo, true)
  on conflict (lezione_id, allievo_id) do update set presente = true;
  return v_tipo;
end $$;

-- Chi non è registrato: si segnala alla segreteria ("Da fare oggi" in home)
create or replace function segnala_nuovo_in_appello(p_lezione uuid, p_nome text, p_telefono text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l lezioni; v_corso text; v_chi text; v_id uuid;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not is_staff(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  if length(trim(coalesce(p_nome, ''))) < 3 then raise exception 'nome_mancante'; end if;
  select nome into v_corso from corsi where id = l.corso_id;
  select coalesce(nome || coalesce(' ' || cognome, ''), 'staff') into v_chi from staff where user_id = auth.uid() and palestra_id = l.palestra_id limit 1;

  insert into promemoria (palestra_id, data, testo, creato_da, lezione_id)
  values (l.palestra_id, (now() at time zone 'Europe/Rome')::date,
          'Nuova persona in appello da registrare: ' || initcap(trim(p_nome))
            || coalesce(' · tel. ' || nullif(trim(p_telefono), ''), '')
            || ' — ' || coalesce(v_corso, 'lezione') || ' del ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI'),
          v_chi, p_lezione)
  returning id into v_id;
  return v_id;
end $$;

grant execute on function aggiungi_in_appello(uuid, uuid) to authenticated;
grant execute on function segnala_nuovo_in_appello(uuid, text, text) to authenticated;

-- Chi si può aggiungere: anche l'insegnante, e con il motivo per cui il nome va in rosso
drop function if exists candidati_appello(uuid, text);
create or replace function candidati_appello(p_lezione uuid, p_cerca text default '')
returns table (allievo_id uuid, nome text, cognome text, abbonamento text, certificato_ok boolean, recupero boolean)
language plpgsql stable security definer set search_path = public as $$
declare l lezioni;
begin
  select * into l from lezioni where id = p_lezione;
  if l.id is null or not is_staff(l.palestra_id) then return; end if;
  return query
  select a.id, a.nome, a.cognome,
         coalesce((select c.nome from iscrizioni i join corsi c on c.id = i.corso_id
                    where i.allievo_id = a.id and i.stato = 'attiva' and l.data between i.data_inizio and i.data_fine
                    order by i.data_fine desc limit 1), 'nessun abbonamento'),
         certificato_valido(a.id, l.data),
         exists (select 1 from crediti_recupero cr where cr.allievo_id = a.id and not cr.annullato and cr.usato_in is null
                   and cr.scadenza >= l.data and exists (select 1 from corsi_recupero(cr.iscrizione_id) x where x.corso_id = l.corso_id))
  from allievi a
  where a.palestra_id = l.palestra_id
    and length(trim(coalesce(p_cerca, ''))) >= 2
    and not exists (select 1 from v_partecipanti_lezione vp where vp.lezione_id = p_lezione and vp.allievo_id = a.id)
    and (lower(a.nome || ' ' || a.cognome) like '%' || lower(trim(p_cerca)) || '%'
         or lower(a.cognome || ' ' || a.nome) like '%' || lower(trim(p_cerca)) || '%')
  order by (select count(*) from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva') desc, a.cognome, a.nome
  limit 12;
end $$;
grant execute on function candidati_appello(uuid, text) to authenticated;
