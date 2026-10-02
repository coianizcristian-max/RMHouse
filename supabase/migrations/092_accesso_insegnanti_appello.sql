-- 092 · Accesso degli insegnanti e appello registrato
-- 1. La segreteria crea un codice per far entrare un'insegnante (o chiunque dello staff) nell'app:
--    l'insegnante va su /login → "Primo accesso o password dimenticata?" → email + codice + password.
--    Nessun passaggio in Supabase.
-- 2. L'insegnante fa l'appello solo nelle sue lezioni (o in quelle che sta sostituendo);
--    amministratori e segreteria in tutte.
-- 3. Ogni appello registra chi l'ha fatto e quando (la prima volta e l'ultima modifica).
-- Rieseguibile.

-- ---------------------------------------------------------------------
-- 1. CODICI DI ACCESSO PER LO STAFF
-- ---------------------------------------------------------------------
create table if not exists codici_staff (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  staff_id    uuid not null references staff(id) on delete cascade,
  codice      text not null,
  scade_at    timestamptz not null default now() + interval '7 days',
  usato_at    timestamptz,
  creato_da   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists ix_codici_staff on codici_staff (codice) where usato_at is null;
alter table codici_staff enable row level security;   -- solo funzioni e server

create or replace function crea_codice_staff(p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s staff; v_codice text;
begin
  select * into s from staff where id = p_staff;
  if not found or not is_gestione(s.palestra_id) then raise exception 'non_autorizzato'; end if;
  if coalesce(trim(s.email), '') = '' then raise exception 'email_mancante'; end if;
  update codici_staff set usato_at = now() where staff_id = s.id and usato_at is null;   -- vale solo l'ultimo
  v_codice := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into codici_staff (palestra_id, staff_id, codice, creato_da) values (s.palestra_id, s.id, v_codice, auth.uid());
  return jsonb_build_object('codice', v_codice, 'email', s.email, 'nome', s.nome, 'telefono', s.telefono,
                            'attivo', s.user_id is not null, 'scade', now() + interval '7 days');
end $$;
revoke execute on function crea_codice_staff(uuid) from public, anon;
grant execute on function crea_codice_staff(uuid) to authenticated;

-- il server usa il codice: restituisce la scheda staff (e lo segna come usato)
create or replace function usa_codice_staff(p_email text, p_codice text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_staff uuid;
begin
  select c.staff_id into v_staff from codici_staff c join staff s on s.id = c.staff_id
   where c.codice = trim(p_codice) and c.usato_at is null and c.scade_at > now()
     and lower(trim(s.email)) = lower(trim(p_email)) and s.attivo
   order by c.created_at desc limit 1;
  if v_staff is null then return null; end if;
  update codici_staff set usato_at = now() where staff_id = v_staff and usato_at is null;
  return v_staff;
end $$;
revoke execute on function usa_codice_staff(text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function usa_codice_staff(text, text) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. CHI PUÒ FARE L'APPELLO DI UNA LEZIONE
-- ---------------------------------------------------------------------
create or replace function puo_fare_appello(p_lezione uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lezioni l
     where l.id = p_lezione
       and (is_gestione(l.palestra_id)
            or exists (select 1 from staff s where s.user_id = auth.uid() and s.palestra_id = l.palestra_id and s.attivo
                         and (s.id = l.insegnante_id or s.id = l.svolta_da)))
  );
$$;
revoke execute on function puo_fare_appello(uuid) from public, anon;
grant execute on function puo_fare_appello(uuid) to authenticated;

drop policy if exists insegnante_presenze on presenze;
create policy insegnante_presenze on presenze for insert to authenticated with check (puo_fare_appello(lezione_id));
drop policy if exists insegnante_presenze_mod on presenze;
create policy insegnante_presenze_mod on presenze for update to authenticated
  using (puo_fare_appello(lezione_id)) with check (puo_fare_appello(lezione_id));

-- ---------------------------------------------------------------------
-- 3. APPELLO REGISTRATO: chi e quando
-- ---------------------------------------------------------------------
alter table lezioni add column if not exists appello_da uuid references staff(id) on delete set null;
alter table lezioni add column if not exists appello_at timestamptz;
alter table lezioni add column if not exists appello_mod_da uuid references staff(id) on delete set null;
alter table lezioni add column if not exists appello_mod_at timestamptz;

-- segna presente / assente una o più persone (anche "Tutti presenti") e registra l'appello
create or replace function segna_presenze(p_lezione uuid, p_allievi uuid[], p_presente boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l lezioni; io uuid;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not puo_fare_appello(p_lezione) then raise exception 'non_autorizzato'; end if;
  if l.stato = 'annullata' then raise exception 'lezione_annullata'; end if;
  select id into io from staff where user_id = auth.uid() and palestra_id = l.palestra_id and attivo limit 1;

  insert into presenze (palestra_id, lezione_id, allievo_id, presente, registrata_da, registrata_at)
  select l.palestra_id, l.id, a, p_presente, auth.uid(), now() from unnest(p_allievi) a
  on conflict (lezione_id, allievo_id) do update
     set presente = excluded.presente, registrata_da = excluded.registrata_da, registrata_at = now();

  update lezioni set appello_da = coalesce(appello_da, io), appello_at = coalesce(appello_at, now()),
                     appello_mod_da = io, appello_mod_at = now()
   where id = l.id
  returning * into l;
  return jsonb_build_object('appello_at', l.appello_at, 'appello_da', l.appello_da,
                            'appello_mod_at', l.appello_mod_at, 'appello_mod_da', l.appello_mod_da);
end $$;
revoke execute on function segna_presenze(uuid, uuid[], boolean) from public, anon;
grant execute on function segna_presenze(uuid, uuid[], boolean) to authenticated;
