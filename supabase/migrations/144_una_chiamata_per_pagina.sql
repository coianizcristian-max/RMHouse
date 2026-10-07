-- =====================================================================
-- RMHouse — 144 VELOCITÀ: UNA CHIAMATA AL DATABASE PER PAGINA
-- Le pagine più usate facevano molte richieste separate al database, alcune una dopo l'altra:
--   • scheda persona: 25 richieste in 5 ondate (allievo → 17 insieme → ricevute → lezioni a cui partecipa → prossime);
--   • home (Riepilogo): 13 richieste insieme;
--   • Sportello: 5 insieme + 2 in fila per Satispay.
-- Ogni richiesta, da Vercel a Supabase, costa un viaggio e un posto nella coda del database: con 20 richieste
-- insieme la pagina aspetta la più lenta più la coda. Ora ogni pagina chiede tutto con UNA funzione che
-- restituisce gli stessi dati, con la stessa forma di prima (il resto della pagina non cambia).
-- Solo lettura. Si può eseguire più volte.
-- =====================================================================

-- ------------------------------------------------------------------ scheda persona
create or replace function scheda_persona(p_allievo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a allievi; v_oggi date := (now() at time zone 'Europe/Rome')::date; v_fra30 date; v_lez uuid[];
begin
  select * into a from allievi where id = p_allievo;
  if not found then return null; end if;
  if not is_staff(a.palestra_id) then raise exception 'non_autorizzato'; end if;
  v_fra30 := v_oggi + 30;
  select coalesce(array_agg(vp.lezione_id), '{}') into v_lez from v_partecipanti_lezione vp where vp.allievo_id = p_allievo;

  return jsonb_build_object(
    'allievo', (select to_jsonb(a) || jsonb_build_object('account',
                  (select jsonb_build_object('id', ac.id, 'nome', ac.nome, 'cognome', ac.cognome, 'email', ac.email, 'telefono', ac.telefono,
                     'codice_fiscale', ac.codice_fiscale, 'consenso_marketing', ac.consenso_marketing, 'consenso_privacy_at', ac.consenso_privacy_at)
                     from account ac where ac.id = a.account_id))),
    'stato', (select jsonb_build_object('stato', s.stato, 'attivo', s.attivo, 'fine_prossima', s.fine_prossima, 'prima_data', s.prima_data,
                'ultima_fine', s.ultima_fine, 'certificato_scaduto', s.certificato_scaduto, 'quota_mancante', s.quota_mancante,
                'quota_valida_fino', s.quota_valida_fino, 'senza_orari', s.senza_orari, 'etichette_id', s.etichette_id,
                'giorni_al_compleanno', s.giorni_al_compleanno, 'ultima_presenza', s.ultima_presenza)
              from v_stato_clienti s where s.id = p_allievo),
    'iscrizioni', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'palestra_id', i.palestra_id, 'tipo_abbonamento_id', i.tipo_abbonamento_id,
                'data_inizio', i.data_inizio, 'data_fine', i.data_fine, 'stato', i.stato, 'sconto_cent', i.sconto_cent, 'note', i.note, 'ingressi_residui', i.ingressi_residui,
                'corsi', (select jsonb_build_object('id', c.id, 'nome', c.nome) from corsi c where c.id = i.corso_id),
                'tipi_abbonamento', (select jsonb_build_object('nome', t.nome, 'modalita', t.modalita, 'lezioni_settimanali', t.lezioni_settimanali, 'prezzo_cent', t.prezzo_cent)
                                       from tipi_abbonamento t where t.id = i.tipo_abbonamento_id),
                'iscrizioni_orari', coalesce((select jsonb_agg(jsonb_build_object('orario_id', io.orario_id)) from iscrizioni_orari io where io.iscrizione_id = i.id), '[]'::jsonb))
                order by i.data_inizio desc)
              from iscrizioni i where i.allievo_id = p_allievo), '[]'::jsonb),
    'crediti', coalesce((select jsonb_agg(to_jsonb(cr) order by cr.scadenza desc, cr.id) from v_crediti cr where cr.allievo_id = p_allievo), '[]'::jsonb),
    'prove', coalesce((select jsonb_agg(x) from (
                select jsonb_build_object('id', pr.id, 'stato', pr.stato, 'prezzo_cent', pr.prezzo_cent,
                  'corsi', (select jsonb_build_object('nome', c.nome) from corsi c where c.id = pr.corso_id),
                  'lezioni', (select jsonb_build_object('inizio', l.inizio) from lezioni l where l.id = pr.lezione_id)) as x
                from prove pr where pr.allievo_id = p_allievo order by pr.created_at desc limit 10) q), '[]'::jsonb),
    'certificati', coalesce((select jsonb_agg(x) from (
                select jsonb_build_object('id', ce.id, 'scadenza', ce.scadenza, 'stato', ce.stato, 'caricato_at', ce.caricato_at) as x
                from certificati ce where ce.allievo_id = p_allievo order by ce.caricato_at desc limit 5) q), '[]'::jsonb),
    'corsi', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome) order by c.nome)
              from corsi c where c.palestra_id = a.palestra_id and c.attivo), '[]'::jsonb),
    'tipi', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'codice', t.codice, 'famiglia', t.famiglia, 'gruppo_id', t.gruppo_id,
                'modalita', t.modalita, 'durata_mesi', t.durata_mesi, 'durata_giorni', t.durata_giorni, 'scadenza_fine_mese', t.scadenza_fine_mese,
                'prezzo_cent', t.prezzo_cent, 'num_ingressi', t.num_ingressi,
                'tipi_abbonamento_corsi', coalesce((select jsonb_agg(jsonb_build_object('corso_id', tc.corso_id)) from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = t.id), '[]'::jsonb))
                order by t.famiglia, t.nome)
              from tipi_abbonamento t where t.palestra_id = a.palestra_id and t.attivo and t.archiviato = false), '[]'::jsonb),
    'orari', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'corso_id', o.corso_id, 'giorno_settimana', o.giorno_settimana, 'ora_inizio', o.ora_inizio, 'gruppo', o.gruppo)
                order by o.giorno_settimana, o.ora_inizio, o.id)
              from orari o where o.palestra_id = a.palestra_id and o.attivo), '[]'::jsonb),
    'palestra', (select jsonb_build_object('base_url', pa.base_url, 'quota_iscrizione_cent', pa.quota_iscrizione_cent, 'sconti', pa.sconti, 'ente', pa.ente,
                   'mese_fine_stagione', pa.mese_fine_stagione, 'mese_inizio_annuale', pa.mese_inizio_annuale) from palestre pa where pa.id = a.palestra_id),
    'storico', coalesce((select jsonb_agg(x) from (
                select jsonb_build_object('id', sa.id, 'abbonamento', sa.abbonamento, 'dal', sa.dal, 'al', sa.al, 'stato', sa.stato, 'valore_cent', sa.valore_cent) as x
                from storico_abbonamenti sa where sa.allievo_id = p_allievo order by sa.dal desc limit 60) q), '[]'::jsonb),
    'storico_totale', (select count(*) from storico_abbonamenti sa where sa.allievo_id = p_allievo),
    'etichette', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) order by e.nome) from etichette e where e.palestra_id = a.palestra_id), '[]'::jsonb),
    'famiglia', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'cognome', f.cognome))
                 from allievi f where f.account_id = a.account_id and f.id <> p_allievo), '[]'::jsonb),
    'famiglia_iscritta', (select count(distinct i.allievo_id) from iscrizioni i join allievi f on f.id = i.allievo_id
                           where f.account_id = a.account_id and i.stato = 'attiva' and i.allievo_id <> p_allievo),
    'moduli', coalesce((select jsonb_agg(to_jsonb(m)) from moduli_da_firmare(p_allievo) m), '[]'::jsonb),
    'firme', coalesce((select jsonb_agg(jsonb_build_object('id', fi.id, 'modulo_id', fi.modulo_id, 'versione', fi.versione, 'titolo', fi.titolo, 'firmato_at', fi.firmato_at)
                 order by fi.firmato_at desc) from firme fi where fi.allievo_id = p_allievo), '[]'::jsonb),
    'pagamenti', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.created_at desc) from (
                   select * from pagamenti pg where pg.palestra_id = a.palestra_id
                     and (pg.allievo_id = p_allievo or (pg.account_id = a.account_id and pg.allievo_id is null))
                   order by pg.created_at desc limit 100) pg), '[]'::jsonb),
    'ricevute', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'pagamento_id', r.pagamento_id, 'numero', r.numero, 'anno', r.anno, 'tipo_documento', r.tipo_documento, 'annullata', r.annullata))
                 from ricevute r where r.pagamento_id in (
                   select pg.id from pagamenti pg where pg.palestra_id = a.palestra_id
                     and (pg.allievo_id = p_allievo or (pg.account_id = a.account_id and pg.allievo_id is null))
                   order by pg.created_at desc limit 100)), '[]'::jsonb),
    'rinnovi', coalesce((select jsonb_agg(jsonb_build_object('id', ar.id, 'stato', ar.stato, 'importo_cent', ar.importo_cent,
                 'tipi_abbonamento', (select jsonb_build_object('nome', t.nome) from tipi_abbonamento t where t.id = ar.tipo_abbonamento_id),
                 'corsi', (select jsonb_build_object('nome', c.nome) from corsi c where c.id = ar.corso_id)))
                 from abbonamenti_ricorrenti ar where ar.allievo_id = p_allievo and ar.stato <> 'annullato'), '[]'::jsonb),
    'riepilogo', riepilogo_iscrizioni(p_allievo),
    'partecipa', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', vp.lezione_id, 'tipo', vp.tipo, 'riferimento_id', vp.riferimento_id))
                   from v_partecipanti_lezione vp where vp.allievo_id = p_allievo), '[]'::jsonb),
    'prossime', coalesce((select jsonb_agg(x) from (
                   select jsonb_build_object('id', l.id, 'corso_nome', l.corso_nome, 'inizio', l.inizio, 'sala_nome', l.sala_nome, 'insegnante_nome', l.insegnante_nome) as x
                   from v_lezioni l where l.id = any (v_lez) and l.stato = 'programmata' and l.inizio > now() and l.data <= v_fra30
                   order by l.inizio limit 40) q), '[]'::jsonb),
    'disdette', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', x.lezione_id)) from assenze_avvisate x
                   where x.allievo_id = p_allievo and x.lezione_id = any (v_lez)), '[]'::jsonb)
  );
