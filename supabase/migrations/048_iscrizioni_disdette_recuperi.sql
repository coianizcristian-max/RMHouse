-- =====================================================================
-- RMHouse — 048 ISCRIZIONI, DISDETTE E RECUPERI
--  1. Regole: ore di preavviso per la disdetta, recuperi massimi al mese
--  2. Disdetta dal cliente ("Non vengo"): libera il posto e dà il recupero
--  3. Limite dei recuperi al mese, preavviso anche per disdire un recupero
--  4. Iscrizioni: situazione, modifica, annullamento con motivo,
--     eliminazione di quelle inserite per errore
--  5. Tipi di abbonamento usati: si archiviano invece di eliminarli
-- Si può eseguire più volte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REGOLE DELLA SCUOLA
-- ---------------------------------------------------------------------
alter table palestre add column if not exists ore_disdetta int not null default 4
  check (ore_disdetta between 0 and 72);
alter table palestre add column if not exists recuperi_max_mese int
  check (recuperi_max_mese is null or recuperi_max_mese >= 0);   -- vuoto = senza limite

-- Ritmo Metropolitano: al massimo 2 recuperi al mese (una volta sola, poi si cambia dalla pagina)
do $$ begin
  if not exists (select 1 from pg_class where relname = 'assenze_avvisate') then
    update palestre set recuperi_max_mese = 2 where slug = 'rmhouse' and recuperi_max_mese is null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. LEZIONI DISDETTE ("Non vengo")
-- ---------------------------------------------------------------------
create table if not exists assenze_avvisate (
  id             uuid primary key default gen_random_uuid(),
  palestra_id    uuid not null references palestre(id) on delete cascade,
  lezione_id     uuid not null references lezioni(id) on delete cascade,
  allievo_id     uuid not null references allievi(id) on delete cascade,
  iscrizione_id  uuid references iscrizioni(id) on delete cascade,
  credito_id     uuid references crediti_recupero(id) on delete set null,
  da             text not null default 'cliente' check (da in ('cliente', 'segreteria')),
  created_at     timestamptz not null default now(),
  unique (lezione_id, allievo_id)
);
create index if not exists assenze_avvisate_allievo_idx on assenze_avvisate (allievo_id);

alter table assenze_avvisate enable row level security;
drop policy if exists staff_legge on assenze_avvisate;
create policy staff_legge on assenze_avvisate for select to authenticated using (is_staff(palestra_id));
drop policy if exists cliente_legge on assenze_avvisate;
create policy cliente_legge on assenze_avvisate for select to authenticated
  using (allievo_id in (select a.id from allievi a where a.account_id in (select miei_account())));
grant select on assenze_avvisate to authenticated;
grant all on assenze_avvisate to service_role;

-- Chi ha disdetto non occupa più il posto: la vista dei partecipanti lo esclude.
-- La definizione attuale diventa la "base" (qualunque sia), sopra si mette il filtro.
do $$
declare v_def text; v_opz text;
begin
  v_def := pg_get_viewdef('v_partecipanti_lezione'::regclass);
  if v_def not ilike '%v_partecipanti_base%' then
    execute 'create or replace view v_partecipanti_base with (security_invoker = true) as ' || v_def;
    execute $v$
      create or replace view v_partecipanti_lezione with (security_invoker = true) as
      select b.* from v_partecipanti_base b
      where not (b.tipo = 'iscritto' and exists (
        select 1 from assenze_avvisate x where x.lezione_id = b.lezione_id and x.allievo_id = b.allievo_id))
    $v$;
  end if;
end $$;
grant select on v_partecipanti_base, v_partecipanti_lezione to authenticated, service_role;

