-- =====================================================================
-- RMHouse — 133 FESTIVITÀ PROPOSTE E CONFERMATE
--
-- aggiungi_chiusure(palestra, righe): salva in un colpo le chiusure confermate dalla segreteria
-- (le festività proposte, tolte o corrette, più quelle aggiunte a mano).
--  • una chiusura che si sovrappone a una già presente non si duplica;
--  • le lezioni di quei giorni non si fanno: niente recuperi, scadenze uguali (come ogni chiusura);
--  • per le date lontane (oltre 14 giorni) nessun avviso ai clienti adesso; per quelle vicine sì.
-- Si può eseguire più volte. Va dopo la 132.
-- =====================================================================

create or replace function aggiungi_chiusure(p_palestra uuid, p_righe jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; v_dal date; v_al date;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) order by (value->>'dal') loop
    v_dal := nullif(r->>'dal', '')::date; v_al := coalesce(nullif(r->>'al', '')::date, v_dal);
    continue when v_dal is null or v_al < v_dal;
    continue when exists (select 1 from chiusure ch where ch.palestra_id = p_palestra and ch.dal <= v_al and ch.al >= v_dal);
    perform set_config('rm.chiusura_silenziosa', case when v_dal > current_date + 14 then '1' else '' end, true);
    insert into chiusure (palestra_id, dal, al, motivo) values (p_palestra, v_dal, v_al, nullif(trim(r->>'motivo'), ''));
    n := n + 1;
  end loop;
  perform set_config('rm.chiusura_silenziosa', '', true);
  return n;
end $$;
revoke execute on function aggiungi_chiusure(uuid, jsonb) from public, anon;
grant execute on function aggiungi_chiusure(uuid, jsonb) to authenticated;
