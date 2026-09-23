-- =====================================================================
-- RMHouse — 009 SEDI, IMMAGINI, BACHECA ED EVENTI
-- Aggiunge: più sedi con palinsesti separati, foto e colori su corsi e staff,
-- stati di visibilità, bacheca (avvisi e post), eventi, note del giorno.
-- Da eseguire dopo 001…008.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SEDI: una scuola può avere più palinsesti (Vicenza, Schio…)
-- ---------------------------------------------------------------------
create table if not exists sedi (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,
  principale   boolean not null default false,
  indirizzo    text,
  citta        text,
  telefono     text,
  visibile     boolean not null default true,
  ordine       int not null default 0,
  created_at   timestamptz not null default now(),
  unique (palestra_id, nome)
);

alter table sale  add column if not exists sede_id uuid references sedi(id) on delete set null;
alter table corsi add column if not exists sede_id uuid references sedi(id) on delete set null;

-- La sede principale prende i dati già inseriti nella palestra
do $$
declare p palestre; s uuid;
begin
  for p in select * from palestre loop
    if not exists (select 1 from sedi where palestra_id = p.id) then
      insert into sedi (palestra_id, nome, principale, indirizzo, telefono, ordine)
      values (p.id, coalesce(nullif(p.nome, ''), 'Sede principale'), true, p.indirizzo, p.telefono, 1)
      returning id into s;
      update sale  set sede_id = s where palestra_id = p.id and sede_id is null;
      update corsi set sede_id = s where palestra_id = p.id and sede_id is null;
    end if;
  end loop;
end $$;

alter table sedi enable row level security;
drop policy if exists pubblico_legge on sedi;
create policy pubblico_legge on sedi for select to anon, authenticated using (visibile);
drop policy if exists gestione_scrive on sedi;
create policy gestione_scrive on sedi for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- ---------------------------------------------------------------------
-- 2. IMMAGINI, COLORI E VISIBILITÀ
-- ---------------------------------------------------------------------
do $$ begin
  create type visibilita as enum ('pubblico', 'privato', 'nascosto');
exception when duplicate_object then null; end $$;

alter table corsi add column if not exists colore text;                       -- es. '#f40000'
alter table corsi add column if not exists foto_url text;
alter table corsi add column if not exists visibilita visibilita not null default 'pubblico';
alter table corsi add column if not exists prenotabile boolean not null default true;

alter table staff add column if not exists foto_url text;
alter table staff add column if not exists archiviato boolean not null default false;
alter table staff add column if not exists collaboratore boolean not null default false;
alter table staff add column if not exists bio text;
alter table staff add column if not exists specialita text;                   -- "Aerea e acrobatica"

alter table discipline add column if not exists foto_url text;
alter table categorie  add column if not exists foto_url text;
alter table sale       add column if not exists foto_url text;

-- Archivio pubblico per foto e locandine (il bucket dei certificati resta privato)
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;

-- Il percorso di prova mostra solo i corsi pubblici e prenotabili
drop policy if exists pubblico_legge on corsi;
create policy pubblico_legge on corsi for select to anon, authenticated
  using (attivo and visibilita = 'pubblico');

-- ---------------------------------------------------------------------
-- 3. BACHECA: avvisi e post con immagine e periodo di validità
-- ---------------------------------------------------------------------
create table if not exists bacheca (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  tipo         text not null default 'avviso' check (tipo in ('avviso', 'post')),
  titolo       text not null,
  testo        text,
  immagine_url text,
  dal          timestamptz,
  al           timestamptz,
  visibilita   visibilita not null default 'pubblico',
  inviato_at   timestamptz,          -- quando è stato mandato ai clienti
  destinatari  int,                  -- a quanti è arrivato
  created_at   timestamptz not null default now()
);
create index if not exists bacheca_periodo on bacheca (palestra_id, tipo, dal);