-- L'iscrizione a giorni fissi che porta questa persona in questa lezione
create or replace function iscrizione_della_lezione(p_lezione uuid, p_allievo uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select i.id from iscrizioni i
    join iscrizioni_orari io on io.iscrizione_id = i.id
    join lezioni l on l.orario_id = io.orario_id and l.id = p_lezione
   where i.allievo_id = p_allievo and i.stato = 'attiva' and l.data between i.data_inizio and i.data_fine
     and not exists (select 1 from sospensioni s where s.iscrizione_id = i.id and l.data between s.dal and s.al)
   limit 1;
$$;

-- "Non vengo": dal cliente fino a N ore prima, dalla segreteria sempre (prima della lezione)
create or replace function disdici_lezione(p_lezione uuid, p_allievo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l lezioni; v_pal palestre; v_isc uuid; t tipi_abbonamento; v_gest boolean; v_usati int;
        v_credito uuid; v_scad date;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  select * into v_pal from palestre where id = l.palestra_id;
  v_gest := is_gestione(l.palestra_id);
  if not v_gest and not exists (select 1 from allievi a where a.id = p_allievo
                                  and a.account_id in (select miei_account())) then
    raise exception 'non_autorizzato';
  end if;
  if l.stato <> 'programmata' then raise exception 'lezione_annullata'; end if;
  if l.inizio <= now() then raise exception 'lezione_gia_iniziata'; end if;
  if not v_gest and l.inizio - make_interval(hours => v_pal.ore_disdetta) < now() then
    raise exception 'troppo_tardi';
  end if;
  if exists (select 1 from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo) then
    raise exception 'gia_disdetta';
  end if;

  v_isc := iscrizione_della_lezione(p_lezione, p_allievo);
  if v_isc is null then raise exception 'non_iscritto_a_questa_lezione'; end if;

  -- il credito, se l'abbonamento prevede recuperi
  select ta.* into t from tipi_abbonamento ta join iscrizioni i on i.tipo_abbonamento_id = ta.id where i.id = v_isc;
  if coalesce(t.recuperi_max, 1) <> 0 then
    select count(*) into v_usati from crediti_recupero where iscrizione_id = v_isc and not annullato;
    if t.recuperi_max is null or v_usati < t.recuperi_max then
      v_scad := l.data + coalesce(t.giorni_validita_recupero, 30);
      insert into crediti_recupero (palestra_id, iscrizione_id, allievo_id, lezione_persa_id, scadenza)
      values (l.palestra_id, v_isc, p_allievo, p_lezione, v_scad)
      on conflict (iscrizione_id, lezione_persa_id) do update set annullato = false
      returning id into v_credito;
    end if;
  end if;

  insert into assenze_avvisate (palestra_id, lezione_id, allievo_id, iscrizione_id, credito_id, da)
  values (l.palestra_id, p_lezione, p_allievo, v_isc, v_credito, case when v_gest then 'segreteria' else 'cliente' end);

  -- il posto liberato va a chi è in lista d'attesa
  begin perform avvisa_lista_attesa(p_lezione); exception when others then null; end;

  return jsonb_build_object('credito', v_credito is not null, 'scadenza', v_scad);
end $$;

-- "Ci vengo lo stesso": annulla la disdetta, se il recupero non è già stato usato
create or replace function ripristina_lezione(p_lezione uuid, p_allievo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare x assenze_avvisate; l lezioni; v_gest boolean; v_cap int;
begin
  select * into x from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo;
  if not found then raise exception 'disdetta_non_trovata'; end if;
  select * into l from lezioni where id = p_lezione;
  v_gest := is_gestione(x.palestra_id);
  if not v_gest and not exists (select 1 from allievi a where a.id = p_allievo
                                  and a.account_id in (select miei_account())) then
    raise exception 'non_autorizzato';
  end if;
  if l.inizio <= now() then raise exception 'lezione_gia_iniziata'; end if;
  if x.credito_id is not null and exists (select 1 from crediti_recupero where id = x.credito_id and usato_in is not null) then
    raise exception 'credito_gia_usato';
  end if;
  if not v_gest then
    select coalesce(l.capienza_override, co.capienza, s.capienza) into v_cap
      from corsi co left join sale s on s.id = l.sala_id where co.id = l.corso_id;
    if v_cap is not null and (select count(*) from v_partecipanti_lezione where lezione_id = p_lezione) >= v_cap then
      raise exception 'lezione_al_completo';
    end if;
  end if;
  delete from assenze_avvisate where id = x.id;
  if x.credito_id is not null then delete from crediti_recupero where id = x.credito_id; end if;
end $$;

-- Per l'area clienti: regole e lezioni già disdette
create or replace function disdette_area()
returns jsonb language sql stable security definer set search_path = public as $$
  with mie as (
    select a.id, a.nome, a.palestra_id from allievi a where a.account_id in (select miei_account())
  )
  select jsonb_build_object(
    'ore_disdetta', coalesce((select p.ore_disdetta from palestre p where p.id = (select palestra_id from mie limit 1)), 4),
    'recuperi_max_mese', (select p.recuperi_max_mese from palestre p where p.id = (select palestra_id from mie limit 1)),
    'disdette', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lezione_id', l.id, 'allievo_id', m.id, 'allievo', m.nome, 'corso', c.nome, 'colore', c.colore,
        'inizio', l.inizio, 'credito', x.credito_id is not null,
        'credito_usato', exists (select 1 from crediti_recupero cr where cr.id = x.credito_id and cr.usato_in is not null))
        order by l.inizio)
      from assenze_avvisate x
      join mie m on m.id = x.allievo_id
      join lezioni l on l.id = x.lezione_id
      join corsi c on c.id = l.corso_id
      where l.inizio > now()), '[]'::jsonb),
    'recuperi_mese', coalesce((
      select jsonb_object_agg(k.allievo_id, k.n) from (
        select p.allievo_id, count(*) as n
          from prenotazioni p join lezioni l on l.id = p.lezione_id
         where p.allievo_id in (select id from mie) and p.tipo = 'recupero' and p.stato = 'confermata'
           and date_trunc('month', l.data) = date_trunc('month', (now() at time zone 'Europe/Rome')::date)
         group by p.allievo_id) k), '{}'::jsonb)
  );
