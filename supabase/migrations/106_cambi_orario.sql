-- 106 · Cambi di orario e di giorno durante l'anno, con le comunicazioni
-- Prima: cambiando ora o giorno di un orario (scheda del corso → Orari) le lezioni future senza prenotazioni
-- venivano cancellate e rigenerate, quelle con prenotazioni restavano all'ora (o al giorno) vecchia,
-- e nessuno veniva avvisato. Sospendendo un orario, gli iscritti fissi restavano agganciati senza lezioni.
-- Ora:
-- - Ora, durata o giorno cambiati: TUTTE le lezioni future si spostano (prenotazioni, recuperi e prove compresi).
--   Se si mette "Valido dal" a una data futura, il cambio vale da quel giorno: prima resta tutto com'è.
-- - Ogni cliente coinvolto (fissi e prenotati) riceve UN messaggio ("Cambio orario: … dalle 19:00 alle 20:00 dal 11/11"),
--   l'insegnante uno, la segreteria vede il riepilogo.
-- - Orario sospeso (Attivo tolto) o finito (Valido fino al): le lezioni future spariscono (quelle con prenotazioni
--   vengono annullate restituendo recuperi e ingressi), i clienti ricevono un messaggio solo e la segreteria trova
--   tra le cose da fare chi aveva quel giorno fisso, da spostare.
-- - Sala cambiata in un'altra sede: i clienti vengono avvisati.
-- - Insegnante cambiata dalla scheda dell'orario: una notifica sola all'insegnante (non una per lezione).
-- Rieseguibile.

-- avviso a un cliente: notifica sul telefono se c'è, altrimenti email
create or replace function avvisa_cliente(p_account uuid, p_titolo text, p_testo text, p_url text, p_chiave text, p_evento text default 'avviso')
returns void language plpgsql security definer set search_path = public as $$
declare n int := 0; acc account;
begin
  if p_account is null then return; end if;
  if vuole_notifica(p_account, 'lezioni') then
    n := accoda_push(p_account, p_titolo, p_testo, p_url, p_chiave);
  end if;
  if coalesce(n, 0) = 0 then
    select * into acc from account where id = p_account;
    if acc.email is not null then
      insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
      select acc.palestra_id, acc.id, p_evento, 'email', acc.email, p_titolo,
             'Ciao,' || E'\n\n' || p_testo || E'\n\n' || (select nome from palestre where id = acc.palestra_id),
             p_chiave || ':mail'
      on conflict (palestra_id, chiave) do nothing;
    end if;
  end if;
exception when others then null;
end $$;

