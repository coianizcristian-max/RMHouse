-- =====================================================================
-- RMHouse — 028 PULIZIA DEI DATI DIMOSTRATIVI
--
-- Da eseguire DOPO la 027. Toglie tutto ciò che demo.sql aveva inventato
-- e che con la struttura vera non ha più senso: affitti finti, fornitori
-- e spese finti, costo orario finto delle sale, ricevute emesse a clienti
-- finti (consumavano la numerazione), messaggi finti nello storico,
-- discipline rimaste vuote, segnaposto nelle impostazioni della scuola.
--
-- I 120 CLIENTI FINTI: di norma restano, già ricollegati dalla 027 ai
-- corsi nuovi, così palinsesto e appelli sono pieni per le prove.
-- Per toglierli del tutto e partire vuoti, alla riga
--     v_via_clienti boolean := false;
-- scrivi true prima di eseguire.
--
-- Riconosce i dati finti dai segni che demo.sql ha lasciato (nota 'DEMO'
-- sull'account, email demo…@esempio.it, nomi precisi di fornitori, spese
-- e sale). Tutto ciò che hai inserito tu, a mano o dal sito, resta.
-- Tutto in un colpo: se un passaggio fallisce non cambia niente.
-- =====================================================================

do $$
declare
  v_via_clienti boolean := false;   -- ← true = cancella anche i 120 clienti finti

  p palestre;
  n_affitti int; n_spese int; n_fornitori int; n_ricevute int; n_messaggi int;
  n_discipline int; n_staff int; n_clienti int := 0; n_pagamenti int := 0;
begin
  select * into p from palestre where slug = 'rmhouse';
  if not found then raise exception 'Palestra rmhouse non trovata'; end if;
  if to_regclass('public.corsi_insegnanti') is null then
    raise exception 'Esegui prima la 027_nuova_struttura.sql';
  end if;

  create temp table _acc_demo on commit drop as
    select id from account where palestra_id = p.id and (note = 'DEMO' or email like 'demo%@esempio.it');
  create temp table _pag_demo on commit drop as
    select id from pagamenti where account_id in (select id from _acc_demo);

  -- -------------------------------------------------------------------
  -- 1. Affitti di sala finti
  -- -------------------------------------------------------------------
  delete from prenotazioni_spazi
   where palestra_id = p.id
     and (email like 'demo-spazi%@esempio.it' or (tipo = 'interno' and titolo = 'Prove saggio di Natale'));
  get diagnostics n_affitti = row_count;

  -- -------------------------------------------------------------------
  -- 2. Costi finti: spese, fornitori, costo orario delle sale
  -- -------------------------------------------------------------------
  delete from spese
   where palestra_id = p.id
     and (descrizione, importo_cent) in (
       ('Affitto locali', 190000), ('Utenze (luce, acqua, riscaldamento)', 42000),
       ('Assicurazione', 96000), ('Campagna social', 30000), ('Gestionale e dominio', 4500));
  get diagnostics n_spese = row_count;

  delete from fornitori f
   where f.palestra_id = p.id
     and f.nome in ('Immobiliare Centro', 'Energia Più', 'Studio Grafico Nord')
     and not exists (select 1 from spese s where s.fornitore_id = f.id)
     and not exists (select 1 from fatture ft where ft.fornitore_id = f.id);
  get diagnostics n_fornitori = row_count;

  -- demo.sql aveva messo 9 €/h a tutte le sale senza costo
  update sale set costo_ora_cent = null where palestra_id = p.id and costo_ora_cent = 900;

  -- -------------------------------------------------------------------
  -- 3. Ricevute a clienti finti: via, così la prima ricevuta vera è la n. 1
  --    (se ne hai fatte anche a persone vere, la numerazione riparte
  --    dopo l'ultima rimasta)
  -- -------------------------------------------------------------------
  delete from ricevute
   where palestra_id = p.id
     and (account_id in (select id from _acc_demo) or pagamento_id in (select id from _pag_demo));
  get diagnostics n_ricevute = row_count;

  -- -------------------------------------------------------------------
  -- 4. Messaggi finti rimasti nello storico (mai partiti: erano annullati)
  -- -------------------------------------------------------------------
  delete from messaggi_coda
   where palestra_id = p.id and stato in ('annullato', 'errore')
     and (account_id in (select id from _acc_demo)
          or destinatario like 'demo%@esempio.it'
          or destinatario like 'demo-spazi%@esempio.it'
          or destinatario = 'info@esempio.it');           -- avvisi alla vecchia email segnaposto
  get diagnostics n_messaggi = row_count;

  -- -------------------------------------------------------------------
  -- 5. Avanzi della struttura d'esempio
  -- -------------------------------------------------------------------
  -- insegnanti d'esempio (la 027 li ha già tolti; questo è un controllo in più)
  delete from staff
   where palestra_id = p.id and ruolo = 'insegnante' and email like '%@esempio.it'
     and not exists (select 1 from orari o where o.insegnante_id = staff.id)
     and not exists (select 1 from lezioni l where l.insegnante_id = staff.id);
  get diagnostics n_staff = row_count;

  -- discipline rimaste senza corsi (Tessuti Aerei, Danza Aerea…)
  delete from discipline d
   where d.palestra_id = p.id and not exists (select 1 from corsi c where c.disciplina_id = d.id);
  get diagnostics n_discipline = row_count;

  -- segnaposto rimasti da seed.sql nelle impostazioni della scuola
  update palestre set base_url = 'https://rm-house.vercel.app'
   where id = p.id and (base_url is null or base_url like '%TUO-SITO%');
  update palestre set google_review_url = null
   where id = p.id and google_review_url like '%INSERIRE%';
  update palestre set email = null
   where id = p.id and email = 'info@esempio.it';

  -- -------------------------------------------------------------------
  -- 6. Solo se richiesto: via anche i clienti finti
  -- -------------------------------------------------------------------
  if v_via_clienti then
    select count(*) into n_clienti from _acc_demo;

    -- documenti fiscali legati ai loro pagamenti (tabella di servizio)
    delete from documenti_fiscali where pagamento_id in (select id from _pag_demo);

    -- allievi: portano con sé iscrizioni, prove, presenze, recuperi, quote,
    -- certificati, liste d'attesa, diario dei lead
    delete from allievi where account_id in (select id from _acc_demo);

    -- incassi registrati su di loro (gli abbinamenti con la banca spariscono
    -- con loro, i movimenti di banca restano da riabbinare)
    delete from pagamenti where id in (select id from _pag_demo);
    get diagnostics n_pagamenti = row_count;

    -- e infine gli account (messaggi e notifiche push vanno con loro)
    delete from account where id in (select id from _acc_demo);
  end if;

  raise notice 'Pulizia fatta: % affitti, % spese, % fornitori, % ricevute, % messaggi, % insegnanti, % discipline tolti; clienti finti tolti: % (con % incassi).',
    n_affitti, n_spese, n_fornitori, n_ricevute, n_messaggi, n_staff, n_discipline, n_clienti, n_pagamenti;
end $$;
