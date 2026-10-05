-- =====================================================================
-- RMHouse — 116 I CONSENSI NEGLI ELENCHI (gruppo WhatsApp, foto e video, promozioni)
-- I tre consensi firmati col modulo privacy stavano solo sulla scheda della singola persona.
-- Ora compaiono anche in Persone (filtro "Consensi" ed esportazione) e nell'elenco iscritti di ogni corso
-- (con "Per il gruppo WhatsApp": i numeri di chi ha detto sì, da copiare in un colpo).
-- Aggiunge tre colonne in coda a v_stato_clienti e v_iscritti_corso: null = non ancora chiesto.
-- Le due viste restano "security_invoker": chi legge vede solo quello che le regole gli permettono.
-- Si può eseguire più volte. Va dopo la 115.
-- =====================================================================

do $$
declare v text;
begin
  -- Persone: la vista di prima, avvolta, più le tre colonne
  if not exists (select 1 from information_schema.columns where table_name = 'v_stato_clienti' and column_name = 'consenso_whatsapp') then
    v := pg_get_viewdef('v_stato_clienti'::regclass);
    execute 'create or replace view v_stato_clienti with (security_invoker = true) as '
         || 'select v.*, a.consenso_whatsapp, a.consenso_immagini, acc.consenso_marketing from (' || rtrim(v, '; ' || chr(10)) || ') v '
         || 'left join allievi a on a.id = v.id left join account acc on acc.id = v.account_id';
  end if;

  -- Iscritti di un corso
  if not exists (select 1 from information_schema.columns where table_name = 'v_iscritti_corso' and column_name = 'consenso_whatsapp') then
    v := pg_get_viewdef('v_iscritti_corso'::regclass);
    execute 'create or replace view v_iscritti_corso with (security_invoker = true) as '
         || 'select v.*, a.consenso_whatsapp, a.consenso_immagini, acc.consenso_marketing from (' || rtrim(v, '; ' || chr(10)) || ') v '
         || 'left join allievi a on a.id = v.allievo_id left join account acc on acc.id = a.account_id';
  end if;
end $$;

-- se una delle due viste aveva perso "security_invoker", lo rimette (vale anche per chi ha già eseguito questa query)
alter view v_stato_clienti set (security_invoker = true);
alter view v_iscritti_corso set (security_invoker = true);
