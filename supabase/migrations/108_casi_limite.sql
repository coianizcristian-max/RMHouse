-- =====================================================================
-- RMHouse — 108 CASI LIMITE (dalla grande simulazione di sei mesi)
-- • Dall'app un bambino non si iscrive a un corso per un'altra età (e viceversa).
-- • Il cliente non prenota due lezioni alla stessa ora (abbonamento open, ingressi, recuperi).
-- • Richiesta rifiutata dalla segreteria: il cliente senza notifiche riceve l'email.
-- • Posti ridotti sotto il numero di iscritti: la segreteria lo sa subito.
-- • Contestazione della carta (chargeback) su Stripe: promemoria e avviso alla segreteria.
-- Si può eseguire più volte. Va dopo la 107.
-- =====================================================================

-- 1. Età giusta per il corso (fascia d'età del corso, all'inizio dell'abbonamento).
--    Se manca la data di nascita o il corso non ha fascia, va bene. Chi frequenta già quel corso rinnova anche se
--    nel frattempo ha compiuto gli anni (finisce il suo percorso). La segreteria può sempre iscrivere a mano.
create or replace function eta_adatta(p_allievo uuid, p_corso uuid, p_data date default current_date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from iscrizioni i where i.allievo_id = p_allievo and i.corso_id = p_corso and i.stato <> 'annullata')
      or coalesce((
    select extract(year from age(coalesce(p_data, current_date), a.data_nascita))::int between f.eta_min and coalesce(f.eta_max, 200)
      from allievi a, corsi c join fasce_eta f on f.id = c.fascia_eta_id
     where a.id = p_allievo and c.id = p_corso and a.data_nascita is not null), true);
$$;
grant execute on function eta_adatta(uuid, uuid, date) to authenticated;

do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('prepara_acquisto(jsonb)'::regprocedure); v0 := v;
  if v not ilike '%eta_non_adatta%' then
    v := replace(v, $a$  if not found then raise exception 'corso_non_valido'; end if;$a$,
      $a$  if not found then raise exception 'corso_non_valido'; end if;
  if not eta_adatta(a.id, c.id, coalesce((p ->> 'data_inizio')::date, current_date)) then raise exception 'eta_non_adatta'; end if;$a$);
    if v = v0 then raise exception 'prepara_acquisto: testo non trovato'; end if;
    execute v;
  end if;
  v := pg_get_functiondef('richiedi_abbonamento(uuid, uuid, uuid, uuid[], date)'::regprocedure); v0 := v;
  if v not ilike '%eta_non_adatta%' then
    v := replace(v, $a$  if c.iscrizioni_app <> 'aperte' then raise exception 'corso_non_aperto'; end if;$a$,
      $a$  if c.iscrizioni_app <> 'aperte' then raise exception 'corso_non_aperto'; end if;
  if not eta_adatta(a.id, c.id, v_inizio) then raise exception 'eta_non_adatta'; end if;$a$);
    if v = v0 then raise exception 'richiedi_abbonamento: testo non trovato'; end if;
    execute v;
  end if;
end $$;

-- 2. Due lezioni alla stessa ora: il cliente non le prenota (la segreteria sì, se serve)
create or replace function trg_prenotazioni_sovrapposte()
returns trigger language plpgsql security definer set search_path = public as $$
declare l lezioni;
begin
  if new.stato <> 'confermata' or (tg_op = 'UPDATE' and old.stato = 'confermata') then return new; end if;
  if is_staff(new.palestra_id) or e_sistema() then return new; end if;
  select * into l from lezioni where id = new.lezione_id;
  if exists (select 1 from v_partecipanti_lezione vp join lezioni l2 on l2.id = vp.lezione_id
              where vp.allievo_id = new.allievo_id and l2.id <> l.id and l2.stato = 'programmata'
                and l2.data = l.data and l2.inizio < l.fine and l.inizio < l2.fine) then
    raise exception 'lezione_sovrapposta';
  end if;
  return new;
end $$;
drop trigger if exists prenotazioni_sovrapposte on prenotazioni;
create trigger prenotazioni_sovrapposte before insert or update of stato on prenotazioni
  for each row execute function trg_prenotazioni_sovrapposte();

-- 3. Richiesta rifiutata: notifica, oppure email a chi non ha le notifiche
create or replace function rifiuta_richiesta(p_id uuid, p_risposta text)
returns void language plpgsql security definer set search_path = public as $$
declare r richieste_cliente; a allievi;
begin
  select * into r from richieste_cliente where id = p_id for update;
  if not found or r.stato <> 'da_confermare' then raise exception 'richiesta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = r.allievo_id;
  update richieste_cliente set stato = 'rifiutata', risposta = nullif(trim(p_risposta), ''), gestita_at = now(), gestita_da = auth.uid()
   where id = p_id;
  begin
    perform avvisa_cliente(a.account_id, 'Risposta della segreteria',
      coalesce(nullif(trim(p_risposta), ''), 'La tua richiesta non è stata accettata.'), '/area/io', 'risp:' || p_id, 'richiesta_rifiutata');
  exception when others then null; end;
end $$;

-- 4. Posti ridotti sotto il numero di chi viene: avviso alla segreteria (non si toglie nessuno da solo)
create or replace function trg_lezioni_posti_ridotti()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; c corsi;
begin
  if new.capienza_override is null or new.capienza_override >= coalesce(old.capienza_override, 2147483647) then return new; end if;
  if new.stato <> 'programmata' or new.inizio < now() then return new; end if;
  select count(*) into n from v_partecipanti_lezione where lezione_id = new.id;
  if n > new.capienza_override then
    select * into c from corsi where id = new.corso_id;
    perform accoda_push_staff(new.palestra_id, 'lezione', 'Più persone che posti',
      coalesce(c.nome, 'Lezione') || ' del ' || to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM HH24:MI') || ': ' || n || ' persone per '
      || new.capienza_override || ' posti. Avvisa chi non può venire o rimetti i posti.',
      '/gestione/calendario', array['admin', 'segreteria'], null, 'posti:' || new.id || ':' || new.capienza_override);
  end if;
  return new;
end $$;
drop trigger if exists lezioni_posti_ridotti on lezioni;
create trigger lezioni_posti_ridotti after update of capienza_override on lezioni
  for each row execute function trg_lezioni_posti_ridotti();

create or replace function trg_corsi_posti_ridotti()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; v_prima text;
begin
  if new.capienza is null or new.capienza >= coalesce(old.capienza, 2147483647) then return new; end if;
  select count(*), min(to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM HH24:MI')) into n, v_prima
    from lezioni l
   where l.corso_id = new.id and l.stato = 'programmata' and l.inizio > now() and l.capienza_override is null
     and (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id) > new.capienza;
  if n > 0 then
    perform accoda_push_staff(new.palestra_id, 'lezione', 'Più persone che posti',
      new.nome || ': con ' || new.capienza || ' posti, ' || n || ' lezioni hanno più persone dei posti (la prima il ' || v_prima || ').',
      '/gestione/calendario', array['admin', 'segreteria'], null, 'posti-corso:' || new.id || ':' || new.capienza);
  end if;
  return new;
end $$;
drop trigger if exists corsi_posti_ridotti on corsi;
create trigger corsi_posti_ridotti after update of capienza on corsi
  for each row execute function trg_corsi_posti_ridotti();

-- 5. Contestazione della carta (chargeback) arrivata da Stripe
create or replace function segnala_contestazione(p_intent text, p_importo_cent integer, p_motivo text, p_entro timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare g pagamenti; a allievi;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into g from pagamenti where stripe_payment_intent = p_intent order by created_at limit 1;
  if not found then return null; end if;
  select * into a from allievi where id = g.allievo_id;
  insert into promemoria (palestra_id, data, testo, creato_da)
  values (g.palestra_id, current_date,
    'Contestazione della carta: ' || coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), 'cliente') || ' ha contestato '
    || to_char(coalesce(p_importo_cent, g.importo_cent) / 100.0, 'FM9990.00') || ' € (' || coalesce(g.descrizione, 'pagamento') || ')'
    || coalesce(', motivo: ' || p_motivo, '') || '. Rispondi su Stripe' || coalesce(' entro il ' || to_char(p_entro at time zone 'Europe/Rome', 'DD/MM'), '')
    || ' con ricevuta e presenze.', 'Stripe');
  perform accoda_push_staff(g.palestra_id, 'pagamento', 'Contestazione della carta',
    coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), 'Un cliente') || ' ha contestato un pagamento di '
    || to_char(coalesce(p_importo_cent, g.importo_cent) / 100.0, 'FM9990.00') || ' €: va risposto su Stripe.',
    case when g.allievo_id is not null then '/gestione/persone/' || g.allievo_id else '/gestione' end,
    array['admin'], null, 'dispute:' || p_intent);
  return g.id;
