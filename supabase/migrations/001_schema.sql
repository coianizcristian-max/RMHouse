-- =====================================================================
-- RMHouse — 001 SCHEMA
-- Modello dati multi-tenant: ogni riga appartiene a una palestra.
-- Principio chiave: ACCOUNT (chi paga / riceve messaggi) ≠ ALLIEVO (chi frequenta).
-- Eseguire nell'SQL Editor di Supabase, in ordine: 001, 002, 003, poi seed.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- TIPI ENUMERATI
-- ---------------------------------------------------------------------
do $$ begin
  create type ruolo_staff        as enum ('admin', 'segreteria', 'insegnante');
  create type stato_lead         as enum ('nuovo', 'prova_prenotata', 'prova_effettuata', 'iscritto', 'perso');
  create type stato_prova        as enum ('in_attesa_pagamento', 'confermata', 'presente', 'assente', 'annullata');
  create type modalita_abb       as enum ('orari_fissi', 'ingressi', 'libero');
  create type stato_iscrizione   as enum ('attiva', 'sospesa', 'scaduta', 'annullata');
  create type stato_pagamento    as enum ('in_attesa', 'pagato', 'fallito', 'rimborsato', 'annullato');
  create type stato_lezione      as enum ('programmata', 'annullata');
  create type stato_messaggio    as enum ('in_coda', 'inviato', 'errore', 'annullato');
  create type canale_messaggio   as enum ('email', 'whatsapp');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- PALESTRA (tenant) e STAFF
-- ---------------------------------------------------------------------
create table if not exists palestre (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,                 -- es. 'rmhouse', usato nei link pubblici
  nome               text not null,
  email              text,
  telefono           text,
  indirizzo          text,
  fuso_orario        text not null default 'Europe/Rome',
  base_url           text,                                 -- es. https://rmhouse.vercel.app (per i link nei messaggi)
  google_review_url  text,
  email_mittente     text,                                 -- es. 'RM House <info@rmhouse.it>'
  regime_fiscale     text not null default 'forfettario',  -- forfettario | ordinario | asd
  giorni_prenotabili int  not null default 21,             -- quanti giorni avanti mostrare le prove
  preavviso_ore      int  not null default 2,              -- ore minime prima della lezione per prenotare
  tema               jsonb not null default '{}'::jsonb,   -- colori personalizzati (per il prodotto)
  created_at         timestamptz not null default now()
);

create table if not exists staff (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  ruolo        ruolo_staff not null,
  nome         text not null,
  cognome      text,
  email        text,
  telefono     text,
  attivo       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (palestra_id, user_id)
);

-- ---------------------------------------------------------------------
-- CATALOGO: discipline, fasce d'età, livelli, sale, corsi, orari
-- ---------------------------------------------------------------------
create table if not exists discipline (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,                 -- Danza Aerea, Pole Dance, ...
  descrizione  text,
  ordine       int not null default 0,
  attiva       boolean not null default true,
  unique (palestra_id, nome)
);

create table if not exists fasce_eta (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,                 -- Kids, Teen, Adulti
  eta_min      int  not null,
  eta_max      int,                           -- null = nessun limite
  adulti       boolean not null default false,-- true = fascia mostrata a chi sceglie "adulto"
  ordine       int not null default 0,
  unique (palestra_id, nome),
  check (eta_max is null or eta_max >= eta_min)
);

create table if not exists livelli (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,                 -- Principiante/Base, Intermedio, Avanzato
  descrizione  text,
  ordine       int not null default 0,
  unique (palestra_id, nome)
);

create table if not exists sale (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,
  capienza     int,
  unique (palestra_id, nome)
);

create table if not exists corsi (
  id                     uuid primary key default gen_random_uuid(),
  palestra_id            uuid not null references palestre(id) on delete cascade,
  disciplina_id          uuid not null references discipline(id),
  fascia_eta_id          uuid not null references fasce_eta(id),
  livello_id             uuid references livelli(id),   -- null = aperto a tutti i livelli
  nome                   text not null,                 -- es. 'Danza Aerea Kids Base'
  descrizione            text,
  info_prova             text,                          -- cosa portare, abbigliamento... (va nel messaggio di conferma)
  prova_abilitata        boolean not null default true,
  prezzo_prova_cent      int not null default 0 check (prezzo_prova_cent >= 0),  -- 0 = gratuita, 1000 = 10€
  max_prove_per_lezione  int not null default 2 check (max_prove_per_lezione >= 0),
  capienza               int,                           -- null = usa capienza sala / nessun limite
  attivo                 boolean not null default true,
  created_at             timestamptz not null default now()
);
create index if not exists corsi_palestra_idx on corsi (palestra_id, attivo);

