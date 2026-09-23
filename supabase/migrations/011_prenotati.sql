-- =====================================================================
-- RMHouse — 011 PRENOTATI DELLA LEZIONE
-- Aggiungere o togliere qualcuno da una lezione, sapere da dove è arrivata
-- la prenotazione, scrivere a tutti i prenotati.
-- Da eseguire dopo 001…010.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DA DOVE ARRIVA LA PRENOTAZIONE
-- ---------------------------------------------------------------------
alter table prenotazioni add column if not exists origine text not null default 'segreteria'
  check (origine in ('segreteria', 'cliente', 'sito'));
alter table prenotazioni add column if not exists note text;
alter table prove add column if not exists origine text not null default 'sito'
  check (origine in ('segreteria', 'cliente', 'sito'));

-- ---------------------------------------------------------------------
-- 2. AGGIUNGERE QUALCUNO A UNA LEZIONE
--    Normalmente servono abbonamento attivo e certificato valido;
--    la segreteria può forzare, ma il motivo resta scritto.
-- ---------------------------------------------------------------------
create or replace function aggiungi_partecipante(
  p_lezione uuid, p_allievo uuid, p_tipo text default 'ingresso',
  p_forza boolean default false, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare l lezioni; v_isc uuid; v_cap int; v_id uuid;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_tipo not in ('ingresso', 'recupero') then raise exception 'tipo_non_valido'; end if;

  if exists (select 1 from v_partecipanti_lezione where lezione_id = p_lezione and allievo_id = p_allievo) then
    raise exception 'gia_presente';
  end if;

  select i.id into v_isc from iscrizioni i
   where i.allievo_id = p_allievo and i.stato = 'attiva' and l.data between i.data_inizio and i.data_fine
   order by (i.corso_id = l.corso_id) desc limit 1;

  if not p_forza then
    if v_isc is null then raise exception 'senza_abbonamento_attivo'; end if;
    if not certificato_valido(p_allievo, l.data) then raise exception 'certificato_scaduto'; end if;
    select coalesce(l.capienza_override, c.capienza, s.capienza) into v_cap
      from corsi c left join sale s on s.id = l.sala_id where c.id = l.corso_id;
    if v_cap is not null and (select count(*) from v_partecipanti_lezione where lezione_id = p_lezione) >= v_cap then
      raise exception 'lezione_al_completo';
    end if;
  end if;

  insert into prenotazioni (palestra_id, lezione_id, allievo_id, iscrizione_id, tipo, origine, note)
  values (l.palestra_id, p_lezione, p_allievo, v_isc, p_tipo, 'segreteria',
          nullif(trim(coalesce(p_note, '') || case when p_forza then ' (inserito forzando i controlli)' else '' end), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Togliere qualcuno: la prenotazione si annulla, l'iscrizione al corso resta
create or replace function rimuovi_partecipante(p_lezione uuid, p_allievo uuid)
returns text language plpgsql security definer set search_path = public as $$
declare l lezioni; n int;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(l.palestra_id) then raise exception 'non_autorizzato'; end if;

  update prenotazioni set stato = 'annullata'
   where lezione_id = p_lezione and allievo_id = p_allievo and stato = 'confermata';
  get diagnostics n = row_count;
  if n > 0 then perform avvisa_lista_attesa(p_lezione); return 'prenotazione_annullata'; end if;

  update prove set stato = 'annullata'
   where lezione_id = p_lezione and allievo_id = p_allievo and stato in ('confermata', 'in_attesa_pagamento');
  get diagnostics n = row_count;
  if n > 0 then return 'prova_annullata'; end if;

  return 'iscritto_al_corso';   -- va tolto dalla scheda della persona, non dalla singola lezione
end $$;

-- ---------------------------------------------------------------------
-- 3. SCRIVERE A TUTTI I PRENOTATI DI UNA LEZIONE
-- ---------------------------------------------------------------------
create or replace function messaggio_lezione(p_lezione uuid, p_oggetto text, p_testo text)
returns int language plpgsql security definer set search_path = public as $$
declare l lezioni; pal palestre; c corsi; n int; v_quando text;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into pal from palestre where id = l.palestra_id;
  select * into c from corsi where id = l.corso_id;
  v_quando := to_char(l.inizio at time zone pal.fuso_orario, 'DD/MM') || ' alle ' ||
              to_char(l.inizio at time zone pal.fuso_orario, 'HH24:MI');

  insert into messaggi_coda (palestra_id, account_id, allievo_id, evento, canale, destinatario, oggetto, corpo, chiave)
  select distinct on (acc.id) l.palestra_id, acc.id, a.id, 'lezione', 'email', acc.email,
         coalesce(nullif(trim(p_oggetto), ''), c.nome || ' del ' || v_quando),
         p_testo || E'\n\n' || c.nome || ' — ' || v_quando || E'\n' || pal.nome,
         'lezione:' || p_lezione || ':' || md5(p_testo) || ':' || acc.id
  from v_partecipanti_lezione vp
  join allievi a on a.id = vp.allievo_id
  join account acc on acc.id = a.account_id
  where vp.lezione_id = p_lezione
  on conflict (palestra_id, chiave) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 4. ELENCO PRENOTATI CON PROVENIENZA E CONTATTI
-- ---------------------------------------------------------------------
create or replace view v_prenotati with (security_invoker = true) as
  select vp.lezione_id, vp.palestra_id, vp.allievo_id, vp.tipo, vp.riferimento_id,
         a.nome, a.cognome, a.data_nascita, a.certificato_scadenza,
         acc.email, acc.telefono, acc.nome as titolare_nome, acc.cognome as titolare_cognome,
         case vp.tipo
           when 'prova' then (select pr.origine from prove pr where pr.id = vp.riferimento_id)
           when 'iscritto' then 'abbonamento'
           else (select pn.origine from prenotazioni pn where pn.id = vp.riferimento_id) end as origine,
         case vp.tipo
           when 'prova' then (select pr.created_at from prove pr where pr.id = vp.riferimento_id)
           when 'iscritto' then (select i.created_at from iscrizioni i where i.id = vp.riferimento_id)
           else (select pn.created_at from prenotazioni pn where pn.id = vp.riferimento_id) end as prenotato_il,
         ps.presente
  from v_partecipanti_lezione vp
  join allievi a on a.id = vp.allievo_id
  join account acc on acc.id = a.account_id
  left join presenze ps on ps.lezione_id = vp.lezione_id and ps.allievo_id = vp.allievo_id;

-- Chi si può aggiungere a una lezione: iscritti attivi non già presenti
create or replace function candidati_lezione(p_lezione uuid, p_cerca text default '')
returns table (allievo_id uuid, nome text, cognome text, abbonamento text, certificato_ok boolean)
language sql stable security invoker as $$
  select a.id, a.nome, a.cognome,
         coalesce((select c.nome from iscrizioni i join corsi c on c.id = i.corso_id
                    where i.allievo_id = a.id and i.stato = 'attiva' order by i.data_fine desc limit 1), 'nessun abbonamento'),
         certificato_valido(a.id)
  from allievi a
  join lezioni l on l.id = p_lezione
  where a.palestra_id = l.palestra_id
    and not exists (select 1 from v_partecipanti_lezione vp where vp.lezione_id = p_lezione and vp.allievo_id = a.id)
    and (p_cerca = '' or lower(a.nome || ' ' || a.cognome) like '%' || lower(p_cerca) || '%')
  order by (select count(*) from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva') desc, a.cognome
  limit 20;
$$;

grant execute on function aggiungi_partecipante(uuid, uuid, text, boolean, text) to authenticated;
grant execute on function rimuovi_partecipante(uuid, uuid) to authenticated;
grant execute on function messaggio_lezione(uuid, text, text) to authenticated;
