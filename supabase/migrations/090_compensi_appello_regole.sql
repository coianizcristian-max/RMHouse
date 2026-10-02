-- 090 · Compensi insegnanti: lezione confermata con l'appello, sostituzioni, regole per insegnante
-- 1. Chi ha TENUTO la lezione: l'insegnante la conferma dall'appello ("Ho tenuto io la lezione").
--    Se la conferma un'altra insegnante è una sostituzione: le ore vanno a chi l'ha tenuta.
--    La segreteria può correggere o assegnare a mano.
-- 2. Regole di compenso per ogni insegnante (tariffa oraria standard nella scheda + regole specifiche):
--    a ora, a lezione, a fasce di persone, a persona, privata, forfait mensile di un corso, fisso mensile.
-- 3. Il cedolino del mese è fatto di righe (una per lezione) con la regola usata: si vede, si stampa
--    e l'insegnante lo conferma o segnala una differenza dalla sua area.
-- Rieseguibile.

-- ---------------------------------------------------------------------
-- 1. Chi ha tenuto la lezione
-- ---------------------------------------------------------------------
alter table lezioni add column if not exists svolta_da uuid references staff(id) on delete set null;
alter table lezioni add column if not exists svolta_at timestamptz;
alter table lezioni add column if not exists svolta_come text;          -- appello | segreteria
create index if not exists lezioni_svolta_da on lezioni (svolta_da, data);

