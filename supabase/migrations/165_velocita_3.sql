-- 165 — Velocità, parte 3: "una chiamata sola" anche per Sportello (persona), Appello, scheda del corso e area clienti
-- Le pagine facevano 7–14 richieste al database, in 2–5 "ondate" una dopo l'altra: ogni ondata è un viaggio
-- Vercel ↔ Supabase (40–100 ms). Queste funzioni mettono insieme le stesse letture di prima, nella stessa forma.
-- Sono SECURITY INVOKER: girano con i permessi di chi le chiama, come le letture che sostituiscono (stesse RLS).
-- Le pagine le usano se ci sono, altrimenti fanno come prima. Si può rilanciare.

-- ---------------------------------------------------------------- v_stato_clienti + sesso
-- (l'elenco Persone faceva una seconda lettura solo per il sesso; si aggiunge la colonna in fondo alla vista,
--  partendo dalla definizione che c'è nel database, così vale anche se la vista è stata cambiata dopo)
do $$
declare v_def text;
begin
  if not exists (select 1 from information_schema.columns where table_name = 'v_stato_clienti' and column_name = 'sesso') then
    v_def := regexp_replace(btrim(pg_get_viewdef('v_stato_clienti'::regclass)), ';\s*$', '');
    execute 'create or replace view v_stato_clienti with (security_invoker = true) as select v.*, a.sesso from (' || v_def || ') v join allievi a on a.id = v.id';
  end if;
end $$;

-- ---------------------------------------------------------------- Sportello: la situazione di una persona
-- Le 7 letture di carica() (v_stato_clienti, allievi+account, iscrizioni con corso/abbonamento/orari, tesseramenti,
-- storia v_periodi, crediti, da_saldare) in una risposta sola, con le stesse chiavi.
create or replace function situazione_cliente(p_allievo uuid)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_pal uuid;
begin
  select palestra_id into v_pal from allievi where id = p_allievo;
  if v_pal is null then return null; end if;
  return jsonb_build_object(
    'persona', (select to_jsonb(x) from (
        select id, nome, cognome, data_nascita, is_titolare, titolare_nome, titolare_cognome, email, telefono, attivo, fine_prossima,
               ultima_fine, certificato_scadenza, quota_valida_fino, consenso_whatsapp, account_id, stato
          from v_stato_clienti where id = p_allievo) x),
    'dati', (select jsonb_build_object('id', a.id, 'codice_fiscale', a.codice_fiscale, 'sesso', a.sesso, 'luogo_nascita', a.luogo_nascita,
               'tessera', a.tessera,
               'account', (select jsonb_build_object('nome', ac.nome, 'cognome', ac.cognome, 'indirizzo', ac.indirizzo, 'cap', ac.cap,
                                                     'citta', ac.citta, 'provincia', ac.provincia, 'codice_fiscale', ac.codice_fiscale)
                             from account ac where ac.id = a.account_id))
              from allievi a where a.id = p_allievo),
    'iscrizioni', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'corso_id', i.corso_id, 'tipo_abbonamento_id', i.tipo_abbonamento_id, 'data_inizio', i.data_inizio, 'data_fine', i.data_fine,
        'stato', i.stato, 'ingressi_residui', i.ingressi_residui, 'pagamento_id', i.pagamento_id,
        'corsi', (select jsonb_build_object('nome', c.nome) from corsi c where c.id = i.corso_id),
        'tipi_abbonamento', (select jsonb_build_object('nome', t.nome, 'modalita', t.modalita) from tipi_abbonamento t where t.id = i.tipo_abbonamento_id),
        'iscrizioni_orari', coalesce((select jsonb_agg(jsonb_build_object('orario_id', io.orario_id,
            'orari', (select jsonb_build_object('corso_id', o.corso_id, 'giorno_settimana', o.giorno_settimana, 'ora_inizio', o.ora_inizio)
                        from orari o where o.id = io.orario_id)))
           from iscrizioni_orari io where io.iscrizione_id = i.id), '[]'::jsonb)) order by i.data_inizio desc)
      from (select * from iscrizioni where allievo_id = p_allievo order by data_inizio desc limit 8) i), '[]'::jsonb),
    'tesseramenti', coalesce((select jsonb_agg(jsonb_build_object('stagione', stagione, 'stato', stato, 'numero', numero,
                                 'tipo_tessera', tipo_tessera, 'scadenza', scadenza) order by stagione desc)
      from (select * from tesseramenti where allievo_id = p_allievo order by stagione desc limit 3) t), '[]'::jsonb),
    'storia', coalesce((select jsonb_agg(jsonb_build_object('iscrizione_id', iscrizione_id, 'dal', dal, 'al', al, 'prezzo_cent', prezzo_cent,
                          'abbonamento', abbonamento, 'viva', viva) order by dal desc, al desc)
      from (select * from v_periodi where allievo_id = p_allievo order by dal desc, al desc limit 60) s), '[]'::jsonb),
    'crediti', coalesce((select jsonb_agg(jsonb_build_object('iscrizione_id', iscrizione_id, 'aggiunta', aggiunta))
      from v_crediti where allievo_id = p_allievo and stato = 'disponibile'), '[]'::jsonb),
    'debiti', da_saldare(v_pal, p_allievo)
  );
