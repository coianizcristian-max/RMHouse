-- =====================================================================
-- RMHouse — 150 WORKSHOP: INSEGNANTE DELLA SCUOLA O ESTERNO, COMPENSO NEL CEDOLINO O PAGATO A PARTE
-- • workshop.insegnante_id: se l'insegnante è della scuola (staff), il compenso del workshop (fisso o percentuale
--   dell'incassato, senza le quote annuali) va da solo nel suo cedolino del mese in cui il workshop finisce
--   (calcola_compensi: una riga "Workshop «…»" come i fissi mensili).
-- • Se è esterno: dalla scheda si stampa il riepilogo da allegare alla sua ricevuta o fattura (partecipanti solo con nome
--   e iniziale del cognome) e si registra il pagamento: diventa una spesa "compensi" nei Costi (paga_compenso_workshop).
-- Si può eseguire più volte. Va dopo la 149.
-- =====================================================================
alter table workshop add column if not exists insegnante_id uuid references staff(id) on delete set null;
alter table workshop add column if not exists compenso_pagato_at timestamptz;
alter table workshop add column if not exists compenso_pagato_cent integer;
alter table workshop add column if not exists compenso_metodo text;
alter table workshop add column if not exists compenso_documento text;
alter table workshop add column if not exists compenso_spesa_id uuid references spese(id) on delete set null;
create index if not exists workshop_insegnante on workshop (insegnante_id) where insegnante_id is not null;

