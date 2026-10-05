-- =====================================================================
-- RMHouse — 119 NOTA SU UNA LEZIONE (anche su più lezioni insieme dal palinsesto)
-- modifica_lezione impara p_cosa = 'note': scrive o cancella (valore vuoto) la nota di una lezione
-- programmata, senza toccare lo stato. Serve alle azioni di gruppo del palinsesto ("Nota / info").
-- Si può eseguire più volte. Va dopo la 118.
-- =====================================================================

do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('modifica_lezione(uuid, text, text, boolean, boolean)'::regprocedure); v0 := v;
  if v not like '%p_cosa = ''note''%' then
    v := replace(v,
      '  else
    raise exception ''azione_sconosciuta'';',
      '  elsif p_cosa = ''note'' then
    update lezioni set note = nullif(trim(p_valore), '''')
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  else
    raise exception ''azione_sconosciuta'';');
    if v = v0 then raise exception 'modifica_lezione: testo non trovato'; end if;
    execute v;
  end if;
end $$;
