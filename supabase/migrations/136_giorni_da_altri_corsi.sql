-- =====================================================================
-- RMHouse — 136 GIORNI ANCHE DAGLI ALTRI CORSI DELL'ABBONAMENTO
-- Un abbonamento "3 volte a settimana" su un corso che ha un solo giorno (es. Hip Hop 2: solo mercoledì)
-- si completa con i giorni degli altri corsi che lo stesso abbonamento copre (Impostazioni → Abbonamenti →
-- Corsi coperti: es. STREET 3 volte copre Hip Hop 2, Hip Hop adulti, Afro…).
-- Prima l'app proponeva solo i giorni del corso scelto e il database rifiutava orari di altri corsi
-- ("orario_non_del_corso"). Ora un orario va bene se è del corso OPPURE di un corso coperto
-- dall'abbonamento scelto. Vale per l'iscrizione dal telefono (prepara_acquisto, richiedi_abbonamento) e per crea_iscrizione
-- (scheda persona, Sportello, rinnovi).
-- Non cambia nient'altro. Si può eseguire più volte.
-- =====================================================================

do $$
declare
  v_def text; v_nuova text;
begin
  -- 1) iscrizione dal telefono
  select pg_get_functiondef('prepara_acquisto'::regproc) into v_def;
  v_nuova := replace(v_def,
    'where x.id = o and x.corso_id = c.id)) then',
    'where x.id = o and (x.corso_id = c.id or exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = t.id and tc.corso_id = x.corso_id)))) then');
  if v_nuova <> v_def then execute v_nuova; raise notice 'prepara_acquisto: aggiornata';
  elsif position('tc.corso_id = x.corso_id' in v_def) > 0 then raise notice 'prepara_acquisto: già aggiornata';
  else raise warning 'prepara_acquisto: testo atteso non trovato, NON aggiornata'; end if;

  -- 1b) richiesta con bonifico dall'app
  select pg_get_functiondef('richiedi_abbonamento'::regproc) into v_def;
  v_nuova := replace(v_def,
    'where x.id = o and x.corso_id = p_corso and x.attivo)) then',
    'where x.id = o and x.attivo and (x.corso_id = p_corso or exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = p_tipo and tc.corso_id = x.corso_id)))) then');
  if v_nuova <> v_def then execute v_nuova; raise notice 'richiedi_abbonamento: aggiornata';
  elsif position('tc.corso_id = x.corso_id' in v_def) > 0 then raise notice 'richiedi_abbonamento: già aggiornata';
  else raise warning 'richiedi_abbonamento: testo atteso non trovato, NON aggiornata'; end if;

  -- 2) crea_iscrizione (segreteria, Sportello, completamento degli acquisti, rinnovi)
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.proname = 'crea_iscrizione' and p.pronamespace = 'public'::regnamespace limit 1;
  v_nuova := replace(v_def,
    'if not exists (select 1 from orari where id = v_orario and corso_id = p_corso) then',
    'if not exists (select 1 from orari o where o.id = v_orario and (o.corso_id = p_corso or exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = p_tipo_abbonamento and tc.corso_id = o.corso_id))) then');
  if v_nuova <> v_def then execute v_nuova; raise notice 'crea_iscrizione: aggiornata';
  elsif position('tc.corso_id = o.corso_id' in v_def) > 0 then raise notice 'crea_iscrizione: già aggiornata';
  else raise warning 'crea_iscrizione: testo atteso non trovato, NON aggiornata'; end if;
end $$;
