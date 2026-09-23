-- =====================================================================
-- RMHouse — 005 CATEGORIE E CERTIFICATI
-- Percorso richiesto dalla titolare: fascia d'età → categoria → livello → orari.
-- Fasce reali: Kids 5-11, Ragazzi 12-16, Adulti dai 17.
-- Il cliente carica da solo la foto del certificato medico; la segreteria la verifica.
-- Da eseguire dopo 001/002/seed/004.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CATEGORIE (danza, acrobatica, benessere) sopra le discipline
-- ---------------------------------------------------------------------
create table if not exists categorie (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  nome         text not null,
  descrizione  text,
  ordine       int not null default 0,
  attiva       boolean not null default true,
  unique (palestra_id, nome)
);
alter table discipline add column if not exists categoria_id uuid references categorie(id);

alter table categorie enable row level security;
drop policy if exists pubblico_legge on categorie;
create policy pubblico_legge on categorie for select to anon, authenticated using (attiva);
drop policy if exists gestione_scrive on categorie;
create policy gestione_scrive on categorie for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

do $$
declare p uuid;
begin
  for p in select id from palestre loop
    insert into categorie (palestra_id, nome, ordine) values
      (p, 'Danza', 1), (p, 'Acrobatica', 2), (p, 'Benessere', 3)
    on conflict (palestra_id, nome) do nothing;

    -- esempio: da correggere con l'elenco vero delle discipline
    update discipline d set categoria_id = c.id from categorie c
     where d.palestra_id = p and c.palestra_id = p and d.categoria_id is null
       and c.nome = case when d.nome ilike '%pole%' then 'Acrobatica' else 'Danza' end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. FASCE D'ETÀ REALI
-- ---------------------------------------------------------------------
do $$
declare p uuid;
begin
  for p in select id from palestre loop
    update fasce_eta set eta_min = 5,  eta_max = 11,   adulti = false, ordine = 1 where palestra_id = p and nome = 'Kids';
    update fasce_eta set nome = 'Ragazzi', eta_min = 12, eta_max = 16, adulti = false, ordine = 2 where palestra_id = p and nome in ('Teen', 'Ragazzi');
    update fasce_eta set eta_min = 17, eta_max = null,  adulti = true,  ordine = 3 where palestra_id = p and nome = 'Adulti';
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. PACCHETTI A INGRESSI: restano, ma non compaiono online
-- ---------------------------------------------------------------------
update tipi_abbonamento set acquistabile_online = false where modalita = 'ingressi';

-- ---------------------------------------------------------------------
-- 4. CERTIFICATO MEDICO CARICATO DAL CLIENTE
-- ---------------------------------------------------------------------
-- Link personale per caricare la foto senza bisogno di un account
alter table allievi add column if not exists token uuid not null default gen_random_uuid();
create unique index if not exists allievi_token_idx on allievi (token);

create table if not exists certificati (
  id             uuid primary key default gen_random_uuid(),
  palestra_id    uuid not null references palestre(id) on delete cascade,
  allievo_id     uuid not null references allievi(id) on delete cascade,
  file_path      text not null,                  -- percorso nel bucket 'certificati'
  nome_file      text,
  scadenza       date,                           -- la conferma la segreteria leggendo il documento
  stato          text not null default 'da_verificare' check (stato in ('da_verificare', 'valido', 'rifiutato')),
  note           text,
  caricato_at    timestamptz not null default now(),
  verificato_da  uuid references auth.users(id),
  verificato_at  timestamptz
);
create index if not exists certificati_allievo_idx on certificati (allievo_id, caricato_at desc);
create index if not exists certificati_da_verificare on certificati (palestra_id, stato);

alter table certificati enable row level security;
drop policy if exists staff_legge on certificati;
create policy staff_legge on certificati for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on certificati;
create policy gestione_scrive on certificati for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists cliente_legge on certificati;
create policy cliente_legge on certificati for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));

-- Archivio privato dei documenti (i file si leggono solo con link firmati lato server)
insert into storage.buckets (id, name, public) values ('certificati', 'certificati', false)
on conflict (id) do nothing;

-- Certificato approvato → la data di scadenza finisce sull'allievo (da lì partono avvisi e blocco)
create or replace function trg_certificati_valido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'valido' and new.scadenza is not null then
    update allievi set certificato_scadenza = new.scadenza
     where id = new.allievo_id
       and (certificato_scadenza is null or certificato_scadenza < new.scadenza);
  end if;
  return new;
end $$;

drop trigger if exists certificati_valido on certificati;
create trigger certificati_valido after insert or update of stato, scadenza on certificati
  for each row execute function trg_certificati_valido();