-- ---------------------------------------------------------------------
-- 4. EVENTI: open day, saggi, stage, campus
-- ---------------------------------------------------------------------
create table if not exists eventi (
  id             uuid primary key default gen_random_uuid(),
  palestra_id    uuid not null references palestre(id) on delete cascade,
  sede_id        uuid references sedi(id) on delete set null,
  titolo         text not null,
  descrizione    text,
  locandina_url  text,
  luogo          text,
  inizio         timestamptz not null,
  fine           timestamptz,
  prenotabile    boolean not null default false,
  prezzo_cent    int not null default 0,
  posti          int,
  in_evidenza    boolean not null default false,
  visibilita     visibilita not null default 'pubblico',
  created_at     timestamptz not null default now()
);
create index if not exists eventi_periodo on eventi (palestra_id, inizio);

-- Iscrizioni agli eventi (anche da chi non è ancora cliente)
create table if not exists iscrizioni_evento (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  evento_id    uuid not null references eventi(id) on delete cascade,
  allievo_id   uuid references allievi(id) on delete set null,
  nome         text not null,
  email        text,
  telefono     text,
  persone      int not null default 1,
  stato        text not null default 'iscritto' check (stato in ('iscritto', 'annullato', 'presente')),
  note         text,
  created_at   timestamptz not null default now()
);

-- Al massimo tre eventi in evidenza nella home
create or replace function trg_eventi_evidenza()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.in_evidenza and (select count(*) from eventi
                           where palestra_id = new.palestra_id and in_evidenza and id <> new.id) >= 3 then
    raise exception 'massimo_tre_eventi_in_evidenza';
  end if;
  return new;
end $$;

drop trigger if exists eventi_evidenza on eventi;
create trigger eventi_evidenza before insert or update of in_evidenza on eventi
  for each row execute function trg_eventi_evidenza();

