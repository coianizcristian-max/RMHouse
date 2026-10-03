-- 099 · Cambio insegnante: avvisati anche gli altri di segreteria e amministrazione
-- Prima: se l'insegnante si faceva sostituire, l'avviso arrivava alla segreteria; se il cambio lo faceva
-- la segreteria, lo sapevano solo le due insegnanti. Ora lo sanno sempre anche gli altri di segreteria
-- e amministrazione (non chi ha fatto il cambio). Le sostituzioni dei prossimi giorni sono anche nella home.
-- Rieseguibile.
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('sostituisci_lezione(uuid, uuid, boolean, date, boolean)'::regprocedure);
  v0 := v;
  if v not ilike '%lez-camb:%' then
    v := replace(v, '      -- a chi le lascia',
'      -- agli altri di segreteria e amministrazione
      perform accoda_push_staff(l.palestra_id, ''lezione'', ''Cambio insegnante'',
        trim(io.nome || '' '' || coalesce(io.cognome, '''')) || '' ha messo '' ||
        coalesce(trim(nuova.nome || '' '' || coalesce(nuova.cognome, '''')), ''nessuno'') || '' al posto di '' ||
        coalesce((select trim(x.nome || '' '' || coalesce(x.cognome, '''')) from staff x where x.id = l.insegnante_id), ''nessuno'') ||
        '' · '' || v_quando || v_periodo,
        ''/gestione/appello/'' || l.id, null, s2.id, ''lez-camb:'' || l.id || '':'' || s2.id || '':'' || extract(epoch from now())::bigint)
        from staff s2
       where s2.palestra_id = l.palestra_id and s2.attivo and not coalesce(s2.archiviato, false)
         and s2.ruolo::text in (''admin'', ''segreteria'') and s2.id <> io.id;
      -- a chi le lascia');
    if v = v0 then raise exception 'sostituisci_lezione: punto da modificare non trovato (manca la 098?)'; end if;
    execute v;
  end if;
end $$;
