-- =====================================================================
-- RMHouse — 082 DISPONIBILITÀ DEGLI INSEGNANTI PER LE LEZIONI PRIVATE
--  1. disponibilita_staff: le fasce settimanali in cui un insegnante fa
--     lezioni private (es. martedì 14-17), con la durata della lezione
--  2. slot_personal(): i posti liberi dei prossimi giorni, tolte le ore
--     in cui l'insegnante ha già una lezione o una privata confermata
--  3. richiedi_personal salva anche gli orari scelti dal cliente
-- Si può eseguire più volte. Va dopo la 081.
-- =====================================================================

create table if not exists disponibilita_staff (
  id               uuid primary key default gen_random_uuid(),
  palestra_id      uuid not null references palestre(id) on delete cascade,
  staff_id         uuid not null references staff(id) on delete cascade,
  giorno_settimana int not null check (giorno_settimana between 1 and 7),
  ora_inizio       time not null,
  ora_fine         time not null,
  durata_min       int not null default 60 check (durata_min between 15 and 240),
  created_at       timestamptz not null default now(),
  check (ora_fine > ora_inizio)
);
create index if not exists ix_disponibilita_staff on disponibilita_staff (staff_id, giorno_settimana);
alter table disponibilita_staff enable row level security;
grant select, insert, update, delete on disponibilita_staff to authenticated;
drop policy if exists gestione_tutto on disponibilita_staff;
create policy gestione_tutto on disponibilita_staff for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists insegnante_le_sue on disponibilita_staff;
create policy insegnante_le_sue on disponibilita_staff for all to authenticated
  using (staff_id in (select id from staff where user_id = auth.uid()))
  with check (staff_id in (select id from staff where user_id = auth.uid()));
do $$ begin
  if exists (select 1 from pg_proc where proname = 'trg_registro') then
    drop trigger if exists registro on disponibilita_staff;
    create trigger registro after insert or update or delete on disponibilita_staff for each row execute function trg_registro();
  end if;
end $$;

-- I posti liberi per una lezione privata con un insegnante, dai prossimi giorni
create or replace function slot_personal(p_staff uuid, p_giorni int default 21)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pal uuid; v_tz text;
begin
  select palestra_id into v_pal from staff where id = p_staff and attivo;
  if v_pal is null then return '[]'::jsonb; end if;
  if not (exists (select 1 from account where user_id = auth.uid() and palestra_id = v_pal) or is_staff(v_pal)) then
    return '[]'::jsonb;
  end if;
  select coalesce(fuso_orario, 'Europe/Rome') into v_tz from palestre where id = v_pal;
  return coalesce((
    select jsonb_agg(jsonb_build_object('inizio', s.inizio, 'fine', s.fine) order by s.inizio)
    from (
      select t.ts at time zone v_tz as inizio,
             (t.ts + make_interval(mins => d.durata_min)) at time zone v_tz as fine, g.giorno::date as giorno
        from disponibilita_staff d
        cross join lateral generate_series((now() at time zone v_tz)::date + 1, (now() at time zone v_tz)::date + greatest(p_giorni, 1), interval '1 day') g(giorno)
        cross join lateral generate_series(g.giorno::date + d.ora_inizio, g.giorno::date + d.ora_fine - make_interval(mins => d.durata_min),
                                           make_interval(mins => d.durata_min)) t(ts)
       where d.staff_id = p_staff and extract(isodow from g.giorno) = d.giorno_settimana
         and not exists (select 1 from chiusure ch where ch.palestra_id = v_pal and g.giorno::date between ch.dal and ch.al)
    ) s
    where not exists (   -- l'insegnante ha già lezione in quell'ora
            select 1 from lezioni l where l.insegnante_id = p_staff and l.stato <> 'annullata'
              and l.inizio < s.fine and l.fine > s.inizio)
      and not exists (   -- privata già confermata in quell'ora
            select 1 from richieste_cliente r where r.tipo = 'personal' and r.stato = 'confermata'
              and r.dati->>'staff_id' = p_staff::text and (r.dati->>'fissata')::timestamptz >= s.inizio
              and (r.dati->>'fissata')::timestamptz < s.fine)
  ), '[]'::jsonb);
end $$;
revoke execute on function slot_personal(uuid, int) from public, anon;
grant execute on function slot_personal(uuid, int) to authenticated;

-- insegnanti_personal: anche se hanno le disponibilità impostate
create or replace function insegnanti_personal()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'nome', trim(st.nome || ' ' || coalesce(st.cognome, '')),
           'foto', st.foto_url, 'specialita', st.specialita,
           'disponibile', exists (select 1 from disponibilita_staff d where d.staff_id = st.id))
           order by (exists (select 1 from disponibilita_staff d where d.staff_id = st.id)) desc, st.nome), '[]'::jsonb)
  from staff st
  where st.palestra_id = (select palestra_id from account where user_id = auth.uid() limit 1)
    and st.attivo and not coalesce(st.archiviato, false) and st.ruolo = 'insegnante'
    and coalesce(st.visibilita::text, 'pubblico') <> 'nascosto';
$$;

-- richiedi_personal con gli orari scelti (fino a 6)
create or replace function richiedi_personal_orari(p_allievo uuid, p_staff uuid, p_slot timestamptz[], p_quando text, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(array_length(p_slot, 1), 0) > 6 then raise exception 'troppi_orari'; end if;
  v_id := richiedi_personal(p_allievo, p_staff, p_quando, p_nota);
  update richieste_cliente set dati = dati || jsonb_build_object('slot', to_jsonb(coalesce(p_slot, '{}')))
   where id = v_id;
  return v_id;
end $$;
revoke execute on function richiedi_personal_orari(uuid, uuid, timestamptz[], text, text) from public, anon;
grant execute on function richiedi_personal_orari(uuid, uuid, timestamptz[], text, text) to authenticated;

-- la segreteria conferma un orario preciso: lo segna nella richiesta (così quell'ora non si propone più)
create or replace function fissa_personal(p_id uuid, p_quando timestamptz, p_risposta text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r richieste_cliente;
begin
  select * into r from richieste_cliente where id = p_id;
  if not found or r.tipo <> 'personal' or not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  update richieste_cliente set dati = dati || jsonb_build_object('fissata', p_quando) where id = p_id;
  perform conferma_richiesta(p_id, coalesce(nullif(trim(p_risposta), ''),
    'Fissata ' || (array['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'])[extract(isodow from p_quando at time zone 'Europe/Rome')::int]
      || ' ' || to_char(p_quando at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ' con ' || (r.dati->>'insegnante')));
end $$;
revoke execute on function fissa_personal(uuid, timestamptz, text) from public, anon;
grant execute on function fissa_personal(uuid, timestamptz, text) to authenticated;
