-- 093 · Attività dello staff (solo per chi è abilitato: Erika Bonfanti) e statistiche della stagione
-- 1. staff.vede_attivita: chi può aprire "Attività dello staff". Si accende qui per Erika Bonfanti e Cristian Coianiz;
--    dall'app nessuno può darselo da solo (solo chi ce l'ha già, o da Supabase).
-- 2. eventi_staff: tutto quello che una persona dello staff ha fatto nel periodo, già diviso per voce
--    (dal registro delle modifiche e dalle colonne "fatto da": appelli, firme, ingressi, contatti…).
-- 3. attivita_staff_riepilogo / attivita_staff / attivita_dettaglio: i numeri e l'elenco cliccabile.
-- 4. statistiche_stagione: i dati in più per le statistiche (iscrizioni, frequenza, persone, prove).
-- Rieseguibile.

-- ---------------------------------------------------------------------
-- 1. CHI VEDE L'ATTIVITÀ DELLO STAFF
-- ---------------------------------------------------------------------
alter table staff add column if not exists vede_attivita boolean not null default false;
update staff set vede_attivita = true
 where (lower(trim(nome)) = 'erika' and lower(trim(coalesce(cognome, ''))) = 'bonfanti')
    or (lower(trim(nome)) = 'cristian' and lower(trim(coalesce(cognome, ''))) = 'coianiz')
    or lower(trim(coalesce(email, ''))) = 'coianiz.cristian@gmail.com';

create or replace function puo_vedere_attivita(p_palestra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and palestra_id = p_palestra and attivo and vede_attivita);
$$;
revoke execute on function puo_vedere_attivita(uuid) from public, anon;
grant execute on function puo_vedere_attivita(uuid) to authenticated;

-- dall'app il permesso lo cambia solo chi ce l'ha già (da Supabase, senza utente, sempre)
create or replace function trg_vede_attivita()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vede_attivita is distinct from coalesce(case when tg_op = 'UPDATE' then old.vede_attivita end, false)
     and auth.uid() is not null and not puo_vedere_attivita(new.palestra_id) then
    new.vede_attivita := coalesce(case when tg_op = 'UPDATE' then old.vede_attivita end, false);
  end if;
  return new;
end $$;
drop trigger if exists staff_vede_attivita on staff;
create trigger staff_vede_attivita before insert or update of vede_attivita on staff
  for each row execute function trg_vede_attivita();

