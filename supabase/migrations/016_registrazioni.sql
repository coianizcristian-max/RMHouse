-- =====================================================================
-- RMHouse — 016 PUNTI DI REGISTRAZIONE DELLA SEGRETERIA
-- Creare una persona nuova al banco, incassare, mettere qualcuno in
-- lista d'attesa: cose che si facevano solo via import o dal sito.
-- Da eseguire dopo 001…015.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NUOVA PERSONA AL BANCO
--    Crea (o riusa) il titolare e aggiunge l'allievo. Se chi paga e chi
--    frequenta sono la stessa persona, basta compilare il titolare.
-- ---------------------------------------------------------------------
create or replace function crea_persona(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid := (p->>'palestra_id')::uuid;
  v_email text := lower(nullif(trim(p->'titolare'->>'email'), ''));
  v_acc uuid; v_all uuid; v_nuovo_acc boolean := false;
  v_nome text; v_cognome text; v_nascita date;
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if coalesce(trim(p->'titolare'->>'nome'), '') = '' then raise exception 'nome_mancante'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_non_valida'; end if;

  -- titolare: se l'email esiste già si riusa quell'anagrafica
  if p->>'account_id' is not null then
    v_acc := (p->>'account_id')::uuid;
  else
    if v_email is not null then
      select id into v_acc from account where palestra_id = v_pal and lower(email) = v_email;
    end if;
    if v_acc is null then
      insert into account (palestra_id, nome, cognome, email, telefono, codice_fiscale,
                           indirizzo, cap, citta, provincia, fonte, note,
                           consenso_privacy_at, consenso_marketing)
      values (v_pal, trim(p->'titolare'->>'nome'), nullif(trim(p->'titolare'->>'cognome'), ''),
              v_email, nullif(trim(p->'titolare'->>'telefono'), ''),
              upper(nullif(trim(p->'titolare'->>'codice_fiscale'), '')),
              nullif(trim(p->'titolare'->>'indirizzo'), ''), nullif(trim(p->'titolare'->>'cap'), ''),
              nullif(trim(p->'titolare'->>'citta'), ''), nullif(trim(p->'titolare'->>'provincia'), ''),
              coalesce(nullif(p->>'fonte', ''), 'segreteria'), nullif(p->>'note', ''),
              case when coalesce((p->>'consenso_privacy')::boolean, false) then now() end,
              coalesce((p->>'consenso_marketing')::boolean, false))
      returning id into v_acc;
      v_nuovo_acc := true;
    else
      update account set
        telefono = coalesce(nullif(trim(p->'titolare'->>'telefono'), ''), telefono),
        codice_fiscale = coalesce(upper(nullif(trim(p->'titolare'->>'codice_fiscale'), '')), codice_fiscale)
      where id = v_acc;
    end if;
  end if;

  -- allievo: se non è indicato, frequenta il titolare stesso
  if coalesce(trim(p->'allievo'->>'nome'), '') = '' then
    v_nome := trim(p->'titolare'->>'nome');
    v_cognome := nullif(trim(p->'titolare'->>'cognome'), '');
    v_nascita := nullif(p->'titolare'->>'data_nascita', '')::date;
  else
    v_nome := trim(p->'allievo'->>'nome');
    v_cognome := nullif(trim(p->'allievo'->>'cognome'), '');
    v_nascita := nullif(p->'allievo'->>'data_nascita', '')::date;
  end if;
  if v_nascita is null then raise exception 'data_nascita_mancante'; end if;

  select id into v_all from allievi
   where account_id = v_acc and lower(nome) = lower(v_nome) and data_nascita = v_nascita;

  if v_all is null then
    insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare,
                         certificato_scadenza, stato_lead, note)
    values (v_pal, v_acc, v_nome, coalesce(v_cognome, ''), v_nascita,
            coalesce(trim(p->'allievo'->>'nome'), '') = '',
            nullif(p->>'certificato_scadenza', '')::date,
            'iscritto', nullif(p->>'note_allievo', ''))
    returning id into v_all;
  end if;

  return jsonb_build_object('account_id', v_acc, 'allievo_id', v_all, 'account_nuovo', v_nuovo_acc);
end $$;

