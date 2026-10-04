-- 101 · Rimborso sulla carta direttamente dal gestionale
-- - pagamenti.rimborsato_cent: quanto è già stato restituito (anche più rimborsi parziali).
-- - segna_rimborso_online: tiene il totale rimborsato (Stripe manda sempre il totale), non duplica nulla
--   se arriva due volte (dal gestionale e poi dal webhook) e non chiede la nota di credito se è già stata emessa.
-- Rieseguibile.
alter table pagamenti add column if not exists rimborsato_cent integer not null default 0;

create or replace function segna_rimborso_online(p_intent text, p_rimborsato_cent integer)
returns void language plpgsql security definer set search_path = public as $$
declare p pagamenti; r ricevute; v_eur text; v_chi text; v_note int;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into p from pagamenti where stripe_payment_intent = p_intent limit 1 for update;
  if not found then return; end if;
  if p_rimborsato_cent <= coalesce(p.rimborsato_cent, 0) then return; end if;   -- già registrato
  v_eur := replace(to_char(p_rimborsato_cent / 100.0, 'FM99999990.00'), '.', ',') || ' €';
  update pagamenti set rimborsato_cent = p_rimborsato_cent,
         stato = case when p_rimborsato_cent >= importo_cent then 'rimborsato'::stato_pagamento else stato end,
         descrizione = regexp_replace(descrizione, ' — rimborsati .*$', '') || ' — rimborsati ' || v_eur || ' su Stripe'
   where id = p.id;

  select * into r from ricevute where pagamento_id = p.id and tipo_documento in ('ricevuta', 'fattura') and not annullata
   order by created_at limit 1;
  select coalesce(sum(importo_cent + iva_cent), 0) into v_note from ricevute
   where riferimento_id = r.id and tipo_documento = 'nota_credito' and not annullata;
  select trim(nome || ' ' || coalesce(cognome, '')) into v_chi from account where id = p.account_id;
  -- la nota di credito c'è già per tutto il rimborsato? allora niente promemoria
  if r.id is not null and v_note < p_rimborsato_cent then
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (p.palestra_id, current_date,
            'Rimborso online di ' || v_eur || coalesce(' a ' || v_chi, '') || ' (' || regexp_replace(coalesce(p.descrizione, 'pagamento'), ' — rimborsati .*$', '') || ')'
            || ': emetti la nota di credito di ' || replace(to_char((p_rimborsato_cent - v_note) / 100.0, 'FM99999990.00'), '.', ',') || ' €'
            || ' sulla ' || r.tipo_documento || ' n. ' || r.numero || '/' || r.anno || ' (Conti → Ricevute e fatture)',
            'Stripe');
  end if;
  begin
    perform accoda_push_staff(p.palestra_id, 'pagamento', 'Rimborso sulla carta', v_eur || coalesce(' · ' || v_chi, ''),
                              '/gestione/ricevute', array['admin', 'segreteria'], null, 'rimborso:' || p_intent || ':' || p_rimborsato_cent);
  exception when others then null;
  end;
end $$;
