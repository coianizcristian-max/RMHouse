-- =====================================================================
-- RMHouse — 080 NOTIFICHE DELLA SEGRETERIA E FIGLI AGGIUNTI DALL'APP
--  1. notifiche_staff: ogni notifica alla segreteria resta anche in una
--     lista nel gestionale (la campanella), letta/non letta per persona,
--     anche per chi non ha attivato le notifiche sul telefono
--  2. nuove notifiche: "Nuovo cliente dal sito/app" e "Figlio aggiunto"
--  3. aggiungi_figlio(): il genitore aggiunge un figlio dall'app
-- Si può eseguire più volte. Va dopo la 079.
-- =====================================================================

create table if not exists notifiche_staff (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  tipo        text not null,
  titolo      text not null,
  testo       text,
  url         text,
  ruoli       text[],                 -- a chi (null = tutta la gestione)
  staff_id    uuid references staff(id) on delete cascade,   -- a una persona sola
  chiave      text,
  letta_da    uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
create unique index if not exists ux_notifiche_staff_chiave on notifiche_staff (palestra_id, chiave) where chiave is not null;
create index if not exists ix_notifiche_staff_data on notifiche_staff (palestra_id, created_at desc);
alter table notifiche_staff enable row level security;
grant select on notifiche_staff to authenticated;
drop policy if exists staff_legge on notifiche_staff;
create policy staff_legge on notifiche_staff for select to authenticated
  using (exists (select 1 from staff s where s.user_id = auth.uid() and s.palestra_id = notifiche_staff.palestra_id and s.attivo
                  and (notifiche_staff.staff_id = s.id
                       or (notifiche_staff.staff_id is null and (notifiche_staff.ruoli is null or s.ruolo::text = any (notifiche_staff.ruoli))))));

-- Ogni notifica alla segreteria finisce anche nella lista (una volta sola, anche senza telefoni iscritti)
do $$
declare v text;
begin
  v := pg_get_functiondef('accoda_push_staff(uuid, text, text, text, text, text[], uuid, text)'::regprocedure);
  if v not ilike '%notifiche_staff%' then
    v := regexp_replace(v, 'declare n int;\s*begin',
      'declare n int;
begin
  insert into notifiche_staff (palestra_id, tipo, titolo, testo, url, ruoli, staff_id, chiave)
  values (p_palestra, p_tipo, p_titolo, p_testo, p_url, p_ruoli, p_staff, p_chiave)
  on conflict (palestra_id, chiave) where chiave is not null do nothing;');
    execute v;
  end if;
end $$;

-- Segna lette (tutte, o una)
create or replace function segna_notifiche_lette(p_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare s staff;
begin
  select * into s from staff where user_id = auth.uid() and attivo limit 1;
  if not found then return; end if;
  update notifiche_staff n set letta_da = array_append(n.letta_da, auth.uid())
   where n.palestra_id = s.palestra_id and not (auth.uid() = any (n.letta_da))
     and (p_id is null or n.id = p_id)
     and (n.staff_id = s.id or (n.staff_id is null and (n.ruoli is null or s.ruolo::text = any (n.ruoli))));
end $$;
revoke execute on function segna_notifiche_lette(uuid) from public, anon;
grant execute on function segna_notifiche_lette(uuid) to authenticated;

-- Nuovo cliente arrivato da solo (prova dal sito, acquisto, area clienti): avvisa la segreteria.
-- Chi viene inserito dallo staff (o importato) non manda notifiche.
create or replace function trg_allievi_nuovo_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tit text; v_figlio boolean;
begin
  if is_staff(new.palestra_id) then return new; end if;
  select trim(nome || ' ' || coalesce(cognome, '')) into v_tit from account where id = new.account_id;
  v_figlio := not new.is_titolare and exists (select 1 from allievi x where x.account_id = new.account_id and x.id <> new.id);
  begin
    perform accoda_push_staff(new.palestra_id, 'cliente',
      case when v_figlio then 'Figlio aggiunto dall''app' else 'Nuovo cliente' end,
      trim(new.nome || ' ' || coalesce(new.cognome, '')) ||
        case when v_figlio then ' (figlio di ' || coalesce(v_tit, '?') || ')'
             when not new.is_titolare and v_tit is not null then ' · genitore ' || v_tit else '' end ||
        ' si è iscritto alla scuola',
      '/gestione/persone/' || new.id, array['admin', 'segreteria'], null, 'cli:' || new.id);
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists trg_allievi_nuovo_cliente on allievi;
create trigger trg_allievi_nuovo_cliente after insert on allievi
  for each row execute function trg_allievi_nuovo_cliente();

-- Il genitore aggiunge un figlio dall'app (stesso accesso, stessa famiglia)
create or replace function aggiungi_figlio(p_nome text, p_cognome text, p_nascita date, p_cf text default null, p_sesso text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare acc account; v_id uuid; v_cf text;
begin
  select * into acc from account where user_id = auth.uid() limit 1;
  if not found then raise exception 'non_autorizzato'; end if;
  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_cognome), '') = '' then raise exception 'nome_cognome'; end if;
  if p_nascita is null or p_nascita > current_date or p_nascita < current_date - interval '100 years' then raise exception 'data_nascita'; end if;
  v_cf := nullif(upper(regexp_replace(coalesce(p_cf, ''), '\s', '', 'g')), '');
  if v_cf is not null and v_cf !~ '^[A-Z0-9]{16}$' then raise exception 'codice_fiscale_non_valido'; end if;
  if exists (select 1 from allievi where account_id = acc.id and lower(nome) = lower(trim(p_nome)) and data_nascita = p_nascita) then
    raise exception 'gia_presente';
  end if;
  insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, codice_fiscale, sesso, is_titolare)
  values (acc.palestra_id, acc.id, initcap(trim(p_nome)), initcap(trim(p_cognome)), p_nascita, v_cf, nullif(p_sesso, ''), false)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function aggiungi_figlio(text, text, date, text, text) from public, anon;
grant execute on function aggiungi_figlio(text, text, date, text, text) to authenticated;
