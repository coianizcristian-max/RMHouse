-- =====================================================================
-- RMHouse — 015 COLORI PER FAMIGLIA
-- Ogni disciplina ha il suo colore di base; i corsi di quella disciplina
-- prendono gradazioni diverse dello stesso colore, così il calendario si
-- legge per famiglia e non ci sono due corsi con la stessa tinta.
-- Da eseguire dopo 001…014.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLORE DI BASE SU CATEGORIE E DISCIPLINE
-- ---------------------------------------------------------------------
alter table categorie  add column if not exists colore text;
alter table discipline add column if not exists colore text;

-- ---------------------------------------------------------------------
-- 2. GRADAZIONI: mescola il colore con bianco o nero
--    verso  0   = colore pieno
--    verso +0.6 = molto più chiaro
--    verso -0.5 = molto più scuro
-- ---------------------------------------------------------------------
create or replace function mix_colore(p_hex text, p_verso numeric)
returns text language plpgsql immutable as $$
declare r int; g int; b int; t int;
begin
  if p_hex is null or p_hex !~ '^#[0-9a-fA-F]{6}$' then return p_hex; end if;
  r := ('x' || substr(p_hex, 2, 2))::bit(8)::int;
  g := ('x' || substr(p_hex, 4, 2))::bit(8)::int;
  b := ('x' || substr(p_hex, 6, 2))::bit(8)::int;
  t := case when p_verso >= 0 then 255 else 0 end;

  r := round(r + (t - r) * abs(p_verso));
  g := round(g + (t - g) * abs(p_verso));
  b := round(b + (t - b) * abs(p_verso));

  return '#' || lpad(to_hex(greatest(least(r, 255), 0)), 2, '0')
             || lpad(to_hex(greatest(least(g, 255), 0)), 2, '0')
             || lpad(to_hex(greatest(least(b, 255), 0)), 2, '0');
end $$;

-- Quanto è chiaro un colore, da 0 (nero) a 255 (bianco)
create or replace function luminosita(p_hex text)
returns int language sql immutable as $$
  select case when p_hex ~ '^#[0-9a-fA-F]{6}$' then
    round(0.299 * ('x' || substr(p_hex, 2, 2))::bit(8)::int
        + 0.587 * ('x' || substr(p_hex, 4, 2))::bit(8)::int
        + 0.114 * ('x' || substr(p_hex, 6, 2))::bit(8)::int)::int
  else 128 end;
$$;

-- Dieci tinte della stessa famiglia, dalla più scura alla più chiara.
-- Su un colore già scuro si schiarisce soltanto (altrimenti verrebbero
-- dieci neri uguali), su uno già chiaro si scurisce soltanto.
create or replace function gradazioni(p_hex text, p_quante int default 10)
returns text[] language sql immutable as $$
  with l as (select luminosita(p_hex) as v),
  estremi as (
    select case when (select v from l) < 70 then 0.0
                when (select v from l) > 185 then -0.75
                else -0.35 end as dal,
           case when (select v from l) < 70 then 0.80
                when (select v from l) > 185 then 0.0
                else 0.60 end as al
  )
  select array_agg(mix_colore(p_hex, dal + ((al - dal) * (i - 1) / greatest(p_quante - 1, 1))::numeric) order by i)
  from estremi, generate_series(1, p_quante) i;
$$;

-- La tinta numero n della famiglia: è quella che si assegna a un corso
create or replace function gradazione(p_hex text, p_indice int, p_quante int default 10)
returns text language sql immutable as $$
  select (gradazioni(p_hex, greatest(p_quante, 1)))[1 + (greatest(p_indice, 0) % greatest(p_quante, 1))];
$$;

-- ---------------------------------------------------------------------
-- 3. COLORI DI PARTENZA
--    Le categorie della scuola: danza sul rosso, acrobatica sul nero,
--    benessere su un grigio caldo. Le discipline ereditano e si
--    distanziano fra loro.
-- ---------------------------------------------------------------------
do $$
declare c record; d record; n int; basi text[] := array['#f40000', '#1a1a1a', '#7a4b4b', '#b3001b', '#3d3d3d'];
begin
  -- categorie senza colore: una base a testa
  n := 0;
  for c in select id, nome from categorie where colore is null order by ordine, nome loop
    n := n + 1;
    update categorie set colore = case
      when lower(c.nome) like '%danza%' then '#f40000'
      when lower(c.nome) like '%acrobat%' then '#1a1a1a'
      when lower(c.nome) like '%benessere%' then '#7a4b4b'
      else basi[1 + (n % array_length(basi, 1))] end
    where id = c.id;
  end loop;

  -- discipline: partono dal colore della categoria, distanziate fra loro
  for c in select id, colore from categorie loop
    n := 0;
    for d in select id from discipline where categoria_id = c.id and colore is null order by ordine, nome loop
      -- le discipline si distanziano schiarendo: funziona anche sui colori scuri
      update discipline set colore = mix_colore(c.colore, (0.16 * n)::numeric) where id = d.id;
      n := n + 1;
    end loop;
  end loop;

  -- discipline senza categoria
  n := 0;
  for d in select id from discipline where colore is null order by nome loop
    n := n + 1;
    update discipline set colore = basi[1 + (n % array_length(basi, 1))] where id = d.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. I CORSI PRENDONO UNA GRADAZIONE DELLA PROPRIA DISCIPLINA
