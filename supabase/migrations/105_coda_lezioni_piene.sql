-- 105 · Lezioni e giorni al completo: la coda
-- - Dall'app il cliente su una lezione piena tocca "Mettimi in coda"; su un giorno pieno (acquisto) "In coda per lun 19:00".
-- - La segreteria riceve subito la notifica (con il telefono) e vede tutto in Persone → Liste d'attesa.
-- - Quando qualcuno disdice: i primi in coda (tanti quanti i posti liberi) ricevono l'avviso,
--   e la segreteria riceve "Si è liberato un posto" con l'elenco di chi è in coda, per chiamarli.
-- - Chi entra (prenota o si iscrive) esce dalla coda da solo; le code delle lezioni passate si chiudono.
-- - "Esci dalla coda" nell'app ora funziona (prima falliva in silenzio).
-- - I posti liberi tengono conto dei posti cambiati sulla singola lezione.
-- Rieseguibile.

-- posti liberi: valgono anche i posti modificati sulla singola lezione
create or replace function posti_liberi(p_lezione uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posti', case when coalesce(l.capienza_override, c.capienza, s.capienza) is null then null
                  else coalesce(l.capienza_override, c.capienza, s.capienza)
                       - (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id) end,
    'posti_prova', c.max_prove_per_lezione
      - (select count(*) from prove pr where pr.lezione_id = l.id
          and pr.stato in ('in_attesa_pagamento', 'confermata', 'presente', 'assente')))
  from lezioni l join corsi c on c.id = l.corso_id left join sale s on s.id = l.sala_id
  where l.id = p_lezione;
$$;

-- avviso alla segreteria: chi è in coda, con il telefono
create or replace function avvisa_segreteria_coda(p_palestra uuid, p_titolo text, p_cosa text, p_corso uuid, p_lezione uuid, p_chiave text)
returns void language plpgsql security definer set search_path = public as $$
declare v_elenco text; n int;
begin
  select count(*), string_agg(a.nome || ' ' || coalesce(a.cognome, '') || coalesce(' (' || nullif(acc.telefono, '') || ')', ''), ', ' order by la.created_at)
    into n, v_elenco
    from (select * from liste_attesa where corso_id = p_corso and lezione_id is not distinct from p_lezione and stato in ('in_attesa', 'avvisato')
           order by created_at limit 6) la
    join allievi a on a.id = la.allievo_id left join account acc on acc.id = la.account_id;
  if coalesce(n, 0) = 0 then return; end if;
  perform accoda_push_staff(p_palestra, 'richiesta', p_titolo, p_cosa || ' · in coda: ' || v_elenco, '/gestione/attese',
                            array['admin', 'segreteria'], null, p_chiave);
exception when others then null;
end $$;

