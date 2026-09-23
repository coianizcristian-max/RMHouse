-- =====================================================================
-- RMHouse — 019 NOTIFICHE PUSH, MATERIALI DELLA LEZIONE, LEZIONE SINGOLA
-- Da eseguire dopo 001…018.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NOTIFICHE PUSH SUL WEB
--    Ogni telefono che accetta le notifiche lascia qui il suo recapito.
-- ---------------------------------------------------------------------
alter type canale_messaggio add value if not exists 'push';

create table if not exists push_iscrizioni (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  account_id  uuid not null references account(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  dispositivo text,
  attiva      boolean not null default true,
  errori      int not null default 0,
  ultimo_ok   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists push_account on push_iscrizioni (account_id) where attiva;

alter table push_iscrizioni enable row level security;
drop policy if exists cliente_legge on push_iscrizioni;
create policy cliente_legge on push_iscrizioni for select to authenticated
  using (account_id in (select miei_account()));
drop policy if exists staff_legge on push_iscrizioni;
create policy staff_legge on push_iscrizioni for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on push_iscrizioni;
create policy gestione_scrive on push_iscrizioni for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Registra o aggiorna il recapito del telefono che sta chiedendo le notifiche
create or replace function registra_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_acc uuid; v_pal uuid; v_id uuid;
begin
  select id, palestra_id into v_acc, v_pal from account where user_id = auth.uid() limit 1;
  if v_acc is null then raise exception 'account_non_collegato'; end if;

  insert into push_iscrizioni (palestra_id, account_id, endpoint, p256dh, auth, dispositivo)
  values (v_pal, v_acc, p_endpoint, p_p256dh, p_auth, left(coalesce(p_dispositivo, ''), 120))
  on conflict (endpoint) do update
    set account_id = excluded.account_id, p256dh = excluded.p256dh, auth = excluded.auth,
        attiva = true, errori = 0
  returning id into v_id;
  return v_id;
end $$;

create or replace function cancella_push(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update push_iscrizioni set attiva = false
   where endpoint = p_endpoint
     and (account_id in (select miei_account()) or auth.uid() is null);
end $$;

grant execute on function registra_push(text, text, text, text) to authenticated;
grant execute on function cancella_push(text) to authenticated;

-- Mette in coda una notifica per tutti i telefoni di un account.
-- Il corpo è un JSON: titolo, testo e indirizzo da aprire al tocco.
create or replace function accoda_push(
  p_account uuid, p_titolo text, p_testo text, p_url text default '/area', p_chiave text default null
) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
  select pi.palestra_id, pi.account_id, 'push', 'push', pi.endpoint, p_titolo,
         jsonb_build_object('titolo', p_titolo, 'testo', p_testo, 'url', p_url)::text,
         coalesce(p_chiave, 'push:' || md5(p_titolo || coalesce(p_testo, '')) || ':' || pi.id)
  from push_iscrizioni pi
  where pi.account_id = p_account and pi.attiva
  on conflict (palestra_id, chiave) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Notifica a tutti gli iscritti attivi (usata dalla bacheca)
create or replace function push_a_tutti(p_palestra uuid, p_titolo text, p_testo text, p_url text default '/area')
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;

  insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
  select distinct on (pi.endpoint) pi.palestra_id, pi.account_id, 'push', 'push', pi.endpoint, p_titolo,
         jsonb_build_object('titolo', p_titolo, 'testo', p_testo, 'url', p_url)::text,
         'push:' || md5(p_titolo || coalesce(p_testo, '')) || ':' || pi.id
  from push_iscrizioni pi
  join iscrizioni i on i.palestra_id = pi.palestra_id and i.stato = 'attiva'
  join allievi a on a.id = i.allievo_id and a.account_id = pi.account_id
  where pi.palestra_id = p_palestra and pi.attiva
  on conflict (palestra_id, chiave) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function accoda_push(uuid, text, text, text, text) to authenticated;
grant execute on function push_a_tutti(uuid, text, text, text) to authenticated;

-- Un recapito che risponde male tre volte viene spento
create or replace function push_fallita(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update push_iscrizioni
     set errori = errori + 1, attiva = (errori + 1) < 3
   where endpoint = p_endpoint;
end $$;

create or replace function push_riuscita(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update push_iscrizioni set ultimo_ok = now(), errori = 0 where endpoint = p_endpoint;
end $$;

-- Quando si manda un avviso della bacheca, parte anche la notifica
create or replace function invia_bacheca(p_id uuid, p_push boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bacheca; pal palestre; n int := 0; np int := 0;
begin
  select * into b from bacheca where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  if auth.uid() is not null and not is_gestione(b.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into pal from palestre where id = b.palestra_id;

  insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
  select distinct on (acc.id) b.palestra_id, acc.id, 'bacheca', 'email', acc.email,
         b.titolo, coalesce(b.testo, '') || E'\n\n' || pal.nome, 'bacheca:' || b.id || ':' || acc.id
  from iscrizioni i
  join allievi a on a.id = i.allievo_id
  join account acc on acc.id = a.account_id
  where i.palestra_id = b.palestra_id and i.stato = 'attiva'
  on conflict (palestra_id, chiave) do nothing;
  get diagnostics n = row_count;

  if p_push then
    np := push_a_tutti(b.palestra_id, b.titolo, left(coalesce(b.testo, ''), 160), '/area');
  end if;

  update bacheca set inviato_at = now(), destinatari = n where id = p_id;
  return jsonb_build_object('email', n, 'push', np);
end $$;

-- ---------------------------------------------------------------------
-- 2. MATERIALI DELLA LEZIONE
--    Un video o una scheda che compare ai prenotati poco prima.
-- ---------------------------------------------------------------------
create table if not exists materiali (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  corso_id     uuid references corsi(id) on delete cascade,
  lezione_id   uuid references lezioni(id) on delete cascade,
  titolo       text not null,
  testo        text,
  url          text,
  tipo         text not null default 'link' check (tipo in ('link', 'video', 'file', 'nota')),
  minuti_prima int not null default 120,     -- da quanto prima si vede
  attivo       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (corso_id is not null or lezione_id is not null)
);
create index if not exists materiali_corso on materiali (palestra_id, corso_id);

alter table materiali enable row level security;
drop policy if exists staff_legge on materiali;
create policy staff_legge on materiali for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on materiali;
create policy gestione_scrive on materiali for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Quello che il cliente deve vedere adesso: solo per le sue lezioni vicine
create or replace function materiali_area()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acc uuid;
begin
  select id into v_acc from account where user_id = auth.uid() limit 1;
  if v_acc is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'titolo', m.titolo, 'testo', m.testo, 'url', m.url, 'tipo', m.tipo,
      'corso', c.nome, 'inizio', l.inizio, 'allievo', a.nome) order by l.inizio)
    from v_partecipanti_lezione vp
    join allievi a on a.id = vp.allievo_id
    join lezioni l on l.id = vp.lezione_id
    join corsi c on c.id = l.corso_id
    join materiali m on m.attivo
      and (m.lezione_id = l.id or (m.lezione_id is null and m.corso_id = l.corso_id))
    where a.account_id = v_acc
      and l.stato = 'programmata'
      and l.inizio between now() - interval '2 hours' and now() + make_interval(mins => m.minuti_prima)
  ), '[]'::jsonb);
end $$;

grant execute on function materiali_area() to authenticated;

-- ---------------------------------------------------------------------
-- 3. LEZIONE SINGOLA
--    Un tipo di abbonamento a un ingresso solo: si vende al banco.
-- ---------------------------------------------------------------------
do $$
declare p record;
begin
  for p in select id from palestre loop
    insert into tipi_abbonamento (palestra_id, nome, modalita, durata_mesi, num_ingressi,
                                  prezzo_cent, scadenza_fine_mese, acquistabile_online, attivo,
                                  recuperi_max, giorni_validita_recupero)
    select p.id, 'Lezione singola', 'ingressi', 1, 1, 1500, false, false, true, 0, 0
    where not exists (
      select 1 from tipi_abbonamento t
       where t.palestra_id = p.id and lower(t.nome) = 'lezione singola');
  end loop;
end $$;
