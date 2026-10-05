-- 104 · Lezione annullata dalla scuola: il recupero arriva in automatico
-- - Chi era iscritto a quella lezione riceve un recupero, che non conta nei 2 recuperi dell'abbonamento
--   né nel limite mensile, e vale almeno 30 giorni.
-- - Se la scuola fissa lei il recupero, annullando sceglie "nessun recupero automatico".
-- - Le chiusure (Palinsesto → Chiusure: feste, vacanze) non danno recuperi: i prezzi tengono già conto delle festività.
-- - Se la lezione viene ripristinata, i recuperi non ancora usati spariscono.
-- Rieseguibile.

alter table crediti_recupero add column if not exists dalla_scuola boolean not null default false;

-- i recuperi dati dalla scuola non consumano quelli dell'abbonamento
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('disdici_lezione(uuid,uuid)'::regprocedure); v0 := v;
  if v not ilike '%dalla_scuola%' then
    v := replace(v, 'select count(*) into v_usati from crediti_recupero where iscrizione_id = v_isc and not annullato;',
                    'select count(*) into v_usati from crediti_recupero where iscrizione_id = v_isc and not annullato and not dalla_scuola;');
    if v = v0 then raise notice 'disdici_lezione: testo non trovato'; else execute v; end if;
  end if;
  v := pg_get_functiondef('prenota_recupero(uuid,uuid)'::regprocedure); v0 := v;
  if v not ilike '%dalla_scuola%' then
    v := replace(v, 'if v_max is not null and recuperi_nel_mese(c.allievo_id, l.data) >= v_max then',
                    'if v_max is not null and not c.dalla_scuola and recuperi_nel_mese(c.allievo_id, l.data) >= v_max then');
    if v = v0 then raise notice 'prenota_recupero: testo non trovato'; else execute v; end if;
  end if;
end $$;

create or replace function recuperi_nel_mese(p_allievo uuid, p_data date)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from prenotazioni p join lezioni l on l.id = p.lezione_id
   where p.allievo_id = p_allievo and p.tipo = 'recupero' and p.stato = 'confermata'
     and date_trunc('month', l.data) = date_trunc('month', p_data)
     and not exists (select 1 from crediti_recupero cr where cr.usato_in = p.id and cr.dalla_scuola);
$$;

