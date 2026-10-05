-- =====================================================================
-- RMHouse — 120 RIMBORSO AUTO (o trasferta) NELLE REGOLE DI COMPENSO
-- Alcuni insegnanti ricevono un importo fisso per ogni GIORNO in cui hanno lezione (rimborso auto),
-- a volte solo per le lezioni dei corsi, solo per le private, solo per un corso o una disciplina, o solo in una sede.
-- Nuovo tipo di regola 'rimborso_giorno':
--   • importo_cent = quanto vale un giorno; massimo_cent (facoltativo) = tetto al mese
--   • ambito: tutte (corsi e private) · corsi (solo lezioni dei corsi) · private · corso · disciplina
--   • sede_id (facoltativo) = solo i giorni con una lezione in quella sede
-- Un giorno si paga una volta sola: se più regole valgono nello stesso giorno, vale quella con l'importo più alto.
-- Contano solo le lezioni contate nel cedolino (confermate, tenute da lei, anche se dentro un forfait).
-- Sul cedolino: una riga "Rimborso auto" per giorno; il totale dei rimborsi anche a parte (compensi.rimborsi_cent).
-- Si può eseguire più volte. Va dopo la 119.
-- =====================================================================

alter table regole_compenso add column if not exists sede_id uuid references sedi(id) on delete set null;
alter table compensi add column if not exists rimborsi_cent integer not null default 0;

alter table regole_compenso drop constraint if exists regole_compenso_tipo_check;
alter table regole_compenso add constraint regole_compenso_tipo_check
  check (tipo = any (array['ora', 'lezione', 'fasce', 'a_persona', 'privata', 'forfait_mese', 'fisso_mese', 'rimborso_giorno']));
alter table regole_compenso drop constraint if exists regole_compenso_ambito_check;
alter table regole_compenso add constraint regole_compenso_ambito_check
  check (ambito = any (array['tutte', 'corso', 'disciplina', 'private', 'corsi']));
alter table compensi_righe drop constraint if exists compensi_righe_stato_check;
alter table compensi_righe add constraint compensi_righe_stato_check
  check (stato = any (array['contata', 'da_verificare', 'forfait', 'sostituita', 'mensile', 'rimborso']));

-- regola_per: l'ambito 'corsi' = tutte le lezioni dei corsi, non le private
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('regola_per(uuid, uuid, uuid, boolean, date, text[])'::regprocedure); v0 := v;
  if v not like '%''corsi''%' then
    v := replace(v, 'when ''private'' then p_privata', 'when ''private'' then p_privata
           when ''corsi'' then not p_privata');
    if v = v0 then raise exception 'regola_per: testo non trovato'; end if;
    execute v;
  end if;
end $$;

-- calcola_compensi: i rimborsi del giorno, dopo lezioni e private e prima degli importi mensili
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('calcola_compensi(uuid, integer, integer)'::regprocedure); v0 := v;
  if v not like '%rimborso_giorno%' then
    v := replace(v, 'v_forf int; v_stato text; v_conta boolean; v_forfait regole_compenso;',
                    'v_forf int; v_stato text; v_conta boolean; v_forfait regole_compenso; rb record; v_rimb int; v_imp int;');
    v := replace(v, '    -- importi mensili: forfait dei corsi e fissi',
'    -- rimborso auto / trasferta: un importo per ogni giorno con almeno una lezione contata che rientra nella regola.
    -- Un giorno si paga una volta (la regola con l''importo più alto); il massimo della regola vale sul mese.
    v_rimb := 0;
    for rb in
      with giorni as (
        select r.data, x.corso_id, c.disciplina_id, coalesce(sa.sede_id, c.sede_id) as sede_id, (r.richiesta_id is not null) as privata
          from compensi_righe r
          left join lezioni x on x.id = r.lezione_id
          left join corsi c on c.id = x.corso_id
          left join sale sa on sa.id = x.sala_id
         where r.compenso_id = v_id and r.stato in (''contata'', ''forfait'') and r.data between v_dal and v_al
      ), scelte as (
        select distinct on (g.data) g.data, rr.id as regola_id, rr.importo_cent, rr.massimo_cent, rr.nota
          from giorni g
          join regole_compenso rr on rr.staff_id = st.id and rr.attiva and rr.tipo = ''rimborso_giorno''
           and (rr.dal is null or g.data >= rr.dal) and (rr.al is null or g.data <= rr.al)
           and (case rr.ambito when ''corso'' then rr.corso_id = g.corso_id
                               when ''disciplina'' then rr.disciplina_id = g.disciplina_id
                               when ''private'' then g.privata
                               when ''corsi'' then not g.privata
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
      values (v_id, p_palestra, st.id, rb.data, ''Rimborso auto'', 0, ''rimborso'',
              ''rimborso del giorno''
              || case when rb.nota is not null and rb.nota <> '''' then '' · '' || rb.nota else '''' end
              || case when v_imp < coalesce(rb.importo_cent, 0) then '' · raggiunto il massimo del mese'' else '''' end,
              v_imp);
      v_rimb := v_rimb + v_imp;
    end loop;

    -- importi mensili: forfait dei corsi e fissi');
    v := replace(v, 'base_cent = v_base + v_forf,', 'base_cent = v_base + v_forf + v_rimb, rimborsi_cent = v_rimb,');
    v := replace(v, 'totale_cent = v_base + v_forf + extra_cent,', 'totale_cent = v_base + v_forf + v_rimb + extra_cent,');
    v := replace(v, 'totale_cent is distinct from v_base + v_forf + extra_cent', 'totale_cent is distinct from v_base + v_forf + v_rimb + extra_cent');
    if v = v0 or v not like '%v_rimb + extra_cent,%' or v not like '%rimborsi_cent = v_rimb%' or v not like '%rb record; v_rimb int%' then
      raise exception 'calcola_compensi: testo non trovato';
    end if;
    execute v;
  end if;
end $$;

-- nel dettaglio del cedolino i rimborsi vanno in fondo, in ordine di giorno
create or replace function dettaglio_compenso(p_id uuid)
returns table(data date, inizio timestamptz, corso text, ore numeric, presenti integer, prenotati integer, stato text,
              sostituzione text, regola text, importo_cent integer)
language sql stable security definer set search_path = public as $$
  select r.data, r.inizio, r.corso, r.ore, r.presenti, r.prenotati, r.stato, r.sostituzione, r.regola, r.importo_cent
    from compensi_righe r join compensi c on c.id = r.compenso_id
   where r.compenso_id = p_id
     and (is_gestione(c.palestra_id) or c.staff_id in (select id from staff where user_id = auth.uid()))
   order by case r.stato when 'mensile' then 0 when 'rimborso' then 2 else 1 end, r.inizio nulls first, r.data;
$$;
