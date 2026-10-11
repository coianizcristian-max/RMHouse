-- 156 — Workshop nel calendario (anche in bozza e per insegnante) e competenze dello staff
-- 1) workshop_periodo: dice anche lo stato, chi insegna (insegnante_id) e il luogo; con p_bozze = true anche le bozze
--    (il calendario le mostra tratteggiate). Chi la chiama con 3 valori ha come prima: pubblicati e chiusi.
-- 2) staff_competenze: cosa insegna ogni persona dello staff, per disciplina (es. Aerea) o per area intera
--    (es. tutta la Danza). Serve a proporre per primi gli insegnanti giusti quando si sceglie chi tiene un corso.
--    La prima volta si riempie leggendo il campo "specialità" (es. "Aerea e Pole Dance").
-- Si può rilanciare.

-- 1 ---------------------------------------------------------------------------------------------------------
drop function if exists workshop_periodo(uuid, date, date);
create or replace function workshop_periodo(p_palestra uuid, p_dal date, p_al date, p_bozze boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'workshop_id', w.id, 'titolo', w.titolo, 'stato', w.stato,
             'insegnante', coalesce(nullif(trim(coalesce(st.nome, '') || ' ' || coalesce(st.cognome, '')), ''), w.insegnante),
             'insegnante_id', w.insegnante_id,
             'momento_id', m.id, 'momento', m.titolo,
             'momenti', (select count(*) from workshop_momenti x where x.workshop_id = w.id),
             'data', (m.inizio at time zone 'Europe/Rome')::date,
             'inizio', m.inizio, 'fine', coalesce(m.fine, m.inizio + interval '1 hour'), 'sala_id', m.sala_id, 'sala', s.nome,
             'sede_id', w.sede_id, 'luogo', case when w.sede_id is null then nullif(trim(w.luogo), '') end, 'posti', m.posti,
             'iscritti', (select count(*) from workshop_iscrizioni i join workshop_opzioni o on o.id = i.opzione_id
                           where i.workshop_id = w.id and i.stato = 'iscritto' and m.id = any(o.momenti)),
             'presenti', (select count(*) from workshop_iscrizioni i
                           where i.workshop_id = w.id and i.stato = 'iscritto' and m.id = any(i.presenze)))
             order by m.inizio)
      from workshop_momenti m
      join workshop w on w.id = m.workshop_id
      left join sale s on s.id = m.sala_id
      left join staff st on st.id = w.insegnante_id
     where w.palestra_id = p_palestra
       and (w.stato in ('pubblicato', 'chiuso') or (p_bozze and w.stato = 'bozza'))
       and (m.inizio at time zone 'Europe/Rome')::date between p_dal and p_al), '[]'::jsonb);
end $$;
revoke all on function workshop_periodo(uuid, date, date, boolean) from public, anon;
grant execute on function workshop_periodo(uuid, date, date, boolean) to authenticated;

-- (stessa di prima: la riscrivo perché chiama workshop_periodo)
create or replace function workshop_del_giorno(p_palestra uuid, p_giorno date default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select workshop_periodo(p_palestra, coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date),
                          coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date), false);
$$;
revoke all on function workshop_del_giorno(uuid, date) from public, anon;
grant execute on function workshop_del_giorno(uuid, date) to authenticated;

-- 2 ---------------------------------------------------------------------------------------------------------
create table if not exists staff_competenze (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  disciplina_id uuid references discipline(id) on delete cascade,
  categoria_id uuid references categorie(id) on delete cascade,     -- tutta l'area (anche le discipline aggiunte dopo)
  created_at timestamptz not null default now(),
  constraint staff_competenze_una_cosa check ((disciplina_id is null) <> (categoria_id is null))
);
create unique index if not exists staff_competenze_unica on staff_competenze (staff_id, coalesce(disciplina_id, categoria_id));
create index if not exists staff_competenze_palestra on staff_competenze (palestra_id);
alter table staff_competenze enable row level security;
drop policy if exists staff_legge on staff_competenze;
create policy staff_legge on staff_competenze for select using (palestra_id in (select palestre_staff()));
drop policy if exists gestione_scrive on staff_competenze;
create policy gestione_scrive on staff_competenze for all using (palestra_id in (select palestre_gestione()))
  with check (palestra_id in (select palestre_gestione()));
grant select, insert, update, delete on staff_competenze to authenticated;

-- prima volta: dal testo della specialità. Una disciplina se il nome c'è ("Pole Dance"); un'area intera se c'è il suo
-- nome come parola a sé e non fa parte di una disciplina trovata ("Aerea e Acrobatica" → Aerea + tutta l'Acrobatica,
-- ma "Danza classica" → solo Danza Classica). Solo se la tabella è ancora vuota: dopo si cambia dalla scheda.
do $$
begin
  if exists (select 1 from staff_competenze) then return; end if;
  insert into staff_competenze (palestra_id, staff_id, disciplina_id)
  select s.palestra_id, s.id, d.id
    from staff s join discipline d on d.palestra_id = s.palestra_id
   where coalesce(s.specialita, '') <> '' and d.attiva
     and position(lower(d.nome) in lower(s.specialita)) > 0
  on conflict do nothing;
  insert into staff_competenze (palestra_id, staff_id, categoria_id)
  select s.palestra_id, s.id, c.id
    from staff s join categorie c on c.palestra_id = s.palestra_id
   where coalesce(s.specialita, '') <> '' and c.attiva
     and lower(s.specialita) ~ ('\m' || regexp_replace(lower(c.nome), '([^a-z0-9àèéìòù ])', '\\\1', 'g') || '\M')
     and not exists (select 1 from staff_competenze k join discipline d on d.id = k.disciplina_id
                      where k.staff_id = s.id and position(lower(c.nome) in lower(d.nome)) > 0)
  on conflict do nothing;
end $$;

notify pgrst, 'reload schema';