end $$;
revoke all on function scheda_persona(uuid) from public, anon;
grant execute on function scheda_persona(uuid) to authenticated;

-- ------------------------------------------------------------------ home (Riepilogo)
create or replace function home_dati(p_palestra uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s staff; v_oggi date := (now() at time zone 'Europe/Rome')::date; v_gest boolean;
begin
  select * into s from staff where palestra_id = p_palestra and user_id = auth.uid() and attivo limit 1;
  if not found then raise exception 'non_autorizzato'; end if;
  v_gest := s.ruolo <> 'insegnante';
  return jsonb_build_object(
    'k', case when v_gest then cruscotto(p_palestra) end,
    'lezioni', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', o.lezione_id, 'corso_id', o.corso_id, 'corso_nome', o.corso_nome, 'inizio', o.inizio, 'fine', o.fine,
                  'stato', o.stato, 'capienza', o.capienza, 'iscritti', o.iscritti, 'prove', o.prove, 'presenti', o.presenti, 'assenti', o.assenti,
                  'insegnante_id', o.insegnante_id, 'insegnante_nome', o.insegnante_nome, 'sala_nome', o.sala_nome) order by o.inizio)
                from v_occupazione o where o.palestra_id = p_palestra and o.data = v_oggi and (v_gest or o.insegnante_id = s.id)), '[]'::jsonb),
    'corsi', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'colore', c.colore)) from corsi c where c.palestra_id = p_palestra), '[]'::jsonb),
    'scadenze', case when v_gest then coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('tipo', v.tipo, 'allievo_id', v.allievo_id, 'nome', v.nome, 'cognome', v.cognome, 'data', v.data, 'giorni', v.giorni,
                    'dettaglio', v.dettaglio, 'importo_cent', v.importo_cent) as x
                  from v_scadenze v where v.palestra_id = p_palestra and v.gestito = false and v.tipo in ('abbonamento', 'ingressi', 'rata')
                    and v.giorni >= -3 and v.giorni <= 7 order by v.data limit 9) q), '[]'::jsonb) else '[]'::jsonb end,
    'rate_scadute', case when v_gest then (select count(*) from v_rate r where r.palestra_id = p_palestra and r.scaduta) else 0 end,
    'richieste', (select count(*) from richieste_cliente r where r.palestra_id = p_palestra and r.stato = 'da_confermare'),
    'promemoria', coalesce((select jsonb_agg(to_jsonb(m)) from promemoria_miei(p_palestra) m), '[]'::jsonb),
    'staff', case when v_gest then coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'cognome', x.cognome) order by x.nome)
                  from staff x where x.palestra_id = p_palestra and x.attivo and x.archiviato is not true), '[]'::jsonb) else '[]'::jsonb end,
    'sostituzioni', case when v_gest then coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('id', l.id, 'data', l.data, 'inizio', l.inizio, 'insegnante_id', l.insegnante_id, 'insegnante_titolare', l.insegnante_titolare,
                    'sostituzione_da', l.sostituzione_da, 'corsi', (select jsonb_build_object('nome', c.nome) from corsi c where c.id = l.corso_id)) as x
                  from lezioni l where l.palestra_id = p_palestra and l.insegnante_titolare is not null and l.stato <> 'annullata'
                    and l.data >= v_oggi and l.data <= v_oggi + 14 order by l.inizio limit 30) q), '[]'::jsonb) else '[]'::jsonb end,
    'prossime', case when v_gest then null else coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('lezione_id', o.lezione_id, 'corso_id', o.corso_id, 'corso_nome', o.corso_nome, 'inizio', o.inizio, 'capienza', o.capienza,
                    'iscritti', o.iscritti, 'sala_nome', o.sala_nome) as x
                  from v_occupazione o where o.palestra_id = p_palestra and o.insegnante_id = s.id and o.data > v_oggi and o.stato <> 'annullata'
                  order by o.inizio limit 6) q), '[]'::jsonb) end,
    'da_sistemare', case when v_gest then (select count(*) from anomalie_import x where x.palestra_id = p_palestra and not x.risolta and x.gravita = 'da_sistemare') else 0 end,
    'da_verificare', case when v_gest then (select count(*) from anomalie_import x where x.palestra_id = p_palestra and not x.risolta and x.gravita = 'da_verificare') else 0 end
  );