-- Slot ricorrente settimanale di un corso (es. martedì 18:00, 60 minuti)
create table if not exists orari (
  id                uuid primary key default gen_random_uuid(),
  palestra_id       uuid not null references palestre(id) on delete cascade,
  corso_id          uuid not null references corsi(id) on delete cascade,
  giorno_settimana  smallint not null check (giorno_settimana between 1 and 7), -- 1=lunedì ... 7=domenica
  ora_inizio        time not null,
  durata_min        int  not null default 60 check (durata_min > 0),
  sala_id           uuid references sale(id),
  insegnante_id     uuid references staff(id),
  valido_dal        date not null default current_date,
  valido_al         date,
  attivo            boolean not null default true
);
create index if not exists orari_corso_idx on orari (corso_id);

-- Periodi di chiusura (festività, vacanze): le lezioni in quelle date vengono annullate
create table if not exists chiusure (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  dal          date not null,
  al           date not null,
  motivo       text,
  check (al >= dal)
);

-- Singola lezione con data, generata automaticamente dagli orari
create table if not exists lezioni (
  id             uuid primary key default gen_random_uuid(),
  palestra_id    uuid not null references palestre(id) on delete cascade,
  orario_id      uuid references orari(id) on delete set null,
  corso_id       uuid not null references corsi(id) on delete cascade,
  data           date not null,
  inizio         timestamptz not null,
  fine           timestamptz not null,
  sala_id        uuid references sale(id),
  insegnante_id  uuid references staff(id),
  stato          stato_lezione not null default 'programmata',
  note           text,
  unique (orario_id, data)
);
create index if not exists lezioni_palestra_data_idx on lezioni (palestra_id, data);
create index if not exists lezioni_corso_data_idx    on lezioni (corso_id, data);

-- ---------------------------------------------------------------------
-- PERSONE: account (chi paga) e allievi (chi frequenta)
-- ---------------------------------------------------------------------
create table if not exists account (
  id                   uuid primary key default gen_random_uuid(),
  palestra_id          uuid not null references palestre(id) on delete cascade,
  user_id              uuid references auth.users(id) on delete set null, -- valorizzato quando si registra all'app
  nome                 text not null,
  cognome              text not null,
  email                text not null check (email = lower(email)),
  telefono             text,
  codice_fiscale       text,
  indirizzo            text,
  cap                  text,
  citta                text,
  provincia            text,
  fonte                text,                  -- instagram, sito, passaparola...
  utm                  jsonb,
  consenso_privacy_at  timestamptz,
  consenso_marketing   boolean not null default false,
  note                 text,
  created_at           timestamptz not null default now(),
  unique (palestra_id, email)
);
create index if not exists account_user_idx on account (user_id);

create table if not exists allievi (
  id                    uuid primary key default gen_random_uuid(),
  palestra_id           uuid not null references palestre(id) on delete cascade,
  account_id            uuid not null references account(id) on delete cascade,
  nome                  text not null,
  cognome               text not null,
  data_nascita          date not null,
  is_titolare           boolean not null default false, -- true = l'allievo è la stessa persona dell'account (adulto)
  stato_lead            stato_lead not null default 'nuovo',
  motivo_perso          text,
  certificato_scadenza  date,
  note                  text,
  created_at            timestamptz not null default now()
);
create index if not exists allievi_account_idx on allievi (account_id);
create index if not exists allievi_palestra_stato_idx on allievi (palestra_id, stato_lead);

-- ---------------------------------------------------------------------
-- ABBONAMENTI e ISCRIZIONI
-- ---------------------------------------------------------------------
create table if not exists tipi_abbonamento (
  id                    uuid primary key default gen_random_uuid(),
  palestra_id           uuid not null references palestre(id) on delete cascade,
  nome                  text not null,               -- es. 'Trimestrale 2 volte a settimana'
  modalita              modalita_abb not null default 'orari_fissi',
  durata_mesi           int not null default 1 check (durata_mesi > 0),
  lezioni_settimanali   int,                         -- per orari_fissi: quanti slot sceglie
  num_ingressi          int,                         -- per ingressi: carnet
  prezzo_cent           int not null check (prezzo_cent >= 0),
  scadenza_fine_mese    boolean not null default true, -- true = segue il mese solare
  acquistabile_online   boolean not null default true,
  attivo                boolean not null default true
);