$$;

grant execute on function iscrizione_della_lezione(uuid, uuid) to authenticated;
grant execute on function disdici_lezione(uuid, uuid) to authenticated;
grant execute on function ripristina_lezione(uuid, uuid) to authenticated;
grant execute on function disdette_area() to authenticated;

-- ---------------------------------------------------------------------
-- 3. RECUPERI: massimo N al mese, preavviso anche per disdirli
--    Le funzioni attuali diventano "_base" e restano come sono;
--    sopra si mettono i due controlli nuovi.
-- ---------------------------------------------------------------------
do $$ begin
  if to_regprocedure('prenota_recupero_base(uuid, uuid)') is null then
    alter function prenota_recupero(uuid, uuid) rename to prenota_recupero_base;
  end if;
  if to_regprocedure('annulla_recupero_base(uuid)') is null then
    alter function annulla_recupero(uuid) rename to annulla_recupero_base;
  end if;
end $$;
revoke all on function prenota_recupero_base(uuid, uuid) from public, anon, authenticated;
revoke all on function annulla_recupero_base(uuid) from public, anon, authenticated;

-- Quanti recuperi ha già in quel mese (quello della lezione)
create or replace function recuperi_nel_mese(p_allievo uuid, p_data date)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from prenotazioni p join lezioni l on l.id = p.lezione_id
   where p.allievo_id = p_allievo and p.tipo = 'recupero' and p.stato = 'confermata'
     and date_trunc('month', l.data) = date_trunc('month', p_data);
$$;

