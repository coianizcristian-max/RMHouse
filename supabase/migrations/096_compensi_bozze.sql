-- 096 · Compensi: eliminare le bozze di un mese (es. calcolo lanciato per sbaglio)
-- Toglie solo i cedolini ancora in "bozza" (non approvati, non pagati), con le loro righe.
-- Rieseguibile.

create or replace function elimina_bozze_compensi(p_palestra uuid, p_anno int, p_mese int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  delete from compensi_righe r using compensi c
   where r.compenso_id = c.id and c.palestra_id = p_palestra and c.anno = p_anno and c.mese = p_mese and c.stato = 'bozza';
  delete from compensi where palestra_id = p_palestra and anno = p_anno and mese = p_mese and stato = 'bozza';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function elimina_bozze_compensi(uuid, int, int) from public, anon;
grant execute on function elimina_bozze_compensi(uuid, int, int) to authenticated;
