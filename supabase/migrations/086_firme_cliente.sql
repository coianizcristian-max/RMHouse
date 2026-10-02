-- 086 · Il cliente apre e stampa i suoi documenti firmati
-- Nell'app (Io → Documenti firmati) ogni firma diventa un link alla sua copia, da vedere o salvare in PDF.
-- Serve solo l'id della firma dentro profilo_area. Rieseguibile.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'profilo_area' and n.nspname = 'public' limit 1;
  if position('jsonb_build_object(''id'', f.id, ''titolo'', f.titolo' in d) = 0 then
    execute replace(d, 'jsonb_build_object(''titolo'', f.titolo, ''quando'', f.firmato_at',
                       'jsonb_build_object(''id'', f.id, ''titolo'', f.titolo, ''quando'', f.firmato_at');
  end if;
end $$;
