-- =====================================================================
-- RMHouse — 004 REGOLE
-- Recuperi configurabili, liste d'attesa, certificato che blocca,
-- quota d'iscrizione annuale, sospensioni e sconti gestiti dalla segreteria.
-- Da eseguire dopo 001/002 (e dopo seed.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NUOVI CAMPI
-- ---------------------------------------------------------------------
alter table palestre          add column if not exists quota_iscrizione_cent int not null default 0;
alter table palestre          add column if not exists mese_inizio_stagione smallint not null default 9; -- settembre
alter table tipi_abbonamento  add column if not exists recuperi_max int;                 -- null = illimitati, 0 = non ammessi
alter table tipi_abbonamento  add column if not exists giorni_validita_recupero int not null default 30;
alter table iscrizioni        add column if not exists sconto_cent int not null default 0;
alter table iscrizioni        add column if not exists note text;

-- Più promemoria per lo stesso evento (certificato: 30 giorni prima e 7 giorni prima)
alter table messaggi_template drop constraint if exists messaggi_template_palestra_id_evento_canale_key;
create unique index if not exists messaggi_template_unico
  on messaggi_template (palestra_id, evento, canale, giorni);

-- ---------------------------------------------------------------------
-- 2. RECUPERI
-- ---------------------------------------------------------------------
-- Dove si può recuperare: regole per corso oppure per tipo di abbonamento.
-- Nessuna regola = si recupera solo nello stesso corso.
create table if not exists recuperi_ammessi (
  id                uuid primary key default gen_random_uuid(),
  palestra_id       uuid not null references palestre(id) on delete cascade,
  origine           text not null check (origine in ('corso', 'abbonamento')),
  origine_id        uuid not null,                  -- corsi.id oppure tipi_abbonamento.id
  corso_ammesso_id  uuid not null references corsi(id) on delete cascade,
  unique (origine, origine_id, corso_ammesso_id)
);

-- Credito maturato quando un iscritto risulta assente
create table if not exists crediti_recupero (
  id               uuid primary key default gen_random_uuid(),
  palestra_id      uuid not null references palestre(id) on delete cascade,
  iscrizione_id    uuid not null references iscrizioni(id) on delete cascade,
  allievo_id       uuid not null references allievi(id) on delete cascade,
  lezione_persa_id uuid not null references lezioni(id) on delete cascade,
  scadenza         date not null,
  usato_in         uuid references prenotazioni(id) on delete set null,
  annullato        boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (iscrizione_id, lezione_persa_id)
);
create index if not exists crediti_allievo_idx on crediti_recupero (allievo_id, scadenza);

-- Corsi in cui una certa iscrizione può recuperare
create or replace function corsi_recupero(p_iscrizione uuid)
returns table (corso_id uuid) language sql stable security definer set search_path = public as $$
  with i as (select * from iscrizioni where id = p_iscrizione),
  regole as (
    select ra.corso_ammesso_id from recuperi_ammessi ra, i
     where (ra.origine = 'corso' and ra.origine_id = i.corso_id)
        or (ra.origine = 'abbonamento' and ra.origine_id = i.tipo_abbonamento_id)
  )
  select corso_ammesso_id from regole
  union
  select i.corso_id from i;   -- il proprio corso è sempre ammesso
$$;

-- Certificato medico valido a una certa data
create or replace function certificato_valido(p_allievo uuid, p_data date default current_date)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select certificato_scadenza >= p_data from allievi where id = p_allievo), false);
$$;

