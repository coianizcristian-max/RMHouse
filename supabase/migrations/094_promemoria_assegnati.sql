-- 094 · Promemoria ("Da fare") più precisi e assegnabili
-- 1. Si salva con precisione chi scrive e chi spunta (scheda staff, non solo il nome) e quando.
-- 2. Un promemoria si può assegnare: di base è per segreteria e amministrazione (come prima);
--    oppure a una persona dello staff, oppure a un gruppo (tutto lo staff, insegnanti, segreteria, amministrazione).
--    Chi lo riceve lo vede nella sua home e riceve la notifica; la segreteria vede tutto, con indicato per chi è.
-- 3. Nei compiti di gruppo ognuno spunta il suo: la segreteria vede "3 su 12" e può chiuderlo per tutti.
--    Quando l'hanno fatto tutti si chiude da solo.
-- 4. Nell'attività dello staff si contano "promemoria scritti" e "promemoria fatti".
-- Rieseguibile.

alter table promemoria add column if not exists creato_da_staff uuid references staff(id) on delete set null;
alter table promemoria add column if not exists fatto_da_staff uuid references staff(id) on delete set null;
alter table promemoria add column if not exists per_staff uuid references staff(id) on delete cascade;
alter table promemoria add column if not exists per_ruolo text check (per_ruolo in ('tutti', 'insegnante', 'segreteria', 'admin'));

create table if not exists promemoria_fatti (
  promemoria_id uuid not null references promemoria(id) on delete cascade,
  staff_id      uuid not null references staff(id) on delete cascade,
  fatto_at      timestamptz not null default now(),
  primary key (promemoria_id, staff_id)
);
alter table promemoria_fatti enable row level security;   -- solo dalle funzioni
grant select on promemoria_fatti to authenticated;
drop policy if exists staff_legge on promemoria_fatti;
create policy staff_legge on promemoria_fatti for select to authenticated
  using (exists (select 1 from promemoria p where p.id = promemoria_id and is_staff(p.palestra_id)));

-- la mia scheda staff
create or replace function mio_staff(p_palestra uuid)
returns staff language sql stable security definer set search_path = public as $$
  select * from staff where user_id = auth.uid() and palestra_id = p_palestra and attivo limit 1;
$$;
revoke execute on function mio_staff(uuid) from public, anon;
grant execute on function mio_staff(uuid) to authenticated;

-- il promemoria è (anche) per me?
create or replace function promemoria_per_me(p promemoria)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff s where s.user_id = auth.uid() and s.palestra_id = p.palestra_id and s.attivo
                   and (s.id = p.per_staff or p.per_ruolo = 'tutti' or s.ruolo::text = p.per_ruolo
                        or (p.per_staff is null and p.per_ruolo is null and s.ruolo::text in ('admin', 'segreteria'))));
$$;

