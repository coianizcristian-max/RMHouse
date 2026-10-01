-- =====================================================================
-- RMHouse — 054 IL RECUPERO SOLO A CHI DISDICE DA SOLO, DALL'APP
-- Chi riceve il recupero:
--   'app'    solo chi disdice da solo dall'area clienti, entro le N ore
--   'avviso' anche chi avvisa la segreteria ("ha avvisato" in appello)
--   'sempre' anche chi manca senza avvisare
-- RM House: 'app'. La segreteria può ancora segnare "ha avvisato" per
-- liberare il posto, ma senza recupero.
-- Si può eseguire più volte. Va dopo la 053 (nessuna query) / 052.
-- =====================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'palestre' and column_name = 'recupero_da') then
    alter table palestre add column recupero_da text not null default 'avviso';
    -- si parte da quanto già scelto con la casella
    update palestre set recupero_da = case when recupero_solo_disdetta then 'avviso' else 'sempre' end;
    update palestre set recupero_da = 'app' where slug = 'rmhouse';
  end if;
end $$;
do $$ begin
  alter table palestre add constraint palestre_recupero_da_check check (recupero_da in ('app', 'avviso', 'sempre'));
exception when duplicate_object then null; end $$;

-- la vecchia casella segue la scelta nuova (la usa il trigger delle assenze)
create or replace function trg_palestre_recupero_da()
returns trigger language plpgsql as $$
begin
  new.recupero_solo_disdetta := new.recupero_da <> 'sempre';
  return new;
end $$;
drop trigger if exists palestre_recupero_da on palestre;
create trigger palestre_recupero_da before insert or update of recupero_da on palestre
  for each row execute function trg_palestre_recupero_da();
update palestre set recupero_da = recupero_da;

-- "Non vengo" / "ha avvisato": il recupero nasce solo se lo prevede la scelta della scuola
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('disdici_lezione(uuid, uuid)'::regprocedure);
  if v_def not ilike '%recupero_da%' then
    v_def := replace(v_def,
      $a$  if coalesce(t.recuperi_max, 1) <> 0 then$a$,
      $a$  -- dalla segreteria il recupero c'è solo se la scuola lo prevede (recupero_da)
  if coalesce(t.recuperi_max, 1) <> 0
     and (not v_gest or coalesce((select recupero_da from palestre where id = l.palestra_id), 'avviso') <> 'app') then$a$);
    execute v_def;
  end if;
end $$;