end $$;
revoke all on function situazione_cliente(uuid) from public, anon;
grant execute on function situazione_cliente(uuid) to authenticated;

-- ---------------------------------------------------------------- Sostituzione: i dati del riquadro "Insegnante"
-- (prima: 6 letture dal browser appena si apriva l'appello o il foglio della lezione)
create or replace function sostituzione_dati(p_lezione uuid)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare l record;
begin
  select lz.id, lz.palestra_id, lz.inizio, lz.stato, lz.orario_id, lz.insegnante_id, lz.insegnante_titolare, lz.sostituzione_da, lz.sostituzione_at, lz.corso_id,
         (select c.disciplina_id from corsi c where c.id = lz.corso_id) as disciplina_id
    into l from lezioni lz where lz.id = p_lezione;
  if l.id is null then return null; end if;
  return jsonb_build_object(
    'lezione', jsonb_build_object('id', l.id, 'palestra_id', l.palestra_id, 'inizio', l.inizio, 'stato', l.stato, 'orario_id', l.orario_id,
                 'insegnante_id', l.insegnante_id, 'insegnante_titolare', l.insegnante_titolare, 'sostituzione_da', l.sostituzione_da,
                 'sostituzione_at', l.sostituzione_at, 'corso_id', l.corso_id,
                 'corsi', case when l.corso_id is null then null else jsonb_build_object('disciplina_id', l.disciplina_id) end),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'cognome', cognome, 'ruolo', ruolo) order by nome)
               from staff where palestra_id = l.palestra_id and attivo and archiviato is not true), '[]'::jsonb),
    'io', to_jsonb(mio_staff(l.palestra_id)),
    'discipline', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'categoria_id', categoria_id)) from discipline where palestra_id = l.palestra_id), '[]'::jsonb),
    'competenze', coalesce((select jsonb_agg(jsonb_build_object('staff_id', staff_id, 'disciplina_id', disciplina_id, 'categoria_id', categoria_id))
                     from staff_competenze where palestra_id = l.palestra_id), '[]'::jsonb),
    'del_corso', coalesce((select jsonb_agg(staff_id) from corsi_insegnanti where corso_id = l.corso_id), '[]'::jsonb)
  );
end $$;
revoke all on function sostituzione_dati(uuid) from public, anon;
grant execute on function sostituzione_dati(uuid) to authenticated;