-- Assenza di un iscritto → credito di recupero (se l'abbonamento lo prevede)
create or replace function trg_presenze_credito()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_isc iscrizioni; v_tipo tipi_abbonamento; v_data date; v_usati int;
begin
  if new.presente then
    -- se torna presente, il credito eventuale non vale più
    update crediti_recupero set annullato = true
     where lezione_persa_id = new.lezione_id and allievo_id = new.allievo_id and usato_in is null;
    return new;
  end if;

  select l.data into v_data from lezioni l where l.id = new.lezione_id;

  select i.* into v_isc from iscrizioni i
   join iscrizioni_orari io on io.iscrizione_id = i.id
   join lezioni l on l.orario_id = io.orario_id and l.id = new.lezione_id
   where i.allievo_id = new.allievo_id and i.stato = 'attiva' and v_data between i.data_inizio and i.data_fine
   limit 1;
  if not found then return new; end if;

  select * into v_tipo from tipi_abbonamento where id = v_isc.tipo_abbonamento_id;
  if v_tipo.recuperi_max = 0 then return new; end if;
  if v_tipo.recuperi_max is not null then
    select count(*) into v_usati from crediti_recupero where iscrizione_id = v_isc.id and not annullato;
    if v_usati >= v_tipo.recuperi_max then return new; end if;
  end if;

  insert into crediti_recupero (palestra_id, iscrizione_id, allievo_id, lezione_persa_id, scadenza)
  values (new.palestra_id, v_isc.id, new.allievo_id, new.lezione_id,
          v_data + v_tipo.giorni_validita_recupero)
  on conflict (iscrizione_id, lezione_persa_id) do nothing;
  return new;
end $$;

drop trigger if exists presenze_credito on presenze;
create trigger presenze_credito after insert or update of presente on presenze
  for each row execute function trg_presenze_credito();

-- Prenotazione di un recupero usando un credito
create or replace function prenota_recupero(p_credito uuid, p_lezione uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c crediti_recupero; l lezioni; v_cap int; v_pren uuid;
begin
  select * into c from crediti_recupero where id = p_credito for update;
  if not found or c.annullato or c.usato_in is not null then raise exception 'credito_non_valido'; end if;

  select * into l from lezioni where id = p_lezione and stato = 'programmata' and inizio > now() for update;
  if not found then raise exception 'lezione_non_disponibile'; end if;
  if l.data > c.scadenza then raise exception 'credito_scaduto'; end if;
  if not exists (select 1 from corsi_recupero(c.iscrizione_id) cr where cr.corso_id = l.corso_id) then
    raise exception 'corso_non_ammesso_per_recupero';
  end if;
  if not certificato_valido(c.allievo_id, l.data) then raise exception 'certificato_scaduto'; end if;

  select coalesce(co.capienza, s.capienza) into v_cap
    from corsi co left join sale s on s.id = l.sala_id where co.id = l.corso_id;
  if v_cap is not null and (select count(*) from v_partecipanti_lezione where lezione_id = l.id) >= v_cap then
    raise exception 'lezione_al_completo';
  end if;

  insert into prenotazioni (palestra_id, lezione_id, allievo_id, iscrizione_id, tipo)
  values (l.palestra_id, l.id, c.allievo_id, c.iscrizione_id, 'recupero')
  returning id into v_pren;
  update crediti_recupero set usato_in = v_pren where id = c.id;
  return v_pren;
end $$;

-- ---------------------------------------------------------------------
-- 3. LISTE D'ATTESA (prove, singole lezioni, iscrizione a un corso pieno)
-- ---------------------------------------------------------------------
create table if not exists liste_attesa (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  tipo         text not null check (tipo in ('prova', 'lezione', 'iscrizione')),
  corso_id     uuid not null references corsi(id) on delete cascade,
  lezione_id   uuid references lezioni(id) on delete cascade,   -- null per la lista del corso
  allievo_id   uuid references allievi(id) on delete cascade,
  account_id   uuid not null references account(id) on delete cascade,
  stato        text not null default 'in_attesa' check (stato in ('in_attesa', 'avvisato', 'chiuso')),
  avvisato_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists lista_attesa_unica
  on liste_attesa (coalesce(lezione_id, corso_id), account_id, tipo) where stato <> 'chiuso';
create index if not exists lista_attesa_coda on liste_attesa (lezione_id, stato, created_at);

alter table liste_attesa enable row level security;
drop policy if exists staff_legge on liste_attesa;
create policy staff_legge on liste_attesa for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on liste_attesa;
create policy gestione_scrive on liste_attesa for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Posti liberi in una lezione (capienza e posti prova)
create or replace function posti_liberi(p_lezione uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posti', case when coalesce(c.capienza, s.capienza) is null then null
                  else coalesce(c.capienza, s.capienza)
                       - (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id) end,
    'posti_prova', c.max_prove_per_lezione
      - (select count(*) from prove pr where pr.lezione_id = l.id
          and pr.stato in ('in_attesa_pagamento', 'confermata', 'presente', 'assente')))
  from lezioni l join corsi c on c.id = l.corso_id left join sale s on s.id = l.sala_id
  where l.id = p_lezione;
$$;

-- Si è liberato un posto → avvisa il primo della lista
create or replace function avvisa_lista_attesa(p_lezione uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_pal palestre; v_liberi jsonb; n int := 0; v_corso text; v_quando text;
begin
  select * into v_pal from palestre p join lezioni l on l.palestra_id = p.id where l.id = p_lezione;
  v_liberi := posti_liberi(p_lezione);
  select c.nome, to_char(l.inizio at time zone v_pal.fuso_orario, 'DD/MM alle HH24:MI')
    into v_corso, v_quando
    from lezioni l join corsi c on c.id = l.corso_id where l.id = p_lezione;

  for r in
    select la.* from liste_attesa la
     where la.lezione_id = p_lezione and la.stato = 'in_attesa'
     order by la.created_at
     limit greatest(coalesce((v_liberi->>'posti')::int, 99), 0)
  loop
    exit when (r.tipo = 'prova' and coalesce((v_liberi->>'posti_prova')::int, 0) <= 0);
    perform accoda_messaggio(r.palestra_id, 'posto_libero', r.account_id, r.allievo_id,
      r.id::text, now(),
      jsonb_build_object('corso', v_corso, 'data', v_quando, 'palestra', v_pal.nome,
                         'link_prenota', coalesce(v_pal.base_url, '') || '/prova'));
    update liste_attesa set stato = 'avvisato', avvisato_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Prova o prenotazione annullata → scatta l'avviso
create or replace function trg_posto_libero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'prove' and new.stato = 'annullata' and old.stato <> 'annullata' then
    perform avvisa_lista_attesa(new.lezione_id);
  elsif tg_table_name = 'prenotazioni' and new.stato = 'annullata' and old.stato <> 'annullata' then
    perform avvisa_lista_attesa(new.lezione_id);
  end if;
  return new;
end $$;

drop trigger if exists prove_posto_libero on prove;
create trigger prove_posto_libero after update of stato on prove
  for each row execute function trg_posto_libero();
drop trigger if exists prenotazioni_posto_libero on prenotazioni;
create trigger prenotazioni_posto_libero after update of stato on prenotazioni
  for each row execute function trg_posto_libero();

-- ---------------------------------------------------------------------
-- 4. SOSPENSIONI (infortunio, gravidanza): la segreteria le registra,
--    la scadenza si sposta in avanti dei giorni sospesi
-- ---------------------------------------------------------------------
create table if not exists sospensioni (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  iscrizione_id uuid not null references iscrizioni(id) on delete cascade,
  dal           date not null,
  al            date not null,
  motivo        text,
  created_at    timestamptz not null default now(),
  check (al >= dal)
);
alter table sospensioni enable row level security;
drop policy if exists staff_legge on sospensioni;
create policy staff_legge on sospensioni for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on sospensioni;
create policy gestione_scrive on sospensioni for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

create or replace function trg_sospensioni()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update iscrizioni set data_fine = data_fine + (new.al - new.dal + 1) where id = new.iscrizione_id;
  return new;
end $$;

drop trigger if exists sospensioni_proroga on sospensioni;
create trigger sospensioni_proroga after insert on sospensioni
  for each row execute function trg_sospensioni();

-- ---------------------------------------------------------------------
-- 5. QUOTA D'ISCRIZIONE ANNUALE (separata dall'abbonamento)
-- ---------------------------------------------------------------------
create table if not exists quote_iscrizione (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  allievo_id    uuid not null references allievi(id) on delete cascade,
  stagione      int  not null,                -- anno d'inizio stagione: 2026 = 2026/27
  importo_cent  int  not null default 0,
  pagamento_id  uuid references pagamenti(id),
  data          date not null default current_date,
  unique (allievo_id, stagione)
);
alter table quote_iscrizione enable row level security;
drop policy if exists staff_legge on quote_iscrizione;
create policy staff_legge on quote_iscrizione for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on quote_iscrizione;
create policy gestione_scrive on quote_iscrizione for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists cliente_legge on quote_iscrizione;
create policy cliente_legge on quote_iscrizione for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));

-- Stagione di una data (se la stagione parte a settembre, il 10/09/2026 sta nella 2026)
drop function if exists stagione_di(date, smallint);
create or replace function stagione_di(p_data date, p_mese_inizio int)
returns int language sql immutable as $$
  select case when extract(month from p_data) >= p_mese_inizio
              then extract(year from p_data)::int else extract(year from p_data)::int - 1 end;
$$;

create or replace function quota_pagata(p_allievo uuid, p_data date default current_date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from quote_iscrizione q join allievi a on a.id = q.allievo_id join palestre p on p.id = a.palestra_id
    where q.allievo_id = p_allievo and q.stagione = stagione_di(p_data, p.mese_inizio_stagione)
  );
$$;

-- ---------------------------------------------------------------------
-- 6. VISTE AGGIORNATE: sospensioni escluse, certificato che blocca, quota
-- ---------------------------------------------------------------------
drop view if exists v_appello;
drop view if exists v_lezioni;
drop view if exists v_partecipanti_lezione;

create view v_partecipanti_lezione with (security_invoker = true) as
  select l.id as lezione_id, l.palestra_id, i.allievo_id, 'iscritto'::text as tipo, i.id as riferimento_id
  from lezioni l
  join iscrizioni_orari io on io.orario_id = l.orario_id
  join iscrizioni i on i.id = io.iscrizione_id
   and i.stato = 'attiva' and l.data between i.data_inizio and i.data_fine
  where not exists (select 1 from sospensioni s
                     where s.iscrizione_id = i.id and l.data between s.dal and s.al)
  union all
  select p.lezione_id, p.palestra_id, p.allievo_id, p.tipo, p.id
  from prenotazioni p where p.stato = 'confermata'
  union all
  select pr.lezione_id, pr.palestra_id, pr.allievo_id, 'prova', pr.id
  from prove pr where pr.stato in ('confermata', 'presente', 'assente');

create view v_appello with (security_invoker = true) as
  select vp.lezione_id, vp.palestra_id, vp.allievo_id, vp.tipo, vp.riferimento_id,
         a.nome, a.cognome, a.data_nascita, a.certificato_scadenza,
         (vp.tipo <> 'prova' and (a.certificato_scadenza is null or a.certificato_scadenza < l.data)) as bloccato,
         (vp.tipo <> 'prova' and a.certificato_scadenza is not null
            and a.certificato_scadenza >= l.data and a.certificato_scadenza < l.data + 30) as certificato_in_scadenza,
         (vp.tipo <> 'prova' and not quota_pagata(a.id, l.data)) as quota_mancante,
         ps.presente
  from v_partecipanti_lezione vp
  join allievi a on a.id = vp.allievo_id
  join lezioni l on l.id = vp.lezione_id
  left join presenze ps on ps.lezione_id = vp.lezione_id and ps.allievo_id = vp.allievo_id;

create view v_lezioni with (security_invoker = true) as
  select l.*, c.nome as corso_nome, c.disciplina_id, c.fascia_eta_id, c.livello_id,
         c.max_prove_per_lezione, coalesce(c.capienza, s.capienza) as capienza,
         s.nome as sala_nome, st.nome as insegnante_nome,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id) as partecipanti,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') as iscritti,
         (select count(*) from prove pr where pr.lezione_id = l.id
            and pr.stato in ('in_attesa_pagamento', 'confermata', 'presente', 'assente')) as prove
  from lezioni l
  join corsi c on c.id = l.corso_id
  left join sale s on s.id = l.sala_id
  left join staff st on st.id = l.insegnante_id;

