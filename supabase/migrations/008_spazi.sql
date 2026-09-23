-- =====================================================================
-- RMHouse — 008 AFFITTO SPAZI ED EVENTI
-- Listino orario delle sale, richieste di noleggio dal sito, conferme,
-- acconti e pacchetti per feste e saggi.
-- Da eseguire dopo 001/002/seed/004/005/006/007.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LISTINO
-- ---------------------------------------------------------------------
create table if not exists tariffe_spazi (
  id               uuid primary key default gen_random_uuid(),
  palestra_id      uuid not null references palestre(id) on delete cascade,
  nome             text not null,                 -- es. 'Serale feriale', 'Weekend'
  sala_id          uuid references sale(id) on delete cascade,   -- null = tutte le sale
  giorni           smallint[],                    -- null = tutti i giorni; 1=lun … 7=dom
  ora_da           time not null default '08:00',
  ora_a            time not null default '23:00',
  prezzo_ora_cent  int  not null check (prezzo_ora_cent >= 0),
  minimo_ore       numeric(3,1) not null default 1,
  attiva           boolean not null default true,
  unique (palestra_id, nome)
);

create table if not exists pacchetti_evento (
  id                     uuid primary key default gen_random_uuid(),
  palestra_id            uuid not null references palestre(id) on delete cascade,
  nome                   text not null,           -- es. 'Festa di compleanno acrobatica'
  descrizione            text,
  incluso                text,                    -- cosa comprende: animazione, sala, addobbi…
  durata_min             int  not null default 120,
  prezzo_cent            int  not null,
  ospiti_inclusi         int,
  prezzo_ospite_cent     int  not null default 0, -- per ogni ospite oltre quelli inclusi
  sala_id                uuid references sale(id) on delete set null,
  acconto_pct            int  not null default 30 check (acconto_pct between 0 and 100),
  prenotabile_online     boolean not null default true,
  attivo                 boolean not null default true,
  unique (palestra_id, nome)
);

-- ---------------------------------------------------------------------
-- 2. PRENOTAZIONI DELLO SPAZIO
--    Stati: richiesta → opzione (tenuta) → confermata → completata, oppure annullata
-- ---------------------------------------------------------------------
create table if not exists prenotazioni_spazi (
  id             uuid primary key default gen_random_uuid(),
  palestra_id    uuid not null references palestre(id) on delete cascade,
  sala_id        uuid not null references sale(id),
  tipo           text not null default 'noleggio' check (tipo in ('noleggio','evento','interno')),
  pacchetto_id   uuid references pacchetti_evento(id) on delete set null,
  titolo         text not null,
  account_id     uuid references account(id) on delete set null,
  contatto_nome  text not null,
  email          text,
  telefono       text,
  inizio         timestamptz not null,
  fine           timestamptz not null,
  ospiti         int,
  stato          text not null default 'richiesta'
                 check (stato in ('richiesta','opzione','confermata','completata','annullata')),
  prezzo_cent    int not null default 0,
  acconto_cent   int not null default 0,
  incassato_cent int not null default 0,
  note           text,          -- scritte dal cliente
  note_interne   text,
  motivo_rifiuto text,
  token          uuid not null default gen_random_uuid() unique,
  created_at     timestamptz not null default now(),
  check (fine > inizio)
);
create index if not exists prenotazioni_spazi_periodo on prenotazioni_spazi (palestra_id, inizio);
create index if not exists prenotazioni_spazi_stato on prenotazioni_spazi (palestra_id, stato, inizio);