-- Conferma: p_staff null = "l'ho tenuta io" (insegnante che fa l'appello); la segreteria può indicare chi,
-- oppure togliere la conferma con p_togli
create or replace function conferma_lezione(p_lezione uuid, p_staff uuid default null, p_togli boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l lezioni; io staff; v_chi uuid; v_gest boolean;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not is_staff(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  if l.stato = 'annullata' then raise exception 'lezione_annullata'; end if;
  v_gest := is_gestione(l.palestra_id);
  select * into io from staff where user_id = auth.uid() and palestra_id = l.palestra_id and attivo limit 1;

  if p_togli then
    if not v_gest then raise exception 'non_autorizzato'; end if;
    update lezioni set svolta_da = null, svolta_at = null, svolta_come = null where id = l.id;
    return jsonb_build_object('svolta_da', null);
  end if;

  if p_staff is not null and p_staff is distinct from io.id then
    if not v_gest then raise exception 'non_autorizzato'; end if;      -- solo la segreteria assegna ad altri
    if not exists (select 1 from staff where id = p_staff and palestra_id = l.palestra_id) then raise exception 'staff_non_trovato'; end if;
    v_chi := p_staff;
  else
    if io.id is null then raise exception 'non_autorizzato'; end if;
    -- si conferma da mezz'ora prima dell'inizio in poi
    if now() < l.inizio - interval '30 minutes' then raise exception 'troppo_presto'; end if;
    -- già confermata da un'altra persona: solo la segreteria cambia
    if l.svolta_da is not null and l.svolta_da <> io.id and not v_gest then raise exception 'gia_confermata'; end if;
    v_chi := io.id;
  end if;

  update lezioni set svolta_da = v_chi, svolta_at = now(),
                     svolta_come = case when v_chi = io.id and p_staff is null then 'appello' else 'segreteria' end
   where id = l.id;
  return jsonb_build_object('svolta_da', v_chi,
    'sostituzione', l.insegnante_id is not null and l.insegnante_id <> v_chi);
end $$;
revoke execute on function conferma_lezione(uuid, uuid, boolean) from public, anon;
grant execute on function conferma_lezione(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Regole di compenso
-- ---------------------------------------------------------------------
create table if not exists regole_compenso (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  staff_id      uuid not null references staff(id) on delete cascade,
  tipo          text not null check (tipo in ('ora', 'lezione', 'fasce', 'a_persona', 'privata', 'forfait_mese', 'fisso_mese')),
  ambito        text not null default 'tutte' check (ambito in ('tutte', 'corso', 'disciplina', 'private')),
  corso_id      uuid references corsi(id) on delete cascade,
  disciplina_id uuid references discipline(id) on delete cascade,
  importo_cent  integer,
  minimo_cent   integer,
  massimo_cent  integer,
  conta         text not null default 'presenti' check (conta in ('presenti', 'prenotati')),
  unita         text not null default 'lezione' check (unita in ('lezione', 'ora')),
  fasce         jsonb not null default '[]'::jsonb,         -- [{ "da": 1, "a": 5, "importo_cent": 2000 }, …] ("a" vuoto = in su)
  dal           date,
  al            date,
  nota          text,
  attiva        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists regole_compenso_staff on regole_compenso (staff_id) where attiva;
grant select, insert, update, delete on regole_compenso to authenticated;
alter table regole_compenso enable row level security;
drop policy if exists gestione_tutto on regole_compenso;
create policy gestione_tutto on regole_compenso for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists insegnante_sue on regole_compenso;
create policy insegnante_sue on regole_compenso for select to authenticated
  using (staff_id in (select id from staff where user_id = auth.uid()));

-- Impostazioni del calcolo: { "solo_confermate": true }
alter table palestre add column if not exists compensi jsonb not null default '{"solo_confermate": true}'::jsonb;

-- ---------------------------------------------------------------------
-- 3. Il cedolino a righe
-- ---------------------------------------------------------------------
alter table compensi add column if not exists base_cent integer not null default 0;     -- lezioni + forfait + fissi
alter table compensi add column if not exists forfait_cent integer not null default 0;
alter table compensi add column if not exists da_verificare integer not null default 0;
alter table compensi add column if not exists sostituzioni integer not null default 0;
alter table compensi add column if not exists visto_at timestamptz;                    -- l'insegnante ha confermato
alter table compensi add column if not exists segnalazione text;                       -- l'insegnante segnala una differenza
alter table compensi add column if not exists segnalata_at timestamptz;

create table if not exists compensi_righe (
  id           uuid primary key default gen_random_uuid(),
  compenso_id  uuid not null references compensi(id) on delete cascade,
  palestra_id  uuid not null references palestre(id) on delete cascade,
  staff_id     uuid not null references staff(id) on delete cascade,
  lezione_id   uuid references lezioni(id) on delete set null,
  richiesta_id uuid,
  data         date,
  inizio       timestamptz,
  corso        text,
  ore          numeric(5,2) not null default 0,
  presenti     integer,
  prenotati    integer,
  stato        text not null check (stato in ('contata', 'da_verificare', 'forfait', 'sostituita', 'mensile')),
  sostituzione text,
  regola       text,
  importo_cent integer not null default 0
);
create index if not exists compensi_righe_compenso on compensi_righe (compenso_id, inizio);
grant select, insert, update, delete on compensi_righe to authenticated;
alter table compensi_righe enable row level security;
drop policy if exists gestione_tutto on compensi_righe;
create policy gestione_tutto on compensi_righe for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists insegnante_sue on compensi_righe;
create policy insegnante_sue on compensi_righe for select to authenticated
  using (staff_id in (select id from staff where user_id = auth.uid()));

-- La regola giusta per una lezione (la più precisa: corso > disciplina > private > tutte)
create or replace function regola_per(p_staff uuid, p_corso uuid, p_disciplina uuid, p_privata boolean, p_data date, p_tipi text[])
returns regole_compenso language sql stable security definer set search_path = public as $$
  select r.* from regole_compenso r
   where r.staff_id = p_staff and r.attiva and r.tipo = any (p_tipi)
     and (r.dal is null or p_data >= r.dal) and (r.al is null or p_data <= r.al)
     and case r.ambito
           when 'corso' then r.corso_id = p_corso
           when 'disciplina' then r.disciplina_id = p_disciplina
           when 'private' then p_privata
           else true end
   order by case r.ambito when 'corso' then 4 when 'disciplina' then 3 when 'private' then 2 else 1 end desc, r.created_at desc
   limit 1;
$$;

-- Euro in testo per le descrizioni delle regole
create or replace function eur_txt(c integer) returns text language sql immutable as $$
  select replace(replace(to_char(coalesce(c, 0) / 100.0, 'FM9999990.00'), '.', ','), ',00', '') || ' €';
$$;

-- Quanto vale una lezione con una regola: importo e descrizione
create or replace function valore_lezione(r regole_compenso, p_ore numeric, p_presenti int, p_prenotati int, p_tariffa int,
                                          out importo integer, out descr text)
language plpgsql stable as $$
declare n int; f jsonb;
begin
  if r.id is null then
    importo := round(p_ore * coalesce(p_tariffa, 0)); descr := 'tariffa standard ' || eur_txt(p_tariffa) || '/ora';
    return;
  end if;
  n := case when r.conta = 'prenotati' then coalesce(p_prenotati, 0) else coalesce(p_presenti, 0) end;
  if r.tipo = 'ora' then
    importo := round(p_ore * coalesce(r.importo_cent, 0)); descr := eur_txt(r.importo_cent) || '/ora';
  elsif r.tipo in ('lezione', 'privata') then
    importo := coalesce(r.importo_cent, 0); descr := eur_txt(r.importo_cent) || case when r.tipo = 'privata' then ' a privata' else ' a lezione' end;
  elsif r.tipo = 'a_persona' then
    importo := n * coalesce(r.importo_cent, 0);
    if r.minimo_cent is not null then importo := greatest(importo, r.minimo_cent); end if;
    if r.massimo_cent is not null then importo := least(importo, r.massimo_cent); end if;
    descr := eur_txt(r.importo_cent) || ' × ' || n || ' ' || r.conta
             || case when r.minimo_cent is not null then ', min ' || eur_txt(r.minimo_cent) else '' end
             || case when r.massimo_cent is not null then ', max ' || eur_txt(r.massimo_cent) else '' end;
  elsif r.tipo = 'fasce' then
    select x into f from jsonb_array_elements(r.fasce) x
     where n >= coalesce((x ->> 'da')::int, 0) and (nullif(x ->> 'a', '') is null or n <= (x ->> 'a')::int)
     order by coalesce((x ->> 'da')::int, 0) desc limit 1;
    if f is null then
      importo := 0; descr := 'nessuna fascia per ' || n || ' ' || r.conta;
    else
      importo := round(coalesce((f ->> 'importo_cent')::int, 0) * case when r.unita = 'ora' then p_ore else 1 end);
      descr := n || ' ' || r.conta || ' → ' || eur_txt((f ->> 'importo_cent')::int) || case when r.unita = 'ora' then '/ora' else ' a lezione' end;
    end if;
  else
    importo := round(p_ore * coalesce(p_tariffa, 0)); descr := 'tariffa standard';
  end if;
  if r.nota is not null and r.nota <> '' then descr := descr || ' · ' || r.nota; end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Il calcolo del mese
-- ---------------------------------------------------------------------
create or replace function calcola_compensi(p_palestra uuid, p_anno integer, p_mese integer)
returns integer language plpgsql security definer set search_path = public as $$
declare st record; l record; pr record; rg regole_compenso; v record; n int := 0; v_dal date; v_al date;
        v_id uuid; v_solo boolean; v_ore numeric; v_base int; v_ore_tot numeric; v_lez int; v_ver int; v_sost int;
        v_forf int; v_stato text; v_conta boolean; v_forfait regole_compenso;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  v_dal := make_date(p_anno, p_mese, 1);
  v_al := (v_dal + interval '1 month - 1 day')::date;
  select coalesce((compensi ->> 'solo_confermate')::boolean, true) into v_solo from palestre where id = p_palestra;

  for st in
    select s.id, coalesce(s.compenso_ora_cent, 0) as tariffa, trim(s.nome || ' ' || coalesce(s.cognome, '')) as nome
      from staff s
     where s.palestra_id = p_palestra and s.attivo and not coalesce(s.archiviato, false)
       and (exists (select 1 from lezioni x where x.palestra_id = p_palestra and x.data between v_dal and v_al
                     and x.stato <> 'annullata' and x.fine <= now()
                     and (x.insegnante_id = s.id or x.svolta_da = s.id))
            or exists (select 1 from regole_compenso r where r.staff_id = s.id and r.attiva and r.tipo in ('forfait_mese', 'fisso_mese'))
            or exists (select 1 from richieste_cliente q where q.palestra_id = p_palestra and q.tipo = 'personal' and q.stato = 'confermata'
                         and q.dati ->> 'staff_id' = s.id::text
                         and (q.dati ->> 'fissata')::timestamptz between v_dal and v_al + 1))
  loop
    -- il cedolino (se già pagato non si tocca)
    insert into compensi (palestra_id, staff_id, anno, mese, tariffa_cent)
    values (p_palestra, st.id, p_anno, p_mese, st.tariffa)
    on conflict (staff_id, anno, mese) do nothing;
    select id into v_id from compensi where staff_id = st.id and anno = p_anno and mese = p_mese and stato <> 'pagato';
    if v_id is null then continue; end if;
    delete from compensi_righe where compenso_id = v_id;
    v_base := 0; v_ore_tot := 0; v_lez := 0; v_ver := 0; v_sost := 0; v_forf := 0;

    -- le lezioni del mese tenute da lei (confermate) o in calendario a lei e non tenute da altri
    for l in
      select x.*, c.nome as corso_nome, c.disciplina_id,
             extract(epoch from (x.fine - x.inizio)) / 3600.0 as ore,
             (select count(*) from presenze p where p.lezione_id = x.id and p.presente)::int as presenti,
             (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = x.id)::int as prenotati,
             ti.nome as titolare, sv.nome as tenuta_da
        from lezioni x
        join corsi c on c.id = x.corso_id
        left join staff ti on ti.id = x.insegnante_id
        left join staff sv on sv.id = x.svolta_da
       where x.palestra_id = p_palestra and x.data between v_dal and v_al and x.stato <> 'annullata'
         and x.fine <= now()
         and (x.svolta_da = st.id or (x.insegnante_id = st.id))
       order by x.inizio
    loop
      v_ore := round(l.ore::numeric, 2);
      -- tenuta da un'altra (sostituzione): riga informativa, 0 €
      if l.svolta_da is not null and l.svolta_da <> st.id then
        insert into compensi_righe (compenso_id, palestra_id, staff_id, lezione_id, data, inizio, corso, ore, presenti, prenotati, stato, sostituzione, regola, importo_cent)
        values (v_id, p_palestra, st.id, l.id, l.data, l.inizio, l.corso_nome, v_ore, l.presenti, l.prenotati, 'sostituita',
                'tenuta da ' || coalesce(l.tenuta_da, '?'), null, 0);
        continue;
      end if;
      v_conta := l.svolta_da = st.id or not v_solo;
      -- dentro un forfait mensile del corso?
      v_forfait := regola_per(st.id, l.corso_id, l.disciplina_id, false, l.data, array['forfait_mese']);
      if v_forfait.id is not null then
        insert into compensi_righe (compenso_id, palestra_id, staff_id, lezione_id, data, inizio, corso, ore, presenti, prenotati, stato, sostituzione, regola, importo_cent)
        values (v_id, p_palestra, st.id, l.id, l.data, l.inizio, l.corso_nome, v_ore, l.presenti, l.prenotati,
                case when v_conta then 'forfait' else 'da_verificare' end,
                case when l.insegnante_id is not null and l.insegnante_id <> st.id then 'sostituisce ' || coalesce(l.titolare, '?') end,
                'compresa nel forfait mensile', 0);
        if v_conta then v_ore_tot := v_ore_tot + v_ore; v_lez := v_lez + 1; else v_ver := v_ver + 1; end if;
        continue;
      end if;
      rg := regola_per(st.id, l.corso_id, l.disciplina_id, false, l.data, array['ora', 'lezione', 'fasce', 'a_persona']);
      select * into v from valore_lezione(rg, v_ore, l.presenti, l.prenotati, st.tariffa);
      v_stato := case when v_conta then 'contata' else 'da_verificare' end;
      insert into compensi_righe (compenso_id, palestra_id, staff_id, lezione_id, data, inizio, corso, ore, presenti, prenotati, stato, sostituzione, regola, importo_cent)
      values (v_id, p_palestra, st.id, l.id, l.data, l.inizio, l.corso_nome, v_ore, l.presenti, l.prenotati, v_stato,
              case when l.insegnante_id is not null and l.insegnante_id <> st.id then 'sostituisce ' || coalesce(l.titolare, '?') end,
              v.descr, coalesce(v.importo, 0));
      if v_conta then
        v_base := v_base + coalesce(v.importo, 0); v_ore_tot := v_ore_tot + v_ore; v_lez := v_lez + 1;
        if l.insegnante_id is not null and l.insegnante_id <> st.id then v_sost := v_sost + 1; end if;
      else
        v_ver := v_ver + 1;
      end if;
    end loop;

    -- lezioni private confermate (dalle richieste dell'app)
    for pr in
      select q.id, (q.dati ->> 'fissata')::timestamptz as inizio, coalesce((q.dati ->> 'durata_min')::int, 60) as minuti,
             q.allievo_id
        from richieste_cliente q
       where q.palestra_id = p_palestra and q.tipo = 'personal' and q.stato = 'confermata'
         and q.dati ->> 'staff_id' = st.id::text
         and (q.dati ->> 'fissata')::timestamptz >= v_dal and (q.dati ->> 'fissata')::timestamptz < v_al + 1
         and (q.dati ->> 'fissata')::timestamptz <= now()
    loop
      v_ore := round(pr.minuti / 60.0, 2);
      rg := regola_per(st.id, null, null, true, (pr.inizio at time zone 'Europe/Rome')::date, array['privata', 'ora', 'lezione']);
      if rg.id is not null and rg.ambito = 'tutte' and rg.tipo <> 'privata' then
        -- una regola generale "a lezione" non vale per le private: si usa la tariffa standard
        if rg.tipo = 'lezione' then rg := null; end if;
      end if;
      select * into v from valore_lezione(rg, v_ore, 1, 1, st.tariffa);
      insert into compensi_righe (compenso_id, palestra_id, staff_id, richiesta_id, data, inizio, corso, ore, presenti, prenotati, stato, regola, importo_cent)
      values (v_id, p_palestra, st.id, pr.id, (pr.inizio at time zone 'Europe/Rome')::date, pr.inizio, 'Lezione privata', v_ore, 1, 1,
              'contata', v.descr, coalesce(v.importo, 0));
      v_base := v_base + coalesce(v.importo, 0); v_ore_tot := v_ore_tot + v_ore; v_lez := v_lez + 1;
    end loop;

    -- importi mensili: forfait dei corsi e fissi
    for rg in
      select * from regole_compenso r
       where r.staff_id = st.id and r.attiva and r.tipo in ('forfait_mese', 'fisso_mese')
         and (r.dal is null or r.dal <= v_al) and (r.al is null or r.al >= v_dal)
    loop
      insert into compensi_righe (compenso_id, palestra_id, staff_id, data, corso, stato, regola, importo_cent)
      values (v_id, p_palestra, st.id, v_dal,
              case when rg.tipo = 'forfait_mese' then 'Forfait ' || coalesce((select nome from corsi where id = rg.corso_id),
                                                    (select nome from discipline where id = rg.disciplina_id), 'mensile')
                   else coalesce(nullif(rg.nota, ''), 'Fisso mensile') end,
              'mensile', case when rg.tipo = 'forfait_mese' then 'forfait del mese' else 'fisso del mese' end
                         || case when rg.nota is not null and rg.nota <> '' and rg.tipo = 'forfait_mese' then ' · ' || rg.nota else '' end,
              coalesce(rg.importo_cent, 0));
      v_forf := v_forf + coalesce(rg.importo_cent, 0);
    end loop;

    update compensi set tariffa_cent = st.tariffa, ore = v_ore_tot, lezioni = v_lez, base_cent = v_base + v_forf,
                        forfait_cent = v_forf, da_verificare = v_ver, sostituzioni = v_sost,
                        totale_cent = v_base + v_forf + extra_cent,
                        -- se il conteggio cambia, l'insegnante deve rivederlo
                        visto_at = case when totale_cent is distinct from v_base + v_forf + extra_cent then null else visto_at end
     where id = v_id;
    n := n + 1;
  end loop;
  -- cedolini rimasti vuoti (es. ricalcolo dopo aver tolto lezioni): via, se non pagati e senza extra
  delete from compensi c
   where c.palestra_id = p_palestra and c.anno = p_anno and c.mese = p_mese and c.stato = 'bozza'
     and c.extra_cent = 0 and not exists (select 1 from compensi_righe r where r.compenso_id = c.id);
  return n;
end $$;
revoke execute on function calcola_compensi(uuid, integer, integer) from public, anon;
grant execute on function calcola_compensi(uuid, integer, integer) to authenticated;

-- Extra: il totale è base + extra
create or replace function aggiorna_compenso(p_id uuid, p_extra_cent integer default null, p_extra_nota text default null, p_ore numeric default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c compensi;
begin
  select * into c from compensi where id = p_id;
  if not found then raise exception 'compenso_non_trovato'; end if;
  if not is_gestione(c.palestra_id) then raise exception 'non_autorizzato'; end if;
  if c.stato = 'pagato' then raise exception 'gia_pagato'; end if;
  update compensi
     set extra_cent = coalesce(p_extra_cent, extra_cent),
         extra_nota = coalesce(p_extra_nota, extra_nota),
         note = coalesce(p_note, note),
         totale_cent = base_cent + coalesce(p_extra_cent, extra_cent),
         visto_at = null
   where id = p_id;
end $$;

-- Il dettaglio: le righe del cedolino (per la segreteria e per l'insegnante stessa)
drop function if exists dettaglio_compenso(uuid);
create or replace function dettaglio_compenso(p_id uuid)
returns table (data date, inizio timestamptz, corso text, ore numeric, presenti int, prenotati int, stato text,
               sostituzione text, regola text, importo_cent int)
language sql stable security definer set search_path = public as $$
  select r.data, r.inizio, r.corso, r.ore, r.presenti, r.prenotati, r.stato, r.sostituzione, r.regola, r.importo_cent
    from compensi_righe r join compensi c on c.id = r.compenso_id
   where r.compenso_id = p_id
     and (is_gestione(c.palestra_id) or c.staff_id in (select id from staff where user_id = auth.uid()))
   order by r.stato = 'mensile' desc, r.inizio nulls first;
$$;
revoke execute on function dettaglio_compenso(uuid) from public, anon;
grant execute on function dettaglio_compenso(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. L'insegnante controlla il suo cedolino
-- ---------------------------------------------------------------------
create or replace function rispondi_cedolino(p_id uuid, p_ok boolean, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c compensi; v_nome text;
begin
  select * into c from compensi where id = p_id;
  if not found or c.staff_id not in (select id from staff where user_id = auth.uid()) then raise exception 'non_autorizzato'; end if;
  select trim(nome || ' ' || coalesce(cognome, '')) into v_nome from staff where id = c.staff_id;
  if p_ok then
    update compensi set visto_at = now(), segnalazione = null, segnalata_at = null where id = p_id;
  else
    if coalesce(trim(p_nota), '') = '' then raise exception 'nota_mancante'; end if;
    update compensi set visto_at = null, segnalazione = trim(p_nota), segnalata_at = now() where id = p_id;
  end if;
  begin
    perform accoda_push_staff(c.palestra_id, 'compensi',
      case when p_ok then 'Cedolino confermato' else 'Cedolino: differenza segnalata' end,
      v_nome || case when p_ok then ' ha confermato il conteggio di ' else ' segnala: "' || left(trim(p_nota), 140) || '" · ' end
             || to_char(make_date(c.anno, c.mese, 1), 'MM/YYYY'),
      '/gestione/compensi?anno=' || c.anno || '&mese=' || c.mese, array['admin', 'segreteria'], null, 'ced:' || c.id || ':' || now()::text);
  exception when others then null; end;
end $$;
revoke execute on function rispondi_cedolino(uuid, boolean, text) from public, anon;
grant execute on function rispondi_cedolino(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Promemoria: lezione finita e non confermata → notifica all'insegnante in calendario
-- ---------------------------------------------------------------------
create or replace function promemoria_appelli()
returns integer language plpgsql security definer set search_path = public as $$
declare l record; n int := 0;
begin
  for l in
    select x.id, x.palestra_id, x.insegnante_id, c.nome as corso, x.inizio
      from lezioni x join corsi c on c.id = x.corso_id
     where x.stato <> 'annullata' and x.svolta_da is null and x.insegnante_id is not null
       and x.fine <= now() and x.fine > now() - interval '1 day'
  loop
    begin
      perform accoda_push_staff(l.palestra_id, 'appello', 'Lezione da confermare',
        'Conferma che hai tenuto ' || l.corso || ' di ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI')
        || ': apri l''appello e tocca "Ho tenuto io la lezione".',
        '/gestione/appello/' || l.id, null, l.insegnante_id, 'app:' || l.id);
      n := n + 1;
    exception when others then null; end;
  end loop;
  return n;
end $$;
revoke execute on function promemoria_appelli() from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is null then return; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'rmhouse-promemoria-appelli';
  perform cron.schedule('rmhouse-promemoria-appelli', '30 20 * * *', 'select public.promemoria_appelli()');
end $$;