-- ---------------------------------------------------------------------
-- 2. GLI EVENTI DI UNA PERSONA DELLO STAFF
-- ---------------------------------------------------------------------
create or replace function eventi_staff(p_palestra uuid, p_staff uuid, p_dal date, p_al date)
returns table (voce text, quando timestamptz, descrizione text, persona_id uuid, lezione_id uuid, importo_cent bigint)
language plpgsql stable security definer set search_path = public as $$
declare s staff; v_da timestamptz; v_a timestamptz;
begin
  if not puo_vedere_attivita(p_palestra) then raise exception 'non_autorizzato'; end if;
  select * into s from staff where id = p_staff and palestra_id = p_palestra;
  if not found then return; end if;
  v_da := (p_dal::timestamp) at time zone 'Europe/Rome';
  v_a := ((p_al + 1)::timestamp) at time zone 'Europe/Rome';

  -- dal registro delle modifiche (solo se ha un accesso)
  if s.user_id is not null then
    return query
    select case
             when r.tabella = 'allievi' and r.operazione = 'inserimento' then 'anag_nuove'
             when r.tabella = 'account' and r.operazione = 'inserimento' then 'chi_paga_nuovi'
             when r.tabella in ('allievi', 'account') and r.operazione = 'modifica' then 'anag_modifiche'
             when r.tabella in ('allievi', 'account') then 'anag_cancellate'
             when r.tabella = 'certificati' then 'certificati'
             when r.tabella = 'iscrizioni' and r.operazione = 'inserimento' then
               case when (select i.rinnovo_di from iscrizioni i where i.id = r.record_id) is not null
                      or exists (select 1 from iscrizioni i2 join iscrizioni i on i.id = r.record_id
                                  where i2.allievo_id = i.allievo_id and i2.id <> i.id and i2.data_inizio < i.data_inizio)
                    then 'rinnovi' else 'iscr_nuove' end
             when r.tabella = 'iscrizioni' and r.operazione = 'modifica' then 'iscr_modifiche'
             when r.tabella = 'iscrizioni' then 'iscr_cancellate'
             when r.tabella = 'sospensioni' and r.operazione = 'inserimento' then 'sospensioni'
             when r.tabella = 'quote_iscrizione' and r.operazione = 'inserimento' then 'quote'
             when r.tabella = 'pagamenti' and r.operazione = 'inserimento' then 'incassi'
             when r.tabella = 'pagamenti' and r.operazione = 'modifica' then 'incassi_modifiche'
             when r.tabella = 'pagamenti' then 'incassi_cancellati'
             when r.tabella = 'ricevute' and r.operazione = 'inserimento' then
               case when r.descrizione ilike 'nota di credito%' then 'note_credito' else 'ricevute' end
             when r.tabella = 'rate' then 'rate'
             when r.tabella = 'presenze' then 'presenze'
             when r.tabella = 'assenze_avvisate' and r.operazione = 'inserimento' then 'disdette'
             when r.tabella = 'crediti_recupero' and r.operazione = 'inserimento' then 'recuperi'
             when r.tabella = 'prenotazioni' and r.operazione = 'inserimento' then 'prenotazioni'
             when r.tabella = 'lezioni' then 'lezioni_modifiche'
             when r.tabella = 'richieste_cliente' and r.operazione = 'modifica' then 'richieste'
             when r.tabella in ('corsi', 'orari', 'tipi_abbonamento', 'voci_listino', 'gruppi_listino', 'recuperi_ammessi',
                                'palestre', 'sale', 'discipline', 'livelli', 'fasce_eta', 'chiusure', 'ruoli', 'staff',
                                'aliquote_iva', 'numerazioni', 'disponibilita_staff') then 'configurazione'
             else null end,
           r.quando,
           (case r.operazione when 'inserimento' then 'aggiunto: ' when 'modifica' then 'modificato: ' else 'eliminato: ' end) || coalesce(r.descrizione, r.tabella),
           r.persona_id, r.lezione_id,
           case when r.tabella = 'pagamenti' and r.operazione = 'inserimento'
                then (select p.importo_cent::bigint from pagamenti p where p.id = r.record_id) end
      from registro_azioni r
     where r.palestra_id = p_palestra and r.utente_id = s.user_id and r.quando >= v_da and r.quando < v_a
       -- le modifiche fatte dall'appello (chi l'ha fatto, chi l'ha tenuta) contano già come appelli
       and not (r.tabella = 'lezioni' and r.operazione = 'modifica'
                and (select bool_and(k like 'appello%' or k like 'svolta%') from jsonb_object_keys(coalesce(r.modifiche, '{}'::jsonb)) k));

    return query select 'certificati_verificati', c.verificato_at, 'certificato verificato', c.allievo_id, null::uuid, null::bigint
      from certificati c where c.palestra_id = p_palestra and c.verificato_da = s.user_id and c.verificato_at >= v_da and c.verificato_at < v_a;
    return query select 'firme', f.firmato_at, 'modulo firmato in reception: ' || coalesce(f.titolo, ''), f.allievo_id, null::uuid, null::bigint
      from firme f where f.palestra_id = p_palestra and f.raccolta_da = s.user_id and f.firmato_at >= v_da and f.firmato_at < v_a;
    return query select 'ingressi', i.quando, 'ingresso registrato · ' || coalesce(i.esito, ''), i.allievo_id, i.lezione_id, null::bigint
      from ingressi i where i.palestra_id = p_palestra and i.registrato_da = s.user_id and i.quando >= v_da and i.quando < v_a;
    return query select 'contatti', c.created_at, 'contatto ' || coalesce(c.canale, '') || coalesce(' · ' || c.esito, ''), c.allievo_id, null::uuid, null::bigint
      from contatti_lead c where c.palestra_id = p_palestra and c.autore_id = s.user_id and c.created_at >= v_da and c.created_at < v_a;
    return query select 'campagne', c.inviata_at, 'campagna inviata: ' || coalesce(c.titolo, c.oggetto, ''), null::uuid, null::uuid, null::bigint
      from campagne c where c.palestra_id = p_palestra and c.creata_da = s.user_id and c.inviata_at >= v_da and c.inviata_at < v_a;
  end if;

  -- appelli e lezioni (valgono anche senza accesso, per come sono registrati)
  return query select 'appelli', l.appello_at, 'appello di ' || co.nome || ' del ' || to_char(l.data, 'DD/MM'), null::uuid, l.id, null::bigint
    from lezioni l join corsi co on co.id = l.corso_id
   where l.palestra_id = p_palestra and l.appello_da = s.id and l.appello_at >= v_da and l.appello_at < v_a;
  return query select 'lezioni_tenute', l.inizio, co.nome || ' del ' || to_char(l.data, 'DD/MM')
                      || case when l.insegnante_id is distinct from s.id then ' (sostituzione)' else '' end, null::uuid, l.id, null::bigint
    from lezioni l join corsi co on co.id = l.corso_id
   where l.palestra_id = p_palestra and l.svolta_da = s.id and l.data between p_dal and p_al;
  -- sue lezioni finite, con persone attese, senza appello
  return query select 'senza_appello', l.inizio, co.nome || ' del ' || to_char(l.data, 'DD/MM') || ' alle ' || to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI'),
                      null::uuid, l.id, null::bigint
    from lezioni l join corsi co on co.id = l.corso_id
   where l.palestra_id = p_palestra and coalesce(l.svolta_da, l.insegnante_id) = s.id and l.stato <> 'annullata'
     and l.data between p_dal and p_al and l.fine < now() and l.appello_at is null
     and not exists (select 1 from presenze ps where ps.lezione_id = l.id)
     and exists (select 1 from v_partecipanti_lezione vp where vp.lezione_id = l.id);
