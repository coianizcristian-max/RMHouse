-- =====================================================================
-- RMHouse — 129 ISCRIZIONE DAL TELEFONO (lato cliente)
--
--  • registra_cliente: un nuovo cliente si registra da solo dall'app (sé stesso e/o i figli).
--    La chiama solo il server (API /api/accesso/registrati) dopo aver creato l'accesso.
--  • esito_acquisto: dopo il pagamento con carta il cliente vede subito com'è andata
--    (iscrizione fatta, giorni, ricevuta da scaricare).
--  • invia_ricevuta_email: la può chiamare anche il server dei pagamenti, così la ricevuta
--    dell'acquisto online arriva per email da sola.
-- Si può eseguire più volte. Va dopo la 128.
-- =====================================================================

create or replace function registra_cliente(p_user uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid := (p->>'palestra_id')::uuid;
  v_email text := lower(nullif(trim(p->>'email'), ''));
  v_acc uuid; v_all uuid; v_ids uuid[] := '{}'; f jsonb; v_nascita date;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'non_autorizzato'; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_non_valida'; end if;
  if coalesce(trim(p->>'nome'), '') = '' or coalesce(trim(p->>'cognome'), '') = '' then raise exception 'nome_cognome'; end if;
  if exists (select 1 from account where palestra_id = v_pal and lower(email) = v_email) then raise exception 'email_gia_registrata'; end if;

  insert into account (palestra_id, user_id, nome, cognome, email, telefono, fonte, consenso_privacy_at, consenso_marketing)
  values (v_pal, p_user, initcap(trim(p->>'nome')), initcap(trim(p->>'cognome')), v_email, nullif(trim(p->>'telefono'), ''),
          'app', case when coalesce((p->>'privacy')::boolean, false) then now() end, coalesce((p->>'marketing')::boolean, false))
  returning id into v_acc;

  -- frequenta anche chi si registra
  if coalesce((p->>'frequenta')::boolean, false) then
    v_nascita := nullif(p->>'nascita', '')::date;
    if v_nascita is null or v_nascita > current_date - interval '14 years' then raise exception 'data_nascita'; end if;
    insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare, stato_lead)
    values (v_pal, v_acc, initcap(trim(p->>'nome')), initcap(trim(p->>'cognome')), v_nascita, true, 'nuovo')
    returning id into v_all;
    v_ids := v_ids || v_all;
  end if;
  -- i figli
  for f in select * from jsonb_array_elements(coalesce(p->'figli', '[]'::jsonb)) loop
    if coalesce(trim(f->>'nome'), '') = '' then continue; end if;
    v_nascita := nullif(f->>'nascita', '')::date;
    if v_nascita is null or v_nascita > current_date or v_nascita < current_date - interval '30 years' then raise exception 'data_nascita_figlio'; end if;
    insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare, stato_lead)
    values (v_pal, v_acc, initcap(trim(f->>'nome')), initcap(coalesce(nullif(trim(f->>'cognome'), ''), trim(p->>'cognome'))), v_nascita, false, 'nuovo')
    returning id into v_all;
    v_ids := v_ids || v_all;
  end loop;
  if array_length(v_ids, 1) is null then raise exception 'nessuno_frequenta'; end if;
  return jsonb_build_object('account_id', v_acc, 'allievi', to_jsonb(v_ids));
end $$;
revoke execute on function registra_cliente(uuid, jsonb) from public, anon, authenticated;
grant execute on function registra_cliente(uuid, jsonb) to service_role;

-- com'è andato l'acquisto con carta (lo vede solo chi l'ha fatto)
create or replace function esito_acquisto(p_session text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'stato', ao.stato, 'errore', ao.errore is not null,
    'persona', a.nome, 'corso', c.nome, 'abbonamento', t.nome,
    'dal', i.data_inizio, 'al', i.data_fine,
    'giorni', (select jsonb_agg(jsonb_build_object('giorno', o.giorno_settimana, 'ora', to_char(o.ora_inizio, 'HH24:MI')) order by o.giorno_settimana, o.ora_inizio)
                 from iscrizioni_orari io join orari o on o.id = io.orario_id where io.iscrizione_id = i.id),
    'ricevuta', (select r.token from ricevute r where r.pagamento_id = ao.pagamento_id and not r.annullata order by r.created_at desc limit 1),
    'certificato_ok', certificato_valido(a.id), 'allievo_token', a.token,
    'ricorrente', ao.ricorrente)
  from acquisti_online ao
  join account ac on ac.id = ao.account_id and ac.user_id = auth.uid()
  join allievi a on a.id = ao.allievo_id
  left join corsi c on c.id = ao.corso_id
  left join tipi_abbonamento t on t.id = ao.tipo_abbonamento_id
  left join iscrizioni i on i.id = ao.iscrizione_id
  where ao.stripe_session_id = p_session
  limit 1;
$$;
revoke execute on function esito_acquisto(text) from public, anon;
grant execute on function esito_acquisto(text) to authenticated;

CREATE OR REPLACE FUNCTION public.invia_ricevuta_email(p_id uuid, p_email text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r ricevute; p palestre; v_email text; v_link text; v_tipo text; v_chiave text;
begin
  select * into r from ricevute where id = p_id;
  if not found then raise exception 'ricevuta_non_trovata'; end if;
  if not (is_gestione(r.palestra_id) or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then raise exception 'non_autorizzato'; end if;
  select * into p from palestre where id = r.palestra_id;
  v_email := nullif(trim(p_email), '');
  if v_email is null then
    select ac.email into v_email from account ac where ac.id = r.account_id;
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_mancante'; end if;
  v_link := coalesce(nullif(p.sito_gestionale, ''), 'https://rm-house.vercel.app') || '/ricevuta/' || r.token;
  v_tipo := case r.tipo_documento when 'fattura' then 'Fattura' when 'nota_credito' then 'Nota di credito' else 'Ricevuta' end;
  -- la stessa ricevuta si può rimandare: la chiave cambia a ogni invio
  v_chiave := 'ricevuta:' || r.id || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  insert into messaggi_coda (palestra_id, account_id, allievo_id, evento, canale, destinatario, oggetto, corpo, chiave, programmato_per)
  values (r.palestra_id, r.account_id, r.allievo_id, 'ricevuta', 'email', v_email,
          v_tipo || ' n. ' || coalesce((select codice || ' ' from numerazioni where id = r.numerazione_id), '') || r.numero || '/' || r.anno || ' · ' || p.nome,
          'Gentile ' || r.intestatario || ',' || chr(10) || chr(10)
          || 'ecco il link alla ' || lower(v_tipo) || ' n. ' || r.numero || '/' || r.anno || ' del ' || to_char(r.data, 'DD/MM/YYYY')
          || ' di ' || replace(to_char((r.importo_cent + r.iva_cent) / 100.0, 'FM999999990.00'), '.', ',') || ' € (' || r.descrizione || ').' || chr(10) || chr(10)
          || 'Apri, stampa o salva in PDF da qui: ' || v_link || chr(10) || chr(10)
          || 'Grazie,' || chr(10) || p.nome,
          v_chiave, now());
  return v_email;
end $function$;