do $$ declare t text;
begin
  foreach t in array array['tariffe_spazi','pacchetti_evento','prenotazioni_spazi'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_legge on %I', t);
    execute format('create policy staff_legge on %I for select to authenticated using (is_staff(palestra_id))', t);
    execute format('drop policy if exists gestione_scrive on %I', t);
    execute format('create policy gestione_scrive on %I for all to authenticated using (is_gestione(palestra_id)) with check (is_gestione(palestra_id))', t);
  end loop;
end $$;

-- il listino e i pacchetti si vedono anche dal sito pubblico
drop policy if exists pubblico_legge on tariffe_spazi;
create policy pubblico_legge on tariffe_spazi for select to anon, authenticated using (attiva);
drop policy if exists pubblico_legge on pacchetti_evento;
create policy pubblico_legge on pacchetti_evento for select to anon, authenticated using (attivo and prenotabile_online);

-- ---------------------------------------------------------------------
-- 3. DISPONIBILITÀ E PREZZO
-- ---------------------------------------------------------------------
-- Cosa occupa la sala in quel momento: lezioni dei corsi e altre prenotazioni
create or replace function occupazioni_sala(p_sala uuid, p_inizio timestamptz, p_fine timestamptz, p_escludi uuid default null)
returns table (tipo text, titolo text, inizio timestamptz, fine timestamptz) language sql stable security definer set search_path = public as $$
  select 'lezione', c.nome, l.inizio, l.fine
    from lezioni l join corsi c on c.id = l.corso_id
   where l.sala_id = p_sala and l.stato = 'programmata' and l.inizio < p_fine and l.fine > p_inizio
  union all
  select ps.tipo, ps.titolo, ps.inizio, ps.fine
    from prenotazioni_spazi ps
   where ps.sala_id = p_sala and ps.stato in ('opzione','confermata','completata')
     and ps.inizio < p_fine and ps.fine > p_inizio
     and (p_escludi is null or ps.id <> p_escludi);
$$;

create or replace function sala_libera(p_sala uuid, p_inizio timestamptz, p_fine timestamptz, p_escludi uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from occupazioni_sala(p_sala, p_inizio, p_fine, p_escludi));
$$;

-- Prezzo del noleggio: tariffa più specifica che copre la fascia richiesta
create or replace function prezzo_spazio(p_palestra uuid, p_sala uuid, p_inizio timestamptz, p_fine timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text; v_giorno smallint; v_ora_inizio time; v_ore numeric; t tariffe_spazi;
begin
  select fuso_orario into v_tz from palestre where id = p_palestra;
  v_giorno := extract(isodow from p_inizio at time zone v_tz);
  v_ora_inizio := (p_inizio at time zone v_tz)::time;
  v_ore := extract(epoch from (p_fine - p_inizio)) / 3600.0;

  select * into t from tariffe_spazi
   where palestra_id = p_palestra and attiva
     and (sala_id is null or sala_id = p_sala)
     and (giorni is null or v_giorno = any (giorni))
     and v_ora_inizio >= ora_da and v_ora_inizio < ora_a
   order by (sala_id is not null) desc, (giorni is not null) desc, prezzo_ora_cent desc
   limit 1;

  if not found then
    return jsonb_build_object('ore', v_ore, 'prezzo_cent', null, 'tariffa', null,
                              'nota', 'Nessuna tariffa per questa fascia: la segreteria farà un preventivo.');
  end if;

  v_ore := greatest(v_ore, t.minimo_ore);
  return jsonb_build_object('ore', round(v_ore, 1), 'prezzo_cent', round(v_ore * t.prezzo_ora_cent)::int,
                            'tariffa', t.nome, 'minimo_ore', t.minimo_ore);
end $$;

-- Prezzo di un pacchetto festa, ospiti extra compresi
create or replace function prezzo_evento(p_pacchetto uuid, p_ospiti int)
returns int language sql stable security definer set search_path = public as $$
  select pe.prezzo_cent
       + case when pe.ospiti_inclusi is not null and coalesce(p_ospiti, 0) > pe.ospiti_inclusi
              then (p_ospiti - pe.ospiti_inclusi) * pe.prezzo_ospite_cent else 0 end
  from pacchetti_evento pe where pe.id = p_pacchetto;
$$;

-- ---------------------------------------------------------------------
-- 4. RICHIESTA DAL SITO (chiamata lato server)
-- ---------------------------------------------------------------------
-- { palestra_slug, sala_id, pacchetto_id?, tipo, inizio, fine, ospiti?, titolo,
--   contatto:{nome,email,telefono}, note?, consenso_privacy }
create or replace function richiedi_spazio(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal palestre; v_sala sale; v_pac pacchetti_evento;
  v_inizio timestamptz; v_fine timestamptz; v_prezzo int; v_calc jsonb; v_id uuid;
  v_email text := lower(nullif(trim(p->'contatto'->>'email'), ''));
begin
  if coalesce((p->>'consenso_privacy')::boolean, false) is not true then raise exception 'consenso_privacy_mancante'; end if;
  select * into v_pal from palestre where slug = p->>'palestra_slug';
  if not found then raise exception 'palestra_non_trovata'; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_non_valida'; end if;
  if nullif(trim(p->'contatto'->>'nome'), '') is null or nullif(trim(p->'contatto'->>'telefono'), '') is null then
    raise exception 'contatti_mancanti';
  end if;

  v_inizio := (p->>'inizio')::timestamptz;
  v_fine := (p->>'fine')::timestamptz;
  if v_inizio is null or v_fine is null or v_fine <= v_inizio then raise exception 'orario_non_valido'; end if;
  if v_inizio < now() + interval '12 hours' then raise exception 'troppo_a_ridosso'; end if;

  if p->>'pacchetto_id' is not null then
    select * into v_pac from pacchetti_evento
     where id = (p->>'pacchetto_id')::uuid and palestra_id = v_pal.id and attivo and prenotabile_online;
    if not found then raise exception 'pacchetto_non_disponibile'; end if;
    v_fine := v_inizio + make_interval(mins => v_pac.durata_min);
  end if;

  select * into v_sala from sale
   where id = coalesce((p->>'sala_id')::uuid, v_pac.sala_id) and palestra_id = v_pal.id;
  if not found then raise exception 'sala_non_trovata'; end if;

  if not sala_libera(v_sala.id, v_inizio, v_fine) then raise exception 'sala_occupata'; end if;

  if v_pac.id is not null then
    v_prezzo := prezzo_evento(v_pac.id, (p->>'ospiti')::int);
  else
    v_calc := prezzo_spazio(v_pal.id, v_sala.id, v_inizio, v_fine);
    v_prezzo := coalesce((v_calc->>'prezzo_cent')::int, 0);
  end if;

  insert into prenotazioni_spazi (palestra_id, sala_id, tipo, pacchetto_id, titolo, contatto_nome, email, telefono,
                                  inizio, fine, ospiti, prezzo_cent, acconto_cent, note)
  values (v_pal.id, v_sala.id,
          case when v_pac.id is not null then 'evento' else 'noleggio' end,
          v_pac.id,
          coalesce(nullif(trim(p->>'titolo'), ''), coalesce(v_pac.nome, 'Noleggio ' || v_sala.nome)),
          trim(p->'contatto'->>'nome'), v_email, trim(p->'contatto'->>'telefono'),
          v_inizio, v_fine, (p->>'ospiti')::int, v_prezzo,
          case when v_pac.id is not null then round(v_prezzo * v_pac.acconto_pct / 100.0)::int else 0 end,
          nullif(trim(p->>'note'), ''))
  returning id into v_id;

  return jsonb_build_object('esito', 'richiesta_inviata', 'prenotazione_id', v_id, 'prezzo_cent', v_prezzo);
end $$;

revoke execute on function richiedi_spazio(jsonb) from public, anon, authenticated;
grant execute on function richiedi_spazio(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 5. MESSAGGI AUTOMATICI DELLE PRENOTAZIONI
-- ---------------------------------------------------------------------
create or replace function vars_spazio(p_prenotazione uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nome', ps.contatto_nome,
    'titolo', ps.titolo,
    'sala', s.nome,
    'data', to_char(ps.inizio at time zone p.fuso_orario, 'DD/MM/YYYY'),
    'giorno', (array['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'])
                [extract(isodow from ps.inizio at time zone p.fuso_orario)::int],
    'ora', to_char(ps.inizio at time zone p.fuso_orario, 'HH24:MI'),
    'ora_fine', to_char(ps.fine at time zone p.fuso_orario, 'HH24:MI'),
    'ospiti', coalesce(ps.ospiti::text, ''),
    'prezzo', to_char(ps.prezzo_cent / 100.0, 'FM999G990D00') || ' €',
    'acconto', to_char(ps.acconto_cent / 100.0, 'FM999G990D00') || ' €',
    'motivo', coalesce(ps.motivo_rifiuto, ''),
    'palestra', p.nome,
    'telefono_palestra', coalesce(p.telefono, ''),
    'link_prenotazione', coalesce(p.base_url, '') || '/spazi/prenotazione?t=' || ps.token)
  from prenotazioni_spazi ps join sale s on s.id = ps.sala_id join palestre p on p.id = ps.palestra_id
  where ps.id = p_prenotazione;
$$;

-- Accoda un messaggio a un indirizzo libero (i clienti degli spazi non hanno un account)
create or replace function accoda_a_indirizzo(
  p_palestra uuid, p_evento text, p_destinatario text, p_chiave text, p_quando timestamptz, p_vars jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare t messaggi_template;
begin
  select * into t from messaggi_template
   where palestra_id = p_palestra and evento = p_evento and canale = 'email' and attivo order by giorni limit 1;
  if not found or p_destinatario is null then return; end if;
  insert into messaggi_coda (palestra_id, evento, canale, destinatario, oggetto, corpo, chiave, programmato_per)
  values (p_palestra, p_evento, 'email', p_destinatario,
          render_testo(t.oggetto, p_vars), render_testo(t.corpo, p_vars),
          p_evento || ':' || p_chiave, greatest(p_quando, now()))
  on conflict (palestra_id, chiave) do nothing;
end $$;

create or replace function trg_spazi_messaggi()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_vars jsonb; v_pal palestre;
begin
  v_vars := vars_spazio(new.id);
  select * into v_pal from palestre where id = new.palestra_id;

  if tg_op = 'INSERT' then
    perform accoda_a_indirizzo(new.palestra_id, 'spazio_richiesta_ricevuta', new.email, new.id::text, now(), v_vars);
    -- avviso interno alla segreteria
    perform accoda_a_indirizzo(new.palestra_id, 'spazio_avviso_interno', v_pal.email, new.id::text, now(), v_vars);
  elsif new.stato is distinct from old.stato then
    if new.stato = 'confermata' then
      perform accoda_a_indirizzo(new.palestra_id, 'spazio_confermato', new.email, new.id::text, now(), v_vars);
    elsif new.stato = 'annullata' then
      perform accoda_a_indirizzo(new.palestra_id, 'spazio_annullato', new.email, new.id::text, now(), v_vars);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists spazi_messaggi on prenotazioni_spazi;
create trigger spazi_messaggi after insert or update of stato on prenotazioni_spazi
  for each row execute function trg_spazi_messaggi();

-- Conferma con controllo che nel frattempo la sala non sia stata occupata
create or replace function conferma_spazio(p_prenotazione uuid, p_stato text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare ps prenotazioni_spazi;
begin
  select * into ps from prenotazioni_spazi where id = p_prenotazione for update;
  if not found then raise exception 'prenotazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(ps.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_stato not in ('opzione','confermata','annullata','completata') then raise exception 'stato_non_valido'; end if;

  if p_stato in ('opzione','confermata') and not sala_libera(ps.sala_id, ps.inizio, ps.fine, ps.id) then
    raise exception 'sala_occupata';
  end if;

  update prenotazioni_spazi
     set stato = p_stato, motivo_rifiuto = case when p_stato = 'annullata' then p_motivo else motivo_rifiuto end
   where id = p_prenotazione;
end $$;

-- ---------------------------------------------------------------------
-- 6. AGENDA DELLE SALE: lezioni e noleggi insieme
-- ---------------------------------------------------------------------
create or replace view v_agenda_sale with (security_invoker = true) as
  select l.id, l.palestra_id, l.sala_id, 'lezione'::text as tipo, c.nome as titolo,
         l.inizio, l.fine, l.data, l.stato::text as stato, null::int as prezzo_cent, null::text as contatto
  from lezioni l join corsi c on c.id = l.corso_id
  where l.sala_id is not null
  union all
  select ps.id, ps.palestra_id, ps.sala_id, ps.tipo, ps.titolo,
         ps.inizio, ps.fine, (ps.inizio at time zone 'Europe/Rome')::date, ps.stato, ps.prezzo_cent, ps.contatto_nome
  from prenotazioni_spazi ps
  where ps.stato in ('opzione','confermata','completata');

-- Quanto rendono gli spazi in un periodo
create or replace function statistiche_spazi(p_palestra uuid, p_dal date, p_al date)
returns jsonb language sql stable security invoker as $$
  with p as (
    select * from prenotazioni_spazi
     where palestra_id = p_palestra and inizio::date between p_dal and p_al
  )
  select jsonb_build_object(
    'richieste', (select count(*) from p),
    'confermate', (select count(*) from p where stato in ('confermata','completata')),
    'annullate', (select count(*) from p where stato = 'annullata'),
    'da_rispondere', (select count(*) from prenotazioni_spazi where palestra_id = p_palestra and stato = 'richiesta'),
    'ore', (select coalesce(round(sum(extract(epoch from (fine - inizio)) / 3600.0), 1), 0) from p where stato in ('confermata','completata')),
    'ricavi_cent', (select coalesce(sum(prezzo_cent), 0) from p where stato in ('confermata','completata')),
    'incassato_cent', (select coalesce(sum(incassato_cent), 0) from p where stato in ('confermata','completata')),
    'eventi', (select count(*) from p where tipo = 'evento' and stato in ('confermata','completata'))
  );
$$;

-- ---------------------------------------------------------------------
-- 7. TESTI DEI MESSAGGI E LISTINO D'ESEMPIO
-- ---------------------------------------------------------------------
do $$
declare p uuid; s uuid;
begin
  for p in select id from palestre loop
    insert into messaggi_template (palestra_id, evento, oggetto, corpo, giorni) values
    (p, 'spazio_richiesta_ricevuta', 'Abbiamo ricevuto la tua richiesta',
'Ciao {{nome}},

abbiamo ricevuto la tua richiesta per {{sala}}, {{giorno}} {{data}} dalle {{ora}} alle {{ora_fine}}.

Preventivo indicativo: {{prezzo}}

Ti confermiamo la disponibilità al più presto. Se nel frattempo hai bisogno, rispondi a questa email.

{{palestra}}', 0),

    (p, 'spazio_confermato', 'Prenotazione confermata: {{titolo}}',
'Ciao {{nome}},

la tua prenotazione è confermata:

{{titolo}}
{{giorno}} {{data}}, dalle {{ora}} alle {{ora_fine}}
Sala: {{sala}}
Totale: {{prezzo}}

Ti aspettiamo!
{{palestra}}', 0),

    (p, 'spazio_annullato', 'Aggiornamento sulla tua richiesta',
'Ciao {{nome}},

purtroppo non possiamo accogliere la richiesta per {{giorno}} {{data}} alle {{ora}}.

{{motivo}}

Scrivici pure per trovare un''altra data: saremo felici di ospitarti.

{{palestra}}', 0),

    (p, 'spazio_avviso_interno', 'Nuova richiesta spazio: {{titolo}}',
'Nuova richiesta da confermare.

{{titolo}}
{{giorno}} {{data}} dalle {{ora}} alle {{ora_fine}} — {{sala}}
Contatto: {{nome}}
Preventivo: {{prezzo}}

Apri la gestione per confermare o rifiutare.', 0)
    on conflict do nothing;

    -- listino d'esempio: da correggere con i prezzi veri
    select id into s from sale where palestra_id = p order by nome limit 1;
    insert into tariffe_spazi (palestra_id, nome, sala_id, giorni, ora_da, ora_a, prezzo_ora_cent, minimo_ore) values
      (p, 'Feriale diurno', null, array[1,2,3,4,5]::smallint[], '08:00', '17:00', 2500, 1),
      (p, 'Feriale serale', null, array[1,2,3,4,5]::smallint[], '17:00', '23:00', 3500, 1),
      (p, 'Weekend',        null, array[6,7]::smallint[],       '08:00', '23:00', 4000, 2)
    on conflict (palestra_id, nome) do nothing;

    insert into pacchetti_evento (palestra_id, nome, descrizione, incluso, durata_min, prezzo_cent,
                                  ospiti_inclusi, prezzo_ospite_cent, sala_id, acconto_pct) values
      (p, 'Festa di compleanno', 'Due ore di festa con attività guidata per i bambini.',
       'Sala allestita, insegnante dedicato, attività e musica. Torta e bevande a cura vostra.',
       120, 25000, 15, 800, s, 30),
      (p, 'Open day o workshop', 'Mezza giornata con la sala a disposizione.',
       'Sala, impianto audio e assistenza tecnica.', 240, 30000, null, 0, s, 30)
    on conflict (palestra_id, nome) do nothing;
  end loop;
end $$;