-- ---------------------------------------------------------------- Appello: tutta la pagina in una lettura
-- (prima 11 richieste in 3 ondate, più le 6 della Sostituzione dal browser)
create or replace function appello_dati(p_lezione uuid)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_pal uuid; v_ruolo text;
begin
  select palestra_id into v_pal from lezioni where id = p_lezione;
  if v_pal is null then return null; end if;
  select ruolo into v_ruolo from staff where user_id = auth.uid() and palestra_id = v_pal and attivo limit 1;
  return jsonb_build_object(
    'lezione', (select to_jsonb(x) from v_lezioni x where x.id = p_lezione),
    'persone', coalesce((select jsonb_agg(jsonb_build_object('allievo_id', allievo_id, 'tipo', tipo, 'nome', nome, 'cognome', cognome,
                  'data_nascita', data_nascita, 'certificato_scadenza', certificato_scadenza, 'bloccato', bloccato,
                  'certificato_in_scadenza', certificato_in_scadenza, 'quota_mancante', quota_mancante, 'presente', presente))
                from v_appello where lezione_id = p_lezione), '[]'::jsonb),
    'dettagli', coalesce((select jsonb_agg(jsonb_build_object('allievo_id', allievo_id, 'origine', origine, 'telefono', telefono, 'email', email,
                  'prenotato_il', prenotato_il)) from v_prenotati where lezione_id = p_lezione), '[]'::jsonb),
    'avvisati', coalesce((select jsonb_agg(jsonb_build_object('allievo_id', x.allievo_id, 'da', x.da, 'created_at', x.created_at, 'credito_id', x.credito_id,
                  'allievi', (select jsonb_build_object('nome', a.nome, 'cognome', a.cognome) from allievi a where a.id = x.allievo_id)) order by x.created_at)
                from assenze_avvisate x where x.lezione_id = p_lezione), '[]'::jsonb),
    'nuove', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'testo', testo, 'fatto', fatto) order by created_at)
                from promemoria where lezione_id = p_lezione), '[]'::jsonb),
    'recupero_da', (select recupero_da from palestre where id = v_pal),
    'saldi', coalesce((select jsonb_agg(to_jsonb(s)) from saldi_aperti(v_pal) s), '[]'::jsonb),
    'senza_incasso', case when v_ruolo is distinct from 'insegnante' then coalesce((select jsonb_agg(to_jsonb(s)) from senza_incasso(v_pal, null) s), '[]'::jsonb) else '[]'::jsonb end,
    'postazioni', coalesce((select jsonb_agg(to_jsonb(s)) from postazioni_lezione(p_lezione) s), '[]'::jsonb),
    'lz', (select jsonb_build_object('insegnante_id', insegnante_id, 'svolta_da', svolta_da, 'svolta_at', svolta_at, 'svolta_come', svolta_come,
             'appello_da', appello_da, 'appello_at', appello_at, 'appello_mod_da', appello_mod_da, 'appello_mod_at', appello_mod_at)
           from lezioni where id = p_lezione),
    'insegnanti', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'cognome', cognome) order by nome)
                     from staff where palestra_id = v_pal and attivo and archiviato is not true), '[]'::jsonb),
    'sostituzione', sostituzione_dati(p_lezione)
  );
end $$;
revoke all on function appello_dati(uuid) from public, anon;
grant execute on function appello_dati(uuid) to authenticated;