-- Quali corsi sono coperti da un tipo di abbonamento (nessuna riga = tutti)
create table if not exists tipi_abbonamento_corsi (
  tipo_abbonamento_id  uuid not null references tipi_abbonamento(id) on delete cascade,
  corso_id             uuid not null references corsi(id) on delete cascade,
  primary key (tipo_abbonamento_id, corso_id)
);

create table if not exists pagamenti (
  id                     uuid primary key default gen_random_uuid(),
  palestra_id            uuid not null references palestre(id) on delete cascade,
  account_id             uuid not null references account(id),
  corso_id               uuid references corsi(id),     -- per le statistiche di fatturato per corso
  causale                text not null check (causale in ('prova', 'abbonamento', 'quota_iscrizione', 'altro')),
  descrizione            text not null,
  importo_cent           int not null check (importo_cent >= 0),
  bollo_cent             int not null default 0,
  metodo                 text not null default 'stripe' check (metodo in ('stripe', 'contanti', 'pos', 'bonifico')),
  stato                  stato_pagamento not null default 'in_attesa',
  stripe_session_id      text unique,
  stripe_payment_intent  text,
  pagato_at              timestamptz,
  created_at             timestamptz not null default now()
);
create index if not exists pagamenti_palestra_idx on pagamenti (palestra_id, stato, pagato_at);

create table if not exists iscrizioni (
  id                   uuid primary key default gen_random_uuid(),
  palestra_id          uuid not null references palestre(id) on delete cascade,
  allievo_id           uuid not null references allievi(id) on delete cascade,
  tipo_abbonamento_id  uuid not null references tipi_abbonamento(id),
  corso_id             uuid not null references corsi(id),
  data_inizio          date not null default current_date,
  data_fine            date,                                  -- calcolata in automatico se vuota
  stato                stato_iscrizione not null default 'attiva',
  ingressi_residui     int,
  pagamento_id         uuid references pagamenti(id),
  rinnovo_di           uuid references iscrizioni(id),
  created_at           timestamptz not null default now()
);
create index if not exists iscrizioni_allievo_idx on iscrizioni (allievo_id);
create index if not exists iscrizioni_attive_idx  on iscrizioni (palestra_id, stato, data_fine);

-- Per gli abbonamenti a orari fissi: quali slot settimanali frequenta.
-- Basta questa riga per comparire in appello in TUTTE le lezioni del periodo.
create table if not exists iscrizioni_orari (
  iscrizione_id  uuid not null references iscrizioni(id) on delete cascade,
  orario_id      uuid not null references orari(id) on delete cascade,
  primary key (iscrizione_id, orario_id)
);

-- Prenotazioni puntuali: abbonamenti a ingressi/liberi e recuperi
create table if not exists prenotazioni (
  id             uuid primary key default gen_random_uuid(),
  palestra_id    uuid not null references palestre(id) on delete cascade,
  lezione_id     uuid not null references lezioni(id) on delete cascade,
  allievo_id     uuid not null references allievi(id) on delete cascade,
  iscrizione_id  uuid references iscrizioni(id),
  tipo           text not null default 'ingresso' check (tipo in ('ingresso', 'recupero')),
  stato          text not null default 'confermata' check (stato in ('confermata', 'annullata')),
  created_at     timestamptz not null default now(),
  unique (lezione_id, allievo_id)
);

-- ---------------------------------------------------------------------
-- PROVE, PRESENZE, FUNNEL
-- ---------------------------------------------------------------------
create table if not exists prove (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  allievo_id    uuid not null references allievi(id) on delete cascade,
  corso_id      uuid not null references corsi(id),
  lezione_id    uuid not null references lezioni(id),
  prezzo_cent   int not null default 0,
  stato         stato_prova not null default 'confermata',
  pagamento_id  uuid references pagamenti(id),
  token         uuid not null default gen_random_uuid() unique,  -- per i link pubblici (feedback, abbonamento)
  created_at    timestamptz not null default now()
);
create index if not exists prove_lezione_idx on prove (lezione_id);
create index if not exists prove_allievo_idx on prove (allievo_id);

