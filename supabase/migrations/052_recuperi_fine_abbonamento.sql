-- =====================================================================
-- RMHouse — 052 RECUPERI: VALGONO FINO ALLA FINE DELL'ABBONAMENTO
--  1. Il recupero si fa entro la scadenza dell'abbonamento; se la persona
--     rinnova, i recuperi non usati passano al nuovo abbonamento.
--     (Per le altre scuole resta possibile "N giorni dalla lezione persa".)
--  2. Corsi aperti a tutti per i recuperi (es. Flexy)
--  3. Stesse regole "dove si recupera" su più abbonamenti in un colpo
-- Si può eseguire più volte. Va dopo la 051.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. QUANTO VALE UN RECUPERO
--    'abbonamento' = fino alla fine dell'abbonamento, poi passa al rinnovo
--    'giorni'      = N giorni dalla lezione persa (campo dell'abbonamento)
-- ---------------------------------------------------------------------
alter table palestre add column if not exists scadenza_recupero text not null default 'giorni';
do $$ begin
  alter table palestre add constraint palestre_scadenza_recupero_check check (scadenza_recupero in ('giorni', 'abbonamento'));
exception when duplicate_object then null; end $$;

-- RM House: fino alla fine dell'abbonamento (solo la prima volta: poi si cambia dalla pagina)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'corsi' and column_name = 'recupero_per_tutti') then
    update palestre set scadenza_recupero = 'abbonamento' where slug = 'rmhouse';
  end if;
end $$;

-- Ogni recupero nuovo prende la scadenza dell'abbonamento
create or replace function trg_crediti_scadenza()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fine date;
begin
  if (select scadenza_recupero from palestre where id = new.palestra_id) = 'abbonamento' then
    select data_fine into v_fine from iscrizioni where id = new.iscrizione_id;
    if v_fine is not null then new.scadenza := v_fine; end if;
  end if;
  return new;
end $$;
drop trigger if exists crediti_scadenza on crediti_recupero;
create trigger crediti_scadenza before insert on crediti_recupero
  for each row execute function trg_crediti_scadenza();

-- Se la scadenza dell'abbonamento si sposta (sospensione, modifica), si spostano anche i recuperi
create or replace function trg_iscrizioni_fine_crediti()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.data_fine is distinct from old.data_fine
     and (select scadenza_recupero from palestre where id = new.palestra_id) = 'abbonamento' then
    update crediti_recupero set scadenza = new.data_fine
     where iscrizione_id = new.id and usato_in is null and not annullato;
  end if;
  return new;
end $$;
drop trigger if exists iscrizioni_fine_crediti on iscrizioni;
create trigger iscrizioni_fine_crediti after update of data_fine on iscrizioni
  for each row execute function trg_iscrizioni_fine_crediti();

-- Rinnovo: i recuperi non usati passano al nuovo abbonamento.
-- È un rinnovo se è segnato come tale, oppure è lo stesso corso, e il vecchio
-- abbonamento è ancora in corso o è scaduto da non più di 15 giorni.
create or replace function trg_iscrizioni_rinnovo_crediti()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato <> 'attiva' or (select scadenza_recupero from palestre where id = new.palestra_id) <> 'abbonamento' then
    return new;
  end if;
  update crediti_recupero cr set iscrizione_id = new.id, scadenza = new.data_fine
    from iscrizioni vecchia
   where cr.iscrizione_id = vecchia.id
     and vecchia.id <> new.id and vecchia.allievo_id = new.allievo_id
     and (vecchia.id = new.rinnovo_di or vecchia.corso_id = new.corso_id)
     and vecchia.data_fine >= new.data_inizio - 15
     and vecchia.data_fine <= new.data_fine
     and cr.usato_in is null and not cr.annullato
     and not exists (select 1 from crediti_recupero x where x.iscrizione_id = new.id and x.lezione_persa_id = cr.lezione_persa_id);
  return new;
end $$;
drop trigger if exists iscrizioni_rinnovo_crediti on iscrizioni;
create trigger iscrizioni_rinnovo_crediti after insert on iscrizioni
  for each row execute function trg_iscrizioni_rinnovo_crediti();

-- I recuperi già esistenti e non usati: scadenza = fine del loro abbonamento
update crediti_recupero cr set scadenza = i.data_fine
  from iscrizioni i, palestre p
 where i.id = cr.iscrizione_id and p.id = cr.palestra_id and p.scadenza_recupero = 'abbonamento'
   and cr.usato_in is null and not cr.annullato and cr.scadenza is distinct from i.data_fine;

-- "Non vengo" risponde con la scadenza vera del recupero
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('disdici_lezione(uuid, uuid)'::regprocedure);
  if v_def not ilike '%scadenza_vera%' then
    v_def := replace(v_def,
      $a$return jsonb_build_object('credito', v_credito is not null, 'scadenza', v_scad);$a$,
      $a$return jsonb_build_object('credito', v_credito is not null,
           'scadenza', (select cr.scadenza from crediti_recupero cr where cr.id = v_credito) /* scadenza_vera */);$a$);
    execute v_def;
  end if;
end $$;

-- L'area clienti sa come vale il recupero
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('disdette_area()'::regprocedure);
  if v_def not ilike '%scadenza_recupero%' then
    v_def := replace(v_def, $a$'ore_disdetta', coalesce($a$,
      $a$'scadenza_recupero', (select p.scadenza_recupero from palestre p where p.id = (select palestra_id from mie limit 1)),
    'ore_disdetta', coalesce($a$);
    execute v_def;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. CORSI APERTI A TUTTI PER I RECUPERI (es. Flexy)
-- ---------------------------------------------------------------------
alter table corsi add column if not exists recupero_per_tutti boolean not null default false;

create or replace function corsi_recupero(p_iscrizione uuid)
returns table (corso_id uuid) language sql stable security definer set search_path = public as $$
  with i as (select * from iscrizioni where id = p_iscrizione),
  regole as (
    select ra.corso_ammesso_id from recuperi_ammessi ra, i
     where (ra.origine = 'corso' and ra.origine_id = i.corso_id)
        or (ra.origine = 'abbonamento' and ra.origine_id = i.tipo_abbonamento_id)
  )
  select corso_ammesso_id from regole
  union
  select i.corso_id from i                                   -- il proprio corso è sempre ammesso
  union
  select c.id from corsi c, i where c.palestra_id = i.palestra_id and c.recupero_per_tutti and c.attivo;
$$;

create or replace function imposta_recupero_per_tutti(p_corso uuid, p_si boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_pal uuid;
begin
  select palestra_id into v_pal from corsi where id = p_corso;
  if v_pal is null or not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  update corsi set recupero_per_tutti = coalesce(p_si, false) where id = p_corso;
end $$;
grant execute on function imposta_recupero_per_tutti(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3. STESSE REGOLE SU PIÙ ABBONAMENTI
-- ---------------------------------------------------------------------
create or replace function imposta_recuperi_ammessi_tanti(p_tipi uuid[], p_corsi uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v uuid; n int := 0;
begin
  foreach v in array coalesce(p_tipi, '{}') loop
    perform imposta_recuperi_ammessi('abbonamento', v, p_corsi);
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function imposta_recuperi_ammessi_tanti(uuid[], uuid[]) to authenticated;
