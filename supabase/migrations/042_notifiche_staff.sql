-- =====================================================================
-- RMHouse — 042 NOTIFICHE SUL TELEFONO PER LO STAFF
--
-- Finora le notifiche sul telefono arrivavano solo ai clienti. Ora anche
-- segreteria e insegnanti possono attivarle (Oggi → Le mie notifiche) e
-- scegliere quali ricevere:
--   · nuova prova prenotata (segreteria; l'insegnante per le sue lezioni)
--   · nuova richiesta di affitto dal sito (segreteria)
--   · certificato caricato da approvare (segreteria)
--   · pagamento online ricevuto (segreteria)
--   · lezione annullata o assegnata a te (insegnante)
-- Usa la stessa coda e lo stesso invio delle notifiche dei clienti.
-- Da eseguire dopo la 041. Si può rieseguire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Un telefono può appartenere a un cliente o a una persona dello staff
-- ---------------------------------------------------------------------
alter table push_iscrizioni alter column account_id drop not null;
alter table push_iscrizioni add column if not exists staff_id uuid references staff(id) on delete cascade;
alter table push_iscrizioni drop constraint if exists push_di_qualcuno;
alter table push_iscrizioni add constraint push_di_qualcuno check (account_id is not null or staff_id is not null);
create index if not exists push_staff on push_iscrizioni (staff_id) where attiva;

drop policy if exists staff_proprie on push_iscrizioni;
create policy staff_proprie on push_iscrizioni for select to authenticated
  using (staff_id in (select id from staff where user_id = auth.uid()));

-- Quali notifiche vuole ricevere (vuoto = tutte quelle del suo ruolo)
alter table staff add column if not exists notifiche jsonb not null default '{}'::jsonb;

create or replace function registra_push_staff(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s staff; v_id uuid;
begin
  select * into s from staff where user_id = auth.uid() and attivo limit 1;
  if s.id is null then raise exception 'non_sei_dello_staff'; end if;
  insert into push_iscrizioni (palestra_id, account_id, staff_id, endpoint, p256dh, auth, dispositivo)
  values (s.palestra_id, null, s.id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_dispositivo, ''), 120))
  on conflict (endpoint) do update
    set account_id = null, staff_id = excluded.staff_id, p256dh = excluded.p256dh, auth = excluded.auth,
        attiva = true, errori = 0
  returning id into v_id;
  return v_id;
end $$;
grant execute on function registra_push_staff(text, text, text, text) to authenticated;

