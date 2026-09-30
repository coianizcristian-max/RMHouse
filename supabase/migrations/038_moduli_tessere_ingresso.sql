-- =====================================================================
-- RMHouse — 038 MODULI DA FIRMARE, TESSERAMENTO, INGRESSO CON QR
--
-- 1. Moduli da firmare (regolamento, privacy e immagini, liberatoria…):
--    si firmano col dito dall'area clienti o sul tablet della reception;
--    per i minori firma un genitore. Ogni firma conserva il testo firmato.
-- 2. Tesseramento all'ente sportivo: chi è tesserato per la stagione, chi
--    manca, dati mancanti, elenco da mandare all'ente, numeri di tessera.
-- 3. Ingresso con QR: ogni persona ha il suo pass nell'area clienti; la
--    reception lo inquadra con la fotocamera del telefono e vede subito se
--    è tutto in regola. La presenza si segna da sola.
-- 4. Pacchetti a ingressi: ogni presenza ora scala un ingresso (prima non
--    succedeva).
-- Da eseguire dopo la 037. Si può rieseguire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Moduli
-- ---------------------------------------------------------------------
create table if not exists moduli (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  titolo       text not null,
  testo        text not null,
  per_chi      text not null default 'tutti' check (per_chi in ('tutti', 'minori', 'maggiorenni')),
  obbligatorio boolean not null default true,
  versione     int not null default 1,
  attivo       boolean not null default true,
  ordine       int not null default 0,
  created_at   timestamptz not null default now(),
  aggiornato_at timestamptz not null default now()
);
alter table moduli enable row level security;
drop policy if exists staff_legge on moduli;
create policy staff_legge on moduli for select to authenticated using (is_staff(palestra_id));
drop policy if exists cliente_legge on moduli;
create policy cliente_legge on moduli for select to authenticated
  using (attivo and palestra_id in (select a.palestra_id from account a where a.user_id = auth.uid()));
drop policy if exists gestione_scrive on moduli;
create policy gestione_scrive on moduli for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Cambiare il testo di un modulo crea una nuova versione: chi aveva firmato la vecchia va rifatto firmare
create or replace function trg_moduli_versione()
returns trigger language plpgsql as $$
begin
  if new.testo is distinct from old.testo then
    new.versione := old.versione + 1;
    new.aggiornato_at := now();
  end if;
  return new;
end $$;
drop trigger if exists moduli_versione on moduli;
create trigger moduli_versione before update on moduli for each row execute function trg_moduli_versione();

create table if not exists firme (
  id              uuid primary key default gen_random_uuid(),
  palestra_id     uuid not null references palestre(id) on delete cascade,
  modulo_id       uuid not null references moduli(id) on delete cascade,
  versione        int not null,
  allievo_id      uuid not null references allievi(id) on delete cascade,
  firmatario      text not null,
  firmatario_cf   text,
  per_conto       boolean not null default false,        -- genitore o tutore per un minore
  titolo          text not null,                         -- testo congelato com'era al momento della firma
  testo           text not null,
  firma_svg       text not null,
  dove            text not null default 'area' check (dove in ('area', 'reception')),
  raccolta_da     uuid,
  user_agent      text,
  firmato_at      timestamptz not null default now()
);
create index if not exists firme_allievo on firme (allievo_id, modulo_id, versione);
alter table firme enable row level security;
drop policy if exists gestione_legge on firme;
create policy gestione_legge on firme for select to authenticated using (is_gestione(palestra_id));
drop policy if exists cliente_legge on firme;
create policy cliente_legge on firme for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));