end $$;
revoke execute on function eventi_staff(uuid, uuid, date, date) from public, anon;
grant execute on function eventi_staff(uuid, uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. RIEPILOGO, SCHEDA DI UNA PERSONA, DETTAGLIO
-- ---------------------------------------------------------------------
create or replace function voce_area(p_voce text)
returns text language sql immutable as $$
  select case
    when p_voce in ('anag_nuove', 'chi_paga_nuovi', 'anag_modifiche', 'anag_cancellate', 'certificati', 'certificati_verificati', 'firme') then 'anagrafiche'
    when p_voce in ('iscr_nuove', 'rinnovi', 'iscr_modifiche', 'iscr_cancellate', 'sospensioni', 'quote') then 'iscrizioni'
    when p_voce in ('incassi', 'ricevute', 'note_credito', 'incassi_modifiche', 'incassi_cancellati', 'rate') then 'incassi'
    when p_voce in ('appelli', 'presenze', 'lezioni_tenute', 'senza_appello', 'disdette', 'recuperi', 'prenotazioni', 'lezioni_modifiche') then 'lezioni'
    when p_voce in ('ingressi', 'contatti', 'richieste', 'campagne') then 'reception'
    else 'configurazione' end;
$$;

-- una riga per persona dello staff: quante cose ha fatto, divise per area
create or replace function attivita_staff_riepilogo(p_palestra uuid, p_dal date, p_al date)
returns table (staff_id uuid, nome text, ruolo text, accesso boolean, ultimo_accesso timestamptz,
               totale bigint, giorni_attivi bigint, anagrafiche bigint, iscrizioni bigint, incassi bigint, incassato_cent bigint,
               lezioni bigint, reception bigint, configurazione bigint, senza_appello bigint, cancellazioni bigint, ultima_azione timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not puo_vedere_attivita(p_palestra) then raise exception 'non_autorizzato'; end if;
  return query
  select s.id, trim(s.nome || ' ' || coalesce(s.cognome, '')), s.ruolo::text, s.user_id is not null,
         (select u.last_sign_in_at from auth.users u where u.id = s.user_id),
         count(e.voce) filter (where e.voce <> 'senza_appello'),
         count(distinct (e.quando at time zone 'Europe/Rome')::date) filter (where e.voce <> 'senza_appello'),
         count(e.voce) filter (where voce_area(e.voce) = 'anagrafiche'),
         count(e.voce) filter (where voce_area(e.voce) = 'iscrizioni'),
         count(e.voce) filter (where voce_area(e.voce) = 'incassi'),
         coalesce(sum(e.importo_cent) filter (where e.voce = 'incassi'), 0)::bigint,
         count(e.voce) filter (where voce_area(e.voce) = 'lezioni' and e.voce <> 'senza_appello'),
         count(e.voce) filter (where voce_area(e.voce) = 'reception'),
         count(e.voce) filter (where voce_area(e.voce) = 'configurazione'),
         count(e.voce) filter (where e.voce = 'senza_appello'),
         count(e.voce) filter (where e.voce in ('anag_cancellate', 'iscr_cancellate', 'incassi_cancellati')),
         max(e.quando) filter (where e.voce <> 'senza_appello')
    from staff s
    left join lateral eventi_staff(p_palestra, s.id, p_dal, p_al) e on e.voce is not null
   where s.palestra_id = p_palestra and s.attivo and not coalesce(s.archiviato, false)
   group by s.id
   order by 6 desc, 2;
end $$;
revoke execute on function attivita_staff_riepilogo(uuid, date, date) from public, anon;
grant execute on function attivita_staff_riepilogo(uuid, date, date) to authenticated;

-- i numeri di una persona, voce per voce (e il giorno per giorno per il grafico)
create or replace function attivita_staff(p_palestra uuid, p_staff uuid, p_dal date, p_al date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not puo_vedere_attivita(p_palestra) then raise exception 'non_autorizzato'; end if;
  with e as (select * from eventi_staff(p_palestra, p_staff, p_dal, p_al) where voce is not null)
  select jsonb_build_object(
    'voci', coalesce((select jsonb_object_agg(voce, jsonb_build_object('n', n, 'euro', eu))
                        from (select voce, count(*) n, coalesce(sum(importo_cent), 0) eu from e group by voce) x), '{}'::jsonb),
    'giorni', coalesce((select jsonb_agg(jsonb_build_object('giorno', g, 'n', n) order by g)
                         from (select (quando at time zone 'Europe/Rome')::date g, count(*) n from e where voce <> 'senza_appello' group by 1) x), '[]'::jsonb),
    'ore', coalesce((select jsonb_agg(jsonb_build_object('ora', h, 'n', n) order by h)
                      from (select extract(hour from quando at time zone 'Europe/Rome')::int h, count(*) n from e where voce <> 'senza_appello' group by 1) x), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke execute on function attivita_staff(uuid, uuid, date, date) from public, anon;
grant execute on function attivita_staff(uuid, uuid, date, date) to authenticated;

create or replace function attivita_dettaglio(p_palestra uuid, p_staff uuid, p_voce text, p_dal date, p_al date)
returns table (quando timestamptz, descrizione text, persona_id uuid, persona text, lezione_id uuid, importo_cent bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not puo_vedere_attivita(p_palestra) then raise exception 'non_autorizzato'; end if;
  return query
  select e.quando, e.descrizione, e.persona_id, trim(a.nome || ' ' || coalesce(a.cognome, '')), e.lezione_id, e.importo_cent
    from eventi_staff(p_palestra, p_staff, p_dal, p_al) e
    left join allievi a on a.id = e.persona_id
   where e.voce = p_voce or (p_voce like 'area:%' and voce_area(e.voce) = substr(p_voce, 6) and e.voce <> 'senza_appello')
   order by e.quando desc
   limit 500;
end $$;
revoke execute on function attivita_dettaglio(uuid, uuid, text, date, date) from public, anon;
grant execute on function attivita_dettaglio(uuid, uuid, text, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. STATISTICHE DELLA STAGIONE
-- ---------------------------------------------------------------------
create or replace function statistiche_stagione(p_palestra uuid, p_dal date, p_al date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_inizio_stagione date; v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  v_inizio_stagione := make_date(case when extract(month from v_oggi) >= 9 then extract(year from v_oggi)::int else extract(year from v_oggi)::int - 1 end, 9, 1);

  with
  isc as (select i.*, (select min(i2.data_inizio) from iscrizioni i2 where i2.allievo_id = i.allievo_id and i2.stato <> 'annullata') prima
            from iscrizioni i where i.palestra_id = p_palestra and i.stato <> 'annullata'),
  attivi as (select distinct allievo_id from isc where stato = 'attiva' and data_inizio <= v_oggi and coalesce(data_fine, v_oggi) >= v_oggi),
  mesi as (select generate_series(date_trunc('month', v_oggi) - interval '11 months', date_trunc('month', v_oggi), interval '1 month')::date m),
  -- stagione: settembre → agosto, quest'anno e l'anno prima (iscritti attivi al 15 del mese)
  stag as (select k, make_date(extract(year from v_inizio_stagione)::int - k, 9, 15) + (n || ' months')::interval as giorno, n
             from generate_series(0, 1) k, generate_series(0, 11) n),
  lez as (select l.*, extract(isodow from l.data)::int dow, extract(hour from l.inizio at time zone 'Europe/Rome')::int ora,
                 (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id) attesi,
                 (select count(*) filter (where ps.presente) from presenze ps where ps.lezione_id = l.id) presenti,
                 (select count(*) from presenze ps where ps.lezione_id = l.id) segnati
            from lezioni l where l.palestra_id = p_palestra and l.stato <> 'annullata' and l.data between p_dal and least(p_al, v_oggi)),
  finite as (select * from isc where data_fine between p_dal and least(p_al, v_oggi - 1))
  select jsonb_build_object(
    -- iscrizioni mese per mese: prime iscrizioni, rinnovi, chi esce
    'iscrizioni_mese', (select jsonb_agg(jsonb_build_object('mese', m,
         'nuove', (select count(*) from isc where date_trunc('month', data_inizio) = m and data_inizio = prima),
         'rinnovi', (select count(*) from isc where date_trunc('month', data_inizio) = m and data_inizio > prima),
         'uscite', (select count(distinct allievo_id) from isc i where date_trunc('month', i.data_fine) = m and i.data_fine < v_oggi
                      and not exists (select 1 from isc i2 where i2.allievo_id = i.allievo_id and i2.data_inizio > i.data_fine and i2.data_inizio <= i.data_fine + 45))
       ) order by m) from mesi),
    'stagioni', (select jsonb_agg(jsonb_build_object('k', k, 'n', n, 'giorno', giorno::date,
         'attivi', case when giorno::date > v_oggi then null else
                     (select count(distinct allievo_id) from isc where data_inizio <= giorno::date and coalesce(data_fine, giorno::date) >= giorno::date) end)
       order by k, n) from stag),
    'rinnovo', (select jsonb_build_object('finite', count(*),
         'rinnovate', count(*) filter (where exists (select 1 from isc i2 where i2.allievo_id = f.allievo_id and i2.id <> f.id
                                                      and i2.data_inizio > f.data_inizio and i2.data_inizio <= f.data_fine + 45)))
       from finite f),
    'abbonamenti', (select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
         select jsonb_build_object('nome', ta.nome, 'n', count(*), 'euro', sum(greatest(ta.prezzo_cent - i.sconto_cent, 0))) x
           from isc i join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id
          where i.data_inizio between p_dal and p_al group by ta.nome order by count(*) desc limit 10) z),
    'anzianita', (select jsonb_agg(jsonb_build_object('etichetta', e, 'valore', n) order by o) from (
         select case when anni < 1 then 'Primo anno' when anni < 2 then '1–2 anni' when anni < 4 then '2–4 anni' else 'Più di 4 anni' end e,
                case when anni < 1 then 1 when anni < 2 then 2 when anni < 4 then 3 else 4 end o, count(*) n
           from (select a.allievo_id, (v_oggi - min(i.data_inizio)) / 365.0 anni from attivi a join isc i on i.allievo_id = a.allievo_id group by a.allievo_id) t
          group by 1, 2) z),
    'genere', (select jsonb_agg(jsonb_build_object('etichetta', e, 'valore', n)) from (
         select case genere_di(al.sesso, al.codice_fiscale) when 'F' then 'Femmine' when 'M' then 'Maschi' else 'Non indicato' end e, count(*) n
           from attivi a join allievi al on al.id = a.allievo_id group by 1 order by 2 desc) z),
    'eta_media', (select round(avg(extract(year from age(v_oggi, al.data_nascita)))::numeric, 1)
                    from attivi a join allievi al on al.id = a.allievo_id where al.data_nascita is not null),
    'minorenni', (select count(*) from attivi a join allievi al on al.id = a.allievo_id where al.data_nascita > v_oggi - interval '18 years'),
    'citta', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', c, 'valore', n)), '[]'::jsonb) from (
         select initcap(coalesce(nullif(trim(ac.citta), ''), 'Non indicata')) c, count(*) n
           from attivi a join allievi al on al.id = a.allievo_id join account ac on ac.id = al.account_id
          group by 1 order by 2 desc limit 8) z),
    'discipline', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', d, 'valore', n)), '[]'::jsonb) from (
         select coalesce(di.nome, co.nome) d, count(distinct i.allievo_id) n
           from isc i join corsi co on co.id = i.corso_id left join discipline di on di.id = co.disciplina_id
          where i.stato = 'attiva' and i.data_inizio <= v_oggi and coalesce(i.data_fine, v_oggi) >= v_oggi
          group by 1 order by 2 desc limit 12) z),
    -- frequenza
    'presenze_mese', (select jsonb_agg(jsonb_build_object('mese', m,
         'presenti', (select count(*) from presenze ps join lezioni l on l.id = ps.lezione_id
                       where l.palestra_id = p_palestra and ps.presente and date_trunc('month', l.data) = m),
         'segnati', (select count(*) from presenze ps join lezioni l on l.id = ps.lezione_id
                       where l.palestra_id = p_palestra and date_trunc('month', l.data) = m)) order by m) from mesi),
    'calore', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'ora', ora, 'lezioni', n, 'attesi', a, 'presenti', p)), '[]'::jsonb) from (
         select dow, ora, count(*) n, round(avg(attesi), 1) a, round(avg(presenti) filter (where segnati > 0), 1) p from lez group by dow, ora) z),
    'giorni', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'lezioni', n, 'attesi', a, 'presenti', p) order by dow), '[]'::jsonb) from (
         select dow, count(*) n, sum(attesi) a, sum(presenti) p from lez group by dow) z),
    'appelli', (select jsonb_build_object('finite', count(*) filter (where fine < now() and attesi > 0),
                                          'fatti', count(*) filter (where fine < now() and attesi > 0 and segnati > 0)) from lez),
    'disdette', (select jsonb_build_object(
         'app', count(*) filter (where da = 'cliente'), 'segreteria', count(*) filter (where da <> 'cliente'))
       from assenze_avvisate x join lezioni l on l.id = x.lezione_id where x.palestra_id = p_palestra and l.data between p_dal and p_al),
    'recuperi', (select jsonb_build_object('dati', count(*),
         'usati', count(*) filter (where usato_in is not null),
         'scaduti', count(*) filter (where usato_in is null and not coalesce(annullato, false) and scadenza < v_oggi),
         'aperti', count(*) filter (where usato_in is null and not coalesce(annullato, false) and scadenza >= v_oggi))
       from crediti_recupero where palestra_id = p_palestra and created_at::date between p_dal and p_al),
    -- prove
    'prove_mese', (select jsonb_agg(jsonb_build_object('mese', m,
         'prenotate', (select count(*) from prove pr where pr.palestra_id = p_palestra and pr.stato <> 'annullata' and date_trunc('month', pr.created_at) = m),
         'fatte', (select count(*) from prove pr where pr.palestra_id = p_palestra and pr.stato = 'presente' and date_trunc('month', pr.created_at) = m),
         'iscritti', (select count(distinct pr.allievo_id) from prove pr where pr.palestra_id = p_palestra and date_trunc('month', pr.created_at) = m
                        and exists (select 1 from iscrizioni i where i.allievo_id = pr.allievo_id and i.stato <> 'annullata'
                                     and i.created_at >= pr.created_at and i.created_at < pr.created_at + interval '60 days'))) order by m) from mesi),
    -- soldi
    'metodi', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', initcap(coalesce(metodo, 'altro')), 'valore', round(e / 100.0))), '[]'::jsonb) from (
         select metodo, sum(importo_cent) e from pagamenti where palestra_id = p_palestra and stato = 'pagato'
            and (pagato_at at time zone 'Europe/Rome')::date between p_dal and p_al group by metodo order by 2 desc) z),
    'causali', (select coalesce(jsonb_agg(jsonb_build_object('etichetta', initcap(replace(coalesce(causale, 'altro'), '_', ' ')), 'valore', round(e / 100.0))), '[]'::jsonb) from (
         select causale, sum(importo_cent) e from pagamenti where palestra_id = p_palestra and stato = 'pagato'
            and (pagato_at at time zone 'Europe/Rome')::date between p_dal and p_al group by causale order by 2 desc) z)
  ) into v;
  return v;
end $$;
revoke execute on function statistiche_stagione(uuid, date, date) from public, anon;
grant execute on function statistiche_stagione(uuid, date, date) to authenticated;