-- ---------------------------------------------------------------- Scheda del corso (prima 13 richieste in 2 ondate)
create or replace function scheda_corso(p_corso uuid)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_pal uuid;
begin
  select palestra_id into v_pal from corsi where id = p_corso;
  if v_pal is null then return null; end if;
  return jsonb_build_object(
    'corso', (select to_jsonb(x) from v_riepilogo_corsi x where x.corso_id = p_corso),
    -- tutti gli stati: la pagina tiene quelli che le servono
    'iscritti', coalesce((select jsonb_agg(to_jsonb(x) order by x.cognome) from v_iscritti_corso x
                  where x.corso_id = p_corso and x.stato in ('attiva', 'sospesa', 'scaduta', 'annullata')), '[]'::jsonb),
    'orari', coalesce((select jsonb_agg(to_jsonb(o) order by o.giorno_settimana, o.ora_inizio) from orari o where o.corso_id = p_corso), '[]'::jsonb),
    'sale', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by ordine nulls last, nome) from sale where palestra_id = v_pal), '[]'::jsonb),
    'insegnanti', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'cognome', cognome, 'ruolo', ruolo, 'foto_url', foto_url, 'archiviato', archiviato) order by nome)
                     from staff where palestra_id = v_pal and attivo), '[]'::jsonb),
    'attese', coalesce((select jsonb_agg(jsonb_build_object('id', l.id,
                  'allievi', (select jsonb_build_object('id', a.id, 'nome', a.nome, 'cognome', a.cognome) from allievi a where a.id = l.allievo_id)))
                from liste_attesa l where l.corso_id = p_corso and l.stato = 'in_attesa'), '[]'::jsonb),
    'base', (select jsonb_build_object('slug', slug, 'capienza', capienza, 'disciplina_id', disciplina_id) from corsi where id = p_corso),
    'abilitati', coalesce((select jsonb_agg(jsonb_build_object('staff_id', staff_id)) from corsi_insegnanti where corso_id = p_corso), '[]'::jsonb),
    'iscrizioni', coalesce((select jsonb_agg(jsonb_build_object('id', i.id,
                     'tipi_abbonamento', (select jsonb_build_object('modalita', t.modalita, 'lezioni_settimanali', t.lezioni_settimanali) from tipi_abbonamento t where t.id = i.tipo_abbonamento_id),
                     'iscrizioni_orari', coalesce((select jsonb_agg(jsonb_build_object('orario_id', io.orario_id)) from iscrizioni_orari io where io.iscrizione_id = i.id), '[]'::jsonb)))
                   from iscrizioni i where i.corso_id = p_corso and i.stato in ('attiva', 'sospesa')), '[]'::jsonb),
    'discipline', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'categoria_id', categoria_id)) from discipline where palestra_id = v_pal), '[]'::jsonb),
    'competenze', coalesce((select jsonb_agg(jsonb_build_object('staff_id', staff_id, 'disciplina_id', disciplina_id, 'categoria_id', categoria_id))
                     from staff_competenze where palestra_id = v_pal), '[]'::jsonb),
    'debiti', coalesce((select jsonb_agg(to_jsonb(d)) from pagamenti_da_sistemare(v_pal) d), '[]'::jsonb),
    'materiali', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titolo', titolo, 'tipo', tipo, 'url', url, 'minuti_prima', minuti_prima) order by created_at)
                    from materiali where corso_id = p_corso and attivo = true), '[]'::jsonb)
  );
end $$;
revoke all on function scheda_corso(uuid) from public, anon;
grant execute on function scheda_corso(uuid) to authenticated;

-- ---------------------------------------------------------------- Area clienti: home (prima 4 ondate)
create or replace function area_home()
returns jsonb
language plpgsql volatile security invoker set search_path = public as $$
declare r jsonb; n int;
begin
  -- come faceva la pagina: se il collegamento non riesce (es. utente senza email) si va avanti lo stesso
  begin
    perform collega_account();
  exception when others then null;
  end;
  r := area_riepilogo();
  select count(*) into n
    from jsonb_array_elements(coalesce(r -> 'allievi', '[]'::jsonb)) a
    cross join lateral moduli_da_firmare((a ->> 'id')::uuid) m
   where m.obbligatorio and m.firmata_versione is distinct from m.versione;
  return jsonb_build_object(
    'riepilogo', r,
    'materiali', materiali_area(),
    'in_verifica', coalesce((select jsonb_agg(jsonb_build_object('allievo_id', allievo_id, 'scadenza', scadenza, 'caricato_at', caricato_at))
                      from certificati where stato = 'da_verificare'), '[]'::jsonb),
    'consenso', (select jsonb_build_object('consenso_marketing', consenso_marketing, 'consenso_chiesto_at', consenso_chiesto_at)
                   from account where user_id = auth.uid() limit 1),
    'disdette', disdette_area(),
    'workshop', workshop_area(),
    'moduli_da_firmare', coalesce(n, 0)
  );
end $$;
revoke all on function area_home() from public, anon;
grant execute on function area_home() to authenticated;

