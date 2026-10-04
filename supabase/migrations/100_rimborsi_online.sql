-- 100 · Rimborso fatto su Stripe: la segreteria lo sa e si ricorda la nota di credito
-- Quando su Stripe si rimborsa un pagamento (tutto o in parte), l'incasso si segna come rimborsato
-- (come prima) e in più: messaggio nella campanella di segreteria e amministrazione e una voce in "Da fare"
-- per emettere la nota di credito sulla ricevuta (le note di credito le emette sempre una persona).
-- Rieseguibile.
create or replace function segna_rimborso_online(p_intent text, p_rimborsato_cent integer)
returns void language plpgsql security definer set search_path = public as $$
declare p pagamenti; r ricevute; v_eur text; v_chi text;
begin
  if not e_sistema() then raise exception 'non_autorizzato'; end if;
  select * into p from pagamenti where stripe_payment_intent = p_intent limit 1;
  if not found then return; end if;
  if p.descrizione like '%rimborsati%' and p.descrizione like '%' || replace(to_char(p_rimborsato_cent / 100.0, 'FM99999990.00'), '.', ',') || ' €%' then return; end if;
  v_eur := replace(to_char(p_rimborsato_cent / 100.0, 'FM99999990.00'), '.', ',') || ' €';
  update pagamenti set stato = case when p_rimborsato_cent >= importo_cent then 'rimborsato'::stato_pagamento else stato end,
         descrizione = regexp_replace(descrizione, ' — rimborsati .*$', '') || ' — rimborsati ' || v_eur || ' su Stripe'
   where id = p.id;

  select * into r from ricevute where pagamento_id = p.id and tipo_documento in ('ricevuta', 'fattura') and not annullata
   order by created_at limit 1;
  select trim(nome || ' ' || coalesce(cognome, '')) into v_chi from account where id = p.account_id;
  insert into promemoria (palestra_id, data, testo, creato_da)
  values (p.palestra_id, current_date,
          'Rimborso online di ' || v_eur || coalesce(' a ' || v_chi, '') || ' (' || coalesce(p.descrizione, 'pagamento') || ')'
          || case when r.id is not null then ': emetti la nota di credito sulla ' || r.tipo_documento || ' n. ' || r.numero || '/' || r.anno || ' (Conti → Ricevute e fatture)'
                  else ': nessuna ricevuta da stornare' end,
          'Stripe');
  begin
    perform accoda_push_staff(p.palestra_id, 'pagamento', 'Rimborso fatto su Stripe', v_eur || coalesce(' · ' || v_chi, ''),
                              '/gestione/ricevute', array['admin', 'segreteria'], null, 'rimborso:' || p_intent || ':' || p_rimborsato_cent);
  exception when others then null;
  end;
end $$;
