-- =====================================================================
-- RMHouse — 137 GRUPPI DENTRO UN CORSO
-- Un corso può avere più gruppi con giorni e insegnanti diversi (es. Pole Dance Liv.1: serale con Eloise,
-- serale con Liuda, pausa pranzo con Liuda) senza creare corsi nuovi né nuovi abbinamenti agli abbonamenti.
-- • orari.gruppo: il nome del gruppo, lo scrive la segreteria (vuoto = corso senza gruppi).
-- • Iscrizione dall'app (carta, Satispay, bonifico): i giorni scelti di quel corso devono essere tutti dello
--   stesso gruppo ("gruppi_diversi"). Mescolare gruppi lo può fare solo la segreteria (scheda persona, Sportello).
-- Si può eseguire più volte.
-- =====================================================================

alter table orari add column if not exists gruppo text;
update orari set gruppo = null where gruppo is not null and btrim(gruppo) = '';

do $$
declare
  v_def text; v_nuova text;
begin
  -- 1) carta / Satispay dall'app
  select pg_get_functiondef('prepara_acquisto'::regproc) into v_def;
  if position('gruppi_diversi' in v_def) > 0 then
    raise notice 'prepara_acquisto: già aggiornata';
  else
    v_nuova := replace(v_def,
      'cardinality(v_orari) > t.lezioni_settimanali then raise exception ''troppi_giorni''; end if;',
      'cardinality(v_orari) > t.lezioni_settimanali then raise exception ''troppi_giorni''; end if;
  -- i giorni del corso scelto devono essere tutti dello stesso gruppo (mescolare lo fa la segreteria)
  if (select count(distinct coalesce(x.gruppo, '''')) from orari x where x.id = any (v_orari) and x.corso_id = c.id) > 1 then
    raise exception ''gruppi_diversi'';
  end if;');
    if v_nuova <> v_def then execute v_nuova; raise notice 'prepara_acquisto: aggiornata';
    else raise warning 'prepara_acquisto: testo atteso non trovato, NON aggiornata'; end if;
  end if;

  -- 2) bonifico dall'app
  select pg_get_functiondef('richiedi_abbonamento'::regproc) into v_def;
  if position('gruppi_diversi' in v_def) > 0 then
    raise notice 'richiedi_abbonamento: già aggiornata';
  else
    v_nuova := replace(v_def,
      'coalesce(array_length(p_orari, 1), 0) > t.lezioni_settimanali then raise exception ''troppi_giorni''; end if;',
      'coalesce(array_length(p_orari, 1), 0) > t.lezioni_settimanali then raise exception ''troppi_giorni''; end if;
  if (select count(distinct coalesce(x.gruppo, '''')) from orari x where x.id = any (coalesce(p_orari, ''{}'')) and x.corso_id = p_corso) > 1 then
    raise exception ''gruppi_diversi'';
  end if;');
    if v_nuova <> v_def then execute v_nuova; raise notice 'richiedi_abbonamento: aggiornata';
    else raise warning 'richiedi_abbonamento: testo atteso non trovato, NON aggiornata'; end if;
  end if;
end $$;