create table if not exists presenze (
  id              uuid primary key default gen_random_uuid(),
  palestra_id     uuid not null references palestre(id) on delete cascade,
  lezione_id      uuid not null references lezioni(id) on delete cascade,
  allievo_id      uuid not null references allievi(id) on delete cascade,
  presente        boolean not null,
  registrata_da   uuid references auth.users(id),
  registrata_at   timestamptz not null default now(),
  unique (lezione_id, allievo_id)
);

-- Diario del funnel: una riga per ogni passaggio. Le statistiche si leggono da qui.
create table if not exists lead_eventi (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  allievo_id   uuid not null references allievi(id) on delete cascade,
  corso_id     uuid references corsi(id),
  evento       text not null check (evento in ('richiesta', 'prova_prenotata', 'prova_effettuata', 'iscritto', 'perso')),
  created_at   timestamptz not null default now()
);
create unique index if not exists lead_eventi_unici on lead_eventi (allievo_id, coalesce(corso_id, '00000000-0000-0000-0000-000000000000'::uuid), evento);
create index if not exists lead_eventi_stat_idx on lead_eventi (palestra_id, corso_id, created_at);

create table if not exists feedback_prove (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  prova_id    uuid not null references prove(id) on delete cascade unique,
  motivo      text not null,        -- orari, prezzo, livello, insegnante, altro...
  testo       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- DOCUMENTI FISCALI (struttura pronta, integrazione SDI in fase successiva)
-- ---------------------------------------------------------------------
create table if not exists documenti_fiscali (
  id              uuid primary key default gen_random_uuid(),
  palestra_id     uuid not null references palestre(id) on delete cascade,
  pagamento_id    uuid references pagamenti(id),
  tipo            text not null check (tipo in ('fattura', 'nota_credito', 'ricevuta')),
  anno            int  not null,
  numero          int  not null,
  data            date not null default current_date,
  intestatario    jsonb not null,    -- nome, cognome, cf, indirizzo...
  righe           jsonb not null,    -- [{descrizione, importo_cent, partecipante}]
  totale_cent     int  not null,
  bollo_cent      int  not null default 0,
  stato_sdi       text not null default 'da_inviare',
  provider_id     text,
  pdf_url         text,
  created_at      timestamptz not null default now(),
  unique (palestra_id, tipo, anno, numero)
);

-- ---------------------------------------------------------------------
-- MESSAGGI: modelli configurabili + coda d'invio
-- ---------------------------------------------------------------------
create table if not exists messaggi_template (
  id              uuid primary key default gen_random_uuid(),
  palestra_id     uuid not null references palestre(id) on delete cascade,
  evento          text not null,   -- prova_confermata, promemoria_prova, follow_up_prova, sondaggio_perso,
                                   -- scadenza_abbonamento, scadenza_certificato, compleanno, promo
  canale          canale_messaggio not null default 'email',
  oggetto         text,
  corpo           text not null,   -- segnaposto: {{nome}} {{corso}} {{data}} {{ora}} ...
  giorni          int not null default 0,  -- anticipo/ritardo in giorni (es. scadenza: 7 giorni prima)
  attivo          boolean not null default true,
  unique (palestra_id, evento, canale)
);

create table if not exists messaggi_coda (
  id               uuid primary key default gen_random_uuid(),
  palestra_id      uuid not null references palestre(id) on delete cascade,
  account_id       uuid references account(id) on delete cascade,
  allievo_id       uuid references allievi(id) on delete cascade,
  evento           text not null,
  canale           canale_messaggio not null default 'email',
  destinatario     text not null,
  oggetto          text,
  corpo            text not null,
  chiave           text not null,  -- impedisce doppioni (es. 'promemoria_prova:<id prova>')
  programmato_per  timestamptz not null default now(),
  stato            stato_messaggio not null default 'in_coda',
  tentativi        int not null default 0,
  inviato_at       timestamptz,
  errore           text,
  created_at       timestamptz not null default now(),
  unique (palestra_id, chiave)
);
create index if not exists messaggi_da_inviare_idx on messaggi_coda (stato, programmato_per);
