-- 155 — Ricevute: filtri, statistiche e modifica
-- • cerca_ricevute(): periodo, metodo, tipo di abbonamento, documento e cliente (il genitore vede anche quelle dei
--   figli; il figlio solo le sue), con tutto quello che serve alla lista e alle statistiche.
-- • modifica_vendita(): cambia un abbonamento venduto (tipo, corso, date, giorni, prezzo, metodo, nota) e sistema
--   incasso e ricevuta: dati e metodo → la stessa ricevuta aggiornata; importo → la ricevuta viene annullata e se ne fa
--   una nuova (il numero vecchio resta, annullato, come vuole la numerazione).
-- • modifica_ricevuta(): lo stesso per le ricevute che non sono di un abbonamento (quote, workshop, altro).
-- Si può rilanciare.

drop function if exists cerca_ricevute(uuid, date, date, text[], uuid[], uuid, text[]);
create or replace function cerca_ricevute(p_palestra uuid, p_dal date, p_al date, p_metodi text[] default null,
                                          p_tipi uuid[] default null, p_allievo uuid default null, p_documenti text[] default null,
                                          p_account uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb; a allievi;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_allievo is not null then select * into a from allievi where id = p_allievo and palestra_id = p_palestra; end if;
  with base as (
    select r.*, n.codice, rif.tipo_documento as rif_tipo,
           i.id as iscrizione_id, i.tipo_abbonamento_id, t.nome as tipo_nome, c.nome as corso_nome,
           coalesce(r.allievo_id, pg.allievo_id, i.allievo_id) as chi_id, pg.causale,
           ac.email as acc_email, ac.telefono as acc_telefono, ac.nome as acc_nome
      from ricevute r
      left join numerazioni n on n.id = r.numerazione_id
      left join ricevute rif on rif.id = r.riferimento_id
      left join pagamenti pg on pg.id = r.pagamento_id
      left join lateral (select x.* from iscrizioni x where x.pagamento_id = r.pagamento_id limit 1) i on true
      left join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
      left join corsi c on c.id = i.corso_id
      left join account ac on ac.id = r.account_id
     where r.palestra_id = p_palestra and r.data between p_dal and p_al
       and (p_metodi is null or coalesce(r.metodo, '') = any (p_metodi))
       and (p_documenti is null or coalesce(r.tipo_documento, 'ricevuta') = any (p_documenti))
       and (p_tipi is null or i.tipo_abbonamento_id = any (p_tipi))
       -- chi paga (titolare) vede anche quelle dei figli; un figlio solo le sue
       and (p_account is null or r.account_id = p_account)
       and (p_allievo is null
            or (a.is_titolare and r.account_id = a.account_id)
            or (not a.is_titolare and (r.allievo_id = a.id or pg.allievo_id = a.id or i.allievo_id = a.id)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'tipo_documento', coalesce(b.tipo_documento, 'ricevuta'), 'codice', b.codice, 'numero', b.numero, 'anno', b.anno, 'data', b.data,
      'intestatario', b.intestatario, 'codice_fiscale', b.codice_fiscale, 'indirizzo', b.indirizzo, 'descrizione', b.descrizione,
      'importo_cent', b.importo_cent, 'iva_cent', b.iva_cent, 'metodo', b.metodo, 'annullata', b.annullata, 'motivo_annullo', b.motivo_annullo,
      'xml_scaricato_at', b.xml_scaricato_at, 'rif_tipo', b.rif_tipo, 'pagamento_id', b.pagamento_id, 'causale', b.causale,
      'iscrizione_id', b.iscrizione_id, 'tipo_abbonamento_id', b.tipo_abbonamento_id, 'tipo_nome', b.tipo_nome, 'corso_nome', b.corso_nome,
      'allievo_id', b.chi_id, 'cliente', (select trim(x.nome || ' ' || coalesce(x.cognome, '')) from allievi x where x.id = b.chi_id),
      'email', b.acc_email, 'telefono', b.acc_telefono, 'nome_account', b.acc_nome, 'token', b.token, 'note', b.note
    ) order by b.data desc, b.numero desc), '[]'::jsonb) into v
    from (select * from base order by data desc, numero desc limit 5000) b;
  return v;
end $$;
revoke all on function cerca_ricevute(uuid, date, date, text[], uuid[], uuid, text[], uuid) from public, anon;
grant execute on function cerca_ricevute(uuid, date, date, text[], uuid[], uuid, text[], uuid) to authenticated;

-- il cliente per il filtro: chi frequenta (allievi) e chi paga (account, es. il genitore)
create or replace function cerca_clienti_ricevute(p_palestra uuid, p_testo text)
returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare v jsonb; q text := lower(trim(coalesce(p_testo, ''))); parole text[];
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if length(q) < 2 then return '[]'::jsonb; end if;
  -- ogni parola scritta deve esserci, in qualunque ordine ("lara cogo" trova anche "Cogo Lara")
  parole := array(select w from unnest(regexp_split_to_array(q, '\s+')) w where w <> '');
  select coalesce(jsonb_agg(x order by (x->>'n')::int desc, x->>'testo'), '[]'::jsonb) into v from (
    select jsonb_build_object('tipo', 'allievo', 'id', a.id,
             'testo', trim(coalesce(a.cognome, '') || ' ' || a.nome),
             'sotto', case when a.is_titolare then 'paga da sé' else 'paga ' || trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')) end
                      || coalesce(' · ' || coalesce(nullif(ac.email, ''), ac.telefono), ''),
             'n', (select count(*) from ricevute r where r.palestra_id = p_palestra
                     and (r.allievo_id = a.id or (a.is_titolare and r.account_id = a.account_id)))) as x
      from allievi a left join account ac on ac.id = a.account_id
     where a.palestra_id = p_palestra
       and not exists (select 1 from unnest(parole) w where lower(a.nome || ' ' || coalesce(a.cognome, '')) not like '%' || w || '%')
    union all
    -- chi paga per altri (genitori): con le sue ricevute e quelle dei figli
    select jsonb_build_object('tipo', 'account', 'id', ac.id,
             'testo', trim(coalesce(ac.cognome, '') || ' ' || coalesce(ac.nome, '')),
             'sotto', 'paga per ' || (select string_agg(f.nome, ', ' order by f.nome) from allievi f where f.account_id = ac.id and not f.is_titolare)
                      || coalesce(' · ' || coalesce(nullif(ac.email, ''), ac.telefono), ''),
             'n', (select count(*) from ricevute r where r.palestra_id = p_palestra and r.account_id = ac.id))
      from account ac
     where ac.palestra_id = p_palestra
       and exists (select 1 from allievi f where f.account_id = ac.id and not f.is_titolare)
       and not exists (select 1 from unnest(parole) w where lower(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')) not like '%' || w || '%')
    limit 30
  ) s;
  return v;
end $f$;
revoke all on function cerca_clienti_ricevute(uuid, text) from public, anon;
grant execute on function cerca_clienti_ricevute(uuid, text) to authenticated;

-- la ricevuta (non annullata) di un incasso
create or replace function ricevuta_di(p_pagamento uuid) returns ricevute
language sql stable security definer set search_path = public as $$
  select * from ricevute where pagamento_id = p_pagamento and not annullata and coalesce(tipo_documento, 'ricevuta') in ('ricevuta', 'fattura')
   order by created_at desc limit 1
$$;
revoke all on function ricevuta_di(uuid) from public, anon, authenticated;

-- cambia un abbonamento venduto e sistema incasso e ricevuta
create or replace function modifica_vendita(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i iscrizioni; t tipi_abbonamento; a allievi; pg pagamenti; r ricevute;
  v_prezzo int; v_metodo text; v_corso uuid; v_descr text; v_nuova uuid; v_avvisi text[] := '{}';
  v_modificata boolean := false;
begin
  select * into i from iscrizioni where id = (p->>'iscrizione_id')::uuid;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_gestione(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = i.allievo_id;
  select * into t from tipi_abbonamento where id = coalesce(nullif(p->>'tipo_abbonamento_id', '')::uuid, i.tipo_abbonamento_id) and palestra_id = i.palestra_id;
  if not found then raise exception 'tipo_non_valido'; end if;
  v_corso := coalesce(nullif(p->>'corso_id', '')::uuid, i.corso_id);
  v_prezzo := nullif(p->>'prezzo_cent', '')::int;
  if v_prezzo is not null and v_prezzo < 0 then raise exception 'importo_non_valido'; end if;

  -- 1) l'abbonamento (tipo, date, prezzo come sconto sul listino, nota, ingressi)
  if v_corso is distinct from i.corso_id then
    update iscrizioni set corso_id = v_corso where id = i.id;
  end if;
  perform modifica_iscrizione(i.id, jsonb_strip_nulls(jsonb_build_object(
    'tipo_abbonamento_id', t.id, 'data_inizio', nullif(p->>'data_inizio', ''), 'data_fine', nullif(p->>'data_fine', ''),
    'sconto_cent', case when v_prezzo is null then null else greatest(coalesce(t.prezzo_cent, 0) - v_prezzo, 0) end,
    'ingressi_residui', nullif(p->>'ingressi', ''))) || case when p ? 'note' then jsonb_build_object('note', p->>'note') else '{}'::jsonb end);
  -- i giorni
  if p ? 'orari' and t.modalita = 'orari_fissi' then
    delete from iscrizioni_orari where iscrizione_id = i.id;
    insert into iscrizioni_orari (iscrizione_id, orario_id)
    select i.id, x::uuid from jsonb_array_elements_text(p->'orari') x
     where exists (select 1 from orari o where o.id = x::uuid and o.corso_id = v_corso)
    on conflict do nothing;
  end if;

  -- 2) l'incasso e la ricevuta
  v_descr := t.nome || ' · ' || coalesce((select nome from corsi where id = v_corso), '') || ' · ' || trim(a.nome || ' ' || coalesce(a.cognome, ''));
  v_metodo := nullif(p->>'metodo', '');
  if v_metodo is not null and v_metodo not in ('contanti', 'pos', 'bonifico', 'assegno', 'satispay', 'altro', 'online', 'da_incassare') then
    raise exception 'metodo_non_valido';
  end if;
  if i.pagamento_id is not null then select * into pg from pagamenti where id = i.pagamento_id; end if;

  if pg.id is null then
    -- non c'era un incasso (abbonamento gratuito): se ora ha un prezzo, si crea
    if coalesce(v_prezzo, 0) > 0 then
      pg.id := registra_incasso(jsonb_build_object('palestra_id', i.palestra_id, 'allievo_id', i.allievo_id, 'causale', 'abbonamento',
                 'corso_id', v_corso, 'importo_cent', v_prezzo, 'descrizione', v_descr,
                 'metodo', case when coalesce(v_metodo, 'da_incassare') = 'da_incassare' then 'contanti' else v_metodo end,
                 'incassato', coalesce(v_metodo, 'contanti') <> 'da_incassare'));
      update iscrizioni set pagamento_id = pg.id where id = i.id;
      if coalesce(v_metodo, 'contanti') <> 'da_incassare' then v_nuova := emetti_ricevuta(pg.id); end if;
    end if;
  else
    r := ricevuta_di(pg.id);
    -- metodo: "non pagato" o un modo di pagamento
    if v_metodo = 'da_incassare' and pg.stato = 'pagato' then
      if r.id is not null then
        perform annulla_ricevuta(r.id, 'abbonamento segnato come non pagato');
        v_avvisi := array_append(v_avvisi, 'ricevuta n. ' || r.numero || '/' || r.anno || ' annullata: l''abbonamento risulta non pagato');
        r := null;
      end if;
      update pagamenti set stato = 'in_attesa', pagato_at = null where id = pg.id;
      pg.stato := 'in_attesa';
    elsif v_metodo is not null and v_metodo <> 'da_incassare' and pg.stato = 'in_attesa' then
      perform segna_pagato(pg.id, v_metodo, now());
      pg.stato := 'pagato'; pg.metodo := v_metodo;
    elsif v_metodo is not null and v_metodo <> 'da_incassare' and v_metodo is distinct from pg.metodo then
      update pagamenti set metodo = v_metodo where id = pg.id;
      if r.id is not null then update ricevute set metodo = v_metodo where id = r.id; v_modificata := true; end if;
    end if;
    -- descrizione (tipo, corso, nome)
    if v_descr is distinct from pg.descrizione then
      update pagamenti set descrizione = v_descr, corso_id = v_corso where id = pg.id;
      if r.id is not null then update ricevute set descrizione = v_descr where id = r.id; v_modificata := true; end if;
    end if;
    -- importo: la ricevuta vecchia si annulla e se ne fa una nuova
    if v_prezzo is not null and v_prezzo <> pg.importo_cent then
      if v_prezzo = 0 then
        if r.id is not null then perform annulla_ricevuta(r.id, 'abbonamento diventato gratuito'); end if;
        update pagamenti set stato = 'annullato' where id = pg.id;
        update iscrizioni set pagamento_id = null where id = i.id;
        r := null; v_modificata := false;
      else
        update pagamenti set importo_cent = v_prezzo where id = pg.id;
        if r.id is not null then
          perform annulla_ricevuta(r.id, 'importo corretto da ' || eur_txt(r.importo_cent + r.iva_cent) || ' a ' || eur_txt(v_prezzo));
          v_modificata := false;
        end if;
      end if;
    end if;
    -- ricevuta nuova se l'incasso è pagato e non ne ha più una valida
    if v_prezzo is distinct from 0 and (select stato from pagamenti where id = pg.id) = 'pagato'
       and (ricevuta_di(pg.id)).id is null and coalesce((p->>'ricevuta')::boolean, true) then
      v_nuova := emetti_ricevuta(pg.id);
      if r.id is not null then
        update ricevute set motivo_annullo = motivo_annullo || ' · sostituita dalla n. '
               || (select numero || '/' || anno from ricevute where id = v_nuova) where id = r.id;
      end if;
    end if;
  end if;

  return jsonb_build_object('iscrizione_id', i.id, 'ricevuta_vecchia', r.id, 'ricevuta_nuova', v_nuova,
                            'ricevuta_modificata', case when v_modificata then r.id end, 'avvisi', to_jsonb(v_avvisi));
end $$;
revoke all on function modifica_vendita(jsonb) from public, anon;
grant execute on function modifica_vendita(jsonb) to authenticated;

-- le altre ricevute: intestatario, codice fiscale, indirizzo, descrizione, metodo (stessa ricevuta); importo (nuova)
create or replace function modifica_ricevuta(p_id uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r ricevute; v_imp int; v_nuova uuid; v_metodo text;
begin
  select * into r from ricevute where id = p_id;
  if not found then raise exception 'ricevuta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if r.annullata then raise exception 'ricevuta_annullata'; end if;
  if coalesce(r.tipo_documento, 'ricevuta') <> 'ricevuta' then raise exception 'solo_ricevute'; end if;
  v_metodo := nullif(p->>'metodo', '');
  if v_metodo is not null and v_metodo not in ('contanti', 'pos', 'bonifico', 'assegno', 'satispay', 'altro', 'online') then raise exception 'metodo_non_valido'; end if;
  update ricevute set
    intestatario = coalesce(nullif(trim(p->>'intestatario'), ''), intestatario),
    codice_fiscale = case when p ? 'codice_fiscale' then nullif(upper(replace(p->>'codice_fiscale', ' ', '')), '') else codice_fiscale end,
    indirizzo = case when p ? 'indirizzo' then nullif(trim(p->>'indirizzo'), '') else indirizzo end,
    descrizione = coalesce(nullif(trim(p->>'descrizione'), ''), descrizione),
    metodo = coalesce(v_metodo, metodo)
   where id = r.id;
  if r.pagamento_id is not null then
    update pagamenti set descrizione = coalesce(nullif(trim(p->>'descrizione'), ''), descrizione), metodo = coalesce(v_metodo, metodo)
     where id = r.pagamento_id;
  end if;
  v_imp := nullif(p->>'importo_cent', '')::int;
  if v_imp is not null and v_imp <> r.importo_cent + r.iva_cent then
    if v_imp <= 0 then raise exception 'importo_non_valido'; end if;
    if r.pagamento_id is null then raise exception 'senza_incasso'; end if;
    update pagamenti set importo_cent = v_imp where id = r.pagamento_id;
    perform annulla_ricevuta(r.id, 'importo corretto da ' || eur_txt(r.importo_cent + r.iva_cent) || ' a ' || eur_txt(v_imp));
    v_nuova := emetti_ricevuta(r.pagamento_id);
    -- i dati scritti a mano restano anche sulla nuova
    update ricevute n set intestatario = x.intestatario, codice_fiscale = x.codice_fiscale, indirizzo = x.indirizzo, descrizione = x.descrizione
      from ricevute x where n.id = v_nuova and x.id = r.id;
    update ricevute set motivo_annullo = motivo_annullo || ' · sostituita dalla n. ' || (select numero || '/' || anno from ricevute where id = v_nuova)
     where id = r.id;
  end if;
  return jsonb_build_object('ricevuta', coalesce(v_nuova, r.id), 'nuova', v_nuova is not null);
end $$;
revoke all on function modifica_ricevuta(uuid, jsonb) from public, anon;
grant execute on function modifica_ricevuta(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
