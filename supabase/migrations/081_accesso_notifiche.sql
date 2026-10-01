-- =====================================================================
-- RMHouse — 081 ACCESSO CON PASSWORD E NOTIFICHE SUL TELEFONO
--  1. Primo accesso: il cliente scrive l'email registrata in segreteria,
--     conferma chi è (ultime 4 cifre del cellulare, o data di nascita) e
--     si crea la password. Nessuna email da mandare.
--  2. Codice della segreteria: un codice di 6 cifre (valido 3 giorni, una
--     volta sola) per entrare o rifare la password "in diretta".
--  3. Limite ai tentativi (contro chi prova a indovinare).
--  4. Notifiche sul telefono al cliente: promemoria della lezione di
--     domani, scadenze (abbonamento, certificato, recuperi), lezione
--     annullata. Ognuno sceglie quali ricevere.
-- Si può eseguire più volte. Va dopo la 080.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1-2-3. ACCESSO
-- ---------------------------------------------------------------------
create table if not exists codici_accesso (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  account_id  uuid not null references account(id) on delete cascade,
  codice      text not null,
  scade_at    timestamptz not null default now() + interval '3 days',
  usato_at    timestamptz,
  creato_da   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists ix_codici_accesso_codice on codici_accesso (codice) where usato_at is null;
alter table codici_accesso enable row level security;   -- solo funzioni e server

create table if not exists tentativi_accesso (
  id         bigint generated always as identity primary key,
  chiave     text not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_tentativi_accesso on tentativi_accesso (chiave, created_at desc);
alter table tentativi_accesso enable row level security;

-- Conta (e registra) un tentativo; il server blocca oltre una soglia per ora
create or replace function conta_tentativo(p_chiave text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from tentativi_accesso where created_at < now() - interval '1 day';
  insert into tentativi_accesso (chiave) values (lower(left(p_chiave, 200)));
  select count(*) into n from tentativi_accesso where chiave = lower(left(p_chiave, 200)) and created_at > now() - interval '1 hour';
  return n;
end $$;

-- A che punto è l'accesso di questa email: sconosciuta / da_attivare / attiva (+ come verificarla)
create or replace function stato_accesso(p_email text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_email text := lower(trim(p_email)); acc account; v_tel text;
begin
  select * into acc from account where lower(email) = v_email order by (user_id is not null) desc, created_at limit 1;
  if not found then return jsonb_build_object('stato', 'sconosciuta'); end if;
  if acc.user_id is not null or exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return jsonb_build_object('stato', 'attiva');
  end if;
  v_tel := regexp_replace(coalesce(acc.telefono, ''), '\D', '', 'g');
  return jsonb_build_object('stato', 'da_attivare', 'nome', acc.nome,
    'verifica', case when length(v_tel) >= 6 then 'telefono'
                     when exists (select 1 from allievi a where a.account_id = acc.id and a.data_nascita is not null) then 'nascita'
                     else 'segreteria' end);
end $$;

-- Il cliente dimostra di essere lui: ultime 4 cifre del cellulare o una data di nascita della famiglia
create or replace function verifica_attivazione(p_email text, p_risposta text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare acc account; v_tel text; v_r text := trim(coalesce(p_risposta, ''));
begin
  select * into acc from account where lower(email) = lower(trim(p_email)) and user_id is null order by created_at limit 1;
  if not found then return null; end if;
  v_tel := regexp_replace(coalesce(acc.telefono, ''), '\D', '', 'g');
  if length(v_tel) >= 6 then
    return case when right(v_tel, 4) = regexp_replace(v_r, '\D', '', 'g') then acc.id end;
  end if;
  if v_r ~ '^\d{4}-\d{2}-\d{2}$' and exists (select 1 from allievi a where a.account_id = acc.id and a.data_nascita = v_r::date) then
    return acc.id;
  end if;
  return null;
end $$;

-- La segreteria crea il codice (6 cifre, 3 giorni, una volta sola)
create or replace function crea_codice_accesso(p_allievo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; acc account; v_codice text;
begin
  select * into a from allievi where id = p_allievo;
  if not found or not is_gestione(a.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into acc from account where id = a.account_id;
  if coalesce(acc.email, '') = '' then raise exception 'email_mancante'; end if;
  update codici_accesso set usato_at = now() where account_id = acc.id and usato_at is null;   -- vale solo l'ultimo
  v_codice := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into codici_accesso (palestra_id, account_id, codice, creato_da) values (a.palestra_id, acc.id, v_codice, auth.uid());
  return jsonb_build_object('codice', v_codice, 'email', acc.email, 'nome', acc.nome, 'telefono', acc.telefono,
                            'attivo', acc.user_id is not null, 'scade', now() + interval '3 days');
end $$;

-- Il server usa il codice: restituisce l'account (e lo segna come usato)
create or replace function usa_codice_accesso(p_email text, p_codice text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_acc uuid;
begin
  select c.account_id into v_acc from codici_accesso c join account acc on acc.id = c.account_id
   where c.codice = trim(p_codice) and c.usato_at is null and c.scade_at > now()
     and lower(acc.email) = lower(trim(p_email))
   order by c.created_at desc limit 1;
  if v_acc is null then return null; end if;
  update codici_accesso set usato_at = now() where account_id = v_acc and usato_at is null;
  return v_acc;
end $$;

-- L'utente di accesso già esistente per un'email (per rifare la password)
create or replace function utente_da_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- Stato dell'accesso visto dalla scheda persona (segreteria)
create or replace function accesso_app(p_allievo uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare a allievi; acc account; v_ultimo timestamptz;
begin
  select * into a from allievi where id = p_allievo;
  if not found or not is_gestione(a.palestra_id) then return null; end if;
  select * into acc from account where id = a.account_id;
  select (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz into v_ultimo from auth.users u where u.id = acc.user_id;
  return jsonb_build_object('email', acc.email, 'attivo', acc.user_id is not null, 'ultimo_accesso', v_ultimo,
    'telefoni_notifiche', (select count(*) from push_iscrizioni p where p.account_id = acc.id and p.attiva));
end $$;

-- solo il server (chiave di servizio) usa queste funzioni; la segreteria le sue due
revoke execute on function conta_tentativo(text) from public, anon, authenticated;
revoke execute on function stato_accesso(text) from public, anon, authenticated;
revoke execute on function verifica_attivazione(text, text) from public, anon, authenticated;
revoke execute on function usa_codice_accesso(text, text) from public, anon, authenticated;
revoke execute on function utente_da_email(text) from public, anon, authenticated;
revoke execute on function crea_codice_accesso(uuid) from public, anon;
revoke execute on function accesso_app(uuid) from public, anon;
grant execute on function crea_codice_accesso(uuid) to authenticated;
grant execute on function accesso_app(uuid) to authenticated;
-- il server usa la chiave di servizio: le funzioni riservate a lui gliele diamo esplicitamente
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function conta_tentativo(text) to service_role;
    grant execute on function stato_accesso(text) to service_role;
    grant execute on function verifica_attivazione(text, text) to service_role;
    grant execute on function usa_codice_accesso(text, text) to service_role;
    grant execute on function utente_da_email(text) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. NOTIFICHE SUL TELEFONO AL CLIENTE
-- ---------------------------------------------------------------------
alter table account add column if not exists notifiche jsonb not null default '{}'::jsonb;

create or replace function imposta_notifiche_cliente(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update account set notifiche = coalesce(p, '{}'::jsonb) where user_id = auth.uid();
end $$;
revoke execute on function imposta_notifiche_cliente(jsonb) from public, anon;
grant execute on function imposta_notifiche_cliente(jsonb) to authenticated;

-- vuole questo tipo di notifica? (tutte accese finché non le spegne)
create or replace function vuole_notifica(p_account uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (notifiche ->> p_tipo)::boolean from account where id = p_account), true);
$$;

-- La sera: "Domani hai…" — al mattino: scadenze
create or replace function notifiche_clienti(p_momento text)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_oggi date;
begin
  if p_momento = 'sera' then
    for r in
      select a.account_id,
             string_agg(c.nome || ' alle ' || to_char(l.inizio at time zone p.fuso_orario, 'HH24:MI')
                        || case when (select count(*) from allievi x where x.account_id = a.account_id) > 1 then ' (' || a.nome || ')' else '' end,
                        ', ' order by l.inizio) as testo
        from v_partecipanti_lezione vp
        join allievi a on a.id = vp.allievo_id
        join lezioni l on l.id = vp.lezione_id
        join corsi c on c.id = l.corso_id
        join palestre p on p.id = l.palestra_id
       where l.data = (now() at time zone p.fuso_orario)::date + 1 and l.stato = 'programmata'
         and exists (select 1 from push_iscrizioni pi where pi.account_id = a.account_id and pi.attiva)
       group by a.account_id
    loop
      if vuole_notifica(r.account_id, 'lezioni') then
        n := n + accoda_push(r.account_id, 'Domani hai lezione', r.testo || '. Non puoi venire? Cancella entro 4 ore prima.',
                             '/area', 'domani:' || r.account_id || ':' || current_date);
      end if;
    end loop;
    return n;
  end if;

  -- mattino: scadenze
  for r in
    select a.account_id, a.nome, c.nome as corso, i.data_fine, i.id,
           (i.data_fine - (now() at time zone p.fuso_orario)::date) as giorni
      from iscrizioni i join allievi a on a.id = i.allievo_id join corsi c on c.id = i.corso_id join palestre p on p.id = i.palestra_id
     where i.stato = 'attiva' and (i.data_fine - (now() at time zone p.fuso_orario)::date) in (7, 1)
       and not exists (select 1 from iscrizioni j where j.allievo_id = i.allievo_id and j.corso_id = i.corso_id
                         and j.id <> i.id and j.data_inizio > i.data_fine and j.stato in ('attiva', 'sospesa'))
  loop
    if vuole_notifica(r.account_id, 'scadenze') then
      n := n + accoda_push(r.account_id,
        case when r.giorni = 1 then 'Il tuo abbonamento scade domani' else 'Il tuo abbonamento scade tra una settimana' end,
        r.corso || ' di ' || r.nome || ' · fino al ' || to_char(r.data_fine, 'DD/MM') || '. Rinnovalo dall''app in un minuto.',
        '/area/acquista', 'scad:' || r.id || ':' || r.giorni);
    end if;
  end loop;

  for r in
    select a.account_id, a.nome, a.certificato_scadenza, a.id,
           (a.certificato_scadenza - (now() at time zone p.fuso_orario)::date) as giorni
      from allievi a join palestre p on p.id = a.palestra_id
     where (a.certificato_scadenza - (now() at time zone p.fuso_orario)::date) in (30, 7, 0)
       and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva')
  loop
    if vuole_notifica(r.account_id, 'scadenze') then
      n := n + accoda_push(r.account_id,
        case when r.giorni = 0 then 'Il certificato medico è scaduto' else 'Il certificato medico sta per scadere' end,
        'Quello di ' || r.nome || (case when r.giorni = 0 then ' è scaduto oggi' else ' scade il ' || to_char(r.certificato_scadenza, 'DD/MM') end)
          || ': fai una foto al nuovo e caricalo da Io.',
        '/area/io', 'cert:' || r.id || ':' || r.giorni);
    end if;
  end loop;

  for r in
    select a.account_id, a.nome, count(*) as quanti, min(cr.scadenza) as scadenza
      from crediti_recupero cr join allievi a on a.id = cr.allievo_id join palestre p on p.id = a.palestra_id
     where not cr.annullato and cr.usato_in is null
       and cr.scadenza = (now() at time zone p.fuso_orario)::date + 7
     group by a.account_id, a.nome
  loop
    if vuole_notifica(r.account_id, 'scadenze') then
      n := n + accoda_push(r.account_id, 'Hai un recupero da usare',
        r.nome || ': ' || r.quanti || case when r.quanti = 1 then ' recupero scade' else ' recuperi scadono' end
          || ' il ' || to_char(r.scadenza, 'DD/MM') || '. Prenotalo prima che scada.',
        '/area/recuperi', 'rec:' || r.account_id || ':' || r.scadenza);
    end if;
  end loop;
  return n;
end $$;
revoke execute on function notifiche_clienti(text) from public, anon, authenticated;

-- Lezione annullata: avvisa subito chi era dentro
create or replace function trg_lezioni_annullata_clienti()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.stato = 'annullata' and old.stato is distinct from 'annullata' and new.inizio > now() then
    for r in select distinct a.account_id from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id where vp.lezione_id = new.id loop
      begin
        if vuole_notifica(r.account_id, 'lezioni') then
          perform accoda_push(r.account_id, 'Lezione annullata',
            (select nome from corsi where id = new.corso_id) || ' di ' ||
              to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ' non si fa. Ci scusiamo!',
            '/area', 'ann:' || new.id || ':' || r.account_id);
        end if;
      exception when others then null; end;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_lezioni_annullata_clienti on lezioni;
create trigger trg_lezioni_annullata_clienti after update of stato on lezioni
  for each row execute function trg_lezioni_annullata_clienti();

-- Orari dei promemoria (se il cron del database è attivo): 18:00 e 9:00 ora italiana (16:00 e 7:00 UTC d'estate)
do $$
begin
  if to_regclass('cron.job') is null then return; end if;
  perform cron.unschedule(jobid) from cron.job where jobname in ('rmhouse-notifiche-sera', 'rmhouse-notifiche-mattino');
  perform cron.schedule('rmhouse-notifiche-sera', '0 16 * * *', 'select public.notifiche_clienti(''sera'')');
  perform cron.schedule('rmhouse-notifiche-mattino', '0 7 * * *', 'select public.notifiche_clienti(''mattino'')');
end $$;
