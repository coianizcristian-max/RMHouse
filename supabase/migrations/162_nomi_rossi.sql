-- 162 — Nome in rosso per chi è iscritto e non ha pagato, in tutto il gestionale
-- Una sola lettura con tutte le persone che hanno un problema di pagamento:
-- • da_saldare: incassi "non pagato" / in attesa e rate scadute (come "Da saldare" in home);
-- • senza_incasso: abbonamento attivo che costa qualcosa ma non ha nessun incasso collegato (solo segreteria e
--   amministrazione: spesso è un pagamento fatto in APP Palestre e non abbinato).
-- Gli insegnanti vedono chi, non quanto. Si può rilanciare.

-- senza palestra: quella di chi è entrato
drop function if exists pagamenti_da_sistemare(uuid);
create or replace function pagamenti_da_sistemare(p_palestra uuid default null)
returns table (allievo_id uuid, da_saldare boolean, totale_cent int, senza_incasso boolean)
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v_gest boolean;
begin
  p_palestra := coalesce(p_palestra, (select x from palestre_staff() x limit 1));
  if p_palestra is null or not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  v_gest := is_gestione(p_palestra);
  return query
    with d as (select v.allievo_id, sum(v.importo_cent)::int as tot from voci_da_saldare(p_palestra, null) v group by v.allievo_id),
         s as (select distinct x.allievo_id from senza_incasso(p_palestra, null) x where v_gest)
    select coalesce(d.allievo_id, s.allievo_id), d.allievo_id is not null, case when v_gest then d.tot end, s.allievo_id is not null
      from d full join s on s.allievo_id = d.allievo_id;
end $$;
revoke all on function pagamenti_da_sistemare(uuid) from public, anon;
grant execute on function pagamenti_da_sistemare(uuid) to authenticated;

notify pgrst, 'reload schema';