-- il cliente si mette in coda per una lezione piena
create or replace function mettimi_in_coda(p_lezione uuid, p_allievo uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; l lezioni; v_id uuid; v_posti int; v_corso text; v_quando text;
begin
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  select * into l from lezioni where id = p_lezione and palestra_id = a.palestra_id;
  if not found or l.stato <> 'programmata' or l.inizio <= now() then raise exception 'lezione_non_disponibile'; end if;
  if exists (select 1 from v_partecipanti_lezione where lezione_id = l.id and allievo_id = a.id) then raise exception 'gia_prenotato'; end if;
  v_posti := (posti_liberi(l.id) ->> 'posti')::int;
  if v_posti is null or v_posti > 0 then raise exception 'ci_sono_posti'; end if;

  select id into v_id from liste_attesa where lezione_id = l.id and allievo_id = a.id and tipo = 'lezione' and stato <> 'chiuso';
  if v_id is not null then return v_id; end if;
  insert into liste_attesa (palestra_id, tipo, corso_id, lezione_id, allievo_id, account_id, note)
  values (a.palestra_id, 'lezione', l.corso_id, l.id, a.id, a.account_id, 'dall''app')
  returning id into v_id;

  select nome into v_corso from corsi where id = l.corso_id;
  v_quando := to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');
  begin
    perform accoda_push_staff(a.palestra_id, 'richiesta', 'In coda per una lezione piena',
      trim(a.nome || ' ' || coalesce(a.cognome, '')) || ' · ' || coalesce(v_corso, '') || ' del ' || v_quando,
      '/gestione/attese', array['admin', 'segreteria'], null, 'coda:' || v_id);
  exception when others then null; end;
  return v_id;
end $$;
revoke execute on function mettimi_in_coda(uuid, uuid) from public, anon;
grant execute on function mettimi_in_coda(uuid, uuid) to authenticated;

-- il cliente vuole un giorno fisso che è pieno (acquisto dall'app)
create or replace function mettimi_in_coda_orario(p_allievo uuid, p_orario uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; o orari; v_id uuid; v_giorno text; v_corso text;
begin
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  select * into o from orari where id = p_orario and palestra_id = a.palestra_id and attivo;
  if not found then raise exception 'orario_non_valido'; end if;
  v_giorno := (array['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])[o.giorno_settimana] || ' ' || to_char(o.ora_inizio, 'HH24:MI');

  select id into v_id from liste_attesa where corso_id = o.corso_id and lezione_id is null and allievo_id = a.id and tipo = 'iscrizione' and stato <> 'chiuso';
  if v_id is not null then
    update liste_attesa set note = case when coalesce(note, '') like '%' || v_giorno || '%' then note else concat_ws(', ', nullif(note, ''), 'giorno: ' || v_giorno) end
     where id = v_id;
    return v_id;
  end if;
  insert into liste_attesa (palestra_id, tipo, corso_id, allievo_id, account_id, note)
  values (a.palestra_id, 'iscrizione', o.corso_id, a.id, a.account_id, 'dall''app · giorno: ' || v_giorno)
  returning id into v_id;
  select nome into v_corso from corsi where id = o.corso_id;
  begin
    perform accoda_push_staff(a.palestra_id, 'richiesta', 'In coda per un giorno pieno',
      trim(a.nome || ' ' || coalesce(a.cognome, '')) || ' vorrebbe ' || coalesce(v_corso, '') || ' il ' || v_giorno,
      '/gestione/attese', array['admin', 'segreteria'], null, 'coda:' || v_id);
  exception when others then null; end;
  return v_id;
end $$;
revoke execute on function mettimi_in_coda_orario(uuid, uuid) from public, anon;
grant execute on function mettimi_in_coda_orario(uuid, uuid) to authenticated;

-- il cliente esce dalla coda (prima l'app scriveva uno stato che il database rifiutava)
create or replace function esci_dalla_coda(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update liste_attesa set stato = 'chiuso', esito = 'rinunciato'
   where id = p_id and allievo_id in (select id from allievi where account_id in (select miei_account()));
  if not found then raise exception 'non_trovato'; end if;
end $$;
revoke execute on function esci_dalla_coda(uuid) from public, anon;
grant execute on function esci_dalla_coda(uuid) to authenticated;

-- posto liberato in una lezione: avviso ai primi in coda + avviso alla segreteria con l'elenco
create or replace function avvisa_lista_attesa(p_lezione uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_pal palestre; v_liberi jsonb; n int := 0; v_corso text; v_quando text; v_corso_id uuid;
begin
  select p.* into v_pal from palestre p join lezioni l on l.palestra_id = p.id where l.id = p_lezione;
  v_liberi := posti_liberi(p_lezione);
  select c.nome, c.id, to_char(l.inizio at time zone v_pal.fuso_orario, 'DD/MM alle HH24:MI')
    into v_corso, v_corso_id, v_quando
    from lezioni l join corsi c on c.id = l.corso_id where l.id = p_lezione;
  if coalesce((v_liberi->>'posti')::int, 1) <= 0 then return 0; end if;

  for r in
    select la.* from liste_attesa la
     where la.lezione_id = p_lezione and la.stato = 'in_attesa'
     order by la.created_at
     limit greatest(coalesce((v_liberi->>'posti')::int, 99), 0)
  loop
    exit when (r.tipo = 'prova' and coalesce((v_liberi->>'posti_prova')::int, 0) <= 0);
    perform accoda_messaggio(r.palestra_id, 'posto_libero', r.account_id, r.allievo_id,
      r.id::text, now(),
      jsonb_build_object('corso', v_corso, 'data', v_quando, 'palestra', v_pal.nome,
                         'link_prenota', coalesce(v_pal.base_url, '') || case when r.tipo = 'prova' then '/prova' else '/area/orario' end));
    if r.account_id is not null and r.tipo <> 'prova' then
      begin
        perform accoda_push(r.account_id, 'Si è liberato un posto', v_corso || ' del ' || v_quando || ': prenotalo dall''app', '/area/orario', 'posto:' || r.id);
      exception when others then null; end;
    end if;
    update liste_attesa set stato = 'avvisato', avvisato_at = now() where id = r.id;
    n := n + 1;
  end loop;
  -- la segreteria sa chi chiamare (anche quelli già avvisati che non hanno ancora prenotato)
  perform avvisa_segreteria_coda(v_pal.id, 'Si è liberato un posto', coalesce(v_corso, 'Lezione') || ' del ' || v_quando,
                                 v_corso_id, p_lezione, 'posto-libero:' || p_lezione || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  return n;
end $$;

-- posto liberato in un corso (abbonamento annullato): anche qui la segreteria lo sa
create or replace function avvisa_attesa_corso(p_corso uuid, p_quanti integer default null)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_liberi int; n int := 0; v_cap int; v_iscritti int; v_pal uuid; v_nome text;
begin
  select coalesce(capienza, 0), palestra_id, nome into v_cap, v_pal, v_nome from corsi where id = p_corso;
  select count(*) into v_iscritti from iscrizioni where corso_id = p_corso and stato = 'attiva';
  v_liberi := coalesce(p_quanti, greatest(v_cap - v_iscritti, 0));
  if v_liberi <= 0 then return 0; end if;

  for r in
    select la.id from liste_attesa la
     where la.corso_id = p_corso and la.lezione_id is null and la.stato = 'in_attesa'
     order by la.created_at
     limit v_liberi
  loop
    perform avvisa_attesa(r.id);
    n := n + 1;
  end loop;
  perform avvisa_segreteria_coda(v_pal, 'Si è liberato un posto nel corso', coalesce(v_nome, 'Corso'), p_corso, null,
                                 'posto-corso:' || p_corso || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  return n;
end $$;

-- chi entra esce dalla coda da solo
create or replace function trg_prenotazioni_chiudi_coda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'confermata' then
    update liste_attesa set stato = 'chiuso', esito = 'iscritto'
     where lezione_id = new.lezione_id and allievo_id = new.allievo_id and stato <> 'chiuso';
  end if;
  return new;
end $$;
drop trigger if exists prenotazioni_chiudi_coda on prenotazioni;
create trigger prenotazioni_chiudi_coda after insert or update of stato on prenotazioni
  for each row execute function trg_prenotazioni_chiudi_coda();

--   La coda del corso si chiude quando chi era stato avvisato si iscrive, o quando prende proprio il giorno che aspettava.
--   Chi era in coda per il lunedì e intanto prende il giovedì resta in coda per il lunedì.
create or replace function trg_iscrizioni_chiudi_coda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'attiva' then
    update liste_attesa set stato = 'chiuso', esito = 'iscritto'
     where corso_id = new.corso_id and lezione_id is null and allievo_id = new.allievo_id and tipo = 'iscrizione' and stato = 'avvisato';
  end if;
  return new;
end $$;
drop trigger if exists iscrizioni_chiudi_coda on iscrizioni;
create trigger iscrizioni_chiudi_coda after insert on iscrizioni
  for each row execute function trg_iscrizioni_chiudi_coda();

create or replace function trg_iscrizioni_orari_chiudi_coda()
returns trigger language plpgsql security definer set search_path = public as $$
declare i iscrizioni; o orari; v_giorno text;
begin
  select * into i from iscrizioni where id = new.iscrizione_id;
  select * into o from orari where id = new.orario_id;
  if i.stato <> 'attiva' or o.id is null then return new; end if;
  v_giorno := (array['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])[o.giorno_settimana] || ' ' || to_char(o.ora_inizio, 'HH24:MI');
  update liste_attesa set stato = 'chiuso', esito = 'iscritto'
   where corso_id = i.corso_id and lezione_id is null and allievo_id = i.allievo_id and tipo = 'iscrizione' and stato <> 'chiuso'
     and coalesce(note, '') like '%' || v_giorno || '%';
  return new;
end $$;
drop trigger if exists iscrizioni_orari_chiudi_coda on iscrizioni_orari;
create trigger iscrizioni_orari_chiudi_coda after insert on iscrizioni_orari
  for each row execute function trg_iscrizioni_orari_chiudi_coda();

-- di notte: le code delle lezioni già passate si chiudono
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('lavori_giornalieri()'::regprocedure); v0 := v;
  if v not ilike '%code delle lezioni passate%' then
    v := replace(v, '    -- crediti di recupero scaduti',
      '    -- code delle lezioni passate
    update liste_attesa la set stato = ''chiuso'', esito = coalesce(la.esito, ''scaduto'')
      from lezioni l where l.id = la.lezione_id and la.palestra_id = pal.id and la.stato <> ''chiuso'' and l.inizio < now();

    -- crediti di recupero scaduti');
    if v = v0 then raise notice 'lavori_giornalieri: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- nell'app: per quale lezione o giorno si è in coda
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('area_riepilogo()'::regprocedure); v0 := v;
  if v not ilike '%''lezione'', l2.inizio%' then
    v := replace(v, '      select jsonb_agg(jsonb_build_object(''id'', la.id, ''corso'', c.nome, ''allievo'', a.nome) order by la.created_at)
      from liste_attesa la
      join allievi a on a.id = la.allievo_id
      join corsi c on c.id = la.corso_id
      where a.account_id = v_acc and la.stato = ''in_attesa''',
      '      select jsonb_agg(jsonb_build_object(''id'', la.id, ''corso'', c.nome, ''allievo'', a.nome, ''lezione'', l2.inizio,
                                          ''stato'', la.stato, ''note'', la.note) order by la.created_at)
      from liste_attesa la
      join allievi a on a.id = la.allievo_id
      join corsi c on c.id = la.corso_id
      left join lezioni l2 on l2.id = la.lezione_id
      where a.account_id = v_acc and la.stato in (''in_attesa'', ''avvisato'')');
    if v = v0 then raise notice 'area_riepilogo: testo non trovato'; else execute v; end if;
  end if;
end $$;

-- chi si iscrive prima del giorno della prova: la prova non serve più (prima restava e occupava il posto
-- anche quando poi disdiceva la lezione). Se l'aveva pagata, la segreteria decide se scalarla.
create or replace function trg_iscrizioni_chiudi_coda()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.stato = 'attiva' then
    -- la coda del corso si chiude se era stato avvisato (il giorno che aspettava lo chiude iscrizioni_orari_chiudi_coda)
    update liste_attesa set stato = 'chiuso', esito = 'iscritto'
     where corso_id = new.corso_id and lezione_id is null and allievo_id = new.allievo_id and tipo = 'iscrizione' and stato = 'avvisato';
    for r in select pr.id, pr.prezzo_cent, pg.stato as pagata, l.inizio, a.nome, a.cognome
               from prove pr join lezioni l on l.id = pr.lezione_id join allievi a on a.id = pr.allievo_id
               left join pagamenti pg on pg.id = pr.pagamento_id
              where pr.allievo_id = new.allievo_id and pr.corso_id = new.corso_id and pr.stato = 'confermata'
                and l.inizio > now() and l.data between new.data_inizio and new.data_fine loop
      update prove set stato = 'annullata' where id = r.id;
      if r.pagata = 'pagato' and coalesce(r.prezzo_cent, 0) > 0 then
        insert into promemoria (palestra_id, data, testo, creato_da)
        values (new.palestra_id, current_date,
                r.nome || ' ' || coalesce(r.cognome, '') || ' si è iscritto prima della prova del ' || to_char(r.inizio at time zone 'Europe/Rome', 'DD/MM')
                  || ' (pagata ' || to_char(r.prezzo_cent / 100.0, 'FM9990.00') || ' €): decidi se scalarla.', 'Iscrizioni');
      end if;
    end loop;
  end if;
  return new;
end $$;

-- sistemazione: prove future di chi è già iscritto a quel corso in quel giorno
update prove pr set stato = 'annullata'
  from lezioni l
 where l.id = pr.lezione_id and pr.stato = 'confermata' and l.inizio > now()
   and exists (select 1 from iscrizioni i where i.allievo_id = pr.allievo_id and i.corso_id = pr.corso_id and i.stato = 'attiva'
                 and l.data between i.data_inizio and i.data_fine);
