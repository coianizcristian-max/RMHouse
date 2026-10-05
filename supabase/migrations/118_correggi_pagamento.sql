-- =====================================================================
-- RMHouse — 118 CORREGGERE UN INCASSO (data, metodo, descrizione) E REGISTRARLO CON LA DATA GIUSTA
-- Richieste della segreteria: "come modifico la data di pagamento?", "ho sbagliato metodo",
-- "non posso modificare i pagamenti precedenti?". Finora si poteva solo annullare e rifare.
-- 1. correggi_pagamento: cambia data, metodo e descrizione di un incasso già registrato
--    (non quelli pagati online con la carta: quelli li decide Stripe). Resta tutto nel registro azioni.
-- 2. registra_incasso accetta la data (p ->> 'pagato_at'): un incasso di ieri si registra con la data di ieri.
-- Si può eseguire più volte. Va dopo la 117.
-- =====================================================================

create or replace function correggi_pagamento(p_pagamento uuid, p_metodo text default null, p_pagato_at date default null, p_descrizione text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pg pagamenti; v_ric int;
begin
  select * into pg from pagamenti where id = p_pagamento for update;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
  if pg.metodo in ('stripe', 'online') or pg.stripe_payment_intent is not null then raise exception 'pagamento_online'; end if;
  if pg.stato <> 'pagato' then raise exception 'non_pagato'; end if;
  if p_metodo is not null and p_metodo not in ('contanti', 'pos', 'bonifico', 'assegno', 'altro') then raise exception 'metodo_non_valido'; end if;
  if p_pagato_at is not null and p_pagato_at > current_date then raise exception 'data_futura'; end if;

  update pagamenti
     set metodo = coalesce(p_metodo, metodo),
         -- la data cambia, l'ora del giorno resta quella registrata (serve all'ordine nella giornata)
         pagato_at = case when p_pagato_at is null then pagato_at
                          else p_pagato_at + coalesce(pagato_at::time, '12:00'::time) end,
         descrizione = coalesce(nullif(trim(p_descrizione), ''), descrizione)
   where id = p_pagamento;

  -- la ricevuta già emessa non cambia da sola: la data e il metodo sul documento restano quelli del momento
  select count(*) into v_ric from ricevute where pagamento_id = p_pagamento and not annullata and tipo_documento in ('ricevuta', 'fattura');
  if v_ric > 0 and (p_pagato_at is not null or p_metodo is not null) then
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (pg.palestra_id, current_date,
            'Incasso corretto (' || coalesce(p_metodo, pg.metodo) || coalesce(', ' || to_char(p_pagato_at, 'DD/MM/YYYY'), '') || ') ma la ricevuta era già emessa: '
            || 'se serve, annullala e riemettila da Conti → Ricevute e fatture.', 'Sistema');
  end if;
end $$;
grant execute on function correggi_pagamento(uuid, text, date, text) to authenticated;

-- registra_incasso con la data dell'incasso (se non c'è: adesso)
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('registra_incasso(jsonb)'::regprocedure); v0 := v;
  if v not like '%pagato_at''%' then
    v := replace(v, 'case when coalesce((p->>''incassato'')::boolean, true) then now() end)',
                    'case when coalesce((p->>''incassato'')::boolean, true)
               then coalesce(nullif(p->>''pagato_at'', '''')::date + current_time::time, now()) end)');
    if v = v0 then raise exception 'registra_incasso: testo non trovato'; end if;
    execute v;
  end if;
end $$;