end $$;
revoke all on function segnala_contestazione(text, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function segnala_contestazione(text, integer, text, timestamptz) to service_role;

-- 6. Lezioni passate: chi aveva l'abbonamento (poi scaduto) resta tra gli iscritti di quelle lezioni.
--    Prima, finito il mese, spariva: l'appello rivisto dopo e il riempimento nelle statistiche contavano la metà delle persone.
create or replace view v_partecipanti_base with (security_invoker = true) as
 select l.id as lezione_id, l.palestra_id, i.allievo_id, 'iscritto'::text as tipo, i.id as riferimento_id
   from lezioni l
   join iscrizioni_orari io on io.orario_id = l.orario_id
   join iscrizioni i on i.id = io.iscrizione_id and i.stato in ('attiva', 'scaduta') and l.data between i.data_inizio and i.data_fine
  where not exists (select 1 from sospensioni s where s.iscrizione_id = i.id and l.data between s.dal and s.al)
 union all
 select p.lezione_id, p.palestra_id, p.allievo_id, p.tipo, p.id as riferimento_id
   from prenotazioni p
  where p.stato = 'confermata'
 union all
 select pr.lezione_id, pr.palestra_id, pr.allievo_id, 'prova'::text as tipo, pr.id as riferimento_id
   from prove pr
  where pr.stato in ('confermata', 'presente', 'assente');
