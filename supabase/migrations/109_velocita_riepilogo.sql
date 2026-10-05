-- =====================================================================
-- RMHouse — 109 VELOCITÀ DEL RIEPILOGO (e delle pagine con tante persone)
-- Con ~2.500 persone in archivio il Riepilogo ci metteva 3-4 secondi: le regole di accesso
-- "il cliente vede solo i suoi" venivano ricalcolate sull'intero archivio per ogni lezione
-- della settimana. Ora:
-- • "i miei allievi" si calcola una volta sola (funzione miei_allievi), nelle stesse regole;
-- • i numeri del Riepilogo e delle Statistiche si calcolano in un colpo solo, con il controllo
--   che chi li chiede sia dello staff di quella scuola.
-- Non cambia cosa vede chi: solo la velocità. Si può eseguire più volte.
-- =====================================================================

create or replace function miei_allievi()
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.id from allievi a join account ac on ac.id = a.account_id where ac.user_id = auth.uid();
$$;
grant execute on function miei_allievi() to authenticated;

-- regole "il cliente legge i suoi": stessa regola, scritta in modo che si calcoli una volta
do $$
declare t text;
begin
  foreach t in array array['assegnazioni_postazione', 'assenze_avvisate', 'certificati', 'crediti_recupero', 'firme',
                           'iscrizioni', 'iscrizioni_evento', 'liste_attesa', 'prenotazioni', 'prove', 'quote_iscrizione',
                           'richieste_cliente'] loop
    if exists (select 1 from pg_policies where tablename = t and policyname = 'cliente_legge') then
      execute format('alter policy cliente_legge on %I using (allievo_id in (select miei_allievi()))', t);
    end if;
  end loop;
  if exists (select 1 from pg_policies where tablename = 'liste_attesa' and policyname = 'cliente_annulla') then
    alter policy cliente_annulla on liste_attesa
      using (allievo_id in (select miei_allievi())) with check (allievo_id in (select miei_allievi()));
  end if;
  if exists (select 1 from pg_policies where tablename = 'iscrizioni_orari' and policyname = 'staff_legge') then
    alter policy staff_legge on iscrizioni_orari using (exists (select 1 from iscrizioni i where i.id = iscrizioni_orari.iscrizione_id
      and (is_staff(i.palestra_id) or i.allievo_id in (select miei_allievi()))));
  end if;
end $$;

-- numeri del Riepilogo: calcolati con i diritti del programma, ma solo per lo staff di quella scuola.
-- Il calcolo resta quello di prima (rinominato cruscotto_dati); cruscotto(uuid) controlla chi chiede e lo chiama.
do $$
begin
  if to_regprocedure('cruscotto_dati(uuid)') is null then
    alter function cruscotto(uuid) rename to cruscotto_dati;
  end if;
  alter function cruscotto_dati(uuid) security definer;
  revoke all on function cruscotto_dati(uuid) from public, anon, authenticated;
end $$;

create or replace function cruscotto(p_palestra uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  return cruscotto_dati(p_palestra);
end $$;
grant execute on function cruscotto(uuid) to authenticated;
