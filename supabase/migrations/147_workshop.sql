-- =====================================================================
-- RMHouse — 147 WORKSHOP
-- Eventi a spot con insegnanti esterni, una sezione a sé (gestionale, Sportello, app, pagina pubblica):
--  • workshop: titolo, insegnante, descrizione, locandina, sede, stato (bozza / pubblicato / chiuso / annullato),
--    chiusura delle iscrizioni, pagamento online e/o in segreteria, quota annuale per chi non ce l'ha,
--    certificato richiesto (sì/no), compenso dell'insegnante (fisso o percentuale);
--  • momenti: le date del workshop (sabato, domenica, livello base…), ognuno con sala e posti;
--  • opzioni: cosa si compra ("Solo sabato", "Weekend completo"), con i momenti compresi e i prezzi a scaglioni:
--    [{ fino_al: '2026-11-15', allievi: 4000, esterni: 4500 }, { fino_al: null, allievi: 5000, esterni: 5500 }]
--    vale il primo scaglione non ancora scaduto; "esterni" vuoto = stesso prezzo degli allievi;
--  • iscrizioni: chi viene, con quale opzione, quanto paga (workshop + quota), il pagamento, le presenze per momento.
-- Esterno = chi oggi non ha un abbonamento attivo o sospeso. La quota annuale si aggiunge a chi non ce l'ha valida
-- (stessa regola degli acquisti dall'app) e si registra quando il pagamento risulta pagato (carta, Satispay, segreteria).
-- Email: conferma dell'iscrizione e promemoria il giorno prima alle 18 (testi in Impostazioni → Messaggi automatici).
-- Si può eseguire più volte.
-- =====================================================================

-- ------------------------------------------------------------------ tabelle
create table if not exists workshop (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  titolo text not null,
  slug text,
  sottotitolo text,
  insegnante text,
  descrizione text,
  info_pratiche text,
  locandina_url text,
  sede_id uuid references sedi(id) on delete set null,
  luogo text,
  stato text not null default 'bozza',
  iscrizioni_fino timestamptz,
  online boolean not null default true,
  in_segreteria boolean not null default true,
  quota_esterni boolean not null default true,
  certificato_richiesto boolean not null default false,
  compenso_tipo text,
  compenso_cent integer,
  compenso_percentuale numeric(5,2),
  note_interne text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table workshop drop constraint if exists workshop_stato_check;
alter table workshop add constraint workshop_stato_check check (stato in ('bozza', 'pubblicato', 'chiuso', 'annullato'));
alter table workshop drop constraint if exists workshop_compenso_check;
alter table workshop add constraint workshop_compenso_check check (compenso_tipo is null or compenso_tipo in ('fisso', 'percentuale'));
create unique index if not exists workshop_slug on workshop (palestra_id, slug);
create index if not exists ix_workshop_palestra on workshop (palestra_id, stato);

create table if not exists workshop_momenti (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  workshop_id uuid not null references workshop(id) on delete cascade,
  titolo text not null,
  inizio timestamptz not null,
  fine timestamptz,
  sala_id uuid references sale(id) on delete set null,
  posti integer,
  ordine integer not null default 0
);
alter table workshop_momenti drop constraint if exists workshop_momenti_posti_check;
alter table workshop_momenti add constraint workshop_momenti_posti_check check (posti is null or posti > 0);
create index if not exists ix_workshop_momenti on workshop_momenti (workshop_id, inizio);

create table if not exists workshop_opzioni (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  workshop_id uuid not null references workshop(id) on delete cascade,
  nome text not null,
  descrizione text,
  momenti uuid[] not null default '{}',
  prezzi jsonb not null default '[]'::jsonb,
  attiva boolean not null default true,
  ordine integer not null default 0
);
create index if not exists ix_workshop_opzioni on workshop_opzioni (workshop_id);

create table if not exists workshop_iscrizioni (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  workshop_id uuid not null references workshop(id) on delete cascade,
  opzione_id uuid not null references workshop_opzioni(id),
  allievo_id uuid not null references allievi(id) on delete cascade,
  stato text not null default 'iscritto',
  esterno boolean not null default false,
  prezzo_cent integer not null default 0,
  quota_cent integer not null default 0,
  pagamento_id uuid references pagamenti(id) on delete set null,
  origine text not null default 'segreteria',
  presenze uuid[] not null default '{}',
  codice text not null default replace(gen_random_uuid()::text, '-', ''),
  note text,
  created_at timestamptz not null default now(),
  annullata_at timestamptz
);
alter table workshop_iscrizioni drop constraint if exists workshop_iscrizioni_stato_check;
alter table workshop_iscrizioni add constraint workshop_iscrizioni_stato_check check (stato in ('iscritto', 'annullato'));
alter table workshop_iscrizioni drop constraint if exists workshop_iscrizioni_origine_check;
alter table workshop_iscrizioni add constraint workshop_iscrizioni_origine_check check (origine in ('app', 'pubblico', 'segreteria'));
create unique index if not exists workshop_iscritto_una_volta on workshop_iscrizioni (workshop_id, allievo_id) where stato = 'iscritto';
create unique index if not exists workshop_iscrizioni_codice on workshop_iscrizioni (codice);
create index if not exists ix_workshop_iscrizioni on workshop_iscrizioni (workshop_id, stato);
create index if not exists ix_workshop_iscrizioni_allievo on workshop_iscrizioni (allievo_id);
create index if not exists ix_workshop_iscrizioni_pagamento on workshop_iscrizioni (pagamento_id);
create index if not exists ix_workshop_iscrizioni_opzione on workshop_iscrizioni (opzione_id);

-- ------------------------------------------------------------------ permessi (scrivono la gestione e le funzioni qui sotto)
alter table workshop enable row level security;
alter table workshop_momenti enable row level security;
alter table workshop_opzioni enable row level security;
alter table workshop_iscrizioni enable row level security;
do $$
declare t text;
begin
  foreach t in array array['workshop', 'workshop_momenti', 'workshop_opzioni', 'workshop_iscrizioni'] loop
    execute format('drop policy if exists staff_legge on %I', t);
    execute format('create policy staff_legge on %I for select to authenticated using (palestra_id in (select palestre_staff()))', t);
    execute format('drop policy if exists gestione_scrive on %I', t);
    execute format('create policy gestione_scrive on %I for all to authenticated using (palestra_id in (select palestre_gestione())) with check (palestra_id in (select palestre_gestione()))', t);
  end loop;
end $$;
grant select, insert, update, delete on workshop, workshop_momenti, workshop_opzioni, workshop_iscrizioni to authenticated;
grant select, insert, update, delete on workshop, workshop_momenti, workshop_opzioni, workshop_iscrizioni to service_role;
revoke all on workshop, workshop_momenti, workshop_opzioni, workshop_iscrizioni from anon;
drop policy if exists cliente_legge on workshop_iscrizioni;
create policy cliente_legge on workshop_iscrizioni for select to authenticated using (allievo_id in (select miei_allievi()));

-- registro delle azioni, come per il resto
do $$
begin
  if exists (select 1 from pg_proc where proname = 'trg_registro') then
    drop trigger if exists registro on workshop;
    create trigger registro after insert or update or delete on workshop for each row execute function trg_registro();
    drop trigger if exists registro on workshop_iscrizioni;
    create trigger registro after insert or update or delete on workshop_iscrizioni for each row execute function trg_registro();
  end if;
end $$;

-- indirizzo pubblico: /workshop/<slug>, scelto dal titolo e poi fisso (un link già condiviso non cambia)
create or replace function trg_workshop_slug() returns trigger language plpgsql as $$
declare base text; finale text; n int := 1;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base := coalesce(nullif(slug_di(new.titolo), ''), 'workshop');
  else
    base := coalesce(nullif(slug_di(new.slug), ''), 'workshop');
  end if;
  finale := base;
  while exists (select 1 from workshop where palestra_id = new.palestra_id and slug = finale and id <> new.id) loop
    n := n + 1; finale := base || '-' || n;
  end loop;
  new.slug := finale;
  return new;
end $$;
drop trigger if exists workshop_slug on workshop;
create trigger workshop_slug before insert or update of slug on workshop for each row execute function trg_workshop_slug();

-- ------------------------------------------------------------------ prezzi, posti, chi è esterno
-- lo scaglione che vale in una data: il primo non ancora scaduto (in ordine di "fino al", "poi" in fondo); se sono tutti scaduti l'ultimo
create or replace function workshop_scaglione(p_prezzi jsonb, p_data date default current_date)
returns jsonb language sql immutable as $$
  with s as (
    select x, nullif(x ->> 'fino_al', '')::date as fino, ord
      from jsonb_array_elements(coalesce(p_prezzi, '[]'::jsonb)) with ordinality as t(x, ord)
     where nullif(x ->> 'allievi', '') is not null
  ), o as (select x, fino, row_number() over (order by fino nulls last, ord) as n from s)
  select coalesce(
    (select x || jsonb_build_object('n', n) from o where fino is null or fino >= p_data order by n limit 1),
    (select x || jsonb_build_object('n', n, 'scaduto', true) from o order by n desc limit 1));
$$;

create or replace function workshop_prezzo(p_prezzi jsonb, p_esterno boolean, p_data date default current_date)
returns int language sql immutable as $$
  select case when p_esterno then coalesce(nullif(s ->> 'esterni', '')::int, nullif(s ->> 'allievi', '')::int)
              else nullif(s ->> 'allievi', '')::int end
    from (select workshop_scaglione(p_prezzi, p_data) as s) z;
$$;

-- esterno = oggi non ha un abbonamento attivo o sospeso
create or replace function workshop_esterno(p_allievo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from iscrizioni i where i.allievo_id = p_allievo and i.stato in ('attiva', 'sospesa') and i.data_fine >= current_date);
$$;

create or replace function workshop_occupati(p_momento uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from workshop_iscrizioni wi join workshop_opzioni o on o.id = wi.opzione_id
   where wi.stato = 'iscritto' and p_momento = any (o.momenti);
$$;

-- la scheda di un workshop come la vedono app, pagina pubblica e Sportello
create or replace function workshop_scheda(p_workshop uuid, p_data date default current_date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', w.id, 'titolo', w.titolo, 'slug', w.slug, 'sottotitolo', w.sottotitolo, 'insegnante', w.insegnante,
    'descrizione', w.descrizione, 'info_pratiche', w.info_pratiche, 'locandina_url', w.locandina_url,
    'luogo', coalesce(nullif(btrim(w.luogo), ''), s.nome), 'stato', w.stato,
    'online', w.online, 'in_segreteria', w.in_segreteria, 'certificato_richiesto', w.certificato_richiesto,
    'quota_cent', case when w.quota_esterni then coalesce(p.quota_iscrizione_cent, 0) else 0 end,
    'inizio', mm.inizio, 'fine', mm.fine,
    'iscrizioni_fino', coalesce(w.iscrizioni_fino, mm.inizio),
    'aperte', w.stato = 'pubblicato' and now() < coalesce(w.iscrizioni_fino, mm.inizio, now()),
    'momenti', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'titolo', m.titolo, 'inizio', m.inizio, 'fine', m.fine,
                  'sala', sa.nome, 'sala_id', m.sala_id, 'posti', m.posti, 'occupati', workshop_occupati(m.id)) order by m.inizio, m.ordine)
                from workshop_momenti m left join sale sa on sa.id = m.sala_id where m.workshop_id = w.id), '[]'::jsonb),
    'opzioni', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'descrizione', o.descrizione, 'momenti', o.momenti,
                  'prezzi', o.prezzi, 'scaglione', workshop_scaglione(o.prezzi, p_data),
                  'prezzo_allievi', workshop_prezzo(o.prezzi, false, p_data), 'prezzo_esterni', workshop_prezzo(o.prezzi, true, p_data),
                  'liberi', (select greatest(min(m.posti - workshop_occupati(m.id)), 0) from workshop_momenti m
                              where m.id = any (o.momenti) and m.posti is not null)) order by o.ordine, o.nome)
                from workshop_opzioni o where o.workshop_id = w.id and o.attiva), '[]'::jsonb))
  from workshop w
  join palestre p on p.id = w.palestra_id
  left join sedi s on s.id = w.sede_id
  cross join lateral (select min(inizio) as inizio, max(coalesce(fine, inizio)) as fine from workshop_momenti where workshop_id = w.id) mm
  where w.id = p_workshop;