--    Si tocca solo chi non ha ancora un colore scelto a mano.
-- ---------------------------------------------------------------------
create or replace function ricolora_corsi(p_palestra uuid, p_forza boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare d record; c record; n int := 0; i int;
begin
  if auth.uid() is not null and not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;

  for d in select id, colore from discipline where palestra_id = p_palestra and colore is not null loop
    i := 0;
    for c in select id from corsi
              where palestra_id = p_palestra and disciplina_id = d.id
                and (p_forza or colore is null or colore_automatico)
              order by nome loop
      update corsi set colore = gradazione(d.colore, 1 + i, 10), colore_automatico = true where id = c.id;
      i := i + 1; n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- Ricordiamo se il colore è stato scelto a mano: in quel caso non si tocca
alter table corsi add column if not exists colore_automatico boolean not null default true;

-- Primo giro su tutte le scuole
do $$
declare p record;
begin
  for p in select id from palestre loop
    perform ricolora_corsi(p.id, true);
  end loop;
end $$;

-- Quando cambia la disciplina di un corso, il colore automatico si adegua
create or replace function trg_corsi_colore()
returns trigger language plpgsql as $$
declare v_base text; v_pos int;
begin
  if new.colore_automatico is not true then return new; end if;
  if tg_op = 'UPDATE' and new.disciplina_id = old.disciplina_id and new.colore = old.colore then
    return new;
  end if;
  select colore into v_base from discipline where id = new.disciplina_id;
  if v_base is null then return new; end if;
  select count(*) into v_pos from corsi
   where disciplina_id = new.disciplina_id and id <> new.id;
  new.colore := gradazione(v_base, 1 + v_pos, 10);
  return new;
end $$;

drop trigger if exists corsi_colore on corsi;
create trigger corsi_colore before insert or update of disciplina_id on corsi
  for each row execute function trg_corsi_colore();

grant execute on function ricolora_corsi(uuid, boolean) to authenticated;
grant execute on function gradazioni(text, int) to authenticated, anon;
grant execute on function gradazione(text, int, int) to authenticated, anon;

-- ---------------------------------------------------------------------
-- 5. CHI NASCE DOPO PRENDE IL COLORE DA SOLO
--    Categorie e discipline create in seguito (anche dai dati demo o
--    dall'importazione) non devono restare senza tinta.
-- ---------------------------------------------------------------------
create or replace function trg_categorie_colore()
returns trigger language plpgsql as $$
declare basi text[] := array['#f40000', '#1a1a1a', '#7a4b4b', '#b3001b', '#3d3d3d']; n int;
begin
  if new.colore is not null then return new; end if;
  if lower(new.nome) like '%danza%' then new.colore := '#f40000';
  elsif lower(new.nome) like '%acrobat%' then new.colore := '#1a1a1a';
  elsif lower(new.nome) like '%benessere%' then new.colore := '#7a4b4b';
  else
    select count(*) into n from categorie where palestra_id = new.palestra_id;
    new.colore := basi[1 + (n % array_length(basi, 1))];
  end if;
  return new;
end $$;

drop trigger if exists categorie_colore on categorie;
create trigger categorie_colore before insert on categorie
  for each row execute function trg_categorie_colore();

create or replace function trg_discipline_colore()
returns trigger language plpgsql as $$
declare v_base text; n int; basi text[] := array['#f40000', '#1a1a1a', '#7a4b4b', '#b3001b', '#3d3d3d'];
begin
  if new.colore is not null then return new; end if;
  select colore into v_base from categorie where id = new.categoria_id;
  if v_base is null then
    select count(*) into n from discipline where palestra_id = new.palestra_id;
    new.colore := basi[1 + (n % array_length(basi, 1))];
  else
    select count(*) into n from discipline
     where categoria_id = new.categoria_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
    new.colore := mix_colore(v_base, (0.16 * n)::numeric);
  end if;
  return new;
end $$;

drop trigger if exists discipline_colore on discipline;
create trigger discipline_colore before insert on discipline
  for each row execute function trg_discipline_colore();

-- e i corsi già esistenti senza colore lo ricevono
do $$
declare p record;
begin
  for p in select id from palestre loop perform ricolora_corsi(p.id, false); end loop;
end $$;