create or replace function cancella_push(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update push_iscrizioni set attiva = false
   where endpoint = p_endpoint
     and (account_id in (select miei_account())
          or staff_id in (select id from staff where user_id = auth.uid())
          or auth.uid() is null);
end $$;

create or replace function imposta_mie_notifiche(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update staff set notifiche = coalesce(p, '{}'::jsonb) where user_id = auth.uid();
end $$;
grant execute on function imposta_mie_notifiche(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Mettere in coda una notifica per lo staff
--    p_ruoli: a quali ruoli (null = tutti); p_staff: a una persona sola
-- ---------------------------------------------------------------------
create or replace function accoda_push_staff(p_palestra uuid, p_tipo text, p_titolo text, p_testo text,
                                             p_url text default '/gestione', p_ruoli text[] default null,
                                             p_staff uuid default null, p_chiave text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
  select pi.palestra_id, null, 'push_staff', 'push', pi.endpoint, p_titolo,
         jsonb_build_object('titolo', p_titolo, 'testo', p_testo, 'url', p_url)::text,
         coalesce(p_chiave, 'staff:' || p_tipo || ':' || md5(p_titolo || coalesce(p_testo, ''))) || ':' || pi.id
  from push_iscrizioni pi
  join staff s on s.id = pi.staff_id
  where pi.palestra_id = p_palestra and pi.attiva and s.attivo and not s.archiviato
    and (p_staff is null or s.id = p_staff)
    and (p_ruoli is null or s.ruolo::text = any (p_ruoli))
    and coalesce((s.notifiche ->> p_tipo)::boolean, true)
  on conflict (palestra_id, chiave) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function accoda_push_staff(uuid, text, text, text, text, text[], uuid, text) from public, anon, authenticated;

-- Notifica di prova a se stessi
create or replace function prova_push_staff()
returns int language plpgsql security definer set search_path = public as $$
declare s staff;
begin
  select * into s from staff where user_id = auth.uid() and attivo limit 1;
  if s.id is null then raise exception 'non_sei_dello_staff'; end if;
  return accoda_push_staff(s.palestra_id, 'prova_invio', 'Le notifiche funzionano 👍',
                           'Da ora ricevi qui gli avvisi di RMHouse.', '/gestione', null, s.id,
                           'prova:' || extract(epoch from now())::bigint);
end $$;
grant execute on function prova_push_staff() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Gli avvisi. Un errore qui non deve mai bloccare l'operazione vera.
-- ---------------------------------------------------------------------
create or replace function trg_push_staff_prova()
returns trigger language plpgsql security definer set search_path = public as $$
declare a allievi; c corsi; l lezioni; v_testo text;
begin
  begin
    if new.stato not in ('confermata', 'in_attesa_pagamento') then return new; end if;
    select * into a from allievi where id = new.allievo_id;
    select * into c from corsi where id = new.corso_id;
    select * into l from lezioni where id = new.lezione_id;
    v_testo := a.nome || ' ' || coalesce(a.cognome, '') || ' · ' || c.nome || ' · '
               || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');
    perform accoda_push_staff(new.palestra_id, 'prova', 'Nuova prova prenotata', v_testo,
                              '/gestione/appello/' || l.id, array['admin', 'segreteria'], null, 'prova:' || new.id);
    if l.insegnante_id is not null then
      perform accoda_push_staff(new.palestra_id, 'prova', 'Una prova nella tua lezione', v_testo,
                                '/gestione/appello/' || l.id, null, l.insegnante_id, 'prova-ins:' || new.id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists push_staff_prova on prove;
create trigger push_staff_prova after insert on prove for each row execute function trg_push_staff_prova();

create or replace function trg_push_staff_affitto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.origine = 'sito' and new.stato = 'richiesta' then
      perform accoda_push_staff(new.palestra_id, 'affitto', 'Nuova richiesta di affitto',
        new.contatto_nome || ' · ' || coalesce(new.titolo, 'sala') || ' · '
        || to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI'),
        '/gestione/spazi', array['admin', 'segreteria'], null, 'affitto:' || new.id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists push_staff_affitto on prenotazioni_spazi;
create trigger push_staff_affitto after insert on prenotazioni_spazi for each row execute function trg_push_staff_affitto();

create or replace function trg_push_staff_certificato()
returns trigger language plpgsql security definer set search_path = public as $$
declare a allievi;
begin
  begin
    if new.stato = 'da_verificare' then
      select * into a from allievi where id = new.allievo_id;
      perform accoda_push_staff(new.palestra_id, 'certificato', 'Certificato da approvare',
        a.nome || ' ' || coalesce(a.cognome, '') || coalesce(' · scade il ' || to_char(new.scadenza, 'DD/MM/YY'), ''),
        '/gestione/certificati', array['admin', 'segreteria'], null, 'cert:' || new.id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists push_staff_certificato on certificati;
create trigger push_staff_certificato after insert on certificati for each row execute function trg_push_staff_certificato();

create or replace function trg_push_staff_pagamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.stato = 'pagato' and old.stato is distinct from 'pagato' and new.metodo in ('online', 'stripe') then
      perform accoda_push_staff(new.palestra_id, 'pagamento', 'Pagamento online ricevuto',
        replace(to_char(new.importo_cent / 100.0, 'FM99999990.00'), '.', ',') || ' € · ' || coalesce(new.descrizione, ''),
        '/gestione/incassi', array['admin', 'segreteria'], null, 'pag:' || new.id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists push_staff_pagamento on pagamenti;
create trigger push_staff_pagamento after update of stato on pagamenti for each row execute function trg_push_staff_pagamento();

create or replace function trg_push_staff_lezione()
returns trigger language plpgsql security definer set search_path = public as $$
declare c corsi; v_quando text;
begin
  begin
    -- solo lezioni future, e solo per modifiche fatte da una persona (non dalla generazione notturna)
    if new.inizio < now() or auth.uid() is null then return new; end if;
    select * into c from corsi where id = new.corso_id;
    v_quando := c.nome || ' · ' || to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');
    if new.stato = 'annullata' and old.stato is distinct from 'annullata' and new.insegnante_id is not null then
      perform accoda_push_staff(new.palestra_id, 'lezione', 'Lezione annullata', v_quando,
                                '/gestione/calendario', null, new.insegnante_id, 'lez-ann:' || new.id);
    elsif new.insegnante_id is distinct from old.insegnante_id and new.insegnante_id is not null then
      perform accoda_push_staff(new.palestra_id, 'lezione', 'Ti è stata assegnata una lezione', v_quando,
                                '/gestione/appello/' || new.id, null, new.insegnante_id, 'lez-ass:' || new.id || ':' || new.insegnante_id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists push_staff_lezione on lezioni;
create trigger push_staff_lezione after update of stato, insegnante_id on lezioni for each row execute function trg_push_staff_lezione();

-- ---------------------------------------------------------------------
-- 4. Stato delle notifiche: anche quelle dello staff
-- ---------------------------------------------------------------------
create or replace function stato_notifiche(p_palestra uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'in_coda', (select count(*) from messaggi_coda where palestra_id = p_palestra and stato = 'in_coda'),
    'inviate_14', (select count(*) from messaggi_coda where palestra_id = p_palestra and stato = 'inviato'
                     and inviato_at >= now() - interval '14 days'),
    'errori_14', (select count(*) from messaggi_coda where palestra_id = p_palestra and stato = 'errore'
                    and created_at >= now() - interval '14 days'),
    'ultimi_errori', (select coalesce(jsonb_agg(jsonb_build_object('quando', created_at, 'a', destinatario,
                                    'oggetto', oggetto, 'errore', left(errore, 160)) order by created_at desc), '[]'::jsonb)
                        from (select * from messaggi_coda where palestra_id = p_palestra and stato = 'errore'
                                order by created_at desc limit 5) e),
    'clienti_con_email', (select count(*) from account where palestra_id = p_palestra and email is not null),
    'clienti_con_notifiche', (select count(distinct account_id) from push_iscrizioni where palestra_id = p_palestra and attiva and account_id is not null),
    'staff_notifiche', (select coalesce(jsonb_object_agg(staff_id, n), '{}'::jsonb)
                          from (select staff_id, count(*) n from push_iscrizioni
                                 where palestra_id = p_palestra and attiva and staff_id is not null group by staff_id) x),
    'push_in_errore', (select count(*) from push_iscrizioni where palestra_id = p_palestra and attiva and errori > 0)
  );
$$;

select 'telefoni dello staff' as cosa, count(*) from push_iscrizioni where staff_id is not null;