$$;
revoke all on function workshop_scheda(uuid, date) from public, anon, authenticated;
grant execute on function workshop_scheda(uuid, date) to service_role;

-- ------------------------------------------------------------------ email: conferma e promemoria del giorno prima
create or replace function workshop_email(p_iscrizione uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_quando text; v_inizio timestamptz; v_vars jsonb; v_importo int; v_euro text; v_stato text;
begin
  select wi.id, wi.workshop_id, wi.opzione_id, wi.prezzo_cent, wi.quota_cent, wi.stato, w.palestra_id as pal, w.titolo,
         w.certificato_richiesto, w.info_pratiche, coalesce(nullif(btrim(w.luogo), ''), s.nome, '') as luogo, o.nome as opzione,
         al.nome, acc.email, acc.nome as nome_titolare, pg.stato as stato_pag, pa.nome as palestra
    into r
    from workshop_iscrizioni wi
    join workshop w on w.id = wi.workshop_id
    join workshop_opzioni o on o.id = wi.opzione_id
    join allievi al on al.id = wi.allievo_id
    join palestre pa on pa.id = w.palestra_id
    left join account acc on acc.id = al.account_id
    left join sedi s on s.id = w.sede_id
    left join pagamenti pg on pg.id = wi.pagamento_id
   where wi.id = p_iscrizione;
  if not found or r.stato <> 'iscritto' or r.email is null then return; end if;
  select string_agg(m.titolo || ': ' || to_char(m.inizio at time zone 'Europe/Rome', 'DD/MM/YYYY "ore" HH24:MI'), E'\n' order by m.inizio), min(m.inizio)
    into v_quando, v_inizio
    from workshop_momenti m join workshop_opzioni o on m.id = any (o.momenti) where o.id = r.opzione_id;
  v_importo := r.prezzo_cent + r.quota_cent;
  v_euro := replace(to_char(v_importo / 100.0, 'FM999990.00'), '.', ',') || ' €';
  v_stato := case when v_importo = 0 then 'gratis' when r.stato_pag = 'pagato' then 'pagato' else 'da_pagare' end;
  v_vars := jsonb_build_object(
    'nome', r.nome, 'nome_titolare', coalesce(r.nome_titolare, r.nome), 'workshop', r.titolo, 'opzione', r.opzione,
    'quando', coalesce(v_quando, ''), 'luogo', r.luogo, 'info', coalesce(r.info_pratiche, ''), 'palestra', r.palestra, 'importo', v_euro,
    'pagamento', case v_stato when 'gratis' then 'La partecipazione è gratuita.'
                              when 'pagato' then 'Abbiamo ricevuto il pagamento di ' || v_euro || ', grazie.'
                              else 'Quota da pagare: ' || v_euro || case when r.quota_cent > 0 then ' (compresa la quota associativa annuale)' else '' end
                                   || '. Puoi pagarla dall''app oppure in segreteria.' end,
    'certificato', case when r.certificato_richiesto then 'Per partecipare serve il certificato medico valido: se non ce l''hai già dato, portalo o caricalo dall''app.' else '' end);
  -- la conferma: una per stato (da pagare, poi pagato), mai due uguali
  perform accoda_a_indirizzo(r.pal, 'workshop_iscrizione', r.email, r.id::text || ':' || v_stato, now(), v_vars);
  -- il promemoria del giorno prima alle 18 (una volta sola)
  if v_inizio is not null and v_inizio - interval '1 day' > now() then
    perform accoda_a_indirizzo(r.pal, 'promemoria_workshop', r.email, r.id::text,
      ((((v_inizio at time zone 'Europe/Rome')::date - 1) + time '18:00') at time zone 'Europe/Rome'), v_vars);
  end if;
end $$;
revoke all on function workshop_email(uuid) from public, anon, authenticated;

-- testi di partenza delle due email (la scuola li cambia in Impostazioni → Messaggi automatici)
insert into messaggi_template (palestra_id, evento, canale, oggetto, corpo, giorni, attivo)
select id, 'workshop_iscrizione', 'email', 'Workshop {{workshop}}: iscrizione registrata',
       E'Ciao {{nome_titolare}},\n\nl''iscrizione di {{nome}} al workshop «{{workshop}}» ({{opzione}}) è registrata.\n\nQuando:\n{{quando}}\nDove: {{luogo}}\n\n{{pagamento}}\n{{certificato}}\n\n{{info}}\n\nA presto!\n{{palestra}}',
       0, true
  from palestre
on conflict (palestra_id, evento, canale, giorni) do nothing;
insert into messaggi_template (palestra_id, evento, canale, oggetto, corpo, giorni, attivo)
select id, 'promemoria_workshop', 'email', 'Domani: workshop {{workshop}}',
       E'Ciao {{nome_titolare}},\n\nti ricordiamo il workshop «{{workshop}}» ({{opzione}}):\n{{quando}}\nDove: {{luogo}}\n\n{{certificato}}\n{{info}}\n\nA domani!\n{{palestra}}',
       1, true
  from palestre
on conflict (palestra_id, evento, canale, giorni) do nothing;

-- ------------------------------------------------------------------ iscrizione
-- p_origine: app (cliente dalla sua area), pubblico (pagina del workshop, esterni), segreteria (gestionale o Sportello).
-- La segreteria può cambiare il prezzo, iscrivere anche a iscrizioni chiuse e, con p_forza, oltre i posti.
-- p_con_quota: allo Sportello la quota si incassa a parte (false); altrove si aggiunge a chi non ce l'ha.
create or replace function iscrivi_workshop(p_opzione uuid, p_allievo uuid, p_origine text default 'app', p_prezzo_cent int default null,
                                            p_con_quota boolean default true, p_forza boolean default false, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o workshop_opzioni; w workshop; a allievi; pal palestre; v_staff boolean; v_esterno boolean; v_prezzo int; v_quota int := 0;
        v_pag uuid; v_id uuid; v_codice text; v_inizio timestamptz; v_m record;
begin
  select * into o from workshop_opzioni where id = p_opzione;
  if not found then raise exception 'opzione_non_trovata'; end if;
  select * into w from workshop where id = o.workshop_id for update;   -- uno alla volta: i posti non si sforano
  select * into a from allievi where id = p_allievo and palestra_id = w.palestra_id;
  if not found then raise exception 'allievo_non_trovato'; end if;
  select * into pal from palestre where id = w.palestra_id;
  v_staff := is_gestione(w.palestra_id);
  if p_origine not in ('app', 'pubblico', 'segreteria') then raise exception 'origine_non_valida'; end if;
  if not (v_staff or e_sistema() or p_allievo in (select miei_allievi())) then raise exception 'non_autorizzato'; end if;
  if p_origine = 'segreteria' and not v_staff then raise exception 'non_autorizzato'; end if;

  select min(inizio) into v_inizio from workshop_momenti where workshop_id = w.id;
  if w.stato = 'annullato' then raise exception 'workshop_annullato'; end if;
  if p_origine <> 'segreteria' then
    if w.stato <> 'pubblicato' or not o.attiva then raise exception 'iscrizioni_chiuse'; end if;
    if now() >= coalesce(w.iscrizioni_fino, v_inizio, now()) then raise exception 'iscrizioni_chiuse'; end if;
  end if;
  if cardinality(o.momenti) = 0 then raise exception 'opzione_senza_momenti'; end if;
  if exists (select 1 from workshop_iscrizioni where workshop_id = w.id and allievo_id = a.id and stato = 'iscritto') then
    raise exception 'gia_iscritto';
  end if;

  -- un posto in ogni momento compreso nell'opzione
  if not (v_staff and p_forza) then
    for v_m in select m.id, m.posti, m.titolo from workshop_momenti m where m.id = any (o.momenti) and m.posti is not null loop
      if workshop_occupati(v_m.id) >= v_m.posti then raise exception 'posti_esauriti'; end if;
    end loop;
  end if;

  v_esterno := workshop_esterno(a.id);
  v_prezzo := case when v_staff and p_origine = 'segreteria' and p_prezzo_cent is not null then p_prezzo_cent
                   else workshop_prezzo(o.prezzi, v_esterno, current_date) end;
  if v_prezzo is null or v_prezzo < 0 then raise exception 'prezzo_mancante'; end if;
  if p_con_quota and w.quota_esterni and coalesce(pal.quota_iscrizione_cent, 0) > 0 and not quota_pagata(a.id, current_date) then
    v_quota := pal.quota_iscrizione_cent;
  end if;

  if v_prezzo + v_quota > 0 then
    insert into pagamenti (palestra_id, account_id, allievo_id, causale, descrizione, importo_cent, metodo, stato)
    values (w.palestra_id, a.account_id, a.id, 'evento',
            'Workshop ' || w.titolo || ' · ' || o.nome || ' · ' || trim(a.nome || ' ' || coalesce(a.cognome, ''))
              || case when v_quota > 0 then ' (con quota annuale)' else '' end,
            v_prezzo + v_quota, case when p_origine = 'segreteria' then 'contanti' else 'online' end, 'in_attesa')
    returning id into v_pag;
  end if;

  insert into workshop_iscrizioni (palestra_id, workshop_id, opzione_id, allievo_id, esterno, prezzo_cent, quota_cent, pagamento_id, origine, note)
  values (w.palestra_id, w.id, o.id, a.id, v_esterno, v_prezzo, v_quota, v_pag, p_origine, nullif(btrim(p_note), ''))
  returning id, codice into v_id, v_codice;

  -- gratis: confermata subito (con l'email); a pagamento l'email parte quando si paga o si sceglie la segreteria
  if v_pag is null then perform workshop_email(v_id); end if;
  if p_origine <> 'segreteria' then
    perform accoda_push_staff(w.palestra_id, 'workshop', 'Iscrizione al workshop',
      trim(a.nome || ' ' || coalesce(a.cognome, '')) || ' · ' || w.titolo || ' (' || o.nome || ')' || case when v_esterno then ' · esterno' else '' end,
      '/gestione/workshop/' || w.id, null, null, 'workshop:' || v_id);
  end if;
  return jsonb_build_object('iscrizione_id', v_id, 'pagamento_id', v_pag, 'importo_cent', v_prezzo + v_quota,
                            'prezzo_cent', v_prezzo, 'quota_cent', v_quota, 'esterno', v_esterno, 'codice', v_codice);
end $$;
revoke all on function iscrivi_workshop(uuid, uuid, text, int, boolean, boolean, text) from public, anon;
grant execute on function iscrivi_workshop(uuid, uuid, text, int, boolean, boolean, text) to authenticated;

-- il cliente sceglie di pagare in segreteria: gli arriva l'email con "da pagare"
create or replace function workshop_pago_in_segreteria(p_iscrizione uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r workshop_iscrizioni;
begin
  select * into r from workshop_iscrizioni where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not (e_sistema() or is_gestione(r.palestra_id) or r.allievo_id in (select miei_allievi())) then raise exception 'non_autorizzato'; end if;
  perform workshop_email(r.id);
end $$;
revoke all on function workshop_pago_in_segreteria(uuid) from public, anon;
grant execute on function workshop_pago_in_segreteria(uuid) to authenticated, service_role;

-- pagato (carta, Satispay, segreteria, Sportello): la quota annuale compresa si registra e parte l'email di conferma
create or replace function trg_pagamenti_workshop() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_mese int;
begin
  if new.stato = 'pagato' and old.stato is distinct from 'pagato' then
    for r in select * from workshop_iscrizioni where pagamento_id = new.id loop
      if r.quota_cent > 0 then
        select coalesce(mese_inizio_stagione, 9) into v_mese from palestre where id = r.palestra_id;
        insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, pagamento_id, data)
        values (r.palestra_id, r.allievo_id, stagione_di(current_date, v_mese), r.quota_cent, new.id, current_date)
        on conflict do nothing;
      end if;
      if r.stato = 'iscritto' then perform workshop_email(r.id); end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists pagamenti_workshop on pagamenti;
create trigger pagamenti_workshop after update of stato on pagamenti for each row execute function trg_pagamenti_workshop();

-- ------------------------------------------------------------------ segreteria: incasso, presenze, annullamento
create or replace function incassa_workshop(p_iscrizione uuid, p_metodo text default 'contanti', p_ricevuta boolean default true, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r workshop_iscrizioni; v_pag pagamenti; v_ric uuid; v_avviso text;
begin
  select * into r from workshop_iscrizioni where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if r.stato <> 'iscritto' then raise exception 'iscrizione_annullata'; end if;
  select * into v_pag from pagamenti where id = r.pagamento_id;
  if v_pag.id is null then raise exception 'niente_da_incassare'; end if;
  if v_pag.stato = 'pagato' then raise exception 'gia_pagato'; end if;
  if v_pag.stato <> 'in_attesa' then update pagamenti set stato = 'in_attesa' where id = v_pag.id; end if;
  perform segna_pagato(v_pag.id, p_metodo);
  if p_ricevuta then
    begin
      v_ric := emetti_ricevuta(v_pag.id);
      if nullif(btrim(p_email), '') is not null then perform invia_ricevuta_email(v_ric, btrim(p_email)); end if;
    exception when others then
      v_avviso := 'Incassato, ma la ricevuta non è stata emessa (' || sqlerrm || '): emettila da Ricevute.';
    end;
  end if;
  return jsonb_build_object('ricevuta_id', v_ric, 'avviso', v_avviso);
end $$;
revoke all on function incassa_workshop(uuid, text, boolean, text) from public, anon;
grant execute on function incassa_workshop(uuid, text, boolean, text) to authenticated;

create or replace function presenza_workshop(p_iscrizione uuid, p_momento uuid, p_presente boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r workshop_iscrizioni;
begin
  select * into r from workshop_iscrizioni where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_staff(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  update workshop_iscrizioni
     set presenze = case when p_presente then array(select distinct x from unnest(presenze || p_momento) x) else array_remove(presenze, p_momento) end
   where id = r.id;
end $$;
revoke all on function presenza_workshop(uuid, uuid, boolean) from public, anon;
grant execute on function presenza_workshop(uuid, uuid, boolean) to authenticated;

-- il cliente annulla solo se non ha ancora pagato; la segreteria sempre (se aveva pagato resta il promemoria del rimborso)
create or replace function annulla_iscrizione_workshop(p_iscrizione uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r workshop_iscrizioni; v_staff boolean; v_stato_pag stato_pagamento; v_importo int; v_titolo text; v_nome text;
begin
  select * into r from workshop_iscrizioni where id = p_iscrizione for update;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  v_staff := is_gestione(r.palestra_id);
  if not (v_staff or r.allievo_id in (select miei_allievi())) then raise exception 'non_autorizzato'; end if;
  if r.stato = 'annullato' then return 'gia_annullata'; end if;
  select stato, importo_cent into v_stato_pag, v_importo from pagamenti where id = r.pagamento_id;
  if not v_staff and v_stato_pag = 'pagato' then raise exception 'gia_pagato'; end if;
  update workshop_iscrizioni set stato = 'annullato', annullata_at = now() where id = r.id;
  if v_stato_pag = 'in_attesa' then update pagamenti set stato = 'annullato' where id = r.pagamento_id; end if;
  delete from messaggi_coda where palestra_id = r.palestra_id and stato = 'in_coda' and chiave = 'promemoria_workshop:' || r.id::text;
  if v_stato_pag = 'pagato' then
    select titolo into v_titolo from workshop where id = r.workshop_id;
    select trim(nome || ' ' || coalesce(cognome, '')) into v_nome from allievi where id = r.allievo_id;
    insert into promemoria (palestra_id, testo, creato_da)
    values (r.palestra_id, 'Workshop «' || v_titolo || '»: ' || v_nome || ' non partecipa più e aveva pagato '
            || replace(to_char(v_importo / 100.0, 'FM999990.00'), '.', ',') || ' €. Se va rimborsato, fallo da Incassi.', 'Workshop');
    return 'annullata_da_rimborsare';
  end if;
  return 'annullata';
end $$;
revoke all on function annulla_iscrizione_workshop(uuid) from public, anon;
grant execute on function annulla_iscrizione_workshop(uuid) to authenticated;

-- ------------------------------------------------------------------ salvataggio dal gestionale (tutto insieme)
-- p: { id?, palestra_id, titolo, ..., momenti: [{id?, titolo, inizio, fine, sala_id, posti}], opzioni: [{id?, nome, descrizione, momenti: [id], prezzi, attiva}] }
-- Un'opzione tolta che ha già degli iscritti non si cancella: si ferma (non si vende più).
create or replace function salva_workshop(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_pal uuid := (p ->> 'palestra_id')::uuid; v_id uuid := nullif(p ->> 'id', '')::uuid; m jsonb; o jsonb;
        v_mid uuid; v_oid uuid; v_mids uuid[] := '{}'; v_oids uuid[] := '{}'; v_om uuid[]; v_prezzi jsonb;
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if nullif(btrim(p ->> 'titolo'), '') is null then raise exception 'titolo_mancante'; end if;
  if jsonb_array_length(coalesce(p -> 'momenti', '[]'::jsonb)) = 0 then raise exception 'momenti_mancanti'; end if;
  if jsonb_array_length(coalesce(p -> 'opzioni', '[]'::jsonb)) = 0 then raise exception 'opzioni_mancanti'; end if;
  if coalesce(p ->> 'stato', 'bozza') not in ('bozza', 'pubblicato', 'chiuso', 'annullato') then raise exception 'stato_non_valido'; end if;

  if v_id is not null and exists (select 1 from workshop where id = v_id) then
    if not exists (select 1 from workshop where id = v_id and palestra_id = v_pal) then raise exception 'non_autorizzato'; end if;
    update workshop set
      titolo = btrim(p ->> 'titolo'), sottotitolo = nullif(btrim(p ->> 'sottotitolo'), ''), insegnante = nullif(btrim(p ->> 'insegnante'), ''),
      descrizione = nullif(btrim(p ->> 'descrizione'), ''), info_pratiche = nullif(btrim(p ->> 'info_pratiche'), ''),
      locandina_url = nullif(p ->> 'locandina_url', ''), sede_id = nullif(p ->> 'sede_id', '')::uuid, luogo = nullif(btrim(p ->> 'luogo'), ''),
      stato = coalesce(p ->> 'stato', 'bozza'), iscrizioni_fino = nullif(p ->> 'iscrizioni_fino', '')::timestamptz,
      online = coalesce((p ->> 'online')::boolean, true), in_segreteria = coalesce((p ->> 'in_segreteria')::boolean, true),
      quota_esterni = coalesce((p ->> 'quota_esterni')::boolean, true), certificato_richiesto = coalesce((p ->> 'certificato_richiesto')::boolean, false),
      compenso_tipo = nullif(p ->> 'compenso_tipo', ''), compenso_cent = nullif(p ->> 'compenso_cent', '')::int,
      compenso_percentuale = nullif(p ->> 'compenso_percentuale', '')::numeric, note_interne = nullif(btrim(p ->> 'note_interne'), ''),
      updated_at = now()
    where id = v_id;
  else
    insert into workshop (id, palestra_id, titolo, sottotitolo, insegnante, descrizione, info_pratiche, locandina_url, sede_id, luogo, stato,
                          iscrizioni_fino, online, in_segreteria, quota_esterni, certificato_richiesto, compenso_tipo, compenso_cent,
                          compenso_percentuale, note_interne)
    values (coalesce(v_id, gen_random_uuid()), v_pal, btrim(p ->> 'titolo'), nullif(btrim(p ->> 'sottotitolo'), ''), nullif(btrim(p ->> 'insegnante'), ''),
            nullif(btrim(p ->> 'descrizione'), ''), nullif(btrim(p ->> 'info_pratiche'), ''), nullif(p ->> 'locandina_url', ''),
            nullif(p ->> 'sede_id', '')::uuid, nullif(btrim(p ->> 'luogo'), ''), coalesce(p ->> 'stato', 'bozza'),
            nullif(p ->> 'iscrizioni_fino', '')::timestamptz, coalesce((p ->> 'online')::boolean, true), coalesce((p ->> 'in_segreteria')::boolean, true),
            coalesce((p ->> 'quota_esterni')::boolean, true), coalesce((p ->> 'certificato_richiesto')::boolean, false),
            nullif(p ->> 'compenso_tipo', ''), nullif(p ->> 'compenso_cent', '')::int, nullif(p ->> 'compenso_percentuale', '')::numeric,
            nullif(btrim(p ->> 'note_interne'), ''))
    returning id into v_id;
  end if;

  -- momenti
  for m in select * from jsonb_array_elements(p -> 'momenti') loop
    if nullif(m ->> 'inizio', '') is null then raise exception 'momento_senza_data'; end if;
    if nullif(m ->> 'fine', '') is not null and (m ->> 'fine')::timestamptz <= (m ->> 'inizio')::timestamptz then raise exception 'momento_fine_prima'; end if;
    v_mid := null;
    insert into workshop_momenti (id, palestra_id, workshop_id, titolo, inizio, fine, sala_id, posti, ordine)
    values (coalesce(nullif(m ->> 'id', '')::uuid, gen_random_uuid()), v_pal, v_id, coalesce(nullif(btrim(m ->> 'titolo'), ''), 'Workshop'),
            (m ->> 'inizio')::timestamptz, nullif(m ->> 'fine', '')::timestamptz, nullif(m ->> 'sala_id', '')::uuid,
            nullif(m ->> 'posti', '')::int, coalesce(nullif(m ->> 'ordine', '')::int, 0))
    on conflict (id) do update set titolo = excluded.titolo, inizio = excluded.inizio, fine = excluded.fine, sala_id = excluded.sala_id,
                                   posti = excluded.posti, ordine = excluded.ordine
      where workshop_momenti.workshop_id = v_id
    returning id into v_mid;
    if v_mid is null then raise exception 'non_autorizzato'; end if;
    v_mids := v_mids || v_mid;
  end loop;

  -- opzioni con i loro prezzi
  for o in select * from jsonb_array_elements(p -> 'opzioni') loop
    if nullif(btrim(o ->> 'nome'), '') is null then raise exception 'opzione_senza_nome'; end if;
    v_om := array(select x::uuid from jsonb_array_elements_text(coalesce(o -> 'momenti', '[]'::jsonb)) x where x::uuid = any (v_mids));
    if cardinality(v_om) = 0 then raise exception 'opzione_senza_momenti'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('fino_al', nullif(x ->> 'fino_al', ''), 'allievi', (x ->> 'allievi')::int,
                                                 'esterni', nullif(x ->> 'esterni', '')::int)
                              order by nullif(x ->> 'fino_al', '')::date nulls last), '[]'::jsonb)
      into v_prezzi
      from jsonb_array_elements(coalesce(o -> 'prezzi', '[]'::jsonb)) x
     where nullif(x ->> 'allievi', '') is not null;
    if jsonb_array_length(v_prezzi) = 0 then raise exception 'prezzo_mancante'; end if;
    if exists (select 1 from jsonb_array_elements(v_prezzi) x where (x ->> 'allievi')::int < 0 or coalesce((x ->> 'esterni')::int, 0) < 0) then
      raise exception 'prezzo_mancante';
    end if;
    v_oid := null;
    insert into workshop_opzioni (id, palestra_id, workshop_id, nome, descrizione, momenti, prezzi, attiva, ordine)
    values (coalesce(nullif(o ->> 'id', '')::uuid, gen_random_uuid()), v_pal, v_id, btrim(o ->> 'nome'), nullif(btrim(o ->> 'descrizione'), ''),
            v_om, v_prezzi, coalesce((o ->> 'attiva')::boolean, true), coalesce(nullif(o ->> 'ordine', '')::int, 0))
    on conflict (id) do update set nome = excluded.nome, descrizione = excluded.descrizione, momenti = excluded.momenti,
                                   prezzi = excluded.prezzi, attiva = excluded.attiva, ordine = excluded.ordine
      where workshop_opzioni.workshop_id = v_id
    returning id into v_oid;
    if v_oid is null then raise exception 'non_autorizzato'; end if;
    v_oids := v_oids || v_oid;
  end loop;

  -- tolte: un'opzione con iscritti si ferma, le altre si cancellano; i momenti tolti si cancellano
  update workshop_opzioni set attiva = false
   where workshop_id = v_id and not (id = any (v_oids)) and exists (select 1 from workshop_iscrizioni wi where wi.opzione_id = workshop_opzioni.id);
  delete from workshop_opzioni
   where workshop_id = v_id and not (id = any (v_oids)) and not exists (select 1 from workshop_iscrizioni wi where wi.opzione_id = workshop_opzioni.id);
  delete from workshop_momenti where workshop_id = v_id and not (id = any (v_mids));
  return v_id;
end $$;
revoke all on function salva_workshop(jsonb) from public, anon;
grant execute on function salva_workshop(jsonb) to authenticated;

-- cancellare: solo senza iscritti e senza incassi; altrimenti si annulla (stato "annullato")
create or replace function elimina_workshop(p_workshop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w workshop;
begin
  select * into w from workshop where id = p_workshop;
  if not found then return; end if;
  if not is_gestione(w.palestra_id) then raise exception 'non_autorizzato'; end if;
  if exists (select 1 from workshop_iscrizioni wi left join pagamenti pg on pg.id = wi.pagamento_id
              where wi.workshop_id = w.id and (wi.stato = 'iscritto' or pg.stato = 'pagato')) then
    raise exception 'workshop_con_iscritti';
  end if;
  update pagamenti set stato = 'annullato' where stato = 'in_attesa' and id in (select pagamento_id from workshop_iscrizioni where workshop_id = w.id);
  delete from workshop where id = w.id;
end $$;
revoke all on function elimina_workshop(uuid) from public, anon;
grant execute on function elimina_workshop(uuid) to authenticated;

-- ------------------------------------------------------------------ app del cliente
-- i workshop pubblicati (o chiusi) non ancora finiti, con le iscrizioni della famiglia e, per ogni persona,
-- se paga da allieva o da esterna e se le serve la quota annuale
create or replace function workshop_area() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_pal uuid;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select a.palestra_id into v_pal from account a where a.user_id = auth.uid() limit 1;
  if v_pal is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(workshop_scheda(w.id) || jsonb_build_object(
      'iscritti', coalesce((
        select jsonb_agg(jsonb_build_object('id', wi.id, 'allievo_id', wi.allievo_id, 'nome', al.nome, 'opzione', o.nome, 'opzione_id', o.id,
                 'importo_cent', wi.prezzo_cent + wi.quota_cent, 'quota_cent', wi.quota_cent, 'pagato', pg.stato = 'pagato',
                 'da_pagare', pg.stato = 'in_attesa', 'codice', wi.codice) order by al.nome)
          from workshop_iscrizioni wi
          join allievi al on al.id = wi.allievo_id
          join workshop_opzioni o on o.id = wi.opzione_id
          left join pagamenti pg on pg.id = wi.pagamento_id
         where wi.workshop_id = w.id and wi.stato = 'iscritto' and wi.allievo_id in (select miei_allievi())), '[]'::jsonb),
      'persone', coalesce((
        select jsonb_agg(jsonb_build_object('allievo_id', al.id, 'nome', al.nome, 'cognome', al.cognome, 'esterno', workshop_esterno(al.id),
                 'quota_serve', w.quota_esterni and coalesce(p.quota_iscrizione_cent, 0) > 0 and not quota_pagata(al.id, current_date),
                 'certificato_ok', al.certificato_scadenza is not null
                                   and al.certificato_scadenza >= coalesce((select max(coalesce(m.fine, m.inizio))::date from workshop_momenti m where m.workshop_id = w.id), current_date))
                 order by al.is_titolare desc, al.nome)
          from allievi al where al.id in (select miei_allievi())), '[]'::jsonb))
      order by (select min(m.inizio) from workshop_momenti m where m.workshop_id = w.id))
    from workshop w join palestre p on p.id = w.palestra_id
   where w.palestra_id = v_pal and w.stato in ('pubblicato', 'chiuso')
     and exists (select 1 from workshop_momenti m where m.workshop_id = w.id and coalesce(m.fine, m.inizio) >= now() - interval '6 hours')
  ), '[]'::jsonb);
end $$;
revoke all on function workshop_area() from public, anon;
grant execute on function workshop_area() to authenticated;

-- Sportello e gestionale: i workshop dove si può ancora iscrivere qualcuno
create or replace function workshop_aperti(p_palestra uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  return coalesce((
    select jsonb_agg(workshop_scheda(w.id) order by (select min(m.inizio) from workshop_momenti m where m.workshop_id = w.id))
      from workshop w
     where w.palestra_id = p_palestra and w.stato in ('pubblicato', 'chiuso', 'bozza')
       and exists (select 1 from workshop_momenti m where m.workshop_id = w.id and coalesce(m.fine, m.inizio) >= now() - interval '6 hours')
  ), '[]'::jsonb);
end $$;
revoke all on function workshop_aperti(uuid) from public, anon;
grant execute on function workshop_aperti(uuid) to authenticated;

-- ------------------------------------------------------------------ pagina pubblica (solo dal server del sito)
create or replace function workshop_pubblico(p_slug text, p_palestra_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select w.id into v_id from workshop w join palestre p on p.id = w.palestra_id
   where p.slug = p_palestra_slug and w.slug = p_slug and w.stato in ('pubblicato', 'chiuso', 'annullato');
  if v_id is null then return null; end if;
  return workshop_scheda(v_id);
end $$;
revoke all on function workshop_pubblico(text, text) from public, anon, authenticated;
grant execute on function workshop_pubblico(text, text) to service_role;

-- iscrizione di un esterno dalla pagina pubblica: contatto e persona (o quelli che ci sono già con quella email),
-- poi l'iscrizione come dall'app. Per un figlio: titolare = genitore, partecipante = il figlio.
create or replace function iscrivi_workshop_pubblico(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o workshop_opzioni; w workshop; v_email text := lower(btrim(p -> 'titolare' ->> 'email')); v_adulto boolean := coalesce((p ->> 'adulto')::boolean, true);
        v_acc uuid; v_all uuid; v_nome text; v_cognome text; v_nascita date; v_cf text; r jsonb;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  if coalesce((p ->> 'consenso_privacy')::boolean, false) is not true then raise exception 'consenso_privacy_mancante'; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_non_valida'; end if;
  select * into o from workshop_opzioni where id = nullif(p ->> 'opzione_id', '')::uuid;
  if not found then raise exception 'opzione_non_trovata'; end if;
  select * into w from workshop where id = o.workshop_id;
  if not exists (select 1 from palestre where id = w.palestra_id and slug = p ->> 'palestra_slug') then raise exception 'opzione_non_trovata'; end if;

  if v_adulto then
    v_nome := nullif(btrim(p -> 'titolare' ->> 'nome'), ''); v_cognome := nullif(btrim(p -> 'titolare' ->> 'cognome'), '');
    v_nascita := nullif(p -> 'titolare' ->> 'data_nascita', '')::date; v_cf := upper(nullif(btrim(p -> 'titolare' ->> 'codice_fiscale'), ''));
  else
    v_nome := nullif(btrim(p -> 'partecipante' ->> 'nome'), ''); v_cognome := nullif(btrim(p -> 'partecipante' ->> 'cognome'), '');
    v_nascita := nullif(p -> 'partecipante' ->> 'data_nascita', '')::date; v_cf := upper(nullif(btrim(p -> 'partecipante' ->> 'codice_fiscale'), ''));
  end if;
  if v_nome is null or v_cognome is null or v_nascita is null
     or nullif(btrim(p -> 'titolare' ->> 'nome'), '') is null or nullif(btrim(p -> 'titolare' ->> 'cognome'), '') is null
     or nullif(btrim(p -> 'titolare' ->> 'telefono'), '') is null then
    raise exception 'dati_mancanti';
  end if;

  -- con un'email già nota non si cambiano i dati che ci sono (chi scrive potrebbe non essere il titolare)
  insert into account (palestra_id, nome, cognome, email, telefono, fonte, consenso_privacy_at, consenso_marketing)
  values (w.palestra_id, btrim(p -> 'titolare' ->> 'nome'), btrim(p -> 'titolare' ->> 'cognome'), v_email, btrim(p -> 'titolare' ->> 'telefono'),
          'workshop', now(), coalesce((p ->> 'consenso_marketing')::boolean, false))
  on conflict (palestra_id, email) do update
    set telefono = coalesce(account.telefono, excluded.telefono),
        consenso_privacy_at = coalesce(account.consenso_privacy_at, now()),
        consenso_marketing = account.consenso_marketing or excluded.consenso_marketing
  returning id into v_acc;

  select id into v_all from allievi
   where account_id = v_acc and lower(nome) = lower(v_nome) and data_nascita = v_nascita
   order by created_at limit 1;
  if v_all is null then
    insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare, codice_fiscale)
    values (w.palestra_id, v_acc, v_nome, v_cognome, v_nascita, v_adulto, v_cf)
    returning id into v_all;
  elsif v_cf is not null then
    update allievi set codice_fiscale = v_cf where id = v_all and codice_fiscale is null;
  end if;

  r := iscrivi_workshop(o.id, v_all, 'pubblico', null, true, false, p ->> 'note');
  return r || jsonb_build_object('allievo_id', v_all);
end $$;
revoke all on function iscrivi_workshop_pubblico(jsonb) from public, anon, authenticated;
grant execute on function iscrivi_workshop_pubblico(jsonb) to service_role;

-- la pagina "la tua iscrizione" del link pubblico (con il codice segreto dell'iscrizione)
create or replace function workshop_iscrizione_codice(p_codice text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  return (
    select jsonb_build_object('id', wi.id, 'stato', wi.stato, 'nome', al.nome, 'opzione', o.nome, 'opzione_id', o.id,
             'importo_cent', wi.prezzo_cent + wi.quota_cent, 'quota_cent', wi.quota_cent, 'pagamento_id', wi.pagamento_id,
             'pagato', pg.stato = 'pagato', 'da_pagare', pg.stato = 'in_attesa', 'email', acc.email, 'codice', wi.codice,
             'workshop', workshop_scheda(wi.workshop_id))
      from workshop_iscrizioni wi
      join allievi al on al.id = wi.allievo_id
      join workshop_opzioni o on o.id = wi.opzione_id
      left join account acc on acc.id = al.account_id
      left join pagamenti pg on pg.id = wi.pagamento_id
     where wi.codice = p_codice);
end $$;
revoke all on function workshop_iscrizione_codice(text) from public, anon, authenticated;
grant execute on function workshop_iscrizione_codice(text) to service_role;

-- ------------------------------------------------------------------ Sportello: il workshop insieme al resto
-- sportello_conferma riceve anche workshop_opzione_id (e workshop_prezzo_cent): iscrizione, incasso con lo stesso metodo,
-- ricevuta ed email insieme a quota e abbonamento. Si modifica la funzione esistente solo se non è già stato fatto.
do $$
declare d text;
begin
  select pg_get_functiondef('sportello_conferma(jsonb)'::regprocedure) into d;
  if position('workshop_opzione_id' in d) = 0 then
    d := replace(d, 'v_lez uuid; v_esiti jsonb', 'v_lez uuid; v_ws jsonb; v_esiti jsonb');
    d := replace(d, '  -- 4) ricevute', $r$  -- 3b) workshop (query 147): iscrizione e incasso con lo stesso metodo (la quota annuale è già al punto 2)
  if nullif(p->>'workshop_opzione_id', '') is not null then
    v_ws := iscrivi_workshop((p->>'workshop_opzione_id')::uuid, v_all, 'segreteria',
                             nullif(p->>'workshop_prezzo_cent', '')::int, false, coalesce((p->>'forza')::boolean, false), nullif(trim(p->>'note'), ''));
    if nullif(v_ws->>'pagamento_id', '') is not null then
      update pagamenti set stato = 'pagato', metodo = v_metodo, pagato_at = now() where id = (v_ws->>'pagamento_id')::uuid;
      v_pagamenti := v_pagamenti || (v_ws->>'pagamento_id')::uuid;
    end if;
  end if;

  -- 4) ricevute$r$);
    d := replace(d, '''avvisi'', to_jsonb(v_avvisi));', '''avvisi'', to_jsonb(v_avvisi), ''workshop'', v_ws);');
    if position('workshop_opzione_id' in d) = 0 or position('''workshop'', v_ws' in d) = 0 then
      raise exception 'sportello_conferma: modifica per i workshop non applicata (la funzione è diversa dal previsto)';
    end if;
    execute d;
  end if;
end $$;