grant execute on function crea_persona(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. INCASSI
--    Segnare come pagato quello che arriva in contanti, con bonifico o
--    con il POS; e registrare un incasso libero (quota, saggio, materiale).
-- ---------------------------------------------------------------------
create or replace function segna_pagato(p_pagamento uuid, p_metodo text default 'contanti', p_quando timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare pg pagamenti;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_metodo not in ('contanti', 'bonifico', 'pos', 'online', 'altro') then raise exception 'metodo_non_valido'; end if;

  update pagamenti set stato = 'pagato'::stato_pagamento, metodo = p_metodo, pagato_at = p_quando
   where id = p_pagamento;
end $$;

create or replace function annulla_pagamento(p_pagamento uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pg pagamenti;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;

  update pagamenti set stato = 'annullato'::stato_pagamento,
         descrizione = descrizione || coalesce(' — annullato: ' || p_motivo, '')
   where id = p_pagamento;
end $$;

-- Le causali ammesse: aggiungo quelle che servono davvero al banco
alter table pagamenti drop constraint if exists pagamenti_causale_check;
alter table pagamenti add constraint pagamenti_causale_check
  check (causale in ('prova', 'abbonamento', 'quota_iscrizione', 'evento', 'spazio', 'materiale', 'altro'));

-- Incasso libero: quota annuale, saggio, materiale, penale…
create or replace function registra_incasso(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pal uuid := (p->>'palestra_id')::uuid; v_id uuid; v_importo int;
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  v_importo := coalesce((p->>'importo_cent')::int, 0);
  if v_importo <= 0 then raise exception 'importo_non_valido'; end if;

  insert into pagamenti (palestra_id, account_id, corso_id, causale, descrizione, importo_cent,
                         metodo, stato, pagato_at)
  values (v_pal, nullif(p->>'account_id', '')::uuid, nullif(p->>'corso_id', '')::uuid,
          coalesce(nullif(p->>'causale', ''), 'altro'),
          coalesce(nullif(trim(p->>'descrizione'), ''), 'Incasso'),
          v_importo,
          coalesce(nullif(p->>'metodo', ''), 'contanti'),
          (case when coalesce((p->>'incassato')::boolean, true) then 'pagato' else 'in_attesa' end)::stato_pagamento,
          case when coalesce((p->>'incassato')::boolean, true) then now() end)
  returning id into v_id;

  -- se è la quota annuale, resta anche scritta nella scheda dell'allievo
  if p->>'causale' = 'quota_iscrizione' and p->>'allievo_id' is not null then
    insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, pagamento_id, data)
    select v_pal, (p->>'allievo_id')::uuid,
           stagione_di(current_date, coalesce(pa.mese_inizio_stagione, 9)),
           v_importo, v_id, current_date
    from palestre pa where pa.id = v_pal
    on conflict do nothing;
  end if;

  return v_id;
end $$;

grant execute on function segna_pagato(uuid, text, timestamptz) to authenticated;
grant execute on function annulla_pagamento(uuid, text) to authenticated;
grant execute on function registra_incasso(jsonb) to authenticated;

-- Elenco degli incassi con chi ha pagato e per cosa
create or replace view v_incassi with (security_invoker = true) as
  select pg.id, pg.palestra_id, pg.causale, pg.descrizione, pg.importo_cent, pg.metodo, pg.stato,
         pg.pagato_at, pg.created_at, pg.corso_id, c.nome as corso,
         pg.account_id, acc.nome as titolare_nome, acc.cognome as titolare_cognome,
         acc.email, acc.telefono,
         (select string_agg(a.nome, ', ') from allievi a where a.account_id = pg.account_id) as allievi
  from pagamenti pg
  left join account acc on acc.id = pg.account_id
  left join corsi c on c.id = pg.corso_id;

-- Totali del periodo, divisi per metodo
create or replace function incassi_periodo(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'incassato_cent', coalesce(sum(importo_cent) filter (where stato = 'pagato'), 0),
    'da_incassare_cent', coalesce(sum(importo_cent) filter (where stato = 'in_attesa'), 0),
    'per_metodo', coalesce((
      select jsonb_object_agg(coalesce(metodo, 'non indicato'), tot)
      from (select metodo, sum(importo_cent) as tot from pagamenti
             where palestra_id = p_palestra and stato = 'pagato'
               and pagato_at::date between p_dal and p_al
             group by metodo) m), '{}'::jsonb),
    'per_causale', coalesce((
      select jsonb_object_agg(causale, tot)
      from (select causale, sum(importo_cent) as tot from pagamenti
             where palestra_id = p_palestra and stato = 'pagato'
               and pagato_at::date between p_dal and p_al
             group by causale) cs), '{}'::jsonb)
  )
  from pagamenti
  where palestra_id = p_palestra
    and coalesce(pagato_at::date, created_at::date) between p_dal and p_al;
$$;

-- ---------------------------------------------------------------------
-- 3. LISTA D'ATTESA DALLA SEGRETERIA
--    La funzione c'era ma nessuna schermata la chiamava.
-- ---------------------------------------------------------------------
grant execute on function aggiungi_in_attesa(uuid, uuid, uuid, text) to authenticated;

-- Chi si può mettere in attesa su un corso: cerca per nome
create or replace function candidati_attesa(p_corso uuid, p_cerca text default '')
returns table (allievo_id uuid, nome text, cognome text, titolare text, gia_iscritto boolean)
language sql stable security invoker as $$
  select a.id, a.nome, a.cognome, acc.nome || ' ' || acc.cognome,
         exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.corso_id = p_corso and i.stato = 'attiva')
  from allievi a
  join account acc on acc.id = a.account_id
  join corsi c on c.id = p_corso
  where a.palestra_id = c.palestra_id
    and not exists (select 1 from liste_attesa la
                     where la.allievo_id = a.id and la.corso_id = p_corso and la.stato = 'in_attesa')
    and (p_cerca = '' or lower(a.nome || ' ' || a.cognome) like '%' || lower(p_cerca) || '%')
  order by a.cognome, a.nome
  limit 20;
$$;

grant execute on function candidati_attesa(uuid, text) to authenticated;