-- annullare una lezione: con o senza recupero automatico (di serie: con)
drop function if exists modifica_lezione(uuid, text, text, boolean);
create or replace function modifica_lezione(p_lezione uuid, p_cosa text, p_valore text, p_da_oggi boolean default false, p_recupero boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare l lezioni; n int;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(l.palestra_id) then raise exception 'non_autorizzato'; end if;

  if p_cosa = 'posti' then
    update lezioni set capienza_override = nullif(p_valore, '')::int
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'prenotabile' then
    update lezioni set prenotabile = p_valore::boolean
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'annulla' then
    perform set_config('rm.senza_recupero', case when p_recupero then '' else '1' end, true);
    update lezioni set stato = 'annullata', note = nullif(p_valore, '')
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
    perform set_config('rm.senza_recupero', '', true);
  elsif p_cosa = 'ripristina' then
    update lezioni set stato = 'programmata', note = null
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'insegnante' then
    update lezioni set insegnante_id = nullif(p_valore, '')::uuid
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'sala' then
    update lezioni set sala_id = nullif(p_valore, '')::uuid
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  else
    raise exception 'azione_sconosciuta';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function modifica_lezione(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function modifica_lezione(uuid, text, text, boolean, boolean) to authenticated, service_role;

-- annullata: prenotazioni chiuse, recuperi e ingressi restituiti, e il recupero automatico a chi era iscritto
create or replace function trg_lezioni_annullata_prenotazioni()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_corso text; v_auto boolean;
begin
  if new.stato = 'annullata' and old.stato is distinct from 'annullata' then
    update crediti_recupero cr set usato_in = null
      from prenotazioni p
     where p.lezione_id = new.id and p.stato = 'confermata' and p.tipo = 'recupero' and cr.usato_in = p.id;
    update prenotazioni set stato = 'annullata' where lezione_id = new.id and stato = 'confermata';
    select nome into v_corso from corsi where id = new.corso_id;
    for r in select pr.id, a.nome, a.cognome from prove pr join allievi a on a.id = pr.allievo_id
              where pr.lezione_id = new.id and pr.stato in ('confermata', 'in_attesa_pagamento') loop
      insert into promemoria (palestra_id, data, testo, creato_da, lezione_id)
      values (new.palestra_id, current_date,
              'Prova da spostare: ' || r.nome || ' ' || coalesce(r.cognome, '') || ' — ' || coalesce(v_corso, 'lezione') || ' del '
                || to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ' è stata annullata.', 'Calendario', new.id);
    end loop;

    -- recupero automatico: solo per le lezioni annullate dalla scuola (non le chiusure) ancora da fare
    v_auto := coalesce(current_setting('rm.senza_recupero', true), '') <> '1'
              and coalesce(current_setting('rm.chiusura', true), '') <> '1'
              and new.inizio > now();
    if v_auto then
      insert into crediti_recupero (palestra_id, iscrizione_id, allievo_id, lezione_persa_id, scadenza, dalla_scuola)
      select distinct on (b.riferimento_id) new.palestra_id, b.riferimento_id, b.allievo_id, new.id,
             new.data + coalesce(t.giorni_validita_recupero, 30), true
        from v_partecipanti_base b
        join iscrizioni i on i.id = b.riferimento_id
        join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
       where b.lezione_id = new.id and b.tipo = 'iscritto'
      on conflict (iscrizione_id, lezione_persa_id) do nothing;
      -- almeno 30 giorni per usarlo (anche se l'abbonamento finisce prima)
      update crediti_recupero set scadenza = greatest(scadenza, new.data + 30)
       where lezione_persa_id = new.id and dalla_scuola;
    end if;
  elsif old.stato = 'annullata' and new.stato <> 'annullata' then
    -- lezione ripristinata: i recuperi dati in automatico e non usati non servono più
    update crediti_recupero set annullato = true
     where lezione_persa_id = new.id and dalla_scuola and usato_in is null;
  end if;
  return new;
end $$;

-- il messaggio ai clienti dice se c'è il recupero
create or replace function trg_lezioni_annullata_clienti()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; n int; v_testo text; pal palestre;
begin
  if coalesce(current_setting('rm.chiusura', true), '') = '1' then return new; end if;   -- ci pensa la chiusura
  if new.stato = 'annullata' and old.stato is distinct from 'annullata' and new.inizio > now() then
    select * into pal from palestre where id = new.palestra_id;
    v_testo := (select nome from corsi where id = new.corso_id) || ' di ' ||
               to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ' non si fa. Ci scusiamo!'
               || case when coalesce(current_setting('rm.senza_recupero', true), '') = '1'
                       then ' Per il recupero ti contatta la scuola.'
                       else ' Hai un recupero da usare: lo prenoti dall''app.' end;
    for r in select distinct a.account_id from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id
              where vp.lezione_id = new.id and a.account_id is not null loop
      begin
        n := 0;
        if vuole_notifica(r.account_id, 'lezioni') then
          n := accoda_push(r.account_id, 'Lezione annullata', v_testo, '/area', 'ann:' || new.id || ':' || r.account_id);
        end if;
        -- nessun telefono raggiunto: l'avviso arriva per email (è un'informazione di servizio)
        if coalesce(n, 0) = 0 then
          insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
          select new.palestra_id, acc.id, 'lezione_annullata', 'email', acc.email, 'Lezione annullata',
                 'Ciao,' || E'\n\n' || v_testo || coalesce(E'\n' || nullif(trim(new.note), ''), '')
                   || E'\n\n' || pal.nome,
                 'ann-mail:' || new.id || ':' || acc.id
            from account acc where acc.id = r.account_id and acc.email is not null
          on conflict (palestra_id, chiave) do nothing;
        end if;
      exception when others then null; end;
    end loop;
  end if;
  return new;
end $$;

-- il trigger deve scattare anche al ripristino (era già "after update of stato")
drop trigger if exists trg_lezioni_annullata_rimborsa on lezioni;
create trigger trg_lezioni_annullata_rimborsa after update of stato on lezioni
  for each row execute function trg_lezioni_annullata_prenotazioni();