-- ---------------------------------------------------------------------
-- 7. MESSAGGI: più promemoria per lo stesso evento
-- ---------------------------------------------------------------------
drop function if exists accoda_messaggio(uuid, text, uuid, uuid, text, timestamptz, jsonb);
create or replace function accoda_messaggio(
  p_palestra uuid, p_evento text, p_account uuid, p_allievo uuid,
  p_chiave text, p_quando timestamptz, p_vars jsonb, p_giorni int default null
) returns void language plpgsql security definer set search_path = public as $$
declare t messaggi_template; acc account;
begin
  select * into t from messaggi_template
   where palestra_id = p_palestra and evento = p_evento and canale = 'email' and attivo
     and (p_giorni is null or giorni = p_giorni)
   order by giorni limit 1;
  if not found then return; end if;
  select * into acc from account where id = p_account;
  if not found or acc.email is null then return; end if;

  insert into messaggi_coda (palestra_id, account_id, allievo_id, evento, canale, destinatario,
                             oggetto, corpo, chiave, programmato_per)
  values (p_palestra, p_account, p_allievo, p_evento, 'email', acc.email,
          render_testo(t.oggetto, p_vars), render_testo(t.corpo, p_vars),
          p_evento || ':' || coalesce(t.giorni, 0) || ':' || p_chiave, greatest(p_quando, now()))
  on conflict (palestra_id, chiave) do nothing;
