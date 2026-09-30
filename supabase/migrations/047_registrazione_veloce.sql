-- =====================================================================
-- RMHouse — 047 REGISTRAZIONE VELOCE
--
-- 1. crea_persona salva anche codice fiscale, sesso e telefono di chi
--    frequenta (prima si perdevano per i figli).
-- 2. cerca_doppioni: mentre si scrive, dice se la persona c'è già
--    (stesso codice fiscale, email, telefono o nome e cognome).
-- Da eseguire dopo la 046. Si può rieseguire.
-- =====================================================================

create or replace function crea_persona(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid := (p->>'palestra_id')::uuid;
  v_email text := lower(nullif(trim(p->'titolare'->>'email'), ''));
  v_acc uuid; v_all uuid; v_nuovo_acc boolean := false;
  v_nome text; v_cognome text; v_nascita date; v_cf text; v_sesso text; v_luogo text;
  v_figlio boolean := coalesce(trim(p->'allievo'->>'nome'), '') <> '';
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if coalesce(trim(p->'titolare'->>'nome'), '') = '' then raise exception 'nome_mancante'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_non_valida'; end if;

  -- titolare: se è indicato o se l'email esiste già si riusa quell'anagrafica
  if nullif(p->>'account_id', '') is not null then
    v_acc := (p->>'account_id')::uuid;
  else
    if v_email is not null then
      select id into v_acc from account where palestra_id = v_pal and lower(email) = v_email;
    end if;
    if v_acc is null then
      insert into account (palestra_id, nome, cognome, email, telefono, codice_fiscale,
                           indirizzo, cap, citta, provincia, fonte, note,
                           consenso_privacy_at, consenso_marketing)
      values (v_pal, trim(p->'titolare'->>'nome'), nullif(trim(p->'titolare'->>'cognome'), ''),
              v_email, nullif(trim(p->'titolare'->>'telefono'), ''),
              upper(nullif(trim(p->'titolare'->>'codice_fiscale'), '')),
              nullif(trim(p->'titolare'->>'indirizzo'), ''), nullif(trim(p->'titolare'->>'cap'), ''),
              nullif(trim(p->'titolare'->>'citta'), ''), upper(nullif(trim(p->'titolare'->>'provincia'), '')),
              coalesce(nullif(p->>'fonte', ''), 'segreteria'), nullif(p->>'note', ''),
              case when coalesce((p->>'consenso_privacy')::boolean, false) then now() end,
              coalesce((p->>'consenso_marketing')::boolean, false))
      returning id into v_acc;
      v_nuovo_acc := true;
    else
      update account set
        telefono = coalesce(nullif(trim(p->'titolare'->>'telefono'), ''), telefono),
        codice_fiscale = coalesce(upper(nullif(trim(p->'titolare'->>'codice_fiscale'), '')), codice_fiscale),
        indirizzo = coalesce(nullif(trim(p->'titolare'->>'indirizzo'), ''), indirizzo),
        cap = coalesce(nullif(trim(p->'titolare'->>'cap'), ''), cap),
        citta = coalesce(nullif(trim(p->'titolare'->>'citta'), ''), citta),
        provincia = coalesce(upper(nullif(trim(p->'titolare'->>'provincia'), '')), provincia),
        consenso_privacy_at = coalesce(consenso_privacy_at,
          case when coalesce((p->>'consenso_privacy')::boolean, false) then now() end)
      where id = v_acc;
    end if;
  end if;

  -- chi frequenta: il titolare stesso oppure un figlio
  if not v_figlio then
    v_nome := trim(p->'titolare'->>'nome');
    v_cognome := nullif(trim(p->'titolare'->>'cognome'), '');
    v_nascita := nullif(p->'titolare'->>'data_nascita', '')::date;
    v_cf := upper(nullif(trim(p->'titolare'->>'codice_fiscale'), ''));
    v_sesso := nullif(p->'titolare'->>'sesso', '');
  else
    v_nome := trim(p->'allievo'->>'nome');
    v_cognome := nullif(trim(p->'allievo'->>'cognome'), '');
    v_nascita := nullif(p->'allievo'->>'data_nascita', '')::date;
    v_cf := upper(nullif(trim(p->'allievo'->>'codice_fiscale'), ''));
    v_sesso := nullif(p->'allievo'->>'sesso', '');
  end if;
  if v_nascita is null then raise exception 'data_nascita_mancante'; end if;
  if v_sesso is not null and v_sesso not in ('M', 'F') then v_sesso := null; end if;

  select id into v_all from allievi
   where account_id = v_acc and lower(nome) = lower(v_nome) and data_nascita = v_nascita;

  if v_all is null then
    insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare,
                         codice_fiscale, sesso, certificato_scadenza, stato_lead, note)
    values (v_pal, v_acc, v_nome, coalesce(v_cognome, ''), v_nascita, not v_figlio,
            v_cf, v_sesso, nullif(p->>'certificato_scadenza', '')::date,
            'iscritto', nullif(p->>'note_allievo', ''))
    returning id into v_all;
  else
    update allievi set codice_fiscale = coalesce(codice_fiscale, v_cf), sesso = coalesce(sesso, v_sesso),
           certificato_scadenza = coalesce(nullif(p->>'certificato_scadenza', '')::date, certificato_scadenza)
     where id = v_all;
  end if;

  return jsonb_build_object('account_id', v_acc, 'allievo_id', v_all, 'account_nuovo', v_nuovo_acc);
end $$;

-- Possibili doppioni mentre si scrive: il più probabile per primo
create or replace function cerca_doppioni(p_palestra uuid, p_nome text, p_cognome text, p_email text,
                                          p_telefono text, p_cf text)
returns table (allievo_id uuid, account_id uuid, nome text, cognome text, data_nascita date,
               email text, telefono text, motivo text)
language sql stable security invoker set search_path = public as $$
  with t as (
    select nullif(right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9), '') as tel,
           lower(nullif(trim(p_email), '')) as em, upper(nullif(trim(p_cf), '')) as cf,
           lower(trim(coalesce(p_nome, ''))) as n, lower(trim(coalesce(p_cognome, ''))) as c
  )
  select a.id, a.account_id, a.nome, a.cognome, a.data_nascita, acc.email, acc.telefono,
         case when t.cf is not null and upper(a.codice_fiscale) = t.cf then 'stesso codice fiscale'
              when t.em is not null and lower(acc.email) = t.em then 'stessa email'
              when t.tel is not null and length(t.tel) >= 8
                   and right(regexp_replace(coalesce(acc.telefono, ''), '\D', '', 'g'), 9) = t.tel then 'stesso telefono'
              else 'stesso nome e cognome' end
  from t, allievi a join account acc on acc.id = a.account_id
  where a.palestra_id = p_palestra and a.cognome <> 'anonimizzata'
    and ((t.cf is not null and upper(a.codice_fiscale) = t.cf)
      or (t.em is not null and lower(acc.email) = t.em)
      or (t.tel is not null and length(t.tel) >= 8 and right(regexp_replace(coalesce(acc.telefono, ''), '\D', '', 'g'), 9) = t.tel)
      or (length(t.n) >= 2 and length(t.c) >= 2 and lower(a.nome) = t.n and lower(a.cognome) = t.c))
  order by 8, a.cognome
  limit 6;
$$;
grant execute on function cerca_doppioni(uuid, text, text, text, text, text) to authenticated;

select 'registrazione veloce pronta' as esito;
