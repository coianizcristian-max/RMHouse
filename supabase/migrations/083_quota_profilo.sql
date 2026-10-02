-- =====================================================================
-- RMHouse — 083 QUOTA ANNUALE GIUSTA NELL'APP DEL CLIENTE
-- La quota vale 12 mesi dal pagamento (regola della 041).
-- Prima l'app diceva "pagata" a chiunque non avesse un abbonamento attivo
-- (anche a chi l'aveva pagata nel 2020), e il negozio non la aggiungeva
-- a chi tornava dopo anni. Ora:
--  - profilo_area: quota con data di pagamento, "valida fino al" e stato
--    (valida / scaduta / mai pagata), quota_mancante = non valida oggi
--  - richiedi_abbonamento: aggiunge la quota se non è valida alla data
--    di inizio dell'abbonamento scelto
-- Si può eseguire più volte. Va dopo la 082.
-- =====================================================================
do $$
declare v text;
begin
  v := pg_get_functiondef('profilo_area()'::regprocedure);
  if v not ilike '%valida_fino%' then
    v := replace(v,
      '''quota'', (select jsonb_build_object(''stagione'', q.stagione, ''data'', q.data)',
      '''quota'', (select jsonb_build_object(''stagione'', q.stagione, ''data'', q.data, ''valida_fino'', (q.data + interval ''1 year'')::date - 1)');
    v := replace(v,
      '''quota_mancante'', coalesce((select vs.quota_mancante from v_stato_clienti vs where vs.id = a.id), false),',
      '''quota_mancante'', not quota_pagata(a.id),');
    execute v;
  end if;

  v := pg_get_functiondef('richiedi_abbonamento(uuid, uuid, uuid, uuid[], date)'::regprocedure);
  if v ilike '%v_stato_clienti%' then
    v := replace(v,
      'if coalesce((select vs.quota_mancante from v_stato_clienti vs where vs.id = a.id), false) then',
      'if not quota_pagata(a.id, coalesce(p_data_inizio, current_date)) then');
    execute v;
  end if;
end $$;