end $$;
grant execute on function accoda_messaggio(uuid, text, uuid, uuid, text, timestamptz, jsonb, int) to service_role;
revoke execute on function accoda_messaggio(uuid, text, uuid, uuid, text, timestamptz, jsonb, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. LAVORI GIORNALIERI aggiornati
-- ---------------------------------------------------------------------
create or replace function lavori_giornalieri()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pal palestre; r record; t messaggi_template; v_oggi date; n_lez int := 0; n_msg int := 0;
begin
  for pal in select * from palestre loop
    v_oggi := (now() at time zone pal.fuso_orario)::date;

    n_lez := n_lez + genera_lezioni(pal.id, v_oggi, v_oggi + 90);

    update iscrizioni set stato = 'scaduta'
     where palestra_id = pal.id and stato = 'attiva' and data_fine < v_oggi;

    -- crediti di recupero scaduti
    update crediti_recupero set annullato = true
     where palestra_id = pal.id and not annullato and usato_in is null and scadenza < v_oggi;

    -- sondaggio "cosa non ti ha convinto"
    for t in select * from messaggi_template where palestra_id = pal.id and evento = 'sondaggio_perso' and attivo loop
      for r in
        select pr.id, pr.allievo_id, a.account_id from prove pr
        join allievi a on a.id = pr.allievo_id
        join lezioni l on l.id = pr.lezione_id
        where pr.palestra_id = pal.id and pr.stato = 'presente'
          and a.stato_lead = 'prova_effettuata' and l.data = v_oggi - greatest(t.giorni, 1)
      loop
        perform accoda_messaggio(pal.id, 'sondaggio_perso', r.account_id, r.allievo_id,
                                 r.id::text, now(), vars_prova(r.id), t.giorni);
        n_msg := n_msg + 1;
      end loop;
    end loop;

    -- scadenza abbonamento (un promemoria per ogni modello attivo)
    for t in select * from messaggi_template where palestra_id = pal.id and evento = 'scadenza_abbonamento' and attivo loop
      for r in
        select i.id, i.allievo_id, a.account_id, a.nome, c.nome as corso, i.data_fine from iscrizioni i
        join allievi a on a.id = i.allievo_id join corsi c on c.id = i.corso_id
        where i.palestra_id = pal.id and i.stato = 'attiva' and i.data_fine = v_oggi + t.giorni
      loop
        perform accoda_messaggio(pal.id, 'scadenza_abbonamento', r.account_id, r.allievo_id, r.id::text, now(),
          jsonb_build_object('nome', r.nome, 'corso', r.corso, 'palestra', pal.nome,
                             'data', to_char(r.data_fine, 'DD/MM/YYYY')), t.giorni);
        n_msg := n_msg + 1;
      end loop;
    end loop;

    -- certificato medico: un avviso per ogni modello (30 giorni prima, 7 giorni prima…)
    -- e, dal giorno della scadenza, il messaggio di blocco (modello con giorni = 0)
    for t in select * from messaggi_template where palestra_id = pal.id and evento = 'scadenza_certificato' and attivo loop
      for r in
        select a.id, a.account_id, a.nome, a.certificato_scadenza from allievi a
        where a.palestra_id = pal.id and a.certificato_scadenza = v_oggi + t.giorni
          and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva')
      loop
        perform accoda_messaggio(pal.id, 'scadenza_certificato', r.account_id, r.id,
          r.id::text || ':' || r.certificato_scadenza, now(),
          jsonb_build_object('nome', r.nome, 'palestra', pal.nome,
                             'data', to_char(r.certificato_scadenza, 'DD/MM/YYYY')), t.giorni);
        n_msg := n_msg + 1;
      end loop;
    end loop;

    -- compleanni
    for t in select * from messaggi_template where palestra_id = pal.id and evento = 'compleanno' and attivo loop
      for r in
        select a.id, a.account_id, a.nome from allievi a
        where a.palestra_id = pal.id and to_char(a.data_nascita, 'MM-DD') = to_char(v_oggi, 'MM-DD')
          and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva')
      loop
        perform accoda_messaggio(pal.id, 'compleanno', r.account_id, r.id,
          r.id::text || ':' || extract(year from v_oggi), now(),
          jsonb_build_object('nome', r.nome, 'palestra', pal.nome), t.giorni);
        n_msg := n_msg + 1;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('lezioni_generate', n_lez, 'messaggi_accodati', n_msg);
end $$;

revoke execute on function prenota_recupero(uuid, uuid) from public, anon;
revoke execute on function avvisa_lista_attesa(uuid) from public, anon;

-- ---------------------------------------------------------------------
-- 9. TESTI DEI NUOVI MESSAGGI
-- ---------------------------------------------------------------------
do $$
declare p uuid;
begin
  for p in select id from palestre loop
    -- il modello certificato del seed diventa quello a 30 giorni
    update messaggi_template set giorni = 30 where palestra_id = p and evento = 'scadenza_certificato' and giorni = 15;

    insert into messaggi_template (palestra_id, evento, oggetto, corpo, giorni) values
    (p, 'scadenza_certificato', 'Fra una settimana scade il certificato medico',
'Ciao {{nome}},

il certificato medico scade il {{data}}. Dopo quella data non potrai accedere alle lezioni finché non ce ne consegni uno nuovo.

Puoi portarlo in segreteria o inviarcelo per email.

{{palestra}}', 7),

    (p, 'scadenza_certificato', 'Certificato medico scaduto',
'Ciao {{nome}},

il certificato medico è scaduto il {{data}}: per poter tornare in sala dobbiamo riceverne uno nuovo.

Passa in segreteria, ci mettiamo un minuto.

{{palestra}}', 0),

    (p, 'posto_libero', 'Si è liberato un posto per {{corso}}',
'Ciao,

si è liberato un posto per {{corso}} del {{data}}.

Se ti interessa ancora, prenota qui: {{link_prenota}}
Il posto va a chi conferma per primo.

{{palestra}}', 0)
    on conflict do nothing;
  end loop;
end $$;
