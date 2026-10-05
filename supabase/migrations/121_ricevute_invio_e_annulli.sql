-- =====================================================================
-- RMHouse — 121 RICEVUTE: LINK DA MANDARE AL CLIENTE (WHATSAPP / EMAIL) E ANNULLO DI INCASSI DOPPI
-- 1. Ogni ricevuta/fattura ha un codice segreto (token): con quello il cliente la apre dal sito senza entrare,
--    da un link mandato su WhatsApp o per email (pagina /ricevuta/<token>).
-- 2. ricevuta_pubblica(p_token): i dati del documento e della scuola per quella pagina (solo con il token giusto).
-- 3. invia_ricevuta_email(p_id, p_email): mette in coda l'email con il link (la spedisce il solito cron ogni pochi minuti).
-- 4. annulla_pagamento impara ad annullare anche la ricevuta collegata (p_anche_ricevuta): un incasso registrato due volte
--    si toglie dalla scheda della persona in un colpo, con la sua ricevuta.
-- Si può eseguire più volte. Va dopo la 120.
-- =====================================================================

-- token lungo e casuale (due uuid senza trattini: 64 caratteri), senza dipendere da pgcrypto
create or replace function nuovo_token() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;
alter table ricevute add column if not exists token text;
update ricevute set token = nuovo_token() where token is null;
alter table ricevute alter column token set default nuovo_token();
alter table ricevute alter column token set not null;
create unique index if not exists ricevute_token_un on ricevute(token);

-- la pagina pubblica legge solo con il token (nessun elenco, nessuna ricerca)
create or replace function ricevuta_pubblica(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'numero', r.numero, 'anno', r.anno, 'data', r.data, 'tipo_documento', r.tipo_documento,
    'codice', n.codice, 'intestatario', r.intestatario, 'codice_fiscale', r.codice_fiscale, 'indirizzo', r.indirizzo,
    'descrizione', r.descrizione, 'importo_cent', r.importo_cent, 'iva_cent', r.iva_cent, 'aliquota', r.aliquota,
    'natura', r.natura, 'riferimento_iva', a.riferimento, 'percentuale_iva', a.percentuale, 'metodo', r.metodo, 'note', r.note,
    'annullata', r.annullata, 'motivo_annullo', r.motivo_annullo, 'bollo_cent', r.bollo_cent, 'cliente', r.cliente,
    'palestra', jsonb_build_object('nome', p.nome, 'indirizzo', p.indirizzo, 'telefono', p.telefono, 'email', p.email,
                                   'dati_fiscali', p.dati_fiscali, 'dicitura_ricevuta', p.dicitura_ricevuta, 'fatturazione', p.fatturazione,
                                   'logo_url', (select s.logo_url from sedi s where s.palestra_id = p.id and s.logo_url is not null
                                                 order by s.principale desc, s.ordine limit 1)))
    from ricevute r
    join palestre p on p.id = r.palestra_id
    left join numerazioni n on n.id = r.numerazione_id
    left join aliquote_iva a on a.id = r.aliquota_id
   where r.token = p_token and length(p_token) >= 16;
$$;
grant execute on function ricevuta_pubblica(text) to anon, authenticated;

-- l'email con il link al cliente: in coda, la manda il cron (stessa strada delle altre email)
create or replace function invia_ricevuta_email(p_id uuid, p_email text default null)
returns text language plpgsql security definer set search_path = public as $$
declare r ricevute; p palestre; v_email text; v_link text; v_tipo text; v_chiave text;
begin
  select * into r from ricevute where id = p_id;
  if not found then raise exception 'ricevuta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
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
end $$;
grant execute on function invia_ricevuta_email(uuid, text) to authenticated;

-- se la palestra non ha ancora la colonna con l'indirizzo del gestionale, la aggiungiamo (vuota = rm-house.vercel.app)
alter table palestre add column if not exists sito_gestionale text;

-- annulla_pagamento: anche la ricevuta collegata, se si vuole (incasso registrato due volte)
create or replace function annulla_pagamento(p_pagamento uuid, p_motivo text default null, p_anche_ricevuta boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare pg pagamenti; v_motivo text;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
  if pg.stato <> 'pagato' and pg.stato <> 'in_attesa' then raise exception 'gia_annullato'; end if;
  if pg.stripe_payment_intent is not null and pg.stato = 'pagato' then raise exception 'pagamento_online'; end if;

  update pagamenti set stato = 'annullato'::stato_pagamento,
         descrizione = descrizione || coalesce(' — annullato: ' || nullif(trim(p_motivo), ''), '')
   where id = p_pagamento;

  if p_anche_ricevuta then
    v_motivo := coalesce(nullif(trim(p_motivo), ''), 'incasso annullato');
    update ricevute set annullata = true, motivo_annullo = v_motivo
     where pagamento_id = p_pagamento and not annullata and tipo_documento in ('ricevuta', 'fattura');
  end if;
end $$;
drop function if exists annulla_pagamento(uuid, text);
grant execute on function annulla_pagamento(uuid, text, boolean) to authenticated;