-- Caricamento dal link personale (chiamata lato server dopo il salvataggio del file)
create or replace function registra_certificato(p_token uuid, p_file text, p_nome_file text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; v_id uuid;
begin
  select * into a from allievi where token = p_token;
  if not found then raise exception 'link_non_valido'; end if;
  insert into certificati (palestra_id, allievo_id, file_path, nome_file)
  values (a.palestra_id, a.id, p_file, p_nome_file)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function registra_certificato(uuid, text, text) from public, anon, authenticated;
grant execute on function registra_certificato(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 5. ELENCO ISCRITTI PER CORSO (la domanda della segreteria:
--    "chi è iscritto a danza aerea?")
-- ---------------------------------------------------------------------
create or replace view v_iscritti_corso with (security_invoker = true) as
  select i.palestra_id, i.corso_id, c.nome as corso_nome, i.id as iscrizione_id,
         a.id as allievo_id, a.nome, a.cognome, a.data_nascita, a.certificato_scadenza,
         (a.certificato_scadenza is null or a.certificato_scadenza < current_date) as bloccato,
         not quota_pagata(a.id) as quota_mancante,
         acc.nome as titolare_nome, acc.cognome as titolare_cognome, acc.email, acc.telefono,
         ta.nome as abbonamento, i.data_inizio, i.data_fine, i.stato,
         (select string_agg(
            (array['lun','mar','mer','gio','ven','sab','dom'])[o.giorno_settimana] || ' ' || to_char(o.ora_inizio, 'HH24:MI'),
            ', ' order by o.giorno_settimana, o.ora_inizio)
          from iscrizioni_orari io join orari o on o.id = io.orario_id
          where io.iscrizione_id = i.id) as orari
  from iscrizioni i
  join corsi c on c.id = i.corso_id
  join allievi a on a.id = i.allievo_id
  join account acc on acc.id = a.account_id
  join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id;

-- Riepilogo per corso: iscritti attivi, certificati scaduti, prove in arrivo
create or replace view v_riepilogo_corsi with (security_invoker = true) as
  select c.id as corso_id, c.palestra_id, c.nome as corso_nome, c.attivo,
         d.nome as disciplina, cat.nome as categoria, f.nome as fascia, l.nome as livello,
         (select count(*) from iscrizioni i where i.corso_id = c.id and i.stato = 'attiva') as iscritti_attivi,
         (select count(*) from v_iscritti_corso v where v.corso_id = c.id and v.stato = 'attiva' and v.bloccato) as certificati_da_sistemare,
         (select count(*) from prove pr join lezioni le on le.id = pr.lezione_id
           where pr.corso_id = c.id and pr.stato = 'confermata' and le.inizio > now()) as prove_in_arrivo
  from corsi c
  join discipline d on d.id = c.disciplina_id
  left join categorie cat on cat.id = d.categoria_id
  join fasce_eta f on f.id = c.fascia_eta_id
  left join livelli l on l.id = c.livello_id;

-- ---------------------------------------------------------------------
-- 6. LINK PERSONALE PER IL CERTIFICATO DENTRO I MESSAGGI
-- ---------------------------------------------------------------------
-- Ogni messaggio rivolto a un allievo può usare {{link_certificato}}
create or replace function accoda_messaggio(
  p_palestra uuid, p_evento text, p_account uuid, p_allievo uuid,
  p_chiave text, p_quando timestamptz, p_vars jsonb, p_giorni int default null
) returns void language plpgsql security definer set search_path = public as $$
declare t messaggi_template; acc account; v_vars jsonb := coalesce(p_vars, '{}'::jsonb);
begin
  select * into t from messaggi_template
   where palestra_id = p_palestra and evento = p_evento and canale = 'email' and attivo
     and (p_giorni is null or giorni = p_giorni)
   order by giorni limit 1;
  if not found then return; end if;
  select * into acc from account where id = p_account;
  if not found or acc.email is null then return; end if;

  if p_allievo is not null then
    select jsonb_build_object(
             'link_certificato', coalesce(pal.base_url, '') || '/certificato?t=' || a.token) || v_vars
      into v_vars
      from allievi a, palestre pal where a.id = p_allievo and pal.id = p_palestra;
  end if;

  insert into messaggi_coda (palestra_id, account_id, allievo_id, evento, canale, destinatario,
                             oggetto, corpo, chiave, programmato_per)
  values (p_palestra, p_account, p_allievo, p_evento, 'email', acc.email,
          render_testo(t.oggetto, v_vars), render_testo(t.corpo, v_vars),
          p_evento || ':' || coalesce(t.giorni, 0) || ':' || p_chiave, greatest(p_quando, now()))
  on conflict (palestra_id, chiave) do nothing;
end $$;

-- Nuova iscrizione senza certificato valido → chiedilo subito
create or replace function trg_iscrizioni_certificato()
returns trigger language plpgsql security definer set search_path = public as $$
declare a allievi; p palestre;
begin
  select * into a from allievi where id = new.allievo_id;
  if a.certificato_scadenza is not null and a.certificato_scadenza >= new.data_fine then return new; end if;
  select * into p from palestre where id = new.palestra_id;
  perform accoda_messaggio(new.palestra_id, 'certificato_richiesto', a.account_id, a.id,
    new.id::text, now(), jsonb_build_object('nome', a.nome, 'palestra', p.nome));
  return new;
end $$;

drop trigger if exists iscrizioni_certificato on iscrizioni;
create trigger iscrizioni_certificato after insert on iscrizioni
  for each row execute function trg_iscrizioni_certificato();

do $$
declare p uuid;
begin
  for p in select id from palestre loop
    insert into messaggi_template (palestra_id, evento, oggetto, corpo, giorni) values
    (p, 'certificato_richiesto', 'Manca il certificato medico di {{nome}}',
'Ciao,

per frequentare le lezioni ci serve il certificato medico di {{nome}}.

Puoi caricarne la foto da qui, ci vuole un minuto:
{{link_certificato}}

Grazie,
{{palestra}}', 0)
    on conflict do nothing;

    -- nei promemoria di scadenza aggiungiamo il link per caricare quello nuovo
    update messaggi_template
       set corpo = corpo || E'\n\nPuoi caricare il nuovo certificato da qui:\n{{link_certificato}}'
     where palestra_id = p and evento = 'scadenza_certificato'
       and corpo not like '%{{link_certificato}}%';
  end loop;
end $$;
