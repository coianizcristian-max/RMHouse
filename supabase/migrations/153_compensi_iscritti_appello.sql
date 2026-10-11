-- 153 — Compensi e appello
-- • Le regole a soglie / a persona contano gli ISCRITTI alla lezione (chi era atteso, anche se poi non è venuto),
--   non solo i presenti all'appello: regole_compenso.conta può essere 'iscritti' (nuovo, predefinito), 'prenotati'
--   (iscritti meno chi ha avvisato l'assenza) o 'presenti'. Le regole che contavano i presenti passano agli iscritti.
-- • calcola_compensi(palestra, anno, mese, staff): si può ricalcolare un solo insegnante.
-- • imposta_solo_confermate(): la spunta "conta solo le lezioni confermate" (con errore chiaro se non si può).
-- • rendiconto_staff: il compenso stimato segue le regole di ogni insegnante (non più solo la tariffa oraria);
--   rendiconto_dettaglio(): le lezioni giorno per giorno di un insegnante, con il conteggio di ognuna.
-- • settimana_dati: dice se l'appello è stato fatto (cornice nera nel calendario).
-- Si può rilanciare.

alter table regole_compenso drop constraint if exists regole_compenso_conta_check;
alter table regole_compenso add constraint regole_compenso_conta_check check (conta in ('presenti', 'prenotati', 'iscritti'));
alter table regole_compenso alter column conta set default 'iscritti';
do $$ begin
  -- una volta sola: le regole che contavano i presenti passano agli iscritti (si può cambiare regola per regola)
  if not exists (select 1 from regole_compenso where conta = 'iscritti') then
    update regole_compenso set conta = 'iscritti' where conta = 'presenti';
  end if;
end $$;

-- n = presenti, oppure il numero passato come "prenotati" (che per le regole 'iscritti' sono gli iscritti)
create or replace function valore_lezione(r regole_compenso, p_ore numeric, p_presenti integer, p_prenotati integer, p_tariffa integer, out importo integer, out descr text)
returns record
language plpgsql stable as $f$
declare n int; f jsonb;
begin
  if r.id is null then
    importo := round(p_ore * coalesce(p_tariffa, 0)); descr := 'tariffa standard ' || eur_txt(p_tariffa) || '/ora';
    return;
  end if;
  n := case when r.conta in ('prenotati', 'iscritti') then coalesce(p_prenotati, 0) else coalesce(p_presenti, 0) end;
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
end $f$;

-- il calcolo dei cedolini, ora anche per un solo insegnante (la versione a 3 argomenti si toglie: stessa chiamata)
drop function if exists calcola_compensi(uuid, integer, integer);
CREATE OR REPLACE FUNCTION public.calcola_compensi(p_palestra uuid, p_anno integer, p_mese integer, p_staff uuid DEFAULT NULL::uuid)
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
       and (p_staff is null or s.id = p_staff)   -- 153: anche per un solo insegnante
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
             (select count(distinct b.allievo_id) from v_partecipanti_base b where b.lezione_id = x.id)::int as iscritti,
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
      select * into v from valore_lezione(rg, v_ore, l.presenti, case when rg.conta = 'iscritti' then l.iscritti else l.prenotati end, st.tariffa);
      v_stato := case when v_conta then 'contata' else 'da_verificare' end;
      insert into compensi_righe (compenso_id, palestra_id, staff_id, lezione_id, data, inizio, corso, ore, presenti, prenotati, stato, sostituzione, regola, importo_cent)
      values (v_id, p_palestra, st.id, l.id, l.data, l.inizio, l.corso_nome, v_ore, l.presenti, case when rg.conta = 'iscritti' then l.iscritti else l.prenotati end, v_stato,
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
             (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = x.id)::int as prenotati,
             (select count(distinct b.allievo_id) from v_partecipanti_base b where b.lezione_id = x.id)::int as iscritti
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
      select * into v from valore_lezione(rg, v_ore, l.presenti, case when rg.conta = 'iscritti' then l.iscritti else l.prenotati end, st.tariffa);
      insert into compensi_righe (compenso_id, palestra_id, staff_id, lezione_id, data, inizio, corso, ore, presenti, prenotati, stato, sostituzione, regola, importo_cent)
      values (v_id, p_palestra, st.id, l.id, l.data, l.inizio, l.corso_nome, v_ore, l.presenti, case when rg.conta = 'iscritti' then l.iscritti else l.prenotati end, 'contata', null,
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
     and (p_staff is null or c.staff_id = p_staff)
     and c.extra_cent = 0 and not exists (select 1 from compensi_righe r where r.compenso_id = c.id);
  return n;
end $function$;

revoke all on function calcola_compensi(uuid, integer, integer, uuid) from public, anon;
grant execute on function calcola_compensi(uuid, integer, integer, uuid) to authenticated, service_role;

-- la spunta "conta solo le lezioni confermate con l'appello"
create or replace function imposta_solo_confermate(p_palestra uuid, p_valore boolean)
returns boolean
language plpgsql security definer set search_path = public as $f$
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  update palestre set compensi = coalesce(compensi, '{}'::jsonb) || jsonb_build_object('solo_confermate', coalesce(p_valore, true))
   where id = p_palestra;
  return coalesce(p_valore, true);
end $f$;
revoke all on function imposta_solo_confermate(uuid, boolean) from public, anon;
grant execute on function imposta_solo_confermate(uuid, boolean) to authenticated;

-- ogni lezione del periodo di un insegnante, con quanto vale secondo le sue regole (come nel cedolino)
create or replace function lezioni_compenso(p_palestra uuid, p_dal date, p_al date, p_staff uuid default null)
returns table (staff_id uuid, lezione_id uuid, data date, inizio timestamptz, fine timestamptz, corso text, sala text, ore numeric,
               ruolo text, confermata boolean, appello_at timestamptz, presenti int, prenotati int, iscritti int,
               conta text, contate int, regola text, importo_cent int, forfait boolean)
language sql stable security definer set search_path = public as $f$
  with imp as (select coalesce((compensi ->> 'solo_confermate')::boolean, true) as solo from palestre where id = p_palestra),
  l as (
    select x.*, c.nome as corso_nome, c.disciplina_id, sa.nome as sala_nome,
           round((extract(epoch from (x.fine - x.inizio)) / 3600.0)::numeric, 2) as ore_l,
           case when x.svolta_da is not null then x.svolta_da
                when not (select solo from imp) and x.fine <= now() then x.insegnante_id end as tenuta_da
      from lezioni x join corsi c on c.id = x.corso_id left join sale sa on sa.id = x.sala_id
     where x.palestra_id = p_palestra and x.stato <> 'annullata' and x.data between p_dal and p_al
  ), righe as (
    select s.id as sid, l.*,
           (select count(*) from presenze p where p.lezione_id = l.id and p.presente)::int as n_presenti,
           (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id)::int as n_prenotati,
           (select count(distinct b.allievo_id) from v_partecipanti_base b where b.lezione_id = l.id)::int as n_iscritti,
           coalesce(s.compenso_ora_cent, 0) as tariffa
      from staff s join l on l.insegnante_id = s.id or l.tenuta_da = s.id or l.insegnante_titolare = s.id
     where s.palestra_id = p_palestra and (p_staff is null or s.id = p_staff)
  ), con_regola as (
    select r.*, regola_per(r.sid, r.corso_id, r.disciplina_id, false, r.data, array['forfait_mese']) as rf,
                regola_per(r.sid, r.corso_id, r.disciplina_id, false, r.data, array['ora', 'lezione', 'fasce', 'a_persona']) as rg
      from righe r
  )
  select r.sid, r.id, r.data, r.inizio, r.fine, r.corso_nome, r.sala_nome, r.ore_l,
         case when r.tenuta_da is not null and r.tenuta_da <> r.sid then 'tenuta da altri'
              when r.tenuta_da = r.sid and coalesce(r.insegnante_titolare, r.insegnante_id) is not null
                   and coalesce(r.insegnante_titolare, r.insegnante_id) <> r.sid then 'sostituzione'
              else 'sua' end,
         r.tenuta_da = r.sid, r.appello_at, r.n_presenti, r.n_prenotati, r.n_iscritti,
         coalesce((r.rg).conta, 'presenti'),
         case when (r.rg).conta = 'iscritti' then r.n_iscritti when (r.rg).conta = 'prenotati' then r.n_prenotati else r.n_presenti end,
         case when (r.rf).id is not null then 'compresa nel forfait mensile'
              else (valore_lezione(r.rg, r.ore_l, r.n_presenti, case when (r.rg).conta = 'iscritti' then r.n_iscritti else r.n_prenotati end, r.tariffa)).descr end,
         case when r.tenuta_da is distinct from r.sid or (r.rf).id is not null then 0
              else coalesce((valore_lezione(r.rg, r.ore_l, r.n_presenti, case when (r.rg).conta = 'iscritti' then r.n_iscritti else r.n_prenotati end, r.tariffa)).importo, 0) end,
         (r.rf).id is not null
    from con_regola r
   order by r.sid, r.inizio
$f$;
revoke all on function lezioni_compenso(uuid, date, date, uuid) from public, anon, authenticated;

create or replace function rendiconto_dettaglio(p_palestra uuid, p_staff uuid, p_dal date, p_al date)
returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare v jsonb;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.inizio), '[]'::jsonb) into v from lezioni_compenso(p_palestra, p_dal, p_al, p_staff) x;
  return v;
end $f$;
revoke all on function rendiconto_dettaglio(uuid, uuid, date, date) from public, anon;
grant execute on function rendiconto_dettaglio(uuid, uuid, date, date) to authenticated;

-- il rendiconto: stesse colonne di prima, ma il compenso stimato segue le regole
create or replace function rendiconto_staff(p_palestra uuid, p_dal date, p_al date)
returns table (staff_id uuid, nome text, cognome text, foto_url text, previste bigint, minuti_previsti bigint, lezioni bigint, minuti bigint,
               da_confermare bigint, presenze bigint, clienti bigint, tariffa_cent integer, compenso_cent bigint)
language plpgsql stable security definer set search_path = public as $f$
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  return query
  with imp as (select coalesce((compensi ->> 'solo_confermate')::boolean, true) as solo from palestre where id = p_palestra),
  l as (
    select x.*, extract(epoch from (x.fine - x.inizio)) / 60 as minuti_l,
           case when x.svolta_da is not null then x.svolta_da
                when not (select solo from imp) and x.fine <= now() then x.insegnante_id end as tenuta_da
      from lezioni x
     where x.palestra_id = p_palestra and x.stato <> 'annullata' and x.data between p_dal and p_al
  ),
  per as (
    select s.id, s.nome, s.cognome, s.foto_url, s.compenso_ora_cent,
           count(*) filter (where l.insegnante_id = s.id) as previste,
           coalesce(sum(l.minuti_l) filter (where l.insegnante_id = s.id), 0)::bigint as minuti_previsti,
           count(*) filter (where l.tenuta_da = s.id) as svolte,
           coalesce(sum(l.minuti_l) filter (where l.tenuta_da = s.id), 0)::bigint as minuti_svolti,
           count(*) filter (where l.insegnante_id = s.id and l.tenuta_da is null and l.fine <= now()) as da_confermare
      from staff s
      join l on l.insegnante_id = s.id or l.tenuta_da = s.id
     where s.palestra_id = p_palestra
     group by s.id
  ),
  soldi as (select lc.staff_id as sid, sum(lc.importo_cent)::bigint as tot from lezioni_compenso(p_palestra, p_dal, p_al, null) lc group by lc.staff_id)
  select p.id, p.nome, p.cognome, p.foto_url, p.previste, p.minuti_previsti,
         p.svolte, p.minuti_svolti, p.da_confermare,
         (select count(*) from presenze ps join l on l.id = ps.lezione_id where l.tenuta_da = p.id and ps.presente),
         (select count(distinct ps.allievo_id) from presenze ps join l on l.id = ps.lezione_id where l.tenuta_da = p.id and ps.presente),
         p.compenso_ora_cent,
         coalesce((select so.tot from soldi so where so.sid = p.id), 0)::bigint
    from per p
   order by p.minuti_svolti desc, p.minuti_previsti desc;
end $f$;
revoke all on function rendiconto_staff(uuid, date, date) from public, anon;
grant execute on function rendiconto_staff(uuid, date, date) to authenticated;

-- il calendario della settimana, con appello fatto / lezione confermata
CREATE OR REPLACE FUNCTION public.settimana_dati(p_palestra uuid, p_inizio date, p_fine date, p_sala uuid DEFAULT NULL::uuid, p_insegnante uuid DEFAULT NULL::uuid, p_sede uuid DEFAULT NULL::uuid, p_corso uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_lez uuid[];
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  select coalesce(array_agg(o.lezione_id), '{}') into v_lez from v_occupazione o
   where o.palestra_id = p_palestra and o.data between p_inizio and p_fine
     and (p_sala is null or o.sala_id = p_sala) and (p_insegnante is null or o.insegnante_id = p_insegnante)
     and (p_sede is null or o.sede_id = p_sede) and (p_corso is null or o.corso_id = p_corso);
  return jsonb_build_object(
    'lezioni', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', o.lezione_id, 'corso_id', o.corso_id, 'corso_nome', o.corso_nome, 'data', o.data, 'inizio', o.inizio,
                 'fine', o.fine, 'stato', o.stato, 'capienza', o.capienza, 'iscritti', o.iscritti, 'prove', o.prove, 'presenti', o.presenti, 'sala_id', o.sala_id,
                 'sala_nome', o.sala_nome, 'sede_id', o.sede_id, 'sede_nome', o.sede_nome, 'insegnante_id', o.insegnante_id, 'insegnante_nome', o.insegnante_nome,
                 'insegnante_foto', o.insegnante_foto, 'prenotabile', o.prenotabile, 'colore', o.colore, 'note', o.note,
                 -- 153: appello fatto / lezione confermata (cornice nera nel calendario)
                 'appello_at', lz.appello_at, 'svolta_at', lz.svolta_at) order by o.inizio, o.lezione_id)
               from v_occupazione o join lezioni lz on lz.id = o.lezione_id where o.lezione_id = any (v_lez)), '[]'::jsonb),
    'sale', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) order by s.ordine nulls last, s.nome) from sale s where s.palestra_id = p_palestra), '[]'::jsonb),
    'insegnanti', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'cognome', x.cognome) order by x.nome)
                    from staff x where x.palestra_id = p_palestra and x.ruolo = 'insegnante' and x.attivo and x.archiviato = false), '[]'::jsonb),
    'corsi', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'colore', c.colore, 'visibilita', c.visibilita, 'attivo', c.attivo) order by c.nome)
               from corsi c where c.palestra_id = p_palestra), '[]'::jsonb),
    'note', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'data', n.data, 'testo', n.testo) order by n.created_at)
               from note_giorno n where n.palestra_id = p_palestra and n.data between p_inizio and p_fine), '[]'::jsonb),
    'sedi', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) order by s.ordine) from sedi s where s.palestra_id = p_palestra and s.visibile), '[]'::jsonb),
    'chiusure', coalesce((select jsonb_agg(jsonb_build_object('dal', ch.dal, 'al', ch.al, 'motivo', ch.motivo)) from chiusure ch
                  where ch.palestra_id = p_palestra and ch.dal <= p_fine and ch.al >= p_inizio), '[]'::jsonb),
    'facce', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', f.lezione_id, 'allievo_id', f.allievo_id, 'nome', f.nome, 'cognome', f.cognome, 'foto_url', f.foto_url, 'tipo', f.tipo))
               from v_facce_lezione f where f.lezione_id = any (v_lez)), '[]'::jsonb),
    'coda', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', la.lezione_id, 'allievo_id', la.allievo_id, 'stato', la.stato, 'tipo', la.tipo, 'created_at', la.created_at,
                 'allievi', (select jsonb_build_object('nome', a.nome, 'cognome', a.cognome, 'foto_url', a.foto_url) from allievi a where a.id = la.allievo_id)) order by la.created_at)
               from liste_attesa la where la.lezione_id = any (v_lez) and la.stato in ('in_attesa', 'avvisato')), '[]'::jsonb)
  );
end $function$;

revoke all on function settimana_dati(uuid, date, date, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function settimana_dati(uuid, date, date, uuid, uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
