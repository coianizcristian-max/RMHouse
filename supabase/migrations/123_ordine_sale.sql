-- =====================================================================
-- RMHouse — 123 ORDINE DELLE SALE A SCELTA DELLA SCUOLA
-- sale.ordine: l'ordine in cui le sale compaiono (pagina Sale, giornata per sale, affitti, sito, tendine).
-- Di partenza: in ordine alfabetico, come oggi. Le sale nuove vanno in fondo.
-- ordina_sale(p_palestra, p_ids): salva l'ordine scelto trascinando in Struttura → Sale.
-- Si può eseguire più volte. Va dopo la 122.
-- =====================================================================

alter table sale add column if not exists ordine integer;

-- prima volta: ordine alfabetico per ogni scuola
update sale s set ordine = x.n
  from (select id, row_number() over (partition by palestra_id order by nome) as n from sale) x
 where x.id = s.id and s.ordine is null
   and not exists (select 1 from sale z where z.palestra_id = s.palestra_id and z.ordine is not null);

-- una sala nuova va in fondo
create or replace function trg_sale_ordine() returns trigger language plpgsql as $$
begin
  if new.ordine is null then
    select coalesce(max(ordine), 0) + 1 into new.ordine from sale where palestra_id = new.palestra_id;
  end if;
  return new;
end $$;
drop trigger if exists sale_ordine on sale;
create trigger sale_ordine before insert on sale for each row execute function trg_sale_ordine();

create or replace function ordina_sale(p_palestra uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  update sale s set ordine = x.n
    from unnest(p_ids) with ordinality as x(id, n)
   where s.id = x.id and s.palestra_id = p_palestra;
end $$;
grant execute on function ordina_sale(uuid, uuid[]) to authenticated;