-- ---------------------------------------------------------------------
-- 5. NOTE DEL GIORNO sul calendario
-- ---------------------------------------------------------------------
create table if not exists note_giorno (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  sede_id      uuid references sedi(id) on delete cascade,
  data         date not null,
  testo        text not null,
  autore_id    uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists note_giorno_data on note_giorno (palestra_id, data);

do $$ declare t text;
begin
  foreach t in array array['bacheca', 'eventi', 'iscrizioni_evento', 'note_giorno'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_legge on %I', t);
    execute format('create policy staff_legge on %I for select to authenticated using (is_staff(palestra_id))', t);
    execute format('drop policy if exists gestione_scrive on %I', t);
    execute format('create policy gestione_scrive on %I for all to authenticated using (is_gestione(palestra_id)) with check (is_gestione(palestra_id))', t);
  end loop;
end $$;

-- bacheca ed eventi pubblici si vedono anche dal sito
drop policy if exists pubblico_legge on bacheca;
create policy pubblico_legge on bacheca for select to anon, authenticated
  using (visibilita = 'pubblico' and (dal is null or dal <= now()) and (al is null or al >= now()));
drop policy if exists pubblico_legge on eventi;
create policy pubblico_legge on eventi for select to anon, authenticated using (visibilita = 'pubblico');
-- le presenze in sala le segna anche l'insegnante
drop policy if exists insegnante_note on note_giorno;
create policy insegnante_note on note_giorno for insert to authenticated with check (is_staff(palestra_id));

-- ---------------------------------------------------------------------
-- 6. INVIO DI UN AVVISO AI CLIENTI
-- ---------------------------------------------------------------------
create or replace function invia_bacheca(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare b bacheca; pal palestre; n int := 0;
begin
  select * into b from bacheca where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  if auth.uid() is not null and not is_gestione(b.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into pal from palestre where id = b.palestra_id;

  insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
  select distinct on (acc.id) b.palestra_id, acc.id, 'bacheca', 'email', acc.email,
         b.titolo,
         coalesce(b.testo, '') || E'\n\n' || pal.nome,
         'bacheca:' || b.id || ':' || acc.id
  from iscrizioni i
  join allievi a on a.id = i.allievo_id
  join account acc on acc.id = a.account_id
  where i.palestra_id = b.palestra_id and i.stato = 'attiva'
  on conflict (palestra_id, chiave) do nothing;
  get diagnostics n = row_count;

  update bacheca set inviato_at = now(), destinatari = n where id = p_id;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 7. CRUSCOTTO DELLA HOME: i numeri di oggi
-- ---------------------------------------------------------------------
create or replace function oggi(p_palestra uuid)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'lezioni_oggi', (select count(*) from v_occupazione
                      where palestra_id = p_palestra and data = current_date and stato = 'programmata'),
    'iscritti_oggi', (select coalesce(sum(iscritti), 0) from v_occupazione
                       where palestra_id = p_palestra and data = current_date and stato = 'programmata'),
    'prove_oggi', (select coalesce(sum(prove), 0) from v_occupazione
                    where palestra_id = p_palestra and data = current_date and stato = 'programmata'),
    'presenze_da_segnare', (select count(*) from v_occupazione o
                             where o.palestra_id = p_palestra and o.data = current_date and o.stato = 'programmata'
                               and o.inizio < now() and o.presenti + o.assenti = 0 and o.iscritti > 0),
    'lead_da_seguire', (select count(*) from allievi
                         where palestra_id = p_palestra and stato_lead in ('nuovo', 'prova_effettuata')),
    'prove_in_arrivo', (select count(*) from prove pr join lezioni l on l.id = pr.lezione_id
                         where pr.palestra_id = p_palestra and pr.stato = 'confermata' and l.inizio > now()),
    'certificati_da_verificare', (select count(*) from certificati
                                   where palestra_id = p_palestra and stato = 'da_verificare'),
    'certificati_scaduti', (select count(*) from allievi a
                             where a.palestra_id = p_palestra
                               and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva')
                               and (a.certificato_scadenza is null or a.certificato_scadenza < current_date)),
    'abbonamenti_in_scadenza', (select count(*) from iscrizioni
                                 where palestra_id = p_palestra and stato = 'attiva'
                                   and data_fine between current_date and current_date + 14),
    'spazi_da_rispondere', (select count(*) from prenotazioni_spazi
                             where palestra_id = p_palestra and stato = 'richiesta'),
    'attese', (select count(*) from liste_attesa where palestra_id = p_palestra and stato = 'in_attesa'),
    'messaggi_in_coda', (select count(*) from messaggi_coda
                          where palestra_id = p_palestra and stato = 'in_coda')
  );
$$;

-- Colori d'esempio ai corsi che non ne hanno (si cambiano dalla scheda del corso)
do $$
declare c record; colori text[] := array['#f40000','#000000','#b3001b','#5c5c5c','#8a0303','#2b2b2b','#d64545','#7a7a7a'];
begin
  for c in select id, row_number() over (order by nome) as n from corsi where colore is null loop
    update corsi set colore = colori[1 + (c.n % array_length(colori, 1))] where id = c.id;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 8. VISTE AGGIORNATE: colore, foto e sede nei riepiloghi
-- ---------------------------------------------------------------------
drop view if exists v_riepilogo_corsi;
create view v_riepilogo_corsi with (security_invoker = true) as
  select c.id as corso_id, c.palestra_id, c.nome as corso_nome, c.attivo,
         c.colore, c.foto_url, c.visibilita, c.prenotabile, c.sede_id, se.nome as sede,
         d.nome as disciplina, cat.nome as categoria, f.nome as fascia, l.nome as livello,
         (select count(*) from iscrizioni i where i.corso_id = c.id and i.stato = 'attiva') as iscritti_attivi,
         (select count(*) from v_iscritti_corso v where v.corso_id = c.id and v.stato = 'attiva' and v.bloccato) as certificati_da_sistemare,
         (select count(*) from prove pr join lezioni le on le.id = pr.lezione_id
           where pr.corso_id = c.id and pr.stato = 'confermata' and le.inizio > now()) as prove_in_arrivo
  from corsi c
  join discipline d on d.id = c.disciplina_id
  left join categorie cat on cat.id = d.categoria_id
  join fasce_eta f on f.id = c.fascia_eta_id
  left join livelli l on l.id = c.livello_id
  left join sedi se on se.id = c.sede_id;
