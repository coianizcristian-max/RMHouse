-- =====================================================================
-- RMHouse — 113 VELOCITÀ: STATISTICHE SULL'INTERA STAGIONE
-- Le statistiche (Panoramica, Corsi, Economia…) sommano iscritti, prove e presenze di tutte le
-- lezioni del periodo. Lo facevano lezione per lezione, con 4 conteggi ciascuna: su una stagione
-- intera (3.500 lezioni) erano 14.000 conteggi e 4-5 secondi a pagina.
-- Ora i conteggi si fanno in un passaggio solo (occupazione_periodo): sotto il mezzo secondo.
-- Il Calendario e l'Agenda, che guardano una settimana, restano come sono.
-- Si può eseguire più volte. Va dopo la 112.
-- =====================================================================

-- le lezioni di un periodo con i loro numeri, calcolati in blocco
create or replace function occupazione_periodo(p_palestra uuid, p_dal date, p_al date)
returns table (lezione_id uuid, palestra_id uuid, corso_id uuid, data date, inizio timestamptz, fine timestamptz, stato stato_lezione,
               insegnante_id uuid, sala_id uuid, capienza int, iscritti bigint, prove bigint, presenti bigint, assenti bigint, ore numeric)
language sql stable set search_path = public as $$
  with lez as (
    select l.id, l.palestra_id, l.corso_id, l.data, l.inizio, l.fine, l.stato, l.insegnante_id, l.sala_id,
           coalesce(l.capienza_override, c.capienza, s.capienza) capienza,
           round(extract(epoch from (l.fine - l.inizio)) / 3600.0, 2) ore
      from lezioni l join corsi c on c.id = l.corso_id left join sale s on s.id = l.sala_id
     where l.palestra_id = p_palestra and l.data between p_dal and p_al
  ),
  part as (
    select vp.lezione_id, count(*) filter (where vp.tipo <> 'prova') iscritti, count(*) filter (where vp.tipo = 'prova') prove
      from v_partecipanti_lezione vp join lez on lez.id = vp.lezione_id
     group by vp.lezione_id
  ),
  pres as (
    select ps.lezione_id, count(*) filter (where ps.presente) presenti, count(*) filter (where not ps.presente) assenti
      from presenze ps join lez on lez.id = ps.lezione_id
     group by ps.lezione_id
  )
  select lez.id, lez.palestra_id, lez.corso_id, lez.data, lez.inizio, lez.fine, lez.stato, lez.insegnante_id, lez.sala_id, lez.capienza,
         coalesce(part.iscritti, 0), coalesce(part.prove, 0), coalesce(pres.presenti, 0), coalesce(pres.assenti, 0), lez.ore
    from lez left join part on part.lezione_id = lez.id left join pres on pres.lezione_id = lez.id;
$$;
grant execute on function occupazione_periodo(uuid, date, date) to authenticated;

do $$
declare v text; v0 text;
begin
  -- Panoramica e le pagine delle statistiche
  v := pg_get_functiondef('cruscotto(uuid, date, date)'::regprocedure); v0 := v;
  if v not ilike '%occupazione_periodo%' then
    v := replace(v, 'from v_occupazione where palestra_id = p_palestra and stato = ''programmata'' and data between p_dal and p_al)',
                    'from occupazione_periodo(p_palestra, p_dal, p_al) where stato = ''programmata'')');
    v := replace(v, $a$                from v_occupazione o join staff st on st.id = o.insegnante_id
               where o.palestra_id = p_palestra and o.stato = 'programmata' and o.data between p_dal and p_al)$a$,
                    $a$                from occupazione_periodo(p_palestra, p_dal, p_al) o join staff st on st.id = o.insegnante_id
               where o.stato = 'programmata')$a$);
    if v = v0 then raise exception 'cruscotto: testo non trovato'; end if;
    execute v;
  end if;
  -- Corsi: economia per corso
  v := pg_get_functiondef('economia_corsi(uuid, date, date)'::regprocedure); v0 := v;
  if v not ilike '%occupazione_periodo%' then
    v := replace(v, $a$    from v_occupazione o
    left join staff st on st.id = o.insegnante_id
    left join sale sa on sa.id = o.sala_id
    where o.palestra_id = p_palestra and o.stato = 'programmata' and o.data between p_dal and p_al$a$,
                    $a$    from occupazione_periodo(p_palestra, p_dal, p_al) o
    left join staff st on st.id = o.insegnante_id
    left join sale sa on sa.id = o.sala_id
    where o.stato = 'programmata'$a$);
    if v = v0 then raise exception 'economia_corsi: testo non trovato'; end if;
    execute v;
  end if;
  -- Corsi: sale e insegnanti
  v := pg_get_functiondef('statistiche_sale(uuid, date, date)'::regprocedure); v0 := v;
  if v not ilike '%occupazione_periodo%' then
    v := replace(v, $a$  left join v_occupazione o on o.sala_id = s.id and o.data between p_dal and p_al and o.stato = 'programmata'$a$,
                    $a$  left join occupazione_periodo(p_palestra, p_dal, p_al) o on o.sala_id = s.id and o.stato = 'programmata'$a$);
    if v = v0 then raise exception 'statistiche_sale: testo non trovato'; end if;
    execute v;
  end if;
  v := pg_get_functiondef('statistiche_insegnanti(uuid, date, date)'::regprocedure); v0 := v;
  if v not ilike '%occupazione_periodo%' then
    v := replace(v, $a$  left join v_occupazione o on o.insegnante_id = st.id and o.data between p_dal and p_al and o.stato = 'programmata'$a$,
                    $a$  left join occupazione_periodo(p_palestra, p_dal, p_al) o on o.insegnante_id = st.id and o.stato = 'programmata'$a$);
    if v = v0 then raise exception 'statistiche_insegnanti: testo non trovato'; end if;
    execute v;
  end if;
end $$;