-- I moduli che una persona deve ancora firmare (versione in vigore)
create or replace function moduli_da_firmare(p_allievo uuid)
returns table (modulo_id uuid, titolo text, versione int, obbligatorio boolean, firmata_versione int, firmato_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.titolo, m.versione, m.obbligatorio,
         (select max(f.versione) from firme f where f.modulo_id = m.id and f.allievo_id = a.id),
         (select max(f.firmato_at) from firme f where f.modulo_id = m.id and f.allievo_id = a.id)
  from allievi a
  join moduli m on m.palestra_id = a.palestra_id and m.attivo
  where a.id = p_allievo
    and (a.account_id in (select miei_account()) or is_staff(a.palestra_id))
    and (m.per_chi = 'tutti'
         or (m.per_chi = 'minori' and a.data_nascita > current_date - interval '18 years')
         or (m.per_chi = 'maggiorenni' and (a.data_nascita is null or a.data_nascita <= current_date - interval '18 years')))
  order by m.ordine, m.titolo;
$$;
grant execute on function moduli_da_firmare(uuid) to authenticated;

create or replace function firma_modulo(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; m moduli; v_id uuid; v_reception boolean;
begin
  select * into a from allievi where id = (p ->> 'allievo_id')::uuid;
  select * into m from moduli where id = (p ->> 'modulo_id')::uuid and attivo;
  if a.id is null or m.id is null or m.palestra_id <> a.palestra_id then raise exception 'non_trovato'; end if;
  v_reception := is_staff(a.palestra_id);
  if not v_reception and a.account_id not in (select miei_account()) then raise exception 'non_autorizzato'; end if;
  if coalesce(trim(p ->> 'firmatario'), '') = '' then raise exception 'nome_mancante'; end if;
  if coalesce(p ->> 'firma_svg', '') not like '<svg%' or length(p ->> 'firma_svg') > 200000
     or p ->> 'firma_svg' ~* '(<script|\son[a-z]+\s*=|javascript:|<foreignobject|href)' then raise exception 'firma_mancante'; end if;

  insert into firme (palestra_id, modulo_id, versione, allievo_id, firmatario, firmatario_cf, per_conto, titolo, testo,
                     firma_svg, dove, raccolta_da, user_agent)
  values (a.palestra_id, m.id, m.versione, a.id, trim(p ->> 'firmatario'), nullif(upper(trim(p ->> 'firmatario_cf')), ''),
          coalesce((p ->> 'per_conto')::boolean, false), m.titolo, m.testo, p ->> 'firma_svg',
          case when v_reception then 'reception' else 'area' end, case when v_reception then auth.uid() end,
          left(p ->> 'user_agent', 300))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function firma_modulo(jsonb) to authenticated;

-- Situazione di ogni modulo fra i clienti attivi
create or replace function situazione_moduli(p_palestra uuid)
returns table (modulo_id uuid, titolo text, versione int, obbligatorio boolean, attivo boolean, per_chi text,
               firmati bigint, mancano bigint)
language sql stable security invoker set search_path = public as $$
  with attivi as (
    select distinct a.id, a.data_nascita from allievi a
    join iscrizioni i on i.allievo_id = a.id and i.stato = 'attiva' and i.data_fine >= current_date
    where a.palestra_id = p_palestra
  )
  select m.id, m.titolo, m.versione, m.obbligatorio, m.attivo, m.per_chi,
         count(*) filter (where exists (select 1 from firme f where f.modulo_id = m.id and f.allievo_id = t.id and f.versione = m.versione)),
         count(*) filter (where not exists (select 1 from firme f where f.modulo_id = m.id and f.allievo_id = t.id and f.versione = m.versione))
  from moduli m
  left join attivi t on (m.per_chi = 'tutti'
         or (m.per_chi = 'minori' and t.data_nascita > current_date - interval '18 years')
         or (m.per_chi = 'maggiorenni' and (t.data_nascita is null or t.data_nascita <= current_date - interval '18 years')))
  where m.palestra_id = p_palestra
  group by m.id
  order by m.ordine, m.titolo;
$$;
grant execute on function situazione_moduli(uuid) to authenticated;

-- Tre moduli di partenza, da rivedere con chi vi segue per la parte legale
insert into moduli (palestra_id, titolo, testo, per_chi, obbligatorio, ordine)
select p.id, x.titolo, replace(x.testo, '{scuola}', p.nome), x.per_chi, x.obbl, x.ordine
from palestre p cross join (values
  ('Regolamento della scuola',
   E'Dichiaro di aver letto e di accettare il regolamento di {scuola}.\n\n1. Si entra in sala solo con un certificato medico valido per l''attività non agonistica.\n2. Le lezioni perse si recuperano secondo le regole del proprio abbonamento; gli abbonamenti non sono rimborsabili.\n3. Si arriva puntuali, con abbigliamento adatto e senza gioielli che possano ferire.\n4. La scuola non risponde degli oggetti lasciati negli spogliatoi.\n5. Si rispettano insegnanti, compagni e attrezzature: chi danneggia risponde del danno.\n6. L''attività comporta un rischio di infortunio che dichiaro di conoscere; seguirò sempre le indicazioni dell''insegnante.',
   'tutti', true, 1),
  ('Privacy, foto e video',
   E'Ho ricevuto l''informativa sul trattamento dei dati personali di {scuola} e acconsento al trattamento per la gestione delle iscrizioni, dei pagamenti e delle comunicazioni di servizio.\n\nAutorizzo inoltre la scuola a pubblicare foto e video delle lezioni, dei saggi e degli eventi in cui compaio, sul sito e sui canali social della scuola, senza alcun compenso. Posso revocare questa autorizzazione in qualsiasi momento scrivendo alla segreteria.',
   'tutti', true, 2),
  ('Consenso del genitore per il minore',
   E'Io, genitore o tutore, autorizzo mio figlio / mia figlia a frequentare le attività di {scuola}, dichiaro di aver letto il regolamento e l''informativa privacy e di accettarli anche per suo conto, e mi impegno a comunicare alla scuola qualsiasi informazione utile sulla sua salute.',
   'minori', true, 3)
) as x(titolo, testo, per_chi, obbl, ordine)
where not exists (select 1 from moduli m where m.palestra_id = p.id);

-- ---------------------------------------------------------------------
-- 2. Tesseramento
-- ---------------------------------------------------------------------
alter table palestre add column if not exists ente jsonb not null default '{}'::jsonb;  -- nome, affiliazione, quota_comprende_tessera
alter table allievi add column if not exists indirizzo text;   -- per i minori che vivono altrove o per l'ente
create table if not exists tesseramenti (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  allievo_id    uuid not null references allievi(id) on delete cascade,
  stagione      int not null,
  ente          text,
  numero        text,
  stato         text not null default 'da_inviare' check (stato in ('da_inviare', 'inviato', 'tesserato')),
  inviato_at    timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  unique (allievo_id, stagione)
);
alter table tesseramenti enable row level security;
drop policy if exists gestione_tutto on tesseramenti;
create policy gestione_tutto on tesseramenti for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Se la quota annuale comprende la tessera, pagare la quota mette la persona fra i da tesserare
create or replace function trg_quota_tessera()
returns trigger language plpgsql security definer set search_path = public as $$
declare p palestre;
begin
  select * into p from palestre where id = new.palestra_id;
  if coalesce((p.ente ->> 'quota_comprende_tessera')::boolean, false) then
    insert into tesseramenti (palestra_id, allievo_id, stagione, ente)
    values (new.palestra_id, new.allievo_id, new.stagione, p.ente ->> 'nome')
    on conflict (allievo_id, stagione) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists quota_tessera on quote_iscrizione;
create trigger quota_tessera after insert on quote_iscrizione for each row execute function trg_quota_tessera();

-- Tutti quelli attivi nella stagione, con la loro tessera e i dati che mancano
create or replace function situazione_tesseramento(p_palestra uuid, p_stagione int)
returns table (allievo_id uuid, nome text, cognome text, sesso text, data_nascita date, luogo_nascita text,
               codice_fiscale text, indirizzo text, cap text, citta text, provincia text, email text, telefono text,
               corsi text, tesseramento_id uuid, numero text, stato text, inviato_at timestamptz, mancano text[])
language sql stable security invoker set search_path = public as $$
  with p as (select mese_inizio_stagione m from palestre where id = p_palestra),
  periodo as (select make_date(p_stagione, (select m from p), 1) as dal,
                     (make_date(p_stagione, (select m from p), 1) + interval '1 year' - interval '1 day')::date as al),
  attivi as (
    select distinct i.allievo_id from iscrizioni i, periodo
    where i.palestra_id = p_palestra and i.stato in ('attiva', 'scaduta', 'sospesa')
      and i.data_inizio <= periodo.al and i.data_fine >= periodo.dal
    union
    select t.allievo_id from tesseramenti t where t.palestra_id = p_palestra and t.stagione = p_stagione
  )
  select a.id, a.nome, a.cognome, a.sesso, a.data_nascita, a.luogo_nascita, a.codice_fiscale,
         coalesce(a.indirizzo, acc.indirizzo), acc.cap, acc.citta, acc.provincia, acc.email, acc.telefono,
         (select string_agg(distinct c.nome, ', ') from iscrizioni i join corsi c on c.id = i.corso_id
           where i.allievo_id = a.id and i.stato in ('attiva', 'scaduta', 'sospesa')),
         t.id, coalesce(t.numero, a.tessera), coalesce(t.stato, case when a.tessera is not null then 'tesserato' end), t.inviato_at,
         array_remove(array[
           case when a.codice_fiscale is null then 'codice fiscale' end,
           case when a.data_nascita is null then 'data di nascita' end,
           case when a.luogo_nascita is null then 'luogo di nascita' end,
           case when a.sesso is null then 'sesso' end,
           case when coalesce(a.indirizzo, acc.indirizzo) is null then 'indirizzo' end,
           case when acc.citta is null then 'città' end
         ], null)
  from attivi x
  join allievi a on a.id = x.allievo_id
  join account acc on acc.id = a.account_id
  left join tesseramenti t on t.allievo_id = a.id and t.stagione = p_stagione
  where a.cognome <> 'anonimizzata'
  order by a.cognome, a.nome;
$$;
grant execute on function situazione_tesseramento(uuid, int) to authenticated;

create or replace function aggiorna_tesseramenti(p_palestra uuid, p_stagione int, p_allievi uuid[], p_stato text, p_numero_da int default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int := 0; v_ente text;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_stato not in ('da_inviare', 'inviato', 'tesserato') then raise exception 'stato_non_valido'; end if;
  select ente ->> 'nome' into v_ente from palestre where id = p_palestra;
  foreach v_id in array p_allievi loop
    insert into tesseramenti (palestra_id, allievo_id, stagione, ente, stato, inviato_at, numero)
    values (p_palestra, v_id, p_stagione, v_ente, p_stato,
            case when p_stato = 'inviato' then now() end,
            case when p_numero_da is not null then (p_numero_da + n)::text end)
    on conflict (allievo_id, stagione) do update
       set stato = excluded.stato,
           inviato_at = coalesce(tesseramenti.inviato_at, excluded.inviato_at),
           numero = coalesce(excluded.numero, tesseramenti.numero);
    if p_numero_da is not null then
      update allievi set tessera = (p_numero_da + n)::text where id = v_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function aggiorna_tesseramenti(uuid, int, uuid[], text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Ingresso con QR
-- ---------------------------------------------------------------------
create table if not exists ingressi (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  allievo_id   uuid not null references allievi(id) on delete cascade,
  quando       timestamptz not null default now(),
  lezione_id   uuid references lezioni(id) on delete set null,
  esito        text not null check (esito in ('ok', 'attenzione', 'bloccato')),
  avvisi       text[] not null default '{}',
  registrato_da uuid
);
create index if not exists ingressi_giorno on ingressi (palestra_id, quando desc);
alter table ingressi enable row level security;
drop policy if exists staff_legge on ingressi;
create policy staff_legge on ingressi for select to authenticated using (is_staff(palestra_id));

create or replace function registra_ingresso(p_allievo uuid default null, p_token uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; v_lez record; avv text[] := '{}'; v_esito text := 'ok'; v_iscr record; v_moduli int; v_id uuid;
        p palestre;
begin
  select * into a from allievi where (p_allievo is not null and id = p_allievo) or (p_token is not null and token = p_token);
  if not found then raise exception 'persona_non_trovata'; end if;
  if not is_staff(a.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into p from palestre where id = a.palestra_id;

  -- abbonamento
  select i.*, t.modalita, t.nome as tipo into v_iscr
    from iscrizioni i join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
   where i.allievo_id = a.id and i.stato = 'attiva' and i.data_inizio <= current_date and i.data_fine >= current_date
   order by i.data_fine desc limit 1;
  if v_iscr.id is null then
    if exists (select 1 from prove pr join lezioni l on l.id = pr.lezione_id
                where pr.allievo_id = a.id and l.data = current_date and pr.stato <> 'annullata') then
      avv := array_append(avv, ('Lezione di prova')::text);
    else
      avv := array_append(avv, ('Nessun abbonamento in corso')::text); v_esito := 'bloccato';
    end if;
  elsif v_iscr.modalita = 'ingressi' and coalesce(v_iscr.ingressi_residui, 0) <= 0 then
    avv := array_append(avv, ('Ingressi finiti')::text); v_esito := 'bloccato';
  elsif v_iscr.data_fine <= current_date + 7 then
    avv := array_append(avv, (('Abbonamento in scadenza il ' || to_char(v_iscr.data_fine, 'DD/MM')))::text);
  end if;

  -- certificato
  if a.certificato_scadenza is null then avv := array_append(avv, ('Certificato mancante')::text); v_esito := 'bloccato';
  elsif a.certificato_scadenza < current_date then avv := array_append(avv, ('Certificato scaduto')::text); v_esito := 'bloccato';
  elsif a.certificato_scadenza <= current_date + 30 then avv := array_append(avv, (('Certificato in scadenza il ' || to_char(a.certificato_scadenza, 'DD/MM')))::text);
  end if;

  -- quota e moduli
  if p.quota_iscrizione_cent > 0 and v_iscr.id is not null and not quota_pagata(a.id) then avv := array_append(avv, ('Quota annuale da pagare')::text); end if;
  select count(*) into v_moduli from moduli m
   where m.palestra_id = a.palestra_id and m.attivo and m.obbligatorio
     and (m.per_chi = 'tutti' or (m.per_chi = 'minori' and a.data_nascita > current_date - interval '18 years')
          or (m.per_chi = 'maggiorenni' and (a.data_nascita is null or a.data_nascita <= current_date - interval '18 years')))
     and not exists (select 1 from firme f where f.modulo_id = m.id and f.allievo_id = a.id and f.versione = m.versione);
  if v_moduli > 0 then avv := array_append(avv, ((v_moduli || case when v_moduli = 1 then ' modulo da firmare' else ' moduli da firmare' end))::text); end if;

  if v_esito = 'ok' and array_length(avv, 1) > 0 and not (avv = array['Lezione di prova']) then v_esito := 'attenzione'; end if;

  -- la lezione: quella di oggi più vicina a adesso, fra i suoi corsi
  select l.id, l.inizio, c.nome as corso into v_lez
    from lezioni l join corsi c on c.id = l.corso_id
   where l.palestra_id = a.palestra_id and l.data = current_date and l.stato = 'programmata'
     and l.inizio between now() - interval '75 minutes' and now() + interval '60 minutes'
     and (exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva' and i.corso_id = l.corso_id)
          or exists (select 1 from iscrizioni i join tipi_abbonamento_corsi tc on tc.tipo_abbonamento_id = i.tipo_abbonamento_id
                      where i.allievo_id = a.id and i.stato = 'attiva' and tc.corso_id = l.corso_id)
          or exists (select 1 from prove pr where pr.allievo_id = a.id and pr.lezione_id = l.id)
          or exists (select 1 from prenotazioni pn where pn.allievo_id = a.id and pn.lezione_id = l.id))
   order by abs(extract(epoch from (l.inizio - now()))) limit 1;

  if v_lez.id is not null and v_esito <> 'bloccato' then
    insert into presenze (palestra_id, lezione_id, allievo_id, presente, registrata_da)
    values (a.palestra_id, v_lez.id, a.id, true, auth.uid())
    on conflict (lezione_id, allievo_id) do update set presente = true, registrata_da = auth.uid(), registrata_at = now();
  end if;

  insert into ingressi (palestra_id, allievo_id, lezione_id, esito, avvisi, registrato_da)
  values (a.palestra_id, a.id, v_lez.id, v_esito, avv, auth.uid()) returning id into v_id;

  return jsonb_build_object('allievo_id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'foto_url', a.foto_url,
    'esito', v_esito, 'avvisi', to_jsonb(avv), 'abbonamento', v_iscr.tipo,
    'ingressi_residui', case when v_iscr.modalita = 'ingressi' then (select ingressi_residui from iscrizioni where id = v_iscr.id) end,
    'lezione', v_lez.corso, 'lezione_inizio', v_lez.inizio, 'presenza', v_lez.id is not null and v_esito <> 'bloccato');
end $$;
grant execute on function registra_ingresso(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Pacchetti a ingressi: ogni presenza scala un ingresso
-- ---------------------------------------------------------------------
create or replace function trg_presenze_ingressi()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_corso uuid; v_data date; v_prima boolean; v_dopo boolean; v_allievo uuid; v_iscr uuid;
begin
  v_prima := case when tg_op in ('UPDATE', 'DELETE') then old.presente else false end;
  v_dopo := case when tg_op in ('INSERT', 'UPDATE') then new.presente else false end;
  if v_prima = v_dopo then return coalesce(new, old); end if;
  v_allievo := coalesce(new.allievo_id, old.allievo_id);
  select corso_id, data into v_corso, v_data from lezioni where id = coalesce(new.lezione_id, old.lezione_id);

  select i.id into v_iscr from iscrizioni i join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
   where i.allievo_id = v_allievo and t.modalita = 'ingressi' and i.stato = 'attiva'
     and v_data between i.data_inizio and i.data_fine
     and (i.corso_id = v_corso or exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = t.id and tc.corso_id = v_corso))
   order by i.data_fine limit 1;
  if v_iscr is null then return coalesce(new, old); end if;

  update iscrizioni set ingressi_residui = greatest(0, coalesce(ingressi_residui, 0) + case when v_dopo then -1 else 1 end)
   where id = v_iscr;
  return coalesce(new, old);
end $$;
drop trigger if exists presenze_ingressi on presenze;
create trigger presenze_ingressi after insert or update of presente or delete on presenze
  for each row execute function trg_presenze_ingressi();

select 'moduli' as cosa, count(*) from moduli
union all select 'tesseramenti', count(*) from tesseramenti;

-- Chi, fra i clienti attivi, deve ancora firmare un modulo
create or replace function chi_manca_modulo(p_palestra uuid, p_modulo uuid)
returns table (allievo_id uuid, nome text, cognome text, telefono text, firmata_versione int)
language sql stable security invoker set search_path = public as $$
  select distinct on (a.cognome, a.nome, a.id) a.id, a.nome, a.cognome, acc.telefono,
         (select max(f.versione) from firme f where f.modulo_id = m.id and f.allievo_id = a.id)
  from moduli m
  join allievi a on a.palestra_id = m.palestra_id
  join account acc on acc.id = a.account_id
  join iscrizioni i on i.allievo_id = a.id and i.stato = 'attiva' and i.data_fine >= current_date
  where m.id = p_modulo and m.palestra_id = p_palestra
    and (m.per_chi = 'tutti' or (m.per_chi = 'minori' and a.data_nascita > current_date - interval '18 years')
         or (m.per_chi = 'maggiorenni' and (a.data_nascita is null or a.data_nascita <= current_date - interval '18 years')))
    and not exists (select 1 from firme f where f.modulo_id = m.id and f.allievo_id = a.id and f.versione = m.versione)
  order by a.cognome, a.nome, a.id;
$$;
grant execute on function chi_manca_modulo(uuid, uuid) to authenticated;
