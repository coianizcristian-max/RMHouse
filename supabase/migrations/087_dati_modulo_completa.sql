-- 087 · Il modulo d'iscrizione fa completare i dati che mancano
-- Sopra il testo del modulo ci sono i dati dell'iscritto. Quelli che mancano (nascita, codice fiscale,
-- residenza, cellulare) diventano caselle da riempire: senza non si firma. Quello che si scrive
-- va anche nell'anagrafica (scheda della persona e di chi paga), che così si sistema da sola.
-- Rieseguibile.

-- 1. I dati per il modulo, con la residenza anche a pezzi (via, CAP, città, provincia)
create or replace function dati_modulo(p_allievo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a allievi; acc account; v_ind text; v_manca text[] := '{}'; v_tel text;
begin
  select * into a from allievi where id = p_allievo;
  if a.id is null then raise exception 'non_trovato'; end if;
  if not is_staff(a.palestra_id) and (a.account_id is null or a.account_id not in (select miei_account())) then
    raise exception 'non_autorizzato';
  end if;
  select * into acc from account where id = a.account_id;
  v_ind := coalesce(nullif(trim(a.indirizzo), ''),
                    case when coalesce(trim(acc.indirizzo), '') <> '' then
                      trim(concat_ws(' ', acc.indirizzo || ',', acc.cap, acc.citta,
                                     case when acc.provincia is not null then '(' || acc.provincia || ')' end)) end);
  v_tel := nullif(trim(coalesce(acc.telefono, '')), '');
  if a.data_nascita is null then v_manca := array_append(v_manca, 'data di nascita'); end if;
  if coalesce(trim(a.luogo_nascita), '') = '' then v_manca := array_append(v_manca, 'luogo di nascita'); end if;
  if coalesce(trim(a.codice_fiscale), '') = '' then v_manca := array_append(v_manca, 'codice fiscale'); end if;
  if v_ind is null then v_manca := array_append(v_manca, 'residenza'); end if;
  if v_tel is null then v_manca := array_append(v_manca, 'cellulare'); end if;

  return jsonb_build_object(
    'nome', trim(a.nome || ' ' || coalesce(a.cognome, '')),
    'titolare', a.is_titolare,
    'nato_a', a.luogo_nascita,
    'nato_il', a.data_nascita,
    'residenza', v_ind,
    'via', acc.indirizzo, 'cap', acc.cap, 'citta', acc.citta, 'provincia', acc.provincia,
    'cf', a.codice_fiscale,
    'cellulare', case when a.is_titolare then v_tel end,
    'email', case when a.is_titolare then acc.email end,
    'genitore', case when not a.is_titolare and acc.id is not null then jsonb_build_object(
                  'nome', trim(acc.nome || ' ' || coalesce(acc.cognome, '')), 'cellulare', v_tel,
                  'email', acc.email, 'cf', acc.codice_fiscale) end,
    'corsi', (select string_agg(distinct c.nome, ', ') from iscrizioni i join corsi c on c.id = i.corso_id
               where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa')
                 and (i.data_fine is null or i.data_fine >= current_date)),
    'data_prova', (select max(l.inizio)::date from prove pr join lezioni l on l.id = pr.lezione_id where pr.allievo_id = a.id),
    'data_iscrizione', (select min(i.data_inizio) from iscrizioni i where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa')
                         and (i.data_fine is null or i.data_fine >= current_date)),
    'tessera', a.tessera,
    'manca', to_jsonb(v_manca));
end $$;
revoke execute on function dati_modulo(uuid) from public, anon;
grant execute on function dati_modulo(uuid) to authenticated;

-- 2. Completa i dati dal modulo: scrive solo quello che arriva compilato, nella scheda giusta.
--    p: luogo_nascita, data_nascita, codice_fiscale, via, cap, citta, provincia, telefono
--    (il telefono è quello di chi paga: per un minore è del genitore)
create or replace function completa_dati_modulo(p_allievo uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; acc account; v_cf text; v_tel text; v_via text; v_gg int; v_sesso text;
begin
  select * into a from allievi where id = p_allievo;
  if a.id is null then raise exception 'non_trovato'; end if;
  if not is_staff(a.palestra_id) and (a.account_id is null or a.account_id not in (select miei_account())) then
    raise exception 'non_autorizzato';
  end if;
  select * into acc from account where id = a.account_id;

  v_cf := upper(regexp_replace(coalesce(p ->> 'codice_fiscale', ''), '\s', '', 'g'));
  if v_cf <> '' and v_cf !~ '^[A-Z0-9]{16}$' then raise exception 'codice_fiscale_non_valido'; end if;
  if nullif(p ->> 'data_nascita', '') is not null
     and ((p ->> 'data_nascita')::date > current_date or (p ->> 'data_nascita')::date < date '1900-01-01') then
    raise exception 'data_nascita_non_valida';
  end if;
  v_tel := regexp_replace(coalesce(p ->> 'telefono', ''), '[^0-9+]', '', 'g');
  if v_tel <> '' and length(regexp_replace(v_tel, '\D', '', 'g')) < 6 then raise exception 'telefono_non_valido'; end if;
  -- il sesso dal codice fiscale, se in scheda manca (serve per "nata/nato" e le tessere)
  if v_cf <> '' and a.sesso is null then
    v_gg := nullif(regexp_replace(translate(substr(v_cf, 10, 2), 'LMNPQRSTUV', '0123456789'), '\D', '', 'g'), '')::int;
    v_sesso := case when v_gg > 40 then 'F' when v_gg between 1 and 31 then 'M' end;
  end if;

  update allievi set
    codice_fiscale = coalesce(nullif(v_cf, ''), codice_fiscale),
    luogo_nascita  = coalesce(nullif(trim(p ->> 'luogo_nascita'), ''), luogo_nascita),
    data_nascita   = coalesce(nullif(p ->> 'data_nascita', '')::date, data_nascita),
    sesso          = coalesce(sesso, v_sesso)
  where id = a.id;

  -- residenza: va su chi paga (la famiglia) se è la persona stessa o se lì manca; altrimenti sulla persona
  v_via := nullif(trim(p ->> 'via'), '');
  if v_via is not null and acc.id is not null and (a.is_titolare or coalesce(trim(acc.indirizzo), '') = '') then
    update account set
      indirizzo = v_via,
      cap       = coalesce(nullif(trim(p ->> 'cap'), ''), cap),
      citta     = coalesce(nullif(trim(p ->> 'citta'), ''), citta),
      provincia = coalesce(nullif(upper(trim(p ->> 'provincia')), ''), provincia)
    where id = acc.id;
  elsif v_via is not null then
    update allievi set indirizzo = trim(concat_ws(' ', v_via || ',', nullif(trim(p ->> 'cap'), ''), nullif(trim(p ->> 'citta'), ''),
                                                  '(' || nullif(upper(trim(p ->> 'provincia')), '') || ')'))
    where id = a.id;
  end if;

  if v_tel <> '' and acc.id is not null then update account set telefono = v_tel where id = acc.id; end if;
  if a.is_titolare and v_cf <> '' and acc.id is not null and coalesce(acc.codice_fiscale, '') = '' then
    update account set codice_fiscale = v_cf where id = acc.id;
  end if;

  return dati_modulo(a.id);
end $$;
revoke execute on function completa_dati_modulo(uuid, jsonb) from public, anon;
grant execute on function completa_dati_modulo(uuid, jsonb) to authenticated;

-- 3. Un modulo con i dati non si firma finché mancano dati obbligatori
do $$
declare d text := pg_get_functiondef('firma_modulo(jsonb)'::regprocedure);
begin
  if position('dati_mancanti' in d) = 0 then
    d := replace(d, '  insert into firme (palestra_id, modulo_id, versione,',
      '  if m.con_dati and jsonb_array_length(coalesce(dati_modulo(a.id) -> ''manca'', ''[]''::jsonb)) > 0 then
    raise exception ''dati_mancanti'';
  end if;

  insert into firme (palestra_id, modulo_id, versione,');
    execute d;
  end if;
end $$;
revoke execute on function firma_modulo(jsonb) from public, anon;
grant execute on function firma_modulo(jsonb) to authenticated;
