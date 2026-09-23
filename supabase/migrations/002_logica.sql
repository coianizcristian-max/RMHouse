-- =====================================================================
-- RMHouse — 002 LOGICA
-- Funzioni, automatismi (trigger), viste e sicurezza (RLS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FUNZIONI DI SUPPORTO
-- ---------------------------------------------------------------------

-- Ruolo dell'utente collegato in una palestra
create or replace function ha_ruolo(p_palestra uuid, p_ruoli text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where palestra_id = p_palestra and user_id = auth.uid() and attivo
      and ruolo::text = any (p_ruoli)
  );
$$;

create or replace function is_staff(p_palestra uuid)
returns boolean language sql stable as $$
  select ha_ruolo(p_palestra, array['admin', 'segreteria', 'insegnante']);
$$;

create or replace function is_gestione(p_palestra uuid)
returns boolean language sql stable as $$
  select ha_ruolo(p_palestra, array['admin', 'segreteria']);
$$;

-- Account collegati all'utente cliente
create or replace function miei_account()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from account where user_id = auth.uid();
$$;

-- Età compiuta a una certa data
create or replace function eta_al(p_nascita date, p_data date default current_date)
returns int language sql immutable as $$
  select extract(year from age(p_data, p_nascita))::int;
$$;

-- Fine del periodo di abbonamento.
-- Mese solare: iscritto il 10/09, mensile → 30/09; trimestrale → 30/11.
create or replace function fine_periodo(p_inizio date, p_mesi int, p_fine_mese boolean)
returns date language sql immutable as $$
  select case
    when p_fine_mese then (date_trunc('month', p_inizio) + make_interval(months => p_mesi) - interval '1 day')::date
    else (p_inizio + make_interval(months => p_mesi) - interval '1 day')::date
  end;
$$;

-- Sostituisce i segnaposto {{chiave}} con i valori di un jsonb
create or replace function render_testo(p_testo text, p_vars jsonb)
returns text language plpgsql immutable as $$
declare k text; v text; r text := coalesce(p_testo, '');
begin
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    r := replace(r, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  return regexp_replace(r, '\{\{[a-z_]+\}\}', '', 'g');  -- segnaposto non valorizzati: spariscono
end $$;

-- ---------------------------------------------------------------------
-- 2. GENERAZIONE AUTOMATICA DELLE LEZIONI
-- ---------------------------------------------------------------------

-- Crea le lezioni datate a partire dagli orari ricorrenti (idempotente).
create or replace function genera_lezioni(p_palestra uuid, p_dal date, p_al date, p_orario uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- se chiamata da un utente collegato, deve essere admin/segreteria di quella palestra
  if auth.uid() is not null and not is_gestione(p_palestra) then
    raise exception 'non_autorizzato';
  end if;
  insert into lezioni (palestra_id, orario_id, corso_id, data, inizio, fine, sala_id, insegnante_id)
  select o.palestra_id, o.id, o.corso_id, d::date,
         (d::date + o.ora_inizio) at time zone p.fuso_orario,
         (d::date + o.ora_inizio + make_interval(mins => o.durata_min)) at time zone p.fuso_orario,
         o.sala_id, o.insegnante_id
  from orari o
  join corsi c    on c.id = o.corso_id and c.attivo
  join palestre p on p.id = o.palestra_id
  cross join generate_series(greatest(p_dal, o.valido_dal), least(p_al, coalesce(o.valido_al, p_al)), interval '1 day') d
  where o.palestra_id = p_palestra and o.attivo
    and (p_orario is null or o.id = p_orario)
    and extract(isodow from d) = o.giorno_settimana
    and not exists (select 1 from chiusure ch where ch.palestra_id = o.palestra_id and d::date between ch.dal and ch.al)
  on conflict (orario_id, data) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Nuovo orario → genera subito le lezioni dei prossimi 90 giorni.
-- Orario modificato → rigenera le lezioni future che non hanno ancora nessuno collegato.
create or replace function trg_orari_lezioni()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    delete from lezioni l
    where l.orario_id = new.id and l.inizio > now()
      and not exists (select 1 from prove pr where pr.lezione_id = l.id)
      and not exists (select 1 from prenotazioni pn where pn.lezione_id = l.id)
      and not exists (select 1 from presenze ps where ps.lezione_id = l.id);
    -- quelle rimaste (con prove/prenotazioni) seguono il nuovo insegnante/sala
    update lezioni set insegnante_id = new.insegnante_id, sala_id = new.sala_id
    where orario_id = new.id and inizio > now();
  end if;
  if new.attivo then
    perform genera_lezioni(new.palestra_id, current_date, current_date + 90, new.id);
  end if;
  return new;
end $$;

drop trigger if exists orari_lezioni on orari;
create trigger orari_lezioni after insert or update on orari
  for each row execute function trg_orari_lezioni();

-- Nuova chiusura → annulla le lezioni già generate in quel periodo
create or replace function trg_chiusure_annulla()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update lezioni set stato = 'annullata', note = coalesce(new.motivo, 'Chiusura')
  where palestra_id = new.palestra_id and data between new.dal and new.al;
  return new;
end $$;

drop trigger if exists chiusure_annulla on chiusure;
create trigger chiusure_annulla after insert on chiusure
  for each row execute function trg_chiusure_annulla();

-- ---------------------------------------------------------------------
-- 3. PARTECIPANTI DI UNA LEZIONE (base dell'appello)
-- ---------------------------------------------------------------------
-- Iscritti a orari fissi + prenotazioni puntuali + prove.
create or replace view v_partecipanti_lezione with (security_invoker = true) as
  select l.id as lezione_id, l.palestra_id, i.allievo_id, 'iscritto'::text as tipo, i.id as riferimento_id
  from lezioni l
  join iscrizioni_orari io on io.orario_id = l.orario_id
  join iscrizioni i on i.id = io.iscrizione_id
   and i.stato = 'attiva' and l.data between i.data_inizio and i.data_fine
  union all
  select p.lezione_id, p.palestra_id, p.allievo_id, p.tipo, p.id
  from prenotazioni p where p.stato = 'confermata'
  union all
  select pr.lezione_id, pr.palestra_id, pr.allievo_id, 'prova', pr.id
  from prove pr where pr.stato in ('confermata', 'presente', 'assente');

-- Appello completo con nomi e presenza già registrata
create or replace view v_appello with (security_invoker = true) as
  select vp.lezione_id, vp.palestra_id, vp.allievo_id, vp.tipo, vp.riferimento_id,
         a.nome, a.cognome, a.data_nascita, a.certificato_scadenza,
         (a.certificato_scadenza is null or a.certificato_scadenza < l.data) as certificato_mancante,
         ps.presente
  from v_partecipanti_lezione vp
  join allievi a on a.id = vp.allievo_id
  join lezioni l on l.id = vp.lezione_id
  left join presenze ps on ps.lezione_id = vp.lezione_id and ps.allievo_id = vp.allievo_id;

-- Lezioni con conteggi (per agenda e disponibilità)
drop view if exists v_lezioni;
create view v_lezioni as
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
alter view v_lezioni set (security_invoker = true);

-- ---------------------------------------------------------------------
-- 4. MESSAGGI: accodamento
-- ---------------------------------------------------------------------
create or replace function accoda_messaggio(
  p_palestra uuid, p_evento text, p_account uuid, p_allievo uuid,
  p_chiave text, p_quando timestamptz, p_vars jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare t messaggi_template; acc account;
begin
  select * into t from messaggi_template
   where palestra_id = p_palestra and evento = p_evento and canale = 'email' and attivo;
  if not found then return; end if;
  select * into acc from account where id = p_account;
  if not found or acc.email is null then return; end if;

  insert into messaggi_coda (palestra_id, account_id, allievo_id, evento, canale, destinatario,
                             oggetto, corpo, chiave, programmato_per)
  values (p_palestra, p_account, p_allievo, p_evento, 'email', acc.email,
          render_testo(t.oggetto, p_vars), render_testo(t.corpo, p_vars),
          p_evento || ':' || p_chiave, greatest(p_quando, now()))
  on conflict (palestra_id, chiave) do nothing;
end $$;

-- Variabili per i messaggi legati a una prova
create or replace function vars_prova(p_prova uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nome',             a.nome,
    'nome_titolare',    acc.nome,
    'corso',            c.nome,
    'disciplina',       d.nome,
    'data',             to_char(l.inizio at time zone p.fuso_orario, 'DD/MM/YYYY'),
    'giorno',           (array['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'])
                          [extract(isodow from l.inizio at time zone p.fuso_orario)::int],
    'ora',              to_char(l.inizio at time zone p.fuso_orario, 'HH24:MI'),
    'sala',             coalesce(s.nome, ''),
    'info_prova',       coalesce(c.info_prova, ''),
    'palestra',         p.nome,
    'link_abbonamento', coalesce(p.base_url, '') || '/abbonamento?t=' || pr.token,
    'link_feedback',    coalesce(p.base_url, '') || '/feedback?t=' || pr.token,
    'link_recensione',  coalesce(p.google_review_url, '')
  )
  from prove pr
  join allievi a   on a.id = pr.allievo_id
  join account acc on acc.id = a.account_id
  join corsi c     on c.id = pr.corso_id
  join discipline d on d.id = c.disciplina_id
  join lezioni l   on l.id = pr.lezione_id
  join palestre p  on p.id = pr.palestra_id
  left join sale s on s.id = l.sala_id
  where pr.id = p_prova;
$$;

-- ---------------------------------------------------------------------
-- 5. PRENOTAZIONE DELLA PROVA (chiamata dal sito pubblico, lato server)
-- ---------------------------------------------------------------------
-- Input jsonb:
-- { palestra_slug, corso_id, lezione_id (null = "nessun orario adatto, contattatemi"),
--   titolare: {nome, cognome, email, telefono},
--   partecipante: {nome, cognome, data_nascita},   -- se minore; se adulto: dati del titolare
--   adulto: true|false, consenso_privacy: true, consenso_marketing: bool, fonte, utm }
create or replace function prenota_prova(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal palestre; v_corso corsi; v_fascia fasce_eta; v_lez lezioni;
  v_acc uuid; v_all uuid; v_prova uuid; v_pag uuid;
  v_email text := lower(trim(p->'titolare'->>'email'));
  v_adulto boolean := coalesce((p->>'adulto')::boolean, true);
  v_nome text; v_cognome text; v_nascita date; v_eta int;
  v_occupati int; v_capienza int; v_stato stato_prova;
begin
  if coalesce((p->>'consenso_privacy')::boolean, false) is not true then
    raise exception 'consenso_privacy_mancante';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_non_valida';
  end if;

  select * into v_pal from palestre where slug = p->>'palestra_slug';
  if not found then raise exception 'palestra_non_trovata'; end if;

  select * into v_corso from corsi
   where id = (p->>'corso_id')::uuid and palestra_id = v_pal.id and attivo and prova_abilitata;
  if not found then raise exception 'corso_non_disponibile'; end if;
  select * into v_fascia from fasce_eta where id = v_corso.fascia_eta_id;

  -- chi partecipa
  if v_adulto then
    v_nome := p->'titolare'->>'nome'; v_cognome := p->'titolare'->>'cognome';
    v_nascita := (p->'titolare'->>'data_nascita')::date;
  else
    v_nome := p->'partecipante'->>'nome'; v_cognome := p->'partecipante'->>'cognome';
    v_nascita := (p->'partecipante'->>'data_nascita')::date;
  end if;
  if v_nome is null or v_cognome is null or v_nascita is null then
    raise exception 'dati_partecipante_mancanti';
  end if;

  -- controllo età rispetto al corso
  v_eta := eta_al(v_nascita, current_date);
  if v_eta < v_fascia.eta_min or (v_fascia.eta_max is not null and v_eta > v_fascia.eta_max) then
    raise exception 'eta_non_compatibile';
  end if;

  -- account (chi paga): uno per email
  insert into account (palestra_id, nome, cognome, email, telefono, fonte, utm, consenso_privacy_at, consenso_marketing)
  values (v_pal.id, p->'titolare'->>'nome', p->'titolare'->>'cognome', v_email, p->'titolare'->>'telefono',
          p->>'fonte', p->'utm', now(), coalesce((p->>'consenso_marketing')::boolean, false))
  on conflict (palestra_id, email) do update
    set telefono = coalesce(excluded.telefono, account.telefono),
        consenso_privacy_at = now(),
        consenso_marketing = account.consenso_marketing or excluded.consenso_marketing
  returning id into v_acc;

  -- allievo (chi frequenta): riusa se già presente
  select id into v_all from allievi
   where account_id = v_acc and lower(nome) = lower(v_nome) and data_nascita = v_nascita;
  if v_all is null then
    insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare)
    values (v_pal.id, v_acc, v_nome, v_cognome, v_nascita, v_adulto)
    returning id into v_all;
  end if;

  insert into lead_eventi (palestra_id, allievo_id, corso_id, evento)
  values (v_pal.id, v_all, v_corso.id, 'richiesta') on conflict do nothing;

  -- nessun orario scelto: resta una richiesta da ricontattare
  if p->>'lezione_id' is null then
    return jsonb_build_object('esito', 'richiesta_registrata', 'allievo_id', v_all);
  end if;

  -- lezione valida, futura, con posto (lock per evitare doppie prenotazioni simultanee)
  select * into v_lez from lezioni
   where id = (p->>'lezione_id')::uuid and corso_id = v_corso.id and stato = 'programmata'
     and inizio > now() + make_interval(hours => v_pal.preavviso_ore)
   for update;
  if not found then raise exception 'lezione_non_disponibile'; end if;

  if exists (select 1 from prove where allievo_id = v_all and corso_id = v_corso.id
              and stato in ('in_attesa_pagamento', 'confermata')) then
    raise exception 'prova_gia_prenotata';
  end if;

  select count(*) into v_occupati from prove
   where lezione_id = v_lez.id and stato in ('in_attesa_pagamento', 'confermata');
  if v_occupati >= v_corso.max_prove_per_lezione then raise exception 'posti_prova_esauriti'; end if;

  select coalesce(v_corso.capienza, s.capienza) into v_capienza from lezioni l left join sale s on s.id = l.sala_id where l.id = v_lez.id;
  if v_capienza is not null and
     (select count(*) from v_partecipanti_lezione where lezione_id = v_lez.id) + 1 > v_capienza then
    raise exception 'lezione_al_completo';
  end if;

  v_stato := case when v_corso.prezzo_prova_cent > 0 then 'in_attesa_pagamento' else 'confermata' end;

  if v_corso.prezzo_prova_cent > 0 then
    insert into pagamenti (palestra_id, account_id, corso_id, causale, descrizione, importo_cent)
    values (v_pal.id, v_acc, v_corso.id, 'prova',
            'Lezione di prova ' || v_corso.nome || ' - ' || v_nome || ' ' || v_cognome,
            v_corso.prezzo_prova_cent)
    returning id into v_pag;
  end if;

  insert into prove (palestra_id, allievo_id, corso_id, lezione_id, prezzo_cent, stato, pagamento_id)
  values (v_pal.id, v_all, v_corso.id, v_lez.id, v_corso.prezzo_prova_cent, v_stato, v_pag)
  returning id into v_prova;

  insert into lead_eventi (palestra_id, allievo_id, corso_id, evento)
  values (v_pal.id, v_all, v_corso.id, 'prova_prenotata') on conflict do nothing;

  update allievi set stato_lead = 'prova_prenotata'
   where id = v_all and stato_lead in ('nuovo', 'perso');

  return jsonb_build_object(
    'esito', case when v_pag is null then 'prova_confermata' else 'pagamento_richiesto' end,
    'prova_id', v_prova, 'pagamento_id', v_pag, 'importo_cent', v_corso.prezzo_prova_cent);
end $$;

-- Pagamento riuscito (chiamata dal webhook Stripe): conferma la prova collegata
create or replace function conferma_pagamento(p_pagamento uuid, p_session text default null, p_intent text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update pagamenti set stato = 'pagato', pagato_at = now(),
         stripe_session_id = coalesce(p_session, stripe_session_id),
         stripe_payment_intent = coalesce(p_intent, stripe_payment_intent)
   where id = p_pagamento and stato <> 'pagato';
  update prove set stato = 'confermata'
   where pagamento_id = p_pagamento and stato = 'in_attesa_pagamento';
end $$;

-- ---------------------------------------------------------------------
-- 6. AUTOMATISMI SUL PERCORSO DEL LEAD
-- ---------------------------------------------------------------------

-- Prova confermata → messaggio di conferma subito + promemoria il giorno prima alle 18
create or replace function trg_prove_messaggi()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_vars jsonb; v_acc uuid; v_inizio timestamptz; v_tz text; v_data date;
begin
  if new.stato = 'confermata' and (tg_op = 'INSERT' or old.stato is distinct from 'confermata') then
    v_vars := vars_prova(new.id);
    select a.account_id into v_acc from allievi a where a.id = new.allievo_id;
    select l.inizio, p.fuso_orario, l.data into v_inizio, v_tz, v_data
      from lezioni l join palestre p on p.id = l.palestra_id where l.id = new.lezione_id;

    perform accoda_messaggio(new.palestra_id, 'prova_confermata', v_acc, new.allievo_id,
                             new.id::text, now(), v_vars);
    -- promemoria solo se il giorno prima alle 18 è ancora nel futuro
    if ((v_data - 1) + time '18:00') at time zone v_tz > now() then
      perform accoda_messaggio(new.palestra_id, 'promemoria_prova', v_acc, new.allievo_id,
                               new.id::text, ((v_data - 1) + time '18:00') at time zone v_tz, v_vars);
    end if;
  end if;

  -- prova annullata → annulla i messaggi non ancora partiti
  if tg_op = 'UPDATE' and new.stato = 'annullata' and old.stato <> 'annullata' then
    update messaggi_coda set stato = 'annullato'
     where palestra_id = new.palestra_id and stato = 'in_coda'
       and chiave like '%:' || new.id::text;
  end if;
  return new;
end $$;

drop trigger if exists prove_messaggi on prove;
create trigger prove_messaggi after insert or update of stato on prove
  for each row execute function trg_prove_messaggi();

-- Presenza registrata dall'insegnante → aggiorna la prova, il lead e manda il follow-up
create or replace function trg_presenze_prova()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prova prove; v_fine timestamptz; v_acc uuid;
begin
  select * into v_prova from prove
   where lezione_id = new.lezione_id and allievo_id = new.allievo_id
     and stato in ('confermata', 'presente', 'assente');
  if not found then return new; end if;

  update prove set stato = case when new.presente then 'presente'::stato_prova else 'assente'::stato_prova end
   where id = v_prova.id;

  if new.presente then
    update allievi set stato_lead = 'prova_effettuata'
     where id = new.allievo_id and stato_lead in ('nuovo', 'prova_prenotata', 'perso');
    insert into lead_eventi (palestra_id, allievo_id, corso_id, evento)
    values (new.palestra_id, new.allievo_id, v_prova.corso_id, 'prova_effettuata') on conflict do nothing;

    select fine into v_fine from lezioni where id = new.lezione_id;
    select account_id into v_acc from allievi where id = new.allievo_id;
    perform accoda_messaggio(new.palestra_id, 'follow_up_prova', v_acc, new.allievo_id,
                             v_prova.id::text, v_fine + interval '2 hours', vars_prova(v_prova.id));
  end if;
  return new;
end $$;

drop trigger if exists presenze_prova on presenze;
create trigger presenze_prova after insert or update of presente on presenze
  for each row execute function trg_presenze_prova();

-- Iscrizione: calcola la scadenza a fine mese, aggiorna il lead, annulla il sondaggio
create or replace function trg_iscrizioni_before()
returns trigger language plpgsql as $$
declare t tipi_abbonamento;
begin
  select * into t from tipi_abbonamento where id = new.tipo_abbonamento_id;
  if new.data_fine is null then
    new.data_fine := fine_periodo(new.data_inizio, t.durata_mesi, t.scadenza_fine_mese);
  end if;
  if new.ingressi_residui is null and t.modalita = 'ingressi' then
    new.ingressi_residui := t.num_ingressi;
  end if;
  return new;
end $$;

drop trigger if exists iscrizioni_before on iscrizioni;
create trigger iscrizioni_before before insert on iscrizioni
  for each row execute function trg_iscrizioni_before();

create or replace function trg_iscrizioni_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update allievi set stato_lead = 'iscritto', motivo_perso = null where id = new.allievo_id;
  insert into lead_eventi (palestra_id, allievo_id, corso_id, evento)
  values (new.palestra_id, new.allievo_id, new.corso_id, 'iscritto') on conflict do nothing;
  update messaggi_coda set stato = 'annullato'
   where allievo_id = new.allievo_id and evento = 'sondaggio_perso' and stato = 'in_coda';
  return new;
end $$;

drop trigger if exists iscrizioni_after on iscrizioni;
create trigger iscrizioni_after after insert on iscrizioni
  for each row execute function trg_iscrizioni_after();

-- Feedback "cosa non ti ha convinto" (dal link pubblico con token)
create or replace function registra_feedback(p_token uuid, p_motivo text, p_testo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_prova prove;
begin
  select * into v_prova from prove where token = p_token;
  if not found then raise exception 'link_non_valido'; end if;
  insert into feedback_prove (palestra_id, prova_id, motivo, testo)
  values (v_prova.palestra_id, v_prova.id, p_motivo, nullif(trim(p_testo), ''))
  on conflict (prova_id) do update set motivo = excluded.motivo, testo = excluded.testo;
  update allievi set stato_lead = 'perso', motivo_perso = p_motivo
   where id = v_prova.allievo_id and stato_lead <> 'iscritto';
  insert into lead_eventi (palestra_id, allievo_id, corso_id, evento)
  values (v_prova.palestra_id, v_prova.allievo_id, v_prova.corso_id, 'perso') on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- 7. LAVORI GIORNALIERI (lanciati da cron, vedi 003_cron.sql)
-- ---------------------------------------------------------------------
create or replace function lavori_giornalieri()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pal palestre; r record; t messaggi_template; v_oggi date; n_lez int := 0; n_msg int := 0;
begin
  for pal in select * from palestre loop
    v_oggi := (now() at time zone pal.fuso_orario)::date;

    -- lezioni: finestra mobile di 90 giorni
    n_lez := n_lez + genera_lezioni(pal.id, v_oggi, v_oggi + 90);

    -- abbonamenti scaduti
    update iscrizioni set stato = 'scaduta'
     where palestra_id = pal.id and stato = 'attiva' and data_fine < v_oggi;

    -- sondaggio "cosa non ti ha convinto": X giorni dopo la prova, se non iscritto
    select * into t from messaggi_template where palestra_id = pal.id and evento = 'sondaggio_perso' and attivo;
    if found then
      for r in
        select pr.id, pr.allievo_id, a.account_id from prove pr
        join allievi a on a.id = pr.allievo_id
        join lezioni l on l.id = pr.lezione_id
        where pr.palestra_id = pal.id and pr.stato = 'presente'
          and a.stato_lead = 'prova_effettuata'
          and l.data = v_oggi - greatest(t.giorni, 1)
      loop
        perform accoda_messaggio(pal.id, 'sondaggio_perso', r.account_id, r.allievo_id,
                                 r.id::text, now(), vars_prova(r.id));
        n_msg := n_msg + 1;
      end loop;
    end if;

    -- scadenza abbonamento
    select * into t from messaggi_template where palestra_id = pal.id and evento = 'scadenza_abbonamento' and attivo;
    if found then
      for r in
        select i.id, i.allievo_id, a.account_id, a.nome, c.nome as corso, i.data_fine from iscrizioni i
        join allievi a on a.id = i.allievo_id join corsi c on c.id = i.corso_id
        where i.palestra_id = pal.id and i.stato = 'attiva' and i.data_fine = v_oggi + t.giorni
      loop
        perform accoda_messaggio(pal.id, 'scadenza_abbonamento', r.account_id, r.allievo_id, r.id::text, now(),
          jsonb_build_object('nome', r.nome, 'corso', r.corso, 'palestra', pal.nome,
                             'data', to_char(r.data_fine, 'DD/MM/YYYY')));
        n_msg := n_msg + 1;
      end loop;
    end if;

    -- scadenza certificato medico (solo allievi con iscrizione attiva)
    select * into t from messaggi_template where palestra_id = pal.id and evento = 'scadenza_certificato' and attivo;
    if found then
      for r in
        select a.id, a.account_id, a.nome, a.certificato_scadenza from allievi a
        where a.palestra_id = pal.id and a.certificato_scadenza = v_oggi + t.giorni
          and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva')
      loop
        perform accoda_messaggio(pal.id, 'scadenza_certificato', r.account_id, r.id,
          r.id::text || ':' || r.certificato_scadenza, now(),
          jsonb_build_object('nome', r.nome, 'palestra', pal.nome,
                             'data', to_char(r.certificato_scadenza, 'DD/MM/YYYY')));
        n_msg := n_msg + 1;
      end loop;
    end if;

    -- compleanni (allievi iscritti)
    select * into t from messaggi_template where palestra_id = pal.id and evento = 'compleanno' and attivo;
    if found then
      for r in
        select a.id, a.account_id, a.nome from allievi a
        where a.palestra_id = pal.id
          and to_char(a.data_nascita, 'MM-DD') = to_char(v_oggi, 'MM-DD')
          and exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.stato = 'attiva')
      loop
        perform accoda_messaggio(pal.id, 'compleanno', r.account_id, r.id,
          r.id::text || ':' || extract(year from v_oggi), now(),
          jsonb_build_object('nome', r.nome, 'palestra', pal.nome));
        n_msg := n_msg + 1;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('lezioni_generate', n_lez, 'messaggi_accodati', n_msg);
end $$;

-- Promo segmentata: solo a chi ha un'iscrizione attiva in certi corsi (e ha dato il consenso marketing)
create or replace function invia_promo(p_palestra uuid, p_oggetto text, p_corpo text, p_corsi uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_id text := gen_random_uuid()::text;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
  select distinct on (acc.id) p_palestra, acc.id, 'promo', 'email', acc.email,
         p_oggetto, render_testo(p_corpo, jsonb_build_object('nome', acc.nome)),
         'promo:' || v_id || ':' || acc.id
  from iscrizioni i
  join allievi a on a.id = i.allievo_id
  join account acc on acc.id = a.account_id
  where i.palestra_id = p_palestra and i.stato = 'attiva' and acc.consenso_marketing
    and (p_corsi is null or i.corso_id = any (p_corsi));
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 8. STATISTICHE: funnel prova → iscrizione per corso
-- ---------------------------------------------------------------------
create or replace function statistiche_funnel(p_palestra uuid, p_dal date, p_al date)
returns table (
  corso_id uuid, corso text, richieste bigint, prove_prenotate bigint, prove_effettuate bigint,
  iscrizioni bigint, conversione_pct numeric, fatturato_cent bigint
) language sql stable security invoker as $$
  select c.id, c.nome,
    count(distinct le.allievo_id) filter (where le.evento = 'richiesta'),
    count(distinct le.allievo_id) filter (where le.evento = 'prova_prenotata'),
    count(distinct le.allievo_id) filter (where le.evento = 'prova_effettuata'),
    count(distinct le.allievo_id) filter (where le.evento = 'iscritto'),
    round(100.0 * count(distinct le.allievo_id) filter (where le.evento = 'iscritto')
          / nullif(count(distinct le.allievo_id) filter (where le.evento = 'prova_effettuata'), 0), 1),
    (select coalesce(sum(pg.importo_cent), 0) from pagamenti pg
      where pg.corso_id = c.id and pg.stato = 'pagato'
        and pg.pagato_at >= p_dal and pg.pagato_at < p_al + 1)::bigint
  from corsi c
  left join lead_eventi le on le.corso_id = c.id
       and le.created_at >= p_dal and le.created_at < p_al + 1
  where c.palestra_id = p_palestra
  group by c.id, c.nome
  order by c.nome;
$$;

-- ---------------------------------------------------------------------
-- 9. SICUREZZA (Row Level Security)
-- ---------------------------------------------------------------------
-- Regole:
--  • staff (admin/segreteria/insegnante) legge tutto della propria palestra
--  • admin/segreteria modificano tutto
--  • insegnante scrive solo le presenze
--  • cliente legge solo i propri dati (account, allievi, iscrizioni, prove, pagamenti, documenti)
--  • visitatore anonimo legge solo il catalogo pubblico
--  • il sito pubblico scrive tramite le funzioni lato server (service role)

do $$
declare t text;
begin
  foreach t in array array[
    'palestre','staff','discipline','fasce_eta','livelli','sale','corsi','orari','chiusure','lezioni',
    'account','allievi','tipi_abbonamento','tipi_abbonamento_corsi','pagamenti','iscrizioni','iscrizioni_orari',
    'prenotazioni','prove','presenze','lead_eventi','feedback_prove','documenti_fiscali',
    'messaggi_template','messaggi_coda'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;

  -- tabelle con palestra_id: lettura staff, scrittura gestione
  foreach t in array array[
    'staff','discipline','fasce_eta','livelli','sale','corsi','orari','chiusure','lezioni',
    'account','allievi','tipi_abbonamento','pagamenti','iscrizioni','prenotazioni','prove','presenze',
    'lead_eventi','feedback_prove','documenti_fiscali','messaggi_template','messaggi_coda'
  ] loop
    execute format('drop policy if exists staff_legge on %I', t);
    execute format('create policy staff_legge on %I for select to authenticated using (is_staff(palestra_id))', t);
    execute format('drop policy if exists gestione_scrive on %I', t);
    execute format('create policy gestione_scrive on %I for all to authenticated using (is_gestione(palestra_id)) with check (is_gestione(palestra_id))', t);
  end loop;
end $$;

-- palestre
drop policy if exists pubblico_legge on palestre;
create policy pubblico_legge on palestre for select to anon, authenticated using (true);
drop policy if exists admin_modifica on palestre;
create policy admin_modifica on palestre for update to authenticated
  using (ha_ruolo(id, array['admin'])) with check (ha_ruolo(id, array['admin']));

-- staff: ognuno vede la propria scheda
drop policy if exists se_stesso on staff;
create policy se_stesso on staff for select to authenticated using (user_id = auth.uid());

-- tabelle ponte (senza palestra_id)
drop policy if exists staff_legge on tipi_abbonamento_corsi;
create policy staff_legge on tipi_abbonamento_corsi for select to anon, authenticated using (true);
drop policy if exists gestione_scrive on tipi_abbonamento_corsi;
create policy gestione_scrive on tipi_abbonamento_corsi for all to authenticated
  using (exists (select 1 from tipi_abbonamento ta where ta.id = tipo_abbonamento_id and is_gestione(ta.palestra_id)))
  with check (exists (select 1 from tipi_abbonamento ta where ta.id = tipo_abbonamento_id and is_gestione(ta.palestra_id)));

drop policy if exists staff_legge on iscrizioni_orari;
create policy staff_legge on iscrizioni_orari for select to authenticated
  using (exists (select 1 from iscrizioni i where i.id = iscrizione_id
                 and (is_staff(i.palestra_id) or i.allievo_id in (select id from allievi where account_id in (select miei_account())))));
drop policy if exists gestione_scrive on iscrizioni_orari;
create policy gestione_scrive on iscrizioni_orari for all to authenticated
  using (exists (select 1 from iscrizioni i where i.id = iscrizione_id and is_gestione(i.palestra_id)))
  with check (exists (select 1 from iscrizioni i where i.id = iscrizione_id and is_gestione(i.palestra_id)));

-- catalogo pubblico (per il percorso di prova)
drop policy if exists pubblico_legge on discipline;
create policy pubblico_legge on discipline for select to anon, authenticated using (attiva);
drop policy if exists pubblico_legge on fasce_eta;
create policy pubblico_legge on fasce_eta for select to anon, authenticated using (true);
drop policy if exists pubblico_legge on livelli;
create policy pubblico_legge on livelli for select to anon, authenticated using (true);
drop policy if exists pubblico_legge on corsi;
create policy pubblico_legge on corsi for select to anon, authenticated using (attivo);
drop policy if exists pubblico_legge on orari;
create policy pubblico_legge on orari for select to anon, authenticated using (attivo);
drop policy if exists pubblico_legge on sale;
create policy pubblico_legge on sale for select to anon, authenticated using (true);
drop policy if exists pubblico_legge on tipi_abbonamento;
create policy pubblico_legge on tipi_abbonamento for select to anon, authenticated using (attivo and acquistabile_online);

-- insegnante: registra le presenze
drop policy if exists insegnante_presenze on presenze;
create policy insegnante_presenze on presenze for insert to authenticated with check (is_staff(palestra_id));
drop policy if exists insegnante_presenze_mod on presenze;
create policy insegnante_presenze_mod on presenze for update to authenticated
  using (is_staff(palestra_id)) with check (is_staff(palestra_id));

-- cliente: solo i propri dati
drop policy if exists cliente_legge on account;
create policy cliente_legge on account for select to authenticated using (user_id = auth.uid());
drop policy if exists cliente_legge on allievi;
create policy cliente_legge on allievi for select to authenticated using (account_id in (select miei_account()));
drop policy if exists cliente_legge on iscrizioni;
create policy cliente_legge on iscrizioni for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));
drop policy if exists cliente_legge on prove;
create policy cliente_legge on prove for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));
drop policy if exists cliente_legge on prenotazioni;
create policy cliente_legge on prenotazioni for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));
drop policy if exists cliente_legge on pagamenti;
create policy cliente_legge on pagamenti for select to authenticated using (account_id in (select miei_account()));
drop policy if exists cliente_legge on documenti_fiscali;
create policy cliente_legge on documenti_fiscali for select to authenticated
  using (pagamento_id in (select id from pagamenti where account_id in (select miei_account())));

-- Le funzioni che scrivono per conto del sito pubblico non sono esposte ai visitatori:
revoke execute on function prenota_prova(jsonb) from public, anon, authenticated;
revoke execute on function conferma_pagamento(uuid, text, text) from public, anon, authenticated;
revoke execute on function registra_feedback(uuid, text, text) from public, anon, authenticated;
revoke execute on function lavori_giornalieri() from public, anon, authenticated;
revoke execute on function genera_lezioni(uuid, date, date, uuid) from public, anon;
revoke execute on function accoda_messaggio(uuid, text, uuid, uuid, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function prenota_prova(jsonb) to service_role;
grant execute on function conferma_pagamento(uuid, text, text) to service_role;
grant execute on function registra_feedback(uuid, text, text) to service_role;
grant execute on function lavori_giornalieri() to service_role;
