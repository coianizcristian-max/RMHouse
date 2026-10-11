-- 166 — IVA scelta per corso, evento e workshop (e a mano su un incasso); IVA della quota annuale e dell'affitto sale
-- I prezzi sono sempre IVA COMPRESA: sulla ricevuta l'IVA si scorpora (15 € con IVA 22% = 12,30 imponibile + 2,70 IVA),
-- come già faceva emetti_ricevuta. Qui cambia solo DA DOVE si prende l'aliquota di un incasso:
--   1. scelta a mano sull'incasso (pagamenti.aliquota_id)
--   2. il corso dell'abbonamento / della prova / dell'incasso (corsi.aliquota_id)
--   3. il tipo di abbonamento (tipi_abbonamento.aliquota_id)
--   4. il workshop (workshop.aliquota_id), l'evento (eventi.aliquota_id)
--   5. quota annuale (palestre.aliquota_quota_id), affitto sale (palestre.aliquota_spazi_id)
--   6. l'aliquota predefinita (oggi "Esente IVA", 0%)
-- Le ricevute già fatte non cambiano. Si può rilanciare.

alter table corsi add column if not exists aliquota_id uuid references aliquote_iva(id) on delete set null;
alter table eventi add column if not exists aliquota_id uuid references aliquote_iva(id) on delete set null;
alter table workshop add column if not exists aliquota_id uuid references aliquote_iva(id) on delete set null;
alter table pagamenti add column if not exists aliquota_id uuid references aliquote_iva(id) on delete set null;
alter table palestre add column if not exists aliquota_quota_id uuid references aliquote_iva(id) on delete set null;
alter table palestre add column if not exists aliquota_spazi_id uuid references aliquote_iva(id) on delete set null;

create or replace function aliquota_di_pagamento(p_pagamento uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  with pg as (select * from pagamenti where id = p_pagamento),
  -- l'abbonamento pagato con questo incasso (direttamente o con una rata)
  isc as (
    select i.* from iscrizioni i, pg where i.pagamento_id = pg.id
    union all
    select i.* from pg join rate r on r.id = pg.rata_id join iscrizioni i on i.id = r.iscrizione_id
    union all
    select i.* from pg join rate r on r.pagamento_id = pg.id join iscrizioni i on i.id = r.iscrizione_id
  )
  select coalesce(
    (select pg.aliquota_id from pg where pg.aliquota_id is not null),
    (select c.aliquota_id from isc join corsi c on c.id = isc.corso_id where c.aliquota_id is not null limit 1),
    (select t.aliquota_id from isc join tipi_abbonamento t on t.id = isc.tipo_abbonamento_id where t.aliquota_id is not null limit 1),
    (select c.aliquota_id from pg join prove x on x.pagamento_id = pg.id join corsi c on c.id = x.corso_id where c.aliquota_id is not null limit 1),
    (select w.aliquota_id from pg join workshop_iscrizioni wi on wi.pagamento_id = pg.id join workshop w on w.id = wi.workshop_id where w.aliquota_id is not null limit 1),
    (select e.aliquota_id from pg join iscrizioni_evento ie on ie.pagamento_id = pg.id join eventi e on e.id = ie.evento_id where e.aliquota_id is not null limit 1),
    (select c.aliquota_id from pg join corsi c on c.id = pg.corso_id where c.aliquota_id is not null),
    (select p.aliquota_quota_id from pg join palestre p on p.id = pg.palestra_id where pg.causale = 'quota_iscrizione' and p.aliquota_quota_id is not null),
    (select p.aliquota_spazi_id from pg join palestre p on p.id = pg.palestra_id where pg.causale = 'spazio' and p.aliquota_spazi_id is not null),
    (select a.id from aliquote_iva a, pg where a.palestra_id = pg.palestra_id and a.predefinita and a.attiva limit 1));
$$;

-- l'incasso registrato a mano (Incassi, scheda persona): si può scegliere l'IVA
create or replace function registra_incasso(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_pal uuid := (p->>'palestra_id')::uuid; v_id uuid; v_importo int; v_acc uuid; v_all uuid; v_iva uuid;
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  v_importo := coalesce((p->>'importo_cent')::int, 0);
  if v_importo <= 0 then raise exception 'importo_non_valido'; end if;
  v_all := nullif(p->>'allievo_id', '')::uuid;
  v_acc := coalesce(nullif(p->>'account_id', '')::uuid, (select account_id from allievi where id = v_all));
  v_iva := nullif(p->>'aliquota_id', '')::uuid;
  if v_iva is not null and not exists (select 1 from aliquote_iva where id = v_iva and palestra_id = v_pal) then raise exception 'aliquota_non_valida'; end if;

  insert into pagamenti (palestra_id, account_id, allievo_id, corso_id, causale, descrizione, importo_cent,
                         metodo, stato, pagato_at, aliquota_id)
  values (v_pal, v_acc, v_all, nullif(p->>'corso_id', '')::uuid,
          coalesce(nullif(p->>'causale', ''), 'altro'),
          coalesce(nullif(trim(p->>'descrizione'), ''), 'Incasso'),
          v_importo,
          coalesce(nullif(p->>'metodo', ''), 'contanti'),
          (case when coalesce((p->>'incassato')::boolean, true) then 'pagato' else 'in_attesa' end)::stato_pagamento,
          case when coalesce((p->>'incassato')::boolean, true)
               then coalesce(nullif(p->>'pagato_at', '')::date + current_time::time, now()) end,
          v_iva)
  returning id into v_id;

  if p->>'causale' = 'quota_iscrizione' and v_all is not null then
    insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, pagamento_id, data)
    select v_pal, v_all, stagione_di(current_date, coalesce(pa.mese_inizio_stagione, 9)), v_importo, v_id, current_date
    from palestre pa where pa.id = v_pal
    on conflict do nothing;
  end if;
  return v_id;
end $$;

-- l'IVA che toccherebbe a un incasso di quel tipo, prima di farlo (per mostrarla allo Sportello e nelle schede)
create or replace function aliquota_prevista(p_palestra uuid, p_corso uuid default null, p_tipo uuid default null, p_causale text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(a) - 'palestra_id' from aliquote_iva a where a.id = coalesce(
    (select c.aliquota_id from corsi c where c.id = p_corso and c.palestra_id = p_palestra),
    (select t.aliquota_id from tipi_abbonamento t where t.id = p_tipo and t.palestra_id = p_palestra),
    (select case p_causale when 'quota_iscrizione' then p.aliquota_quota_id when 'spazio' then p.aliquota_spazi_id end from palestre p where p.id = p_palestra),
    (select x.id from aliquote_iva x where x.palestra_id = p_palestra and x.predefinita and x.attiva limit 1))
$$;
revoke all on function aliquota_prevista(uuid, uuid, uuid, text) from public, anon;
grant execute on function aliquota_prevista(uuid, uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
