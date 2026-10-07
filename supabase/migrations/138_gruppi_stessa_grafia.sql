-- =====================================================================
-- RMHouse — 138 GRUPPI: STESSO NOME = STESSO GRUPPO
-- "Serale Eloise", "serale eloise" e "Serale  Eloise " sono lo stesso gruppo:
-- • i nomi già scritti vengono uniformati, corso per corso, alla grafia più usata;
-- • da ora ogni orario salvato prende da solo la grafia del gruppo che c'è già nel corso (spazi doppi tolti);
-- • il controllo "gruppi_diversi" dell'iscrizione dall'app non guarda più maiuscole e spazi.
-- Non cambia nient'altro. Si può eseguire più volte.
-- =====================================================================

-- 1) nomi già scritti: spazi puliti, poi la grafia più usata nel corso
update orari set gruppo = nullif(regexp_replace(btrim(gruppo), '\s+', ' ', 'g'), '')
 where gruppo is not null and gruppo is distinct from nullif(regexp_replace(btrim(gruppo), '\s+', ' ', 'g'), '');

with conta as (
  select corso_id, lower(gruppo) as k, gruppo, count(*) as n
    from orari where gruppo is not null group by 1, 2, 3
), ufficiale as (
  select distinct on (corso_id, k) corso_id, k, gruppo from conta order by corso_id, k, n desc, gruppo
)
update orari o set gruppo = u.gruppo
  from ufficiale u
 where o.corso_id = u.corso_id and lower(o.gruppo) = u.k and o.gruppo <> u.gruppo;

-- 2) da ora: ogni orario salvato prende la grafia del gruppo che c'è già nel corso
create or replace function orari_gruppo_grafia() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  new.gruppo := nullif(regexp_replace(btrim(coalesce(new.gruppo, '')), '\s+', ' ', 'g'), '');
  if new.gruppo is not null then
    select x.gruppo into v from orari x
     where x.corso_id = new.corso_id and x.id is distinct from new.id and lower(x.gruppo) = lower(new.gruppo)
     group by x.gruppo order by count(*) desc, x.gruppo limit 1;
    if v is not null then new.gruppo := v; end if;
  end if;
  return new;
end $$;

drop trigger if exists orari_gruppo_grafia on orari;
create trigger orari_gruppo_grafia before insert or update of gruppo, corso_id on orari
  for each row execute function orari_gruppo_grafia();

-- 3) il controllo dell'iscrizione dall'app non guarda maiuscole e spazi
do $$
declare
  v_def text; v_nuova text; f text;
begin
  foreach f in array array['prepara_acquisto', 'richiedi_abbonamento'] loop
    select pg_get_functiondef(f::regproc) into v_def;
    if position('count(distinct lower(btrim(coalesce(x.gruppo' in v_def) > 0 then
      raise notice '%: già aggiornata', f;
    elsif position('count(distinct coalesce(x.gruppo, ''''))' in v_def) > 0 then
      v_nuova := replace(v_def, 'count(distinct coalesce(x.gruppo, ''''))', 'count(distinct lower(btrim(coalesce(x.gruppo, ''''))))');
      execute v_nuova; raise notice '%: aggiornata', f;
    else
      raise warning '%: testo atteso non trovato (manca la 137?), NON aggiornata', f;
    end if;
  end loop;
end $$;