create or replace function trg_orari_lezioni()
returns trigger language plpgsql security definer set search_path = public as $$
declare pal palestre; v_dal date; v_shift int; v_corso text; v_prima text; v_dopo text; v_testo text; r record;
        v_ids uuid[]; v_fine date; v_sede_old uuid; v_sede_new uuid; v_gg text[] := array['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
        v_chiave text := 'orario:' || new.id || ':' || gen_random_uuid();
begin
  if coalesce(current_setting('rm.cambio_in_blocco', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    select * into pal from palestre where id = new.palestra_id;
    select nome into v_corso from corsi where id = new.corso_id;
    v_dal := greatest(current_date, coalesce(new.valido_dal, current_date));
    perform set_config('rm.cambio_in_blocco', '1', true);    -- niente notifica per ogni singola lezione

    if (old.attivo and not new.attivo) or (new.valido_al is not null and new.valido_al is distinct from old.valido_al and new.valido_al < coalesce(old.valido_al, 'infinity'::date)) then
      -- ── orario sospeso o finito ──
      v_fine := case when not new.attivo then current_date - 1 else new.valido_al end;
      select coalesce(array_agg(id), '{}') into v_ids from lezioni
       where orario_id = new.id and data > v_fine and inizio > now() and stato = 'programmata';
      v_testo := coalesce(v_corso, 'Il corso') || ' del ' || v_gg[old.giorno_settimana] || ' alle ' || to_char(old.ora_inizio, 'HH24:MI')
                 || ' non ci sarà più dal ' || to_char(greatest(v_fine + 1, current_date), 'DD/MM') || '.';
      for r in select distinct a.account_id from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id
                where vp.lezione_id = any (v_ids) and a.account_id is not null loop
        perform avvisa_cliente(r.account_id, 'Cambio di orario', v_testo || ' La segreteria ti contatta per scegliere un altro giorno.', '/area', v_chiave || ':' || r.account_id, 'cambio_orario');
      end loop;
      if old.insegnante_id is not null then
        perform accoda_push_staff(new.palestra_id, 'lezione', 'Orario sospeso', v_testo, '/gestione/calendario', null, old.insegnante_id, v_chiave || ':ins');
      end if;
      -- chi aveva quel giorno fisso va spostato dalla segreteria
      for r in select distinct i.id, a.nome, a.cognome from iscrizioni_orari io join iscrizioni i on i.id = io.iscrizione_id join allievi a on a.id = i.allievo_id
                where io.orario_id = new.id and i.stato = 'attiva' and i.data_fine > v_fine loop
        insert into promemoria (palestra_id, data, testo, creato_da)
        values (new.palestra_id, current_date, 'Scegliere un altro giorno per ' || r.nome || ' ' || coalesce(r.cognome, '') || ': ' || v_testo, 'Orari');
      end loop;
      -- le lezioni: quelle con qualcuno dentro si annullano (recuperi e ingressi tornano), le altre spariscono
      perform set_config('rm.chiusura', '1', true); perform set_config('rm.senza_recupero', '1', true);
      update lezioni l set stato = 'annullata', note = 'Orario sospeso'
       where l.id = any (v_ids)
         and (exists (select 1 from prenotazioni p where p.lezione_id = l.id and p.stato = 'confermata')
              or exists (select 1 from prove pr where pr.lezione_id = l.id and pr.stato in ('confermata', 'in_attesa_pagamento')));
      perform set_config('rm.chiusura', '', true); perform set_config('rm.senza_recupero', '', true);
      delete from lezioni l where l.id = any (v_ids) and l.stato = 'programmata'
         and not exists (select 1 from presenze ps where ps.lezione_id = l.id);

    elsif new.giorno_settimana <> old.giorno_settimana or new.ora_inizio <> old.ora_inizio or new.durata_min <> old.durata_min then
      -- ── stesso orario, ora / durata / giorno diversi: le lezioni si spostano, con chi c'è dentro ──
      v_shift := new.giorno_settimana - old.giorno_settimana;
      select coalesce(array_agg(id), '{}') into v_ids from lezioni
       where orario_id = new.id and data >= v_dal and inizio > now() and stato = 'programmata';
      update lezioni l
         set data = l.data + v_shift,
             inizio = ((l.data + v_shift) + new.ora_inizio) at time zone pal.fuso_orario,
             fine = ((l.data + v_shift) + new.ora_inizio + make_interval(mins => new.durata_min)) at time zone pal.fuso_orario
       where l.id = any (v_ids)
         and not exists (select 1 from lezioni x where x.orario_id = new.id and x.data = l.data + v_shift and x.id <> l.id);
      -- se il nuovo giorno cade in una chiusura, la lezione non si fa
      update lezioni l set stato = 'annullata', note = 'Chiusura'
       where l.id = any (v_ids) and exists (select 1 from chiusure ch where ch.palestra_id = l.palestra_id and l.data between ch.dal and ch.al);

      v_prima := v_gg[old.giorno_settimana] || ' alle ' || to_char(old.ora_inizio, 'HH24:MI');
      v_dopo := case when v_shift <> 0 then v_gg[new.giorno_settimana] || ' alle ' else 'alle ' end || to_char(new.ora_inizio, 'HH24:MI');
      v_testo := coalesce(v_corso, 'La lezione') || ': dal ' || to_char(v_dal, 'DD/MM') || ' ' ||
                 case when v_shift = 0 and new.ora_inizio = old.ora_inizio
                      then 'il ' || v_gg[new.giorno_settimana] || ' dura ' || new.durata_min || ' minuti (prima ' || old.durata_min || ')'
                      else 'non più il ' || v_prima || ' ma il ' || v_dopo
                           || case when new.durata_min <> old.durata_min then ' (' || new.durata_min || ' minuti)' else '' end end || '.';
      for r in select distinct a.account_id from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id
                where vp.lezione_id = any (v_ids) and a.account_id is not null loop
        perform avvisa_cliente(r.account_id, 'Cambio di orario', v_testo, '/area/orario', v_chiave || ':' || r.account_id, 'cambio_orario');
      end loop;
      if new.insegnante_id is not null then
        perform accoda_push_staff(new.palestra_id, 'lezione', 'Cambio di orario', v_testo, '/gestione/calendario', null, new.insegnante_id, v_chiave || ':ins');
      end if;
      perform accoda_push_staff(new.palestra_id, 'lezione', 'Cambio di orario fatto',
        v_testo || ' Avvisati ' || (select count(distinct a.account_id) from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id where vp.lezione_id = any (v_ids)) || ' clienti.',
        '/gestione/calendario', array['admin', 'segreteria'], null, v_chiave || ':seg');
    end if;

    -- sala, insegnante, prenotabilità: valgono per le lezioni future (dal giorno di validità)
    if new.sala_id is distinct from old.sala_id then
      select sede_id into v_sede_old from sale where id = old.sala_id;
      select sede_id into v_sede_new from sale where id = new.sala_id;
      if v_sede_old is distinct from v_sede_new then
        select coalesce(array_agg(id), '{}') into v_ids from lezioni where orario_id = new.id and data >= v_dal and inizio > now() and stato = 'programmata';
        for r in select distinct a.account_id from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id
                  where vp.lezione_id = any (v_ids) and a.account_id is not null loop
          perform avvisa_cliente(r.account_id, 'Cambio di sede', coalesce(v_corso, 'La lezione') || ' del ' || v_gg[new.giorno_settimana] || ': dal ' || to_char(v_dal, 'DD/MM')
                   || ' si fa a ' || coalesce((select s.nome from sedi s join sale x on x.sede_id = s.id where x.id = new.sala_id), 'un''altra sede') || '.',
                   '/area/orario', v_chiave || ':sede:' || r.account_id, 'cambio_orario');
        end loop;
      end if;
    end if;
    update lezioni set sala_id = new.sala_id, prenotabile = new.prenotabile,
                       insegnante_id = case when insegnante_titolare is null then new.insegnante_id else insegnante_id end
     where orario_id = new.id and inizio > now() and data >= v_dal and stato = 'programmata';
    if new.insegnante_id is distinct from old.insegnante_id and new.insegnante_id is not null then
      perform accoda_push_staff(new.palestra_id, 'lezione', 'Ti sono state assegnate delle lezioni',
        coalesce(v_corso, 'Corso') || ' del ' || v_gg[new.giorno_settimana] || ' alle ' || to_char(new.ora_inizio, 'HH24:MI') || ' dal ' || to_char(v_dal, 'DD/MM'),
        '/gestione/calendario', null, new.insegnante_id, v_chiave || ':nuova-ins');
    end if;
    perform set_config('rm.cambio_in_blocco', '', true);
  end if;
  if new.attivo then
    perform genera_lezioni(new.palestra_id, greatest(current_date, coalesce(new.valido_dal, current_date)), current_date + 90, new.id);
    -- insegnante o sala già occupate a quell'ora? la segreteria lo sa subito
    if tg_op = 'INSERT' or new.giorno_settimana <> old.giorno_settimana or new.ora_inizio <> old.ora_inizio or new.durata_min <> old.durata_min
       or new.sala_id is distinct from old.sala_id or new.insegnante_id is distinct from old.insegnante_id or (new.attivo and not old.attivo) then
      declare s jsonb; v_t text := '';
      begin
        s := sovrapposizioni(array(select id from lezioni where orario_id = new.id and inizio > now() and stato = 'programmata'));
        if jsonb_array_length(s -> 'insegnante') > 0 then
          v_t := (select nome from staff where id = new.insegnante_id) || ' ha già ' || (s -> 'insegnante' -> 0 ->> 'corso') || ' ' || (s -> 'insegnante' -> 0 ->> 'quando');
        end if;
        if jsonb_array_length(s -> 'sala') > 0 then
          v_t := concat_ws('; ', nullif(v_t, ''), 'la sala è già occupata da ' || (s -> 'sala' -> 0 ->> 'corso') || ' ' || (s -> 'sala' -> 0 ->> 'quando'));
        end if;
        if v_t <> '' then
          perform accoda_push_staff(new.palestra_id, 'lezione', 'Orario in conflitto',
            (select nome from corsi where id = new.corso_id) || ' (' || (array['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])[new.giorno_settimana] || ' '
              || to_char(new.ora_inizio, 'HH24:MI') || '): ' || v_t, '/gestione/corsi/' || new.corso_id,
            array['admin', 'segreteria'], null, 'conflitto-orario:' || new.id || ':' || gen_random_uuid());
        end if;
      end;
    end if;
  end if;
  return new;
end $$;

-- ── Insegnante o sala in due posti alla stessa ora ──────────────────────────────
-- Le lezioni (tra quelle date) che si sovrappongono ad altre della stessa insegnante (o della stessa sala)
create or replace function sovrapposizioni(p_lezioni uuid[], p_staff uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with mie as (select l.*, coalesce(p_staff, l.insegnante_id) as chi from lezioni l where l.id = any (p_lezioni) and l.stato = 'programmata' and l.inizio > now()),
  ins as (
    select c2.nome as corso, (array['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])[extract(isodow from o.inizio at time zone 'Europe/Rome')::int] || ' ' || to_char(o.inizio at time zone 'Europe/Rome', 'HH24:MI') as quando, count(*) as volte
      from mie m join lezioni o on o.insegnante_id = m.chi and o.id <> m.id and o.stato = 'programmata'
                                and o.inizio < m.fine and m.inizio < o.fine and not (o.id = any (p_lezioni))
      join corsi c2 on c2.id = o.corso_id
     group by 1, 2),
  sal as (
    select c2.nome as corso, (array['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])[extract(isodow from o.inizio at time zone 'Europe/Rome')::int] || ' ' || to_char(o.inizio at time zone 'Europe/Rome', 'HH24:MI') as quando, count(*) as volte
      from mie m join lezioni o on o.sala_id = m.sala_id and o.id <> m.id and o.stato = 'programmata'
                                and o.inizio < m.fine and m.inizio < o.fine and not (o.id = any (p_lezioni))
      join corsi c2 on c2.id = o.corso_id
     where p_staff is null
     group by 1, 2)
  select jsonb_build_object(
    'insegnante', coalesce((select jsonb_agg(to_jsonb(ins)) from ins), '[]'::jsonb),
    'sala', coalesce((select jsonb_agg(to_jsonb(sal)) from sal), '[]'::jsonb));
$$;
revoke execute on function sovrapposizioni(uuid[], uuid) from public, anon;
grant execute on function sovrapposizioni(uuid[], uuid) to authenticated;

-- prima di confermare un cambio d'insegnante: quali lezioni cambierebbero e se lei è già occupata
create or replace function verifica_sostituzione(p_lezione uuid, p_staff uuid, p_da_oggi boolean default false,
                                                 p_fino date default null, p_tutto_corso boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l lezioni; v_ids uuid[];
begin
  select * into l from lezioni where id = p_lezione;
  if not found or not is_staff(l.palestra_id) or p_staff is null then return jsonb_build_object('insegnante', '[]'::jsonb); end if;
  if not is_gestione(l.palestra_id) then p_da_oggi := false; p_fino := null; p_tutto_corso := false; end if;
  select coalesce(array_agg(x.id), '{}') into v_ids from lezioni x
   where x.id = l.id
      or ((p_da_oggi or p_fino is not null) and x.palestra_id = l.palestra_id and x.inizio >= l.inizio and x.stato <> 'annullata'
          and (p_fino is null or x.data <= p_fino)
          and case when p_tutto_corso
                   then x.corso_id = l.corso_id and coalesce(x.insegnante_titolare, x.insegnante_id) is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id)
                   else l.orario_id is not null and x.orario_id = l.orario_id end);
  return sovrapposizioni(v_ids, p_staff) || jsonb_build_object('lezioni', cardinality(v_ids));
end $$;
revoke execute on function verifica_sostituzione(uuid, uuid, boolean, date, boolean) from public, anon;
grant execute on function verifica_sostituzione(uuid, uuid, boolean, date, boolean) to authenticated;

-- dopo un cambio d'insegnante: se l'ha messa in due posti alla stessa ora, la segreteria lo sa
create or replace function trg_avvisa_sovrapposizioni()
returns trigger language plpgsql security definer set search_path = public as $$
declare s jsonb; v_testo text; v_nome text;
begin
  if coalesce(current_setting('rm.cambio_in_blocco', true), '') = '1' then return null; end if;   -- ci pensa chi fa il blocco
  if new.insegnante_id is null or new.insegnante_id is not distinct from old.insegnante_id or new.inizio < now() then return null; end if;
  s := sovrapposizioni(array[new.id], new.insegnante_id);
  if jsonb_array_length(s -> 'insegnante') > 0 then
    select nome into v_nome from staff where id = new.insegnante_id;
    v_testo := coalesce(v_nome, 'L''insegnante') || ' ha già ' || (s -> 'insegnante' -> 0 ->> 'corso') || ' alla stessa ora ('
               || to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM HH24:MI') || ')';
    perform accoda_push_staff(new.palestra_id, 'lezione', 'Insegnante in due posti', v_testo, '/gestione/appello/' || new.id,
                              array['admin', 'segreteria'], null, 'doppia:' || new.id || ':' || new.insegnante_id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists lezioni_sovrapposizioni on lezioni;
create trigger lezioni_sovrapposizioni after update of insegnante_id on lezioni
  for each row execute function trg_avvisa_sovrapposizioni();

-- dopo un cambio in blocco (sostituzione per periodo / tutto il corso): un avviso solo
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('sostituisci_lezione(uuid,uuid,boolean,date,boolean)'::regprocedure); v0 := v;
  if v not ilike '%sovrapposizioni%' then
    v := replace(v, '    perform set_config(''rm.cambio_in_blocco'', '''', true);
  else',
      '    perform set_config(''rm.cambio_in_blocco'', '''', true);
    -- in due posti alla stessa ora? la segreteria lo sa subito
    if p_staff is not null and jsonb_array_length(sovrapposizioni(array(select id from _da_cambiare), p_staff) -> ''insegnante'') > 0 then
      perform accoda_push_staff(l.palestra_id, ''lezione'', ''Insegnante in due posti'',
        trim(nuova.nome) || '' ha già altre lezioni alla stessa ora di '' || v_quando || case when p_fino is not null then '' (fino al '' || to_char(p_fino, ''DD/MM'') || '')'' else '' e successive'' end,
        ''/gestione/calendario'', array[''admin'', ''segreteria''], null, ''doppia-blocco:'' || l.id || '':'' || p_staff || '':'' || to_char(now(), ''YYYYMMDDHH24MI''));
    end if;
  else');
    if v = v0 then raise notice 'sostituisci_lezione: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- ── Un orario sospeso o finito non si può più comprare né assegnare ─────────────
-- (prima: un bonifico chiesto per il venerdì e confermato dopo la sospensione creava un iscritto fisso su un orario che non c'è)
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('crea_iscrizione(uuid,uuid,uuid,date,uuid[],integer,boolean,text)'::regprocedure); v0 := v;
  if v not ilike '%orario_non_attivo%' then
    v := replace(v, '    if not exists (select 1 from orari where id = v_orario and corso_id = p_corso) then
      raise exception ''orario_non_del_corso'';
    end if;',
      '    if not exists (select 1 from orari where id = v_orario and corso_id = p_corso) then
      raise exception ''orario_non_del_corso'';
    end if;
    if not exists (select 1 from orari where id = v_orario and attivo and (valido_al is null or valido_al >= coalesce(p_data_inizio, current_date))) then
      raise exception ''orario_non_attivo'';
    end if;');
    if v = v0 then raise notice 'crea_iscrizione: testo non trovato'; else execute v; end if;
  end if;
  v := pg_get_functiondef('prepara_acquisto(jsonb)'::regprocedure); v0 := v;
  if v not ilike '%orario_non_attivo%' then
    v := replace(v, '    raise exception ''orario_non_del_corso'';
  end if;',
      '    raise exception ''orario_non_del_corso'';
  end if;
  if exists (select 1 from unnest(v_orari) o where not exists (select 1 from orari x where x.id = o and x.attivo)) then
    raise exception ''orario_non_attivo'';
  end if;');
    if v = v0 then raise notice 'prepara_acquisto: testo non trovato'; else execute v; end if;
  end if;
  v := pg_get_functiondef('richiedi_abbonamento(uuid,uuid,uuid,uuid[],date)'::regprocedure); v0 := v;
  if v not ilike '%orario_non_attivo%' then
    v := replace(v, '  if t.modalita = ''orari_fissi'' and coalesce(array_length(p_orari, 1), 0) = 0 then raise exception ''scegli_i_giorni''; end if;',
      '  if t.modalita = ''orari_fissi'' and coalesce(array_length(p_orari, 1), 0) = 0 then raise exception ''scegli_i_giorni''; end if;
  if exists (select 1 from unnest(coalesce(p_orari, ''{}'')) o where not exists (select 1 from orari x where x.id = o and x.corso_id = p_corso and x.attivo)) then
    raise exception ''orario_non_attivo'';
  end if;');
    if v = v0 then raise notice 'richiedi_abbonamento: testo non trovato'; else execute v; end if;
  end if;
end $$;
