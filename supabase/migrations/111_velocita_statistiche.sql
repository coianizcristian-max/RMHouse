-- =====================================================================
-- RMHouse — 111 VELOCITÀ: STATISTICHE, ATTIVITÀ DELLO STAFF E COMPILAZIONE JIT
-- • Il database "compilava" (JIT) le query delle pagine con tante regole di accesso:
--   la compilazione costava più della query (Calendario: 2,6 secondi di cui 2,5 di compilazione).
--   Si spegne per questo database: le query restano identiche, solo senza quel passaggio.
-- • Andamento mensile (Statistiche → Iscrizioni / Frequenza): contava i partecipanti lezione per
--   lezione (3.500 conteggi a stagione); ora li conta in un passaggio solo.
-- • Attività dello staff: "lezioni senza appello" rifaceva il conto dei partecipanti di tutte le
--   lezioni per ogni insegnante; ora guarda direttamente iscritti, prenotazioni e prove della lezione.
-- Si può eseguire più volte. Va dopo la 110.
-- =====================================================================

do $$ begin execute format('alter database %I set jit = off', current_database()); end $$;

-- andamento mensile: partecipanti contati in un passaggio
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('andamento_mensile(uuid, integer)'::regprocedure); v0 := v;
  if v not ilike '%conta_partecipanti%' then
    v := replace(v,
$a$           (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') iscritti
      from lezioni l join corsi c on c.id = l.corso_id left join sale s on s.id = l.sala_id
     where l.palestra_id = p_palestra and l.stato = 'programmata'$a$,
$a$           coalesce(cp.n, 0) iscritti   -- conta_partecipanti: un passaggio solo
      from lezioni l join corsi c on c.id = l.corso_id left join sale s on s.id = l.sala_id
      left join (select vp.lezione_id, count(*) n
                   from v_partecipanti_lezione vp join lezioni l2 on l2.id = vp.lezione_id
                  where l2.palestra_id = p_palestra and l2.stato = 'programmata' and vp.tipo <> 'prova'
                    and l2.data >= (select min(m) from mesi) and l2.data < (select max(m) from mesi) + interval '1 month'
                  group by vp.lezione_id) cp on cp.lezione_id = l.id
     where l.palestra_id = p_palestra and l.stato = 'programmata'$a$);
    if v = v0 then raise exception 'andamento_mensile: testo non trovato'; end if;
    execute v;
  end if;
end $$;

-- attività dello staff: lezioni senza appello
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('eventi_staff(uuid, uuid, date, date)'::regprocedure); v0 := v;
  if v not ilike '%prenotazioni p where p.lezione_id = l.id and p.stato = ''confermata''%' then
    v := replace(v,
$a$   where l.palestra_id = p_palestra and coalesce(l.svolta_da, l.insegnante_id) = s.id and l.stato <> 'annullata'
     and l.data between p_dal and p_al and l.fine < now() and l.appello_at is null
     and not exists (select 1 from presenze ps where ps.lezione_id = l.id)
     and exists (select 1 from v_partecipanti_lezione vp where vp.lezione_id = l.id);$a$,
$a$   where l.palestra_id = p_palestra and (l.svolta_da = s.id or (l.svolta_da is null and l.insegnante_id = s.id)) and l.stato <> 'annullata'
     and l.data between p_dal and p_al and l.fine < now() and l.appello_at is null
     and not exists (select 1 from presenze ps where ps.lezione_id = l.id)
     and (exists (select 1 from iscrizioni_orari io join iscrizioni i on i.id = io.iscrizione_id
                   where io.orario_id = l.orario_id and i.stato in ('attiva', 'scaduta') and l.data between i.data_inizio and i.data_fine)
          or exists (select 1 from prenotazioni p where p.lezione_id = l.id and p.stato = 'confermata')
          or exists (select 1 from prove pr where pr.lezione_id = l.id and pr.stato in ('confermata', 'presente', 'assente')));$a$);
    if v = v0 then raise exception 'eventi_staff: testo non trovato'; end if;
    execute v;
  end if;
end $$;

-- giorni dell'abbonamento: la regola cercava l'abbonamento riga per riga (9.000 ricerche in una statistica);
-- ora prende in un colpo la lista degli abbonamenti che si possono vedere
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'iscrizioni_orari' and policyname = 'staff_legge') then
    alter policy staff_legge on iscrizioni_orari using (
      iscrizione_id in (select i.id from iscrizioni i where i.palestra_id in (select palestre_staff()) or i.allievo_id in (select miei_allievi())));
  end if;
  if exists (select 1 from pg_policies where tablename = 'iscrizioni_orari' and policyname = 'gestione_scrive') then
    alter policy gestione_scrive on iscrizioni_orari
      using (iscrizione_id in (select i.id from iscrizioni i where i.palestra_id in (select palestre_gestione())))
      with check (iscrizione_id in (select i.id from iscrizioni i where i.palestra_id in (select palestre_gestione())));
  end if;
end $$;