end $$;
revoke all on function home_dati(uuid) from public, anon;
grant execute on function home_dati(uuid) to authenticated;

-- ------------------------------------------------------------------ Sportello (dati di riferimento)
create or replace function sportello_dati(p_palestra uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  return jsonb_build_object(
    'corsi', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'colore', c.colore, 'capienza', c.capienza, 'link_whatsapp', c.link_whatsapp) order by c.nome)
               from corsi c where c.palestra_id = p_palestra and c.attivo), '[]'::jsonb),
    'tipi', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'famiglia', t.famiglia, 'modalita', t.modalita, 'durata_mesi', t.durata_mesi,
                 'durata_giorni', t.durata_giorni, 'num_ingressi', t.num_ingressi, 'lezioni_settimanali', t.lezioni_settimanali, 'scadenza_fine_mese', t.scadenza_fine_mese,
                 'prezzo_cent', t.prezzo_cent,
                 'tipi_abbonamento_corsi', coalesce((select jsonb_agg(jsonb_build_object('corso_id', tc.corso_id)) from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = t.id), '[]'::jsonb))
                 order by t.famiglia, t.nome)
               from tipi_abbonamento t where t.palestra_id = p_palestra and t.attivo and t.archiviato = false), '[]'::jsonb),
    'orari', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'corso_id', o.corso_id, 'giorno_settimana', o.giorno_settimana, 'ora_inizio', o.ora_inizio,
                 'valido_al', o.valido_al, 'gruppo', o.gruppo, 'insegnante_id', o.insegnante_id) order by o.giorno_settimana, o.ora_inizio, o.id)
               from orari o where o.palestra_id = p_palestra and o.attivo), '[]'::jsonb),
    'palestra', (select jsonb_build_object('nome', pa.nome, 'quota_iscrizione_cent', pa.quota_iscrizione_cent, 'sconti', pa.sconti, 'ente', pa.ente,
                   'mese_fine_stagione', pa.mese_fine_stagione, 'mese_inizio_annuale', pa.mese_inizio_annuale, 'mese_inizio_stagione', pa.mese_inizio_stagione)
                 from palestre pa where pa.id = p_palestra),
    'persone', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'cognome', x.cognome)) from staff x where x.palestra_id = p_palestra), '[]'::jsonb),
    'satispay', exists (select 1 from satispay_chiavi k where k.palestra_id = p_palestra)
  );
