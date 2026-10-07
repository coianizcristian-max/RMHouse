-- =====================================================================
-- RMHouse — 143 FAMIGLIE DEGLI ABBONAMENTI: SCELTE DA UN ELENCO, NON SCRITTE A MANO
-- La "famiglia" (Street e Danza adulti, Aerea Kids e Teen…) serve solo a raggruppare gli abbonamenti negli elenchi
-- (filtri, Sportello, scheda persona, Corsi coperti, Recuperi). Scritta a mano creava doppioni
-- ("Street  e Danza Kids e Teen" con due spazi, "Kids/Teen" e "Kids e Teen").
-- • da ora: spazi puliti e, se esiste già la stessa famiglia scritta con maiuscole diverse, si usa quella;
-- • i nomi già scritti vengono puliti allo stesso modo;
-- • rinomina_famiglia: cambia (o unisce a un'altra) una famiglia su tutti i suoi abbonamenti in un colpo.
-- Si può eseguire più volte.
-- =====================================================================

create or replace function trg_famiglia_pulita() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  new.famiglia := nullif(regexp_replace(btrim(coalesce(new.famiglia, '')), '\s+', ' ', 'g'), '');
  if new.famiglia is not null then
    select x.famiglia into v from tipi_abbonamento x
     where x.palestra_id = new.palestra_id and x.id is distinct from new.id and lower(x.famiglia) = lower(new.famiglia)
     group by x.famiglia order by count(*) desc, x.famiglia limit 1;
    if v is not null then new.famiglia := v; end if;
  end if;
  return new;
end $$;

drop trigger if exists famiglia_pulita on tipi_abbonamento;
create trigger famiglia_pulita before insert or update of famiglia on tipi_abbonamento
  for each row execute function trg_famiglia_pulita();

-- nomi già scritti: spazi puliti, poi la grafia più usata
update tipi_abbonamento set famiglia = nullif(regexp_replace(btrim(famiglia), '\s+', ' ', 'g'), '')
 where famiglia is not null and famiglia is distinct from nullif(regexp_replace(btrim(famiglia), '\s+', ' ', 'g'), '');
with conta as (
  select palestra_id, lower(famiglia) k, famiglia, count(*) n from tipi_abbonamento where famiglia is not null group by 1, 2, 3
), ufficiale as (
  select distinct on (palestra_id, k) palestra_id, k, famiglia from conta order by palestra_id, k, n desc, famiglia
)
update tipi_abbonamento t set famiglia = u.famiglia from ufficiale u
 where t.palestra_id = u.palestra_id and lower(t.famiglia) = u.k and t.famiglia <> u.famiglia;

-- rinomina (o unisce) una famiglia: tutti i suoi abbonamenti passano al nuovo nome
create or replace function rinomina_famiglia(p_palestra uuid, p_da text, p_a text)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_a text := nullif(regexp_replace(btrim(coalesce(p_a, '')), '\s+', ' ', 'g'), '');
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  -- se la destinazione esiste già (anche con maiuscole diverse) si usa la sua grafia: è un'unione
  select coalesce((select x.famiglia from tipi_abbonamento x where x.palestra_id = p_palestra and lower(x.famiglia) = lower(v_a)
                    and lower(x.famiglia) <> lower(coalesce(p_da, '')) limit 1), v_a) into v_a;
  update tipi_abbonamento set famiglia = v_a
   where palestra_id = p_palestra and (famiglia = p_da or (p_da is null and famiglia is null) or (p_da = '' and famiglia is null));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function rinomina_famiglia(uuid, text, text) from public, anon;
grant execute on function rinomina_famiglia(uuid, text, text) to authenticated;