-- ---------------------------------------------------------------- Area clienti: orario (prima 3 ondate)
create or replace function area_orario(p_giorno date)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare r jsonb;
begin
  r := area_riepilogo();
  return jsonb_build_object(
    'riepilogo', r,
    'lezioni', orario_area(p_giorno, null),
    'regole', disdette_area(),
    'per_mese', recuperi_per_mese(),
    'sedi', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'principale', principale) order by principale desc, ordine)
               from sedi where visibile = true), '[]'::jsonb),
    'code', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', lezione_id, 'allievo_id', allievo_id))
               from liste_attesa where stato in ('in_attesa', 'avvisato') and lezione_id is not null), '[]'::jsonb),
    'prenotabili', coalesce((select jsonb_object_agg(a ->> 'id', coalesce((select jsonb_agg(to_jsonb(l)) from lezioni_prenotabili((a ->> 'id')::uuid) l), '[]'::jsonb))
                      from jsonb_array_elements(coalesce(r -> 'allievi', '[]'::jsonb)) a), '{}'::jsonb),
    'per_credito', coalesce((select jsonb_object_agg(c ->> 'id', coalesce((select jsonb_agg(to_jsonb(l)) from lezioni_per_recupero((c ->> 'id')::uuid) l), '[]'::jsonb))
                      from jsonb_array_elements(coalesce(r -> 'crediti', '[]'::jsonb)) c), '{}'::jsonb)
  );
end $$;
revoke all on function area_orario(date) from public, anon;
grant execute on function area_orario(date) to authenticated;

-- ---------------------------------------------------------------- Area clienti: recuperi e pacchetti (prima 3 ondate)
create or replace function area_recuperi()
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare r jsonb;
begin
  r := area_riepilogo();
  return jsonb_build_object(
    'riepilogo', r,
    'regole', disdette_area(),
    'per_mese', recuperi_per_mese(),
    'per_credito', coalesce((select jsonb_object_agg(c ->> 'id', coalesce((select jsonb_agg(to_jsonb(l)) from lezioni_per_recupero((c ->> 'id')::uuid) l), '[]'::jsonb))
                      from jsonb_array_elements(coalesce(r -> 'crediti', '[]'::jsonb)) c), '{}'::jsonb),
    'pacchetti', coalesce((select jsonb_object_agg(a ->> 'id', jsonb_build_object(
                     'abbonamenti', coalesce((select jsonb_agg(to_jsonb(x)) from abbonamenti_prenotabili((a ->> 'id')::uuid) x), '[]'::jsonb),
                     'lezioni', coalesce((select jsonb_agg(to_jsonb(l)) from lezioni_prenotabili((a ->> 'id')::uuid) l), '[]'::jsonb)))
                      from jsonb_array_elements(coalesce(r -> 'allievi', '[]'::jsonb)) a), '{}'::jsonb)
  );
end $$;
revoke all on function area_recuperi() from public, anon;
grant execute on function area_recuperi() to authenticated;

-- ---------------------------------------------------------------- conteggi dell'elenco Persone in una passata sola
-- (prima nove letture della vista v_stato_clienti, una per contatore: ~55 ms; ora una: ~20 ms). Stesso risultato.
create or replace function conteggi_persone(p_palestra uuid)
returns jsonb
language sql stable set search_path = public as $$
  with g as (
    select stato, count(*) as n, count(*) filter (where attivo) as attivi,
           count(*) filter (where prima_data >= date_trunc('month', current_date)) as nuovi,
           count(*) filter (where certificato_scaduto) as certificato_scaduto,
           count(*) filter (where quota_mancante) as quota_mancante,
           count(*) filter (where senza_orari) as senza_orari,
           count(*) filter (where attivo and giorni_al_compleanno between 0 and 6) as compleanno,
           count(*) filter (where email is null) as senza_email
      from v_stato_clienti where palestra_id = p_palestra group by stato)
  select jsonb_build_object(
    'tutti', coalesce(sum(n), 0), 'attivi', coalesce(sum(attivi), 0), 'nuovi', coalesce(sum(nuovi), 0),
    'stati', coalesce(jsonb_object_agg(stato, n) filter (where stato is not null), '{}'::jsonb),
    'certificato_scaduto', coalesce(sum(certificato_scaduto), 0), 'quota_mancante', coalesce(sum(quota_mancante), 0),
    'senza_orari', coalesce(sum(senza_orari), 0), 'compleanno', coalesce(sum(compleanno), 0), 'senza_email', coalesce(sum(senza_email), 0),
    'etichette', (select coalesce(jsonb_object_agg(e.id, (select count(*) from allievi_etichette ae where ae.etichetta_id = e.id)), '{}'::jsonb)
                    from etichette e where e.palestra_id = p_palestra)
  ) from g;
$$;

notify pgrst, 'reload schema';