end $$;
revoke all on function sportello_dati(uuid) from public, anon;
grant execute on function sportello_dati(uuid) to authenticated;

-- ------------------------------------------------------------------ Palinsesto e Agenda (una settimana o alcuni giorni)
-- Prima: 7 richieste insieme + 2 in fila (prenotati e coda). Ora una sola.
create or replace function settimana_dati(p_palestra uuid, p_inizio date, p_fine date, p_sala uuid default null, p_insegnante uuid default null,
                                          p_sede uuid default null, p_corso uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_lez uuid[];
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  select coalesce(array_agg(o.lezione_id), '{}') into v_lez from v_occupazione o
   where o.palestra_id = p_palestra and o.data between p_inizio and p_fine
     and (p_sala is null or o.sala_id = p_sala) and (p_insegnante is null or o.insegnante_id = p_insegnante)
     and (p_sede is null or o.sede_id = p_sede) and (p_corso is null or o.corso_id = p_corso);
  return jsonb_build_object(
    'lezioni', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', o.lezione_id, 'corso_id', o.corso_id, 'corso_nome', o.corso_nome, 'data', o.data, 'inizio', o.inizio,
                 'fine', o.fine, 'stato', o.stato, 'capienza', o.capienza, 'iscritti', o.iscritti, 'prove', o.prove, 'presenti', o.presenti, 'sala_id', o.sala_id,
                 'sala_nome', o.sala_nome, 'sede_id', o.sede_id, 'sede_nome', o.sede_nome, 'insegnante_id', o.insegnante_id, 'insegnante_nome', o.insegnante_nome,
                 'insegnante_foto', o.insegnante_foto, 'prenotabile', o.prenotabile, 'colore', o.colore, 'note', o.note) order by o.inizio, o.lezione_id)
               from v_occupazione o where o.lezione_id = any (v_lez)), '[]'::jsonb),
    'sale', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) order by s.ordine nulls last, s.nome) from sale s where s.palestra_id = p_palestra), '[]'::jsonb),
    'insegnanti', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'cognome', x.cognome) order by x.nome)
                    from staff x where x.palestra_id = p_palestra and x.ruolo = 'insegnante' and x.attivo and x.archiviato = false), '[]'::jsonb),
    'corsi', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'colore', c.colore, 'visibilita', c.visibilita, 'attivo', c.attivo) order by c.nome)
               from corsi c where c.palestra_id = p_palestra), '[]'::jsonb),
    'note', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'data', n.data, 'testo', n.testo) order by n.created_at)
               from note_giorno n where n.palestra_id = p_palestra and n.data between p_inizio and p_fine), '[]'::jsonb),
    'sedi', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) order by s.ordine) from sedi s where s.palestra_id = p_palestra and s.visibile), '[]'::jsonb),
    'chiusure', coalesce((select jsonb_agg(jsonb_build_object('dal', ch.dal, 'al', ch.al, 'motivo', ch.motivo)) from chiusure ch
                  where ch.palestra_id = p_palestra and ch.dal <= p_fine and ch.al >= p_inizio), '[]'::jsonb),
    'facce', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', f.lezione_id, 'allievo_id', f.allievo_id, 'nome', f.nome, 'cognome', f.cognome, 'foto_url', f.foto_url, 'tipo', f.tipo))
               from v_facce_lezione f where f.lezione_id = any (v_lez)), '[]'::jsonb),
    'coda', coalesce((select jsonb_agg(jsonb_build_object('lezione_id', la.lezione_id, 'allievo_id', la.allievo_id, 'stato', la.stato, 'tipo', la.tipo, 'created_at', la.created_at,
                 'allievi', (select jsonb_build_object('nome', a.nome, 'cognome', a.cognome, 'foto_url', a.foto_url) from allievi a where a.id = la.allievo_id)) order by la.created_at)
               from liste_attesa la where la.lezione_id = any (v_lez) and la.stato in ('in_attesa', 'avvisato')), '[]'::jsonb)
  );
end $$;
revoke all on function settimana_dati(uuid, date, date, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function settimana_dati(uuid, date, date, uuid, uuid, uuid, uuid) to authenticated;
