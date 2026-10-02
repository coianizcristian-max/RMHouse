-- 088 · Fatture con IVA (es. 22%) per le attività commerciali
-- Per quote e corsi si continua con la ricevuta (IVA 0 / esente). Per le attività commerciali (affitto sale,
-- feste, eventi per esterni, sponsor…) dall'incasso si emette una FATTURA: numerazione propria "FT",
-- IVA scorporata dall'importo incassato, PDF di cortesia e file XML della fattura elettronica (FPR12)
-- da caricare gratis sul portale "Fatture e Corrispettivi" dell'Agenzia delle Entrate o da girare al commercialista.
-- Un incasso ha o la ricevuta o la fattura, non tutte e due. Rieseguibile.

-- 1. Il nuovo tipo di documento
alter table numerazioni drop constraint if exists numerazioni_tipo_documento_check;
alter table numerazioni add constraint numerazioni_tipo_documento_check
  check (tipo_documento in ('ricevuta', 'nota_credito', 'fattura'));
alter table ricevute drop constraint if exists ricevute_tipo_documento_check;
alter table ricevute add constraint ricevute_tipo_documento_check
  check (tipo_documento in ('ricevuta', 'nota_credito', 'fattura'));

insert into numerazioni (palestra_id, codice, nome, tipo_documento, predefinita)
select p.id, 'FT', 'Fatture', 'fattura', true from palestre p
on conflict (palestra_id, codice) do nothing;

-- 2. I dati della scuola per la fattura elettronica (Struttura → Sede e contatti)
--    { denominazione, piva, cf, regime, indirizzo, cap, comune, provincia }
alter table palestre add column if not exists fatturazione jsonb not null default '{}'::jsonb;
update palestre set fatturazione = jsonb_build_object(
    'denominazione', 'Ritmo Metropolitano S.S.D. a R.L.', 'piva', '03983880240', 'cf', '03983880240',
    'regime', 'RF18', 'indirizzo', 'Via Artigianato 24', 'cap', '36100', 'comune', 'Vicenza', 'provincia', 'VI')
 where slug = 'rmhouse' and fatturazione = '{}'::jsonb;

-- 3. Sul documento: il cliente completo (persona o azienda, P.IVA, codice destinatario o PEC), bollo, XML
alter table ricevute add column if not exists cliente jsonb;
alter table ricevute add column if not exists bollo_cent integer not null default 0;
alter table ricevute add column if not exists xml_scaricato_at timestamptz;
-- i dati di fatturazione di chi paga, per non riscriverli la volta dopo
alter table account add column if not exists dati_fattura jsonb;

-- 4. La ricevuta non si emette se l'incasso ha già una fattura (e viceversa)
do $$
declare d text := pg_get_functiondef('emetti_ricevuta(uuid, date, text)'::regprocedure);
begin
  if position('''ricevuta'', ''fattura''' in d) = 0 then
    execute replace(d, 'and not r.annullata and r.tipo_documento = ''ricevuta'') then',
                       'and not r.annullata and r.tipo_documento in (''ricevuta'', ''fattura'')) then');
  end if;
end $$;

-- 5. Cosa proporre nel modulo della fattura: dati del cliente e aliquote
create or replace function dati_per_fattura(p_pagamento uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg pagamenti; acc account; v_al uuid;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into acc from account where id = pg.account_id;
  -- aliquota proposta: quella del listino se è un'aliquota con IVA, altrimenti la 22%
  select id into v_al from aliquote_iva where id = aliquota_di_pagamento(pg.id) and percentuale > 0;
  if v_al is null then
    select id into v_al from aliquote_iva where palestra_id = pg.palestra_id and attiva and percentuale = 22 order by ordine limit 1;
  end if;
  return jsonb_build_object(
    'importo_cent', pg.importo_cent, 'descrizione', pg.descrizione, 'stato', pg.stato, 'metodo', pg.metodo,
    'aliquota_id', v_al,
    'aliquote', (select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'percentuale', percentuale, 'natura', natura) order by ordine)
                   from aliquote_iva where palestra_id = pg.palestra_id and attiva),
    'cliente', coalesce(acc.dati_fattura, case when acc.id is not null then jsonb_build_object(
                 'tipo', 'persona', 'nome', acc.nome, 'cognome', acc.cognome, 'cf', acc.codice_fiscale,
                 'indirizzo', acc.indirizzo, 'cap', acc.cap, 'comune', acc.citta, 'provincia', acc.provincia,
                 'codice_destinatario', '0000000') end),
    'scuola_pronta', (select coalesce(fatturazione ->> 'piva', '') <> '' and coalesce(fatturazione ->> 'regime', '') <> ''
                             and coalesce(fatturazione ->> 'indirizzo', '') <> '' from palestre where id = pg.palestra_id));
