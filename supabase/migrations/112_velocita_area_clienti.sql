-- =====================================================================
-- RMHouse — 112 VELOCITÀ DELL'APP DEI CLIENTI
-- Ogni pagina dell'app chiede "il mio riepilogo" (area_riepilogo) e i materiali delle lezioni.
-- Per trovare le prossime lezioni della famiglia il database ricostruiva l'elenco di tutti i
-- partecipanti di tutte le lezioni (44.000 righe con l'archivio di una scuola vera) e poi
-- teneva le poche della famiglia. Ora parte dalle persone della famiglia: da 86 a 10 millisecondi.
-- Con 500 iscritti che aprono l'app è la differenza fra un server tranquillo e uno in affanno.
-- Si può eseguire più volte. Va dopo la 111.
-- =====================================================================

do $$
declare v text; v0 text;
begin
  -- riepilogo dell'area clienti
  v := pg_get_functiondef('area_riepilogo()'::regprocedure); v0 := v;
  if v not ilike '%v_miei uuid[]%' then
    v := replace(v, 'declare v_acc uuid; v_pal uuid; r jsonb;', 'declare v_acc uuid; v_pal uuid; r jsonb; v_miei uuid[];');
    v := replace(v, $a$  if v_acc is null then return jsonb_build_object('collegato', false); end if;
$a$, $a$  if v_acc is null then return jsonb_build_object('collegato', false); end if;
  v_miei := array(select id from allievi where account_id = v_acc);   -- le persone della famiglia, una volta sola
$a$);
    v := replace(v, $a$        where a.account_id = v_acc and l.inizio > now() and l.inizio < now() + interval '21 days'$a$,
                    $a$        where vp.allievo_id = any (v_miei) and a.account_id = v_acc and l.inizio > now() and l.inizio < now() + interval '21 days'$a$);
    if v = v0 then raise exception 'area_riepilogo: testo non trovato'; end if;
    execute v;
  end if;

  -- materiali delle lezioni
  v := pg_get_functiondef('materiali_area()'::regprocedure); v0 := v;
  if v not ilike '%v_miei uuid[]%' then
    v := replace(v, 'declare v_acc uuid;', 'declare v_acc uuid; v_miei uuid[];');
    v := replace(v, $a$  if v_acc is null then return '[]'::jsonb; end if;
$a$, $a$  if v_acc is null then return '[]'::jsonb; end if;
  v_miei := array(select id from allievi where account_id = v_acc);
$a$);
    v := replace(v, $a$    where a.account_id = v_acc
      and l.stato = 'programmata'$a$, $a$    where vp.allievo_id = any (v_miei) and a.account_id = v_acc
      and l.stato = 'programmata'$a$);
    if v = v0 then raise exception 'materiali_area: testo non trovato'; end if;
    execute v;
  end if;
end $$;