-- ---------------------------------------------------------------------
-- 1. Il cedolino del mese (stessa funzione della 090/096/114/120, con in più i workshop)
-- ---------------------------------------------------------------------
create or replace function calcola_compensi(p_palestra uuid, p_anno integer, p_mese integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare st record; l record; pr record; rg regole_compenso; v record; n int := 0; v_dal date; v_al date;
        v_id uuid; v_solo boolean; v_ore numeric; v_base int; v_ore_tot numeric; v_lez int; v_ver int; v_sost int;
        v_forf int; v_stato text; v_conta boolean; v_forfait regole_compenso; rb record; v_rimb int; v_imp int;
        ws record; v_ws int;
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
            or exists (select 1 from lezioni x join compensi cp on cp.staff_id = s.id and cp.stato = 'pagato'
                         and cp.anno = extract(year from x.data) and cp.mese = extract(month from x.data)
                        where x.palestra_id = p_palestra and x.svolta_da = s.id and x.stato <> 'annullata'
                          and x.data < v_dal and x.data >= v_dal - interval '4 months'
                          and not exists (select 1 from compensi_righe r1 join compensi c1 on c1.id = r1.compenso_id
                                           where r1.lezione_id = x.id and r1.staff_id = s.id and r1.stato in ('contata', 'forfait')
                                             and (c1.anno, c1.mese) <> (p_anno, p_mese)))
            or exists (select 1 from regole_compenso r where r.staff_id = s.id and r.attiva and r.tipo in ('forfait_mese', 'fisso_mese'))
            -- 150: i workshop tenuti da un insegnante della scuola, nel mese in cui finiscono
            or exists (select 1 from workshop w
                        where w.palestra_id = p_palestra and w.insegnante_id = s.id and w.stato in ('pubblicato', 'chiuso')
                          and w.compenso_tipo is not null
                          and (select (max(coalesce(m.fine, m.inizio)) at time zone 'Europe/Rome')::date
                                 from workshop_momenti m where m.workshop_id = w.id) between v_dal and v_al)
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
             coalesce(tt.nome, ti.nome) as titolare, coalesce(sv.nome, ti.nome) as tenuta_da, x.insegnante_titolare as tit_id
        from lezioni x
        join corsi c on c.id = x.corso_id
        left join staff ti on ti.id = x.insegnante_id
        left join staff sv on sv.id = x.svolta_da
        left join staff tt on tt.id = x.insegnante_titolare
       where x.palestra_id = p_palestra and x.data between v_dal and v_al and x.stato <> 'annullata'
         and x.fine <= now()
         and (x.svolta_da = st.id or x.insegnante_id = st.id or x.insegnante_titolare = st.id)
       order by x.inizio
    loop
      v_ore := round(l.ore::numeric, 2);
      -- tenuta da un'altra (sostituzione): riga informativa, 0 €
      if (l.svolta_da is not null and l.svolta_da <> st.id) or (l.svolta_da is null and l.insegnante_id is distinct from st.id) then
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
                case when coalesce(l.tit_id, l.insegnante_id) is not null and coalesce(l.tit_id, l.insegnante_id) <> st.id then 'sostituisce ' || coalesce(l.titolare, '?') end,
                'compresa nel forfait mensile', 0);
        if v_conta then v_ore_tot := v_ore_tot + v_ore; v_lez := v_lez + 1; else v_ver := v_ver + 1; end if;
        continue;
      end if;
      rg := regola_per(st.id, l.corso_id, l.disciplina_id, false, l.data, array['ora', 'lezione', 'fasce', 'a_persona']);
      select * into v from valore_lezione(rg, v_ore, l.presenti, l.prenotati, st.tariffa);
      v_stato := case when v_conta then 'contata' else 'da_verificare' end;
      insert into compensi_righe (compenso_id, palestra_id, staff_id, lezione_id, data, inizio, corso, ore, presenti, prenotati, stato, sostituzione, regola, importo_cent)
      values (v_id, p_palestra, st.id, l.id, l.data, l.inizio, l.corso_nome, v_ore, l.presenti, l.prenotati, v_stato,
              case when coalesce(l.tit_id, l.insegnante_id) is not null and coalesce(l.tit_id, l.insegnante_id) <> st.id then 'sostituisce ' || coalesce(l.titolare, '?') end,
              v.descr, coalesce(v.importo, 0));
      if v_conta then
        v_base := v_base + coalesce(v.importo, 0); v_ore_tot := v_ore_tot + v_ore; v_lez := v_lez + 1;
        if coalesce(l.tit_id, l.insegnante_id) is not null and coalesce(l.tit_id, l.insegnante_id) <> st.id then v_sost := v_sost + 1; end if;
      else
        v_ver := v_ver + 1;
      end if;
    end loop;

    -- arretrati: lezioni dei mesi scorsi tenute da lei ma confermate dopo che quel cedolino era già pagato
    for l in
      select x.*, c.nome as corso_nome, c.disciplina_id,
             extract(epoch from (x.fine - x.inizio)) / 3600.0 as ore,
             (select count(*) from presenze p where p.lezione_id = x.id and p.presente)::int as presenti,
             (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = x.id)::int as prenotati
        from lezioni x join corsi c on c.id = x.corso_id
       where x.palestra_id = p_palestra and x.stato <> 'annullata' and x.svolta_da = st.id
         and x.data < v_dal and x.data >= v_dal - interval '4 months'
         and exists (select 1 from compensi cp where cp.staff_id = st.id and cp.stato = 'pagato'
                       and cp.anno = extract(year from x.data) and cp.mese = extract(month from x.data))
         and not exists (select 1 from compensi_righe r1 where r1.lezione_id = x.id and r1.staff_id = st.id
                           and r1.stato in ('contata', 'forfait') and r1.compenso_id <> v_id)
       order by x.inizio
    loop
      v_ore := round(l.ore::numeric, 2);
      if (regola_per(st.id, l.corso_id, l.disciplina_id, false, l.data, array['forfait_mese'])).id is not null then continue; end if;
      rg := regola_per(st.id, l.corso_id, l.disciplina_id, false, l.data, array['ora', 'lezione', 'fasce', 'a_persona']);
      select * into v from valore_lezione(rg, v_ore, l.presenti, l.prenotati, st.tariffa);
      insert into compensi_righe (compenso_id, palestra_id, staff_id, lezione_id, data, inizio, corso, ore, presenti, prenotati, stato, sostituzione, regola, importo_cent)
      values (v_id, p_palestra, st.id, l.id, l.data, l.inizio, l.corso_nome, v_ore, l.presenti, l.prenotati, 'contata', null,
              'arretrato di ' || to_char(l.data, 'DD/MM') || ' · ' || coalesce(v.descr, ''), coalesce(v.importo, 0));
      v_base := v_base + coalesce(v.importo, 0); v_ore_tot := v_ore_tot + v_ore; v_lez := v_lez + 1;
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

    -- rimborso auto / trasferta: un importo per ogni giorno con almeno una lezione contata che rientra nella regola.
    -- Un giorno si paga una volta (la regola con l'importo più alto); il massimo della regola vale sul mese.
    v_rimb := 0;
    for rb in
      with giorni as (
        select r.data, x.corso_id, c.disciplina_id, coalesce(sa.sede_id, c.sede_id) as sede_id, (r.richiesta_id is not null) as privata
          from compensi_righe r
          left join lezioni x on x.id = r.lezione_id
          left join corsi c on c.id = x.corso_id
          left join sale sa on sa.id = x.sala_id
         where r.compenso_id = v_id and r.stato in ('contata', 'forfait') and r.data between v_dal and v_al
      ), scelte as (
        select distinct on (g.data) g.data, rr.id as regola_id, rr.importo_cent, rr.massimo_cent, rr.nota
          from giorni g
          join regole_compenso rr on rr.staff_id = st.id and rr.attiva and rr.tipo = 'rimborso_giorno'
           and (rr.dal is null or g.data >= rr.dal) and (rr.al is null or g.data <= rr.al)
           and (case rr.ambito when 'corso' then rr.corso_id = g.corso_id
                               when 'disciplina' then rr.disciplina_id = g.disciplina_id
                               when 'private' then g.privata
                               when 'corsi' then not g.privata
                               else true end)
           and (rr.sede_id is null or rr.sede_id = g.sede_id)
         order by g.data, coalesce(rr.importo_cent, 0) desc, rr.created_at
      )
      select s.*, coalesce(sum(coalesce(s.importo_cent, 0)) over (partition by s.regola_id order by s.data
                                                         rows between unbounded preceding and 1 preceding), 0) as prima
        from scelte s order by s.data
    loop
      v_imp := coalesce(rb.importo_cent, 0);
      if rb.massimo_cent is not null then v_imp := greatest(0, least(v_imp, rb.massimo_cent - rb.prima)); end if;
      insert into compensi_righe (compenso_id, palestra_id, staff_id, data, corso, ore, stato, regola, importo_cent)
      values (v_id, p_palestra, st.id, rb.data, 'Rimborso auto', 0, 'rimborso',
              'rimborso del giorno'
              || case when rb.nota is not null and rb.nota <> '' then ' · ' || rb.nota else '' end
              || case when v_imp < coalesce(rb.importo_cent, 0) then ' · raggiunto il massimo del mese' else '' end,
              v_imp);
      v_rimb := v_rimb + v_imp;
    end loop;

    -- 150: i workshop tenuti da lei/lui, finiti in questo mese: il compenso deciso nel workshop
    --      (fisso, o la percentuale di quanto è stato incassato per il workshop, senza le quote annuali)
    v_ws := 0;
    for ws in
      select w.id, w.titolo, w.compenso_tipo, w.compenso_cent, w.compenso_percentuale, x.fine_ws,
             coalesce((select sum(i.prezzo_cent) from workshop_iscrizioni i join pagamenti pg on pg.id = i.pagamento_id
                        where i.workshop_id = w.id and i.stato = 'iscritto' and pg.stato = 'pagato'), 0)::int as incassato,
             (select count(*) from workshop_iscrizioni i where i.workshop_id = w.id and i.stato = 'iscritto')::int as iscritti
        from workshop w
        cross join lateral (select max(coalesce(m.fine, m.inizio)) as fine_ws from workshop_momenti m where m.workshop_id = w.id) x
       where w.palestra_id = p_palestra and w.insegnante_id = st.id and w.stato in ('pubblicato', 'chiuso')
         and w.compenso_tipo is not null and x.fine_ws <= now()
         and (x.fine_ws at time zone 'Europe/Rome')::date between v_dal and v_al
       order by x.fine_ws
    loop
      v_imp := case when ws.compenso_tipo = 'fisso' then coalesce(ws.compenso_cent, 0)
                    else round(ws.incassato * coalesce(ws.compenso_percentuale, 0) / 100.0)::int end;
      insert into compensi_righe (compenso_id, palestra_id, staff_id, data, corso, stato, regola, importo_cent)
      values (v_id, p_palestra, st.id, (ws.fine_ws at time zone 'Europe/Rome')::date, 'Workshop «' || ws.titolo || '»', 'mensile',
              case when ws.compenso_tipo = 'fisso' then 'compenso fisso del workshop'
                   else rtrim(to_char(coalesce(ws.compenso_percentuale, 0), 'FM999990.99'), '.') || '% di ' || eur_txt(ws.incassato) || ' incassati'
              end || ' · ' || ws.iscritti || case when ws.iscritti = 1 then ' iscritto' else ' iscritti' end,
              v_imp);
      v_ws := v_ws + v_imp;
    end loop;
    v_base := v_base + v_ws;

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

    update compensi set tariffa_cent = st.tariffa, ore = v_ore_tot, lezioni = v_lez, base_cent = v_base + v_forf + v_rimb, rimborsi_cent = v_rimb,
                        forfait_cent = v_forf, da_verificare = v_ver, sostituzioni = v_sost,
                        totale_cent = v_base + v_forf + v_rimb + extra_cent,
                        -- se il conteggio cambia, l'insegnante deve rivederlo
                        visto_at = case when totale_cent is distinct from v_base + v_forf + v_rimb + extra_cent then null else visto_at end
     where id = v_id;
    n := n + 1;
  end loop;
  -- cedolini rimasti vuoti (es. ricalcolo dopo aver tolto lezioni): via, se non pagati e senza extra
  delete from compensi c
   where c.palestra_id = p_palestra and c.anno = p_anno and c.mese = p_mese and c.stato = 'bozza'
     and c.extra_cent = 0 and not exists (select 1 from compensi_righe r where r.compenso_id = c.id);
  return n;
end $function$;
revoke all on function calcola_compensi(uuid, integer, integer) from public, anon;
grant execute on function calcola_compensi(uuid, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Insegnante esterno: il compenso pagato a parte → una spesa "compensi" nei Costi
-- ---------------------------------------------------------------------
create or replace function compenso_workshop(p_workshop uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when w.compenso_tipo = 'fisso' then coalesce(w.compenso_cent, 0)
              when w.compenso_tipo = 'percentuale' then round(coalesce((
                     select sum(i.prezzo_cent) from workshop_iscrizioni i join pagamenti pg on pg.id = i.pagamento_id
                      where i.workshop_id = w.id and i.stato = 'iscritto' and pg.stato = 'pagato'), 0)
                   * coalesce(w.compenso_percentuale, 0) / 100.0)::int
              else 0 end
    from workshop w where w.id = p_workshop;
$$;
revoke all on function compenso_workshop(uuid) from public, anon;
grant execute on function compenso_workshop(uuid) to authenticated;

create or replace function paga_compenso_workshop(p_workshop uuid, p_data date default current_date, p_metodo text default 'bonifico',
                                                  p_documento text default null, p_importo_cent int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare w workshop; v_imp int; v_spesa uuid;
begin
  select * into w from workshop where id = p_workshop for update;
  if w.id is null then raise exception 'workshop_non_trovato'; end if;
  if not is_gestione(w.palestra_id) then raise exception 'non_autorizzato'; end if;
  if w.insegnante_id is not null then raise exception 'insegnante_della_scuola'; end if;   -- va nel cedolino
  if w.compenso_pagato_at is not null then raise exception 'gia_pagato'; end if;
  v_imp := coalesce(p_importo_cent, compenso_workshop(w.id));
  if coalesce(v_imp, 0) <= 0 then raise exception 'importo_zero'; end if;
  insert into spese (palestra_id, descrizione, categoria, importo_cent, data, periodicita, pagata, note)
  values (w.palestra_id, 'Compenso ' || coalesce(nullif(trim(w.insegnante), ''), 'insegnante') || ' — workshop «' || w.titolo || '»',
          'compensi', v_imp, coalesce(p_data, current_date), 'una_tantum', true,
          nullif(trim(concat_ws(' · ', nullif(trim(p_documento), ''), case when p_metodo is not null then 'pagato con ' || p_metodo end)), ''))
  returning id into v_spesa;
  update workshop set compenso_pagato_at = coalesce(p_data, current_date)::timestamptz, compenso_pagato_cent = v_imp,
         compenso_metodo = p_metodo, compenso_documento = nullif(trim(p_documento), ''), compenso_spesa_id = v_spesa
   where id = w.id;
  return v_spesa;
end $$;
revoke all on function paga_compenso_workshop(uuid, date, text, text, int) from public, anon;
grant execute on function paga_compenso_workshop(uuid, date, text, text, int) to authenticated;

-- tolto per sbaglio: via la spesa e il segno di pagato
create or replace function annulla_compenso_workshop(p_workshop uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w workshop;
begin
  select * into w from workshop where id = p_workshop for update;
  if w.id is null then raise exception 'workshop_non_trovato'; end if;
  if not is_gestione(w.palestra_id) then raise exception 'non_autorizzato'; end if;
  if w.compenso_spesa_id is not null then delete from spese where id = w.compenso_spesa_id; end if;
  update workshop set compenso_pagato_at = null, compenso_pagato_cent = null, compenso_metodo = null,
         compenso_documento = null, compenso_spesa_id = null
   where id = w.id;
end $$;
revoke all on function annulla_compenso_workshop(uuid) from public, anon;
grant execute on function annulla_compenso_workshop(uuid) to authenticated;