end $$;
revoke execute on function dati_per_fattura(uuid) from public, anon;
grant execute on function dati_per_fattura(uuid) to authenticated;

-- 6. Emette la fattura di un incasso
--    p: { cliente: {tipo persona|azienda, nome, cognome, denominazione, piva, cf, indirizzo, cap, comune, provincia,
--         nazione, codice_destinatario, pec}, aliquota_id, descrizione, data, note }
create or replace function emetti_fattura(p_pagamento uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pg pagamenti; al aliquote_iva; c jsonb := coalesce(p -> 'cliente', '{}'::jsonb); v_numerazione uuid;
        v_anno int; v_num int; v_id uuid; v_imponibile int; v_iva int; v_data date; v_allievo uuid;
        v_nome text; v_piva text; v_cf text; v_cod text; v_pec text; v_naz text;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
  if pg.stato <> 'pagato' then raise exception 'pagamento_non_incassato'; end if;
  if exists (select 1 from ricevute r where r.pagamento_id = pg.id and not r.annullata and r.tipo_documento in ('ricevuta', 'fattura')) then
    raise exception 'documento_gia_emesso';
  end if;
  if not exists (select 1 from palestre where id = pg.palestra_id and coalesce(fatturazione ->> 'piva', '') <> ''
                   and coalesce(fatturazione ->> 'regime', '') <> '' and coalesce(fatturazione ->> 'indirizzo', '') <> '') then
    raise exception 'dati_scuola_mancanti';
  end if;

  -- il cliente: azienda con P.IVA, oppure persona con codice fiscale (e P.IVA se ce l'ha)
  v_naz  := upper(coalesce(nullif(trim(c ->> 'nazione'), ''), 'IT'));
  v_piva := nullif(regexp_replace(upper(coalesce(c ->> 'piva', '')), '[^A-Z0-9]', '', 'g'), '');
  v_cf   := nullif(regexp_replace(upper(coalesce(c ->> 'cf', '')), '\s', '', 'g'), '');
  if c ->> 'tipo' = 'azienda' then
    v_nome := nullif(trim(c ->> 'denominazione'), '');
    if v_nome is null then raise exception 'cliente_denominazione'; end if;
    if v_piva is null then raise exception 'cliente_piva'; end if;
  else
    v_nome := nullif(trim(coalesce(c ->> 'nome', '') || ' ' || coalesce(c ->> 'cognome', '')), '');
    if coalesce(trim(c ->> 'nome'), '') = '' or coalesce(trim(c ->> 'cognome'), '') = '' then raise exception 'cliente_nome'; end if;
    if v_cf is null and v_piva is null then raise exception 'cliente_cf'; end if;
  end if;
  if v_naz = 'IT' and v_piva is not null and v_piva !~ '^[0-9]{11}$' then raise exception 'cliente_piva'; end if;
  if v_naz = 'IT' and v_cf is not null and v_cf !~ '^([A-Z0-9]{16}|[0-9]{11})$' then raise exception 'cliente_cf'; end if;
  if coalesce(trim(c ->> 'indirizzo'), '') = '' or coalesce(trim(c ->> 'comune'), '') = ''
     or (v_naz = 'IT' and coalesce(trim(c ->> 'cap'), '') !~ '^[0-9]{5}$') then raise exception 'cliente_indirizzo'; end if;
  v_cod := upper(coalesce(nullif(trim(c ->> 'codice_destinatario'), ''), case when v_naz = 'IT' then '0000000' else 'XXXXXXX' end));
  if v_cod !~ '^[A-Z0-9]{6,7}$' then raise exception 'cliente_codice'; end if;
  v_pec := nullif(trim(c ->> 'pec'), '');
  if v_pec is not null and v_pec !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'cliente_pec'; end if;

  select * into al from aliquote_iva where id = (p ->> 'aliquota_id')::uuid and palestra_id = pg.palestra_id;
  if al.id is null then raise exception 'aliquota_mancante'; end if;
  if coalesce(al.percentuale, 0) = 0 and coalesce(al.natura, '') = '' then raise exception 'aliquota_senza_natura'; end if;

  select id into v_numerazione from numerazioni
   where palestra_id = pg.palestra_id and tipo_documento = 'fattura' and predefinita and attiva limit 1;
  if v_numerazione is null then raise exception 'numerazione_mancante'; end if;

  v_data := coalesce(nullif(p ->> 'data', '')::date, current_date);
  if v_data > current_date then raise exception 'data_futura'; end if;
  v_anno := extract(year from v_data)::int;
  v_num := prossimo_numero(v_numerazione, v_anno);
  -- la numerazione deve andare avanti anche con le date: niente fattura con data prima dell'ultima emessa
  if exists (select 1 from ricevute where numerazione_id = v_numerazione and anno = v_anno and data > v_data and not annullata) then
    raise exception 'data_prima_ultima';
  end if;

  -- l'importo incassato è IVA compresa: si scorpora
  v_imponibile := round(pg.importo_cent / (1 + coalesce(al.percentuale, 0) / 100.0));
  v_iva := pg.importo_cent - v_imponibile;
  v_allievo := coalesce(pg.allievo_id, (select allievo_id from iscrizioni where pagamento_id = pg.id limit 1));

  c := c || jsonb_build_object('nazione', v_naz, 'piva', v_piva, 'cf', v_cf, 'codice_destinatario', v_cod, 'pec', v_pec,
                               'provincia', upper(coalesce(c ->> 'provincia', '')));

  insert into ricevute (palestra_id, numerazione_id, tipo_documento, numero, anno, data, pagamento_id, account_id, allievo_id,
                        intestatario, codice_fiscale, indirizzo, descrizione, importo_cent, iva_cent, aliquota,
                        aliquota_id, natura, metodo, note, cliente, bollo_cent)
  values (pg.palestra_id, v_numerazione, 'fattura', v_num, v_anno, v_data, pg.id, pg.account_id, v_allievo,
          v_nome, coalesce(v_cf, v_piva),
          concat_ws(', ', trim(c ->> 'indirizzo'), trim(concat_ws(' ', c ->> 'cap', c ->> 'comune',
                    case when coalesce(c ->> 'provincia', '') <> '' then '(' || upper(c ->> 'provincia') || ')' end))),
          coalesce(nullif(trim(p ->> 'descrizione'), ''), pg.descrizione), v_imponibile, v_iva, al.nome, al.id, al.natura,
          pg.metodo, nullif(trim(p ->> 'note'), ''), c,
          -- bollo da 2 € sulle fatture senza IVA sopra 77,47 € (assolto in modo virtuale)
          case when v_iva = 0 and pg.importo_cent > 7747 then 200 else 0 end)
  returning id into v_id;

  if pg.account_id is not null then update account set dati_fattura = c where id = pg.account_id; end if;
  return v_id;
end $$;
revoke execute on function emetti_fattura(uuid, jsonb) from public, anon;
grant execute on function emetti_fattura(uuid, jsonb) to authenticated;

-- 7. Segna che l'XML è stato scaricato (per sapere cosa resta da caricare sul portale)
create or replace function segna_xml_scaricato(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update ricevute set xml_scaricato_at = coalesce(xml_scaricato_at, now())
   where id = p_id and tipo_documento = 'fattura' and is_gestione(palestra_id);
end $$;
revoke execute on function segna_xml_scaricato(uuid) from public, anon;
grant execute on function segna_xml_scaricato(uuid) to authenticated;