-- chi lo vede: segreteria e amministrazione tutti; gli altri solo i loro (e quelli della lezione di cui fanno l'appello)
drop policy if exists staff_tutto on promemoria;
drop policy if exists legge on promemoria;
drop policy if exists scrive on promemoria;
drop policy if exists modifica on promemoria;
drop policy if exists cancella on promemoria;
create policy legge on promemoria for select to authenticated
  using (is_gestione(palestra_id) or promemoria_per_me(promemoria)
         or (lezione_id is not null and puo_fare_appello(lezione_id)));
create policy scrive on promemoria for insert to authenticated with check (is_gestione(palestra_id));
create policy modifica on promemoria for update to authenticated using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
create policy cancella on promemoria for delete to authenticated using (is_gestione(palestra_id));

-- chi scrive e chi spunta, sempre preciso (anche se l'app manda solo il nome)
create or replace function trg_promemoria_chi()
returns trigger language plpgsql security definer set search_path = public as $$
declare io staff;
begin
  io := mio_staff(new.palestra_id);
  if tg_op = 'INSERT' then
    if io.id is not null then
      new.creato_da_staff := io.id;
      new.creato_da := trim(io.nome || ' ' || coalesce(io.cognome, ''));
    end if;
  elsif new.fatto is distinct from old.fatto then
    if new.fatto then
      new.fatto_at := now();
      if io.id is not null then
        new.fatto_da_staff := io.id;
        new.fatto_da := trim(io.nome || ' ' || coalesce(io.cognome, ''));
      end if;
    else
      new.fatto_at := null; new.fatto_da := null; new.fatto_da_staff := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists promemoria_chi on promemoria;
create trigger promemoria_chi before insert or update on promemoria for each row execute function trg_promemoria_chi();

-- notifica a chi riceve un compito
create or replace function trg_promemoria_notifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.per_staff is null and new.per_ruolo is null then return new; end if;
  begin
    perform accoda_push_staff(new.palestra_id, 'compito',
      'Nuova cosa da fare' || case when new.data > current_date then ' per il ' || to_char(new.data, 'DD/MM') else '' end,
      new.testo || coalesce(' · da ' || new.creato_da, ''), '/gestione',
      case when new.per_staff is not null or new.per_ruolo = 'tutti' then null else array[new.per_ruolo] end,
      new.per_staff, 'compito:' || new.id);
  exception when others then null;   -- la notifica non deve mai bloccare il promemoria
  end;
  return new;
end $$;
drop trigger if exists promemoria_notifica on promemoria;
create trigger promemoria_notifica after insert on promemoria for each row execute function trg_promemoria_notifica();

-- L'elenco "Da fare" di chi è collegato: quelli di oggi e i rimasti indietro non fatti, più quelli fatti oggi
create or replace function promemoria_miei(p_palestra uuid)
returns table (id uuid, data date, testo text, lezione_id uuid, per_staff uuid, per_ruolo text, per_nome text,
               creato_da text, created_at timestamptz, fatto boolean, fatto_da text, fatto_at timestamptz,
               mio boolean, gruppo boolean, gruppo_fatti int, gruppo_totale int, gruppo_chi text)
language plpgsql stable security definer set search_path = public as $$
declare io staff; v_gest boolean; v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  io := mio_staff(p_palestra);
  if io.id is null then return; end if;
  v_gest := io.ruolo::text in ('admin', 'segreteria');
  return query
  with base as (
    select p.*, (p.per_ruolo is not null) as di_gruppo,
           (p.per_staff = io.id or p.per_ruolo = 'tutti' or p.per_ruolo = io.ruolo::text
            or (p.per_staff is null and p.per_ruolo is null and v_gest)) as per_me,
           pf.fatto_at as mio_fatto_at
      from promemoria p
      left join promemoria_fatti pf on pf.promemoria_id = p.id and pf.staff_id = io.id
     where p.palestra_id = p_palestra and p.data <= v_oggi
  ),
  membri as (
    select b.id pid, s.id sid, trim(s.nome || ' ' || coalesce(s.cognome, '')) nome
      from base b join staff s on s.palestra_id = p_palestra and s.attivo and not coalesce(s.archiviato, false)
                               and (b.per_ruolo = 'tutti' or s.ruolo::text = b.per_ruolo)
     where b.di_gruppo
  )
  select b.id, b.data, b.testo, b.lezione_id, b.per_staff, b.per_ruolo,
         case when b.per_staff is not null then (select trim(s.nome || ' ' || coalesce(s.cognome, '')) from staff s where s.id = b.per_staff)
              when b.per_ruolo = 'tutti' then 'tutto lo staff' when b.per_ruolo = 'insegnante' then 'gli insegnanti'
              when b.per_ruolo = 'segreteria' then 'la segreteria' when b.per_ruolo = 'admin' then 'l''amministrazione' end,
         b.creato_da, b.created_at,
         -- "fatto" per chi guarda: nei compiti di gruppo, il suo; se no quello del promemoria
         case when b.di_gruppo and b.per_me and not b.fatto then b.mio_fatto_at is not null else b.fatto end,
         case when b.di_gruppo and b.per_me and not b.fatto and b.mio_fatto_at is not null then trim(io.nome || ' ' || coalesce(io.cognome, '')) else b.fatto_da end,
         case when b.di_gruppo and b.per_me and not b.fatto and b.mio_fatto_at is not null then b.mio_fatto_at else b.fatto_at end,
         b.per_me, b.di_gruppo,
         (select count(*)::int from membri m join promemoria_fatti f on f.promemoria_id = m.pid and f.staff_id = m.sid where m.pid = b.id),
         (select count(*)::int from membri m where m.pid = b.id),
         (select string_agg(m.nome, ', ' order by f.fatto_at) from membri m join promemoria_fatti f on f.promemoria_id = m.pid and f.staff_id = m.sid where m.pid = b.id)
    from base b
   where (v_gest or b.per_me)
     and (
       -- ancora da fare (per me, o per il gruppo se lo guarda la segreteria) …
       (not b.fatto and (not b.di_gruppo or not b.per_me or b.mio_fatto_at is null))
       -- … oppure fatto oggi
       or (b.fatto_at at time zone 'Europe/Rome')::date = v_oggi
       or (b.di_gruppo and b.per_me and (b.mio_fatto_at at time zone 'Europe/Rome')::date = v_oggi)
     )
   order by b.data, b.created_at;
end $$;
revoke execute on function promemoria_miei(uuid) from public, anon;
grant execute on function promemoria_miei(uuid) to authenticated;

-- Spunta / togli la spunta.
-- Compito di gruppo e io sono nel gruppo: spunto il mio (quando l'hanno fatto tutti si chiude).
-- Altrimenti (o p_tutti): fatto per tutti, solo la segreteria o la persona a cui è assegnato.
create or replace function spunta_promemoria(p_id uuid, p_fatto boolean, p_tutti boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare p promemoria; io staff; v_gest boolean; v_nel_gruppo boolean; v_tot int; v_fatti int;
begin
  select * into p from promemoria where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  io := mio_staff(p.palestra_id);
  if io.id is null then raise exception 'non_autorizzato'; end if;
  v_gest := io.ruolo::text in ('admin', 'segreteria');
  v_nel_gruppo := p.per_ruolo is not null and (p.per_ruolo = 'tutti' or p.per_ruolo = io.ruolo::text);

  if v_nel_gruppo and not p_tutti then
    if p_fatto then
      insert into promemoria_fatti (promemoria_id, staff_id) values (p.id, io.id) on conflict do nothing;
    else
      delete from promemoria_fatti where promemoria_id = p.id and staff_id = io.id;
      if p.fatto then update promemoria set fatto = false where id = p.id; end if;
    end if;
    -- tutti fatto? si chiude da solo
    select count(*), count(f.staff_id) into v_tot, v_fatti
      from staff s left join promemoria_fatti f on f.promemoria_id = p.id and f.staff_id = s.id
     where s.palestra_id = p.palestra_id and s.attivo and not coalesce(s.archiviato, false)
       and (p.per_ruolo = 'tutti' or s.ruolo::text = p.per_ruolo);
    if p_fatto and v_tot > 0 and v_fatti >= v_tot then update promemoria set fatto = true where id = p.id; end if;
    return;
  end if;

  if not (v_gest or p.per_staff = io.id) then raise exception 'non_autorizzato'; end if;
  update promemoria set fatto = p_fatto where id = p.id;
end $$;
revoke execute on function spunta_promemoria(uuid, boolean, boolean) from public, anon;
grant execute on function spunta_promemoria(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Attività dello staff: anche i promemoria
-- ---------------------------------------------------------------------
do $$
declare v text;
begin
  v := pg_get_functiondef('eventi_staff(uuid, uuid, date, date)'::regprocedure);
  if v not ilike '%promemoria_scritti%' then
    v := replace(v, '  -- appelli e lezioni (valgono anche senza accesso, per come sono registrati)',
'  -- promemoria scritti e fatti
  return query select ''promemoria_scritti'', pm.created_at, ''da fare: '' || pm.testo
                      || coalesce('' (per '' || (select trim(x.nome || '' '' || coalesce(x.cognome, '''')) from staff x where x.id = pm.per_staff) || '')'',
                                  '' (per '' || case pm.per_ruolo when ''tutti'' then ''tutto lo staff'' when ''insegnante'' then ''gli insegnanti'' when ''segreteria'' then ''la segreteria'' else ''l''''amministrazione'' end || '')'', ''''),
                      null::uuid, pm.lezione_id, null::bigint
    from promemoria pm where pm.palestra_id = p_palestra and pm.creato_da_staff = s.id and pm.created_at >= v_da and pm.created_at < v_a;
  return query select ''promemoria_fatti'', pm.fatto_at, ''fatto: '' || pm.testo, null::uuid, pm.lezione_id, null::bigint
    from promemoria pm where pm.palestra_id = p_palestra and pm.fatto_da_staff = s.id and pm.fatto_at >= v_da and pm.fatto_at < v_a;
  return query select ''promemoria_fatti'', f.fatto_at, ''fatto (compito di gruppo): '' || pm.testo, null::uuid, pm.lezione_id, null::bigint
    from promemoria_fatti f join promemoria pm on pm.id = f.promemoria_id
   where pm.palestra_id = p_palestra and f.staff_id = s.id and f.fatto_at >= v_da and f.fatto_at < v_a;

  -- appelli e lezioni (valgono anche senza accesso, per come sono registrati)');
    execute v;
  end if;
end $$;

create or replace function voce_area(p_voce text)
returns text language sql immutable as $$
  select case
    when p_voce in ('anag_nuove', 'chi_paga_nuovi', 'anag_modifiche', 'anag_cancellate', 'certificati', 'certificati_verificati', 'firme') then 'anagrafiche'
    when p_voce in ('iscr_nuove', 'rinnovi', 'iscr_modifiche', 'iscr_cancellate', 'sospensioni', 'quote') then 'iscrizioni'
    when p_voce in ('incassi', 'ricevute', 'note_credito', 'incassi_modifiche', 'incassi_cancellati', 'rate') then 'incassi'
    when p_voce in ('appelli', 'presenze', 'lezioni_tenute', 'senza_appello', 'disdette', 'recuperi', 'prenotazioni', 'lezioni_modifiche') then 'lezioni'
    when p_voce in ('ingressi', 'contatti', 'richieste', 'campagne', 'promemoria_scritti', 'promemoria_fatti') then 'reception'
    else 'configurazione' end;
$$;