create or replace function prenota_recupero(p_credito uuid, p_lezione uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c crediti_recupero; l lezioni; v_max int;
begin
  select * into c from crediti_recupero where id = p_credito;
  select * into l from lezioni where id = p_lezione;
  if c.id is not null and l.id is not null then
    -- non si recupera nella lezione che si è disdetta
    if l.id = c.lezione_persa_id or exists (select 1 from assenze_avvisate x where x.lezione_id = l.id and x.allievo_id = c.allievo_id) then
      raise exception 'lezione_disdetta';
    end if;
    select recuperi_max_mese into v_max from palestre where id = l.palestra_id;
    if v_max is not null and recuperi_nel_mese(c.allievo_id, l.data) >= v_max then
      raise exception 'limite_recuperi_mese';
    end if;
  end if;
  return prenota_recupero_base(p_credito, p_lezione);
end $$;

create or replace function annulla_recupero(p_prenotazione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p prenotazioni; l lezioni; v_ore int;
begin
  select * into p from prenotazioni where id = p_prenotazione;
  if found and not is_gestione(p.palestra_id) then
    select * into l from lezioni where id = p.lezione_id;
    select ore_disdetta into v_ore from palestre where id = p.palestra_id;
    if l.inizio - make_interval(hours => coalesce(v_ore, 0)) < now() then raise exception 'troppo_tardi'; end if;
  end if;
  perform annulla_recupero_base(p_prenotazione);
end $$;

grant execute on function recuperi_nel_mese(uuid, date) to authenticated;
grant execute on function prenota_recupero(uuid, uuid) to authenticated;
grant execute on function annulla_recupero(uuid) to authenticated;

-- Dove si recupera: sostituisce in un colpo le regole di un corso o di un abbonamento
create or replace function imposta_recuperi_ammessi(p_origine text, p_origine_id uuid, p_corsi uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_pal uuid; n int;
begin
  if p_origine not in ('corso', 'abbonamento') then raise exception 'origine_non_valida'; end if;
  v_pal := case when p_origine = 'corso' then (select palestra_id from corsi where id = p_origine_id)
                else (select palestra_id from tipi_abbonamento where id = p_origine_id) end;
  if v_pal is null then raise exception 'non_trovato'; end if;
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;

  delete from recuperi_ammessi where origine = p_origine and origine_id = p_origine_id
     and not (corso_ammesso_id = any (coalesce(p_corsi, '{}')));
  insert into recuperi_ammessi (palestra_id, origine, origine_id, corso_ammesso_id)
  select v_pal, p_origine, p_origine_id, c.id from corsi c
   where c.id = any (coalesce(p_corsi, '{}')) and c.palestra_id = v_pal
     and not (p_origine = 'corso' and c.id = p_origine_id)
  on conflict (origine, origine_id, corso_ammesso_id) do nothing;
  select count(*) into n from recuperi_ammessi where origine = p_origine and origine_id = p_origine_id;
  return n;
end $$;
grant execute on function imposta_recuperi_ammessi(text, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 4. ISCRIZIONI: situazione, modifica, annullamento, eliminazione
-- ---------------------------------------------------------------------

-- Cosa c'è attaccato a un'iscrizione: presenze, recuperi, incassi
create or replace function situazione_iscrizione(p_iscrizione uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i iscrizioni; t tipi_abbonamento; v_pres int; v_rec int; v_ing int; v_inc jsonb;
begin
  select * into i from iscrizioni where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into t from tipi_abbonamento where id = i.tipo_abbonamento_id;

  select count(*) into v_pres from presenze pr join lezioni l on l.id = pr.lezione_id
   where pr.allievo_id = i.allievo_id and pr.presente
     and ((l.corso_id = i.corso_id and l.data between i.data_inizio and coalesce(i.data_fine, i.data_inizio))
          or exists (select 1 from prenotazioni p where p.iscrizione_id = i.id and p.lezione_id = l.id));
  select count(*) into v_rec from prenotazioni where iscrizione_id = i.id and stato = 'confermata';
  v_ing := case when t.modalita = 'ingressi' and t.num_ingressi is not null and i.ingressi_residui is not null
                then greatest(t.num_ingressi - i.ingressi_residui, 0) else 0 end;

  -- incassi: quello legato all'iscrizione e quelli "abbonamento" della persona registrati lo stesso giorno
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'descrizione', pg.descrizione, 'importo_cent', pg.importo_cent, 'stato', pg.stato,
           'pagato_at', pg.pagato_at, 'metodo', pg.metodo, 'legato', pg.id = i.pagamento_id,
           'stesso_corso', pg.corso_id is not distinct from i.corso_id,
           'ricevuta_id', r.id, 'ricevuta', case when r.id is not null then r.numero || '/' || r.anno end,
           'ricevuta_cent', r.importo_cent + coalesce(r.iva_cent, 0),
           'rimborsato_cent', coalesce((select sum(n.importo_cent + coalesce(n.iva_cent, 0)) from ricevute n
                                          where n.pagamento_id = pg.id and n.tipo_documento <> 'ricevuta'
                                            and not n.annullata), 0))
           order by pg.created_at), '[]'::jsonb)
    into v_inc
    from pagamenti pg
    left join lateral (select * from ricevute r where r.pagamento_id = pg.id and r.tipo_documento = 'ricevuta'
                         and not r.annullata order by r.created_at desc limit 1) r on true
   where pg.stato in ('pagato', 'in_attesa')
     and (pg.id = i.pagamento_id
          or (pg.allievo_id = i.allievo_id and pg.causale = 'abbonamento'
              and (pg.created_at at time zone 'Europe/Rome')::date = (i.created_at at time zone 'Europe/Rome')::date));

  return jsonb_build_object(
    'presenze', v_pres, 'recuperi', v_rec, 'ingressi_usati', v_ing,
    'crediti_usati', (select count(*) from crediti_recupero where iscrizione_id = i.id and usato_in is not null),
    'incassi', v_inc,
    'eliminabile', v_pres = 0 and v_ing = 0);
end $$;

-- Annulla gli incassi scelti (solo quelli senza ricevuta: con la ricevuta si fa la nota di credito)
create or replace function annulla_incassi_iscrizione(i iscrizioni, p_pagamenti uuid[], p_motivo text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update pagamenti pg set stato = 'annullato'::stato_pagamento,
         descrizione = pg.descrizione || ' — annullato: ' || coalesce(nullif(p_motivo, ''), 'iscrizione tolta')
   where pg.id = any (coalesce(p_pagamenti, '{}')) and pg.palestra_id = i.palestra_id
     and pg.stato in ('pagato', 'in_attesa')
     and (pg.allievo_id = i.allievo_id or pg.id = i.pagamento_id)
     and not exists (select 1 from ricevute r where r.pagamento_id = pg.id and r.tipo_documento = 'ricevuta' and not r.annullata);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function annulla_incassi_iscrizione(iscrizioni, uuid[], text) from public, anon, authenticated;

-- Annulla: la persona esce da appelli e lezioni, la riga resta nello storico
create or replace function annulla_iscrizione(p_iscrizione uuid, p_motivo text default null, p_pagamenti uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare i iscrizioni; n int;
begin
  select * into i from iscrizioni where id = p_iscrizione for update;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  if i.stato = 'annullata' then raise exception 'gia_annullata'; end if;

  update iscrizioni set stato = 'annullata',
         note = concat_ws(' · ', nullif(note, ''), 'Annullata il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY')
                          || coalesce(': ' || nullif(trim(p_motivo), ''), ''))
   where id = i.id;
  -- recuperi futuri già prenotati con questo abbonamento: si liberano
  update prenotazioni p set stato = 'annullata'
    from lezioni l where l.id = p.lezione_id and p.iscrizione_id = i.id and p.stato = 'confermata' and l.inizio > now();
  update crediti_recupero set annullato = true where iscrizione_id = i.id and usato_in is null;
  update messaggi_coda set stato = 'annullato'
   where stato = 'in_coda' and allievo_id = i.allievo_id and chiave like '%' || i.id::text || '%';
  n := annulla_incassi_iscrizione(i, p_pagamenti, p_motivo);
  return jsonb_build_object('incassi_annullati', n);
end $$;

-- Elimina: solo se inserita per errore (nessuna presenza, nessun ingresso usato)
create or replace function elimina_iscrizione(p_iscrizione uuid, p_motivo text default null, p_pagamenti uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare i iscrizioni; s jsonb; n int;
begin
  select * into i from iscrizioni where id = p_iscrizione for update;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  s := situazione_iscrizione(p_iscrizione);
  if (s->>'presenze')::int > 0 then raise exception 'ha_presenze'; end if;
  if (s->>'ingressi_usati')::int > 0 then raise exception 'ha_ingressi_usati'; end if;

  n := annulla_incassi_iscrizione(i, p_pagamenti, coalesce(nullif(p_motivo, ''), 'iscrizione inserita per errore'));

  -- quello che dipende dall'iscrizione
  update crediti_recupero set usato_in = null
   where usato_in in (select id from prenotazioni where iscrizione_id = i.id);
  delete from prenotazioni where iscrizione_id = i.id;
  delete from assenze_avvisate where iscrizione_id = i.id;
  delete from crediti_recupero where iscrizione_id = i.id;
  delete from sospensioni where iscrizione_id = i.id;
  delete from iscrizioni_orari where iscrizione_id = i.id;
  update iscrizioni set rinnovo_di = null where rinnovo_di = i.id;
  update messaggi_coda set stato = 'annullato'
   where stato = 'in_coda' and allievo_id = i.allievo_id and chiave like '%' || i.id::text || '%';
  -- rate ancora da pagare legate a questa iscrizione (se la tabella le collega)
  begin
    execute 'delete from rate where iscrizione_id = $1 and stato = ''da_pagare''' using i.id;
  exception when undefined_table or undefined_column then null;
  end;

  begin
    delete from iscrizioni where id = i.id;
  exception when foreign_key_violation then
    raise exception 'collegata_ad_altri_dati';
  end;
  return jsonb_build_object('incassi_annullati', n);
end $$;

-- Modifica: tipo, date, sconto e note, senza rifare l'iscrizione
create or replace function modifica_iscrizione(p_iscrizione uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare i iscrizioni; t_vecchio tipi_abbonamento; t tipi_abbonamento; v_inizio date; v_fine date; v_sconto int;
begin
  select * into i from iscrizioni where id = p_iscrizione for update;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into t_vecchio from tipi_abbonamento where id = i.tipo_abbonamento_id;
  select * into t from tipi_abbonamento
   where id = coalesce(nullif(p->>'tipo_abbonamento_id', '')::uuid, i.tipo_abbonamento_id) and palestra_id = i.palestra_id;
  if not found then raise exception 'tipo_non_valido'; end if;

  v_inizio := coalesce(nullif(p->>'data_inizio', '')::date, i.data_inizio);
  v_fine := nullif(p->>'data_fine', '')::date;
  if v_fine is null then
    v_fine := case when t.id = i.tipo_abbonamento_id and v_inizio = i.data_inizio then i.data_fine
                   when t.durata_giorni is not null then v_inizio + t.durata_giorni - 1
                   else fine_periodo(v_inizio, t.durata_mesi, t.scadenza_fine_mese) end;
  end if;
  if v_fine < v_inizio then raise exception 'date_non_valide'; end if;
  v_sconto := coalesce((p->>'sconto_cent')::int, i.sconto_cent);
  if v_sconto < 0 or v_sconto > t.prezzo_cent then raise exception 'sconto_non_valido'; end if;

  if i.stato = 'attiva' and exists (select 1 from iscrizioni x where x.allievo_id = i.allievo_id and x.corso_id = i.corso_id
                  and x.id <> i.id and x.stato = 'attiva' and x.data_inizio <= v_fine and x.data_fine >= v_inizio) then
    raise exception 'iscrizione_gia_attiva';
  end if;

  update iscrizioni set
    tipo_abbonamento_id = t.id, data_inizio = v_inizio, data_fine = v_fine, sconto_cent = v_sconto,
    note = case when p ? 'note' then nullif(trim(p->>'note'), '') else note end,
    ingressi_residui = case
      when t.modalita <> 'ingressi' then null
      when t_vecchio.modalita <> 'ingressi' or ingressi_residui is null then t.num_ingressi
      else greatest(ingressi_residui + coalesce(t.num_ingressi, 0) - coalesce(t_vecchio.num_ingressi, 0), 0) end
   where id = i.id;
  -- se il nuovo abbonamento non è a giorni fissi, i giorni assegnati non servono più
  if t.modalita <> 'orari_fissi' then delete from iscrizioni_orari where iscrizione_id = i.id; end if;
end $$;

grant execute on function situazione_iscrizione(uuid) to authenticated;
grant execute on function annulla_iscrizione(uuid, text, uuid[]) to authenticated;
grant execute on function elimina_iscrizione(uuid, text, uuid[]) to authenticated;
grant execute on function modifica_iscrizione(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. TIPI DI ABBONAMENTO: eliminare solo se mai usati, altrimenti archiviare
-- ---------------------------------------------------------------------
create or replace function elimina_o_archivia_tipo(p_tipo uuid)
returns text language plpgsql security definer set search_path = public as $$
declare t tipi_abbonamento;
begin
  select * into t from tipi_abbonamento where id = p_tipo;
  if not found then raise exception 'non_trovato'; end if;
  if not is_gestione(t.palestra_id) then raise exception 'non_autorizzato'; end if;
  if exists (select 1 from iscrizioni where tipo_abbonamento_id = p_tipo) then
    update tipi_abbonamento set archiviato = true, acquistabile_online = false where id = p_tipo;
    return 'archiviato';
  end if;
  begin
    delete from recuperi_ammessi where origine = 'abbonamento' and origine_id = p_tipo;
    delete from tipi_abbonamento where id = p_tipo;
    return 'eliminato';
  exception when foreign_key_violation then
    update tipi_abbonamento set archiviato = true, acquistabile_online = false where id = p_tipo;
    return 'archiviato';
  end;
end $$;
grant execute on function elimina_o_archivia_tipo(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. GRUPPI DI LISTINO: Kids e Teen · Adulti · Ingressi
-- ---------------------------------------------------------------------
create table if not exists gruppi_listino (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,
  ordine       int not null default 0,
  created_at   timestamptz not null default now(),
  unique (palestra_id, nome)
);
alter table tipi_abbonamento add column if not exists gruppo_id uuid references gruppi_listino(id) on delete set null;
create index if not exists tipi_abbonamento_gruppo_idx on tipi_abbonamento (gruppo_id);

alter table gruppi_listino enable row level security;
drop policy if exists tutti_leggono on gruppi_listino;
create policy tutti_leggono on gruppi_listino for select using (true);
drop policy if exists gestione_scrive on gruppi_listino;
create policy gestione_scrive on gruppi_listino for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
grant select on gruppi_listino to anon, authenticated;
grant insert, update, delete on gruppi_listino to authenticated;
grant all on gruppi_listino to service_role;

-- i tre gruppi per ogni scuola
insert into gruppi_listino (palestra_id, nome, ordine)
select p.id, g.nome, g.ordine from palestre p
cross join (values ('Kids e Teen', 1), ('Adulti', 2), ('Ingressi', 3)) g(nome, ordine)
on conflict (palestra_id, nome) do nothing;

-- prima sistemazione: solo gli abbonamenti che non hanno ancora un gruppo
--   "kids e teen" nel nome o nella famiglia → Kids e Teen
--   "ingressi liberi"                       → Ingressi
--   tutto il resto                          → Adulti
update tipi_abbonamento t set gruppo_id = g.id
  from gruppi_listino g
 where t.gruppo_id is null and g.palestra_id = t.palestra_id
   and g.nome = case
     when concat_ws(' ', t.nome, t.famiglia) ilike '%kids e teen%' then 'Kids e Teen'
     when concat_ws(' ', t.nome, t.famiglia) ilike '%ingressi liberi%' then 'Ingressi'
     else 'Adulti' end;

-- sposta in blocco più abbonamenti in un gruppo (null = senza gruppo)
create or replace function sposta_in_gruppo(p_tipi uuid[], p_gruppo uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_pal uuid; n int;
begin
  select palestra_id into v_pal from tipi_abbonamento where id = any (coalesce(p_tipi, '{}')) limit 1;
  if v_pal is null then return 0; end if;
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if p_gruppo is not null and not exists (select 1 from gruppi_listino where id = p_gruppo and palestra_id = v_pal) then
    raise exception 'gruppo_non_valido';
  end if;
  update tipi_abbonamento set gruppo_id = p_gruppo where id = any (p_tipi) and palestra_id = v_pal;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function sposta_in_gruppo(uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. IVA 0%: una voce esplicita, oltre a "Esente" (N4) e "Non soggetta" (N2.2)
--    Le aliquote si cambiano in Conti → Per il commercialista → Aliquote e regimi IVA
-- ---------------------------------------------------------------------
insert into aliquote_iva (palestra_id, nome, percentuale, natura, riferimento, predefinita, ordine)
select p.id, 'IVA 0%', 0, null, null, false, 0 from palestre p
on conflict (palestra_id, nome) do nothing;
