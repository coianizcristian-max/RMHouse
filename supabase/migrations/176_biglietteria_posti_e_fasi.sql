-- 176 — Biglietteria: posti per allievo finiti, periodo libero, posti in sala
-- • La conferma dell'allievo dice quanti posti ha già prenotati (la pagina avvisa se sono finiti).
-- • Contributo "a prenotazione" (es. 10 €): se per lo stesso allievo c'è già una prenotazione valida non si paga di
--   nuovo (nel periodo libero si possono aggiungere posti per lo stesso allievo: si pagano solo quelli nuovi).
-- • La pagina pubblica riceve la fase dell'evento (posti riservati / aperti a tutti) e la capienza.
-- • Nelle email e nelle pagine dopo la conferma: «Per eventuali modifiche alla prenotazione rivolgiti alla segreteria».
-- • La segreteria può modificare una prenotazione (biglietteria_modifica): dati di chi prenota e nomi delle persone
--   sempre; finché non è pagata anche quante persone e le opzioni extra (il totale si ricalcola e, se cambia,
--   riparte il promemoria di pagamento con il nuovo importo).
-- Va dopo la 170–175. Si può rilanciare.

create or replace function biglietteria_verifica(p_allievo uuid, p_nascita date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a biglietteria_allievi; s biglietteria_spettacoli;
begin
  select * into a from biglietteria_allievi where id = p_allievo for update;
  if not found then return jsonb_build_object('ok', false, 'errore', 'allievo_non_trovato'); end if;
  if a.errori_dal is not null and a.errori_dal < now() - interval '1 day' then
    update biglietteria_allievi set errori_nascita = 0, errori_dal = null where id = a.id;
    a.errori_nascita := 0;
  end if;
  select * into s from biglietteria_spettacoli where id = a.spettacolo_id;
  if a.errori_nascita >= 8 and s.chiedi_nascita then return jsonb_build_object('ok', false, 'errore', 'troppi_tentativi'); end if;
  if s.chiedi_nascita and a.data_nascita is not null and a.data_nascita is distinct from p_nascita then
    update biglietteria_allievi set errori_nascita = errori_nascita + 1, errori_dal = coalesce(errori_dal, now()) where id = a.id;
    return jsonb_build_object('ok', false, 'errore', 'nascita_errata');
  end if;
  return jsonb_build_object('ok', true, 'nome', btrim(a.nome || ' ' || a.cognome), 'gruppo', a.gruppo,
                            'spettacolo', s.titolo, 'senza_data', a.data_nascita is null or not s.chiedi_nascita,
                            'rimasti', greatest(s.posti_per_allievo - biglietteria_occupati(s.id, a.id), 0),
                            'gia_prenotati', biglietteria_occupati(s.id, a.id),
                            'contributo_gia', not s.contributo_per_posto and s.contributo_cent > 0 and biglietteria_occupati(s.id, a.id) > 0);
end $$;
revoke all on function biglietteria_verifica(uuid, date) from public, anon, authenticated;
grant execute on function biglietteria_verifica(uuid, date) to service_role;


create or replace function biglietteria_prenota(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s biglietteria_spettacoli; b biglietterie; al biglietteria_allievi; v_posti int; v_pizze int; v_offerta int;
        v_contr int; v_tot int; v_id uuid; v_cod text; v_stato text; v_occ int; v_email text; v_token uuid; v_ver jsonb;
        v_part jsonb := '[]'; x jsonb; v_doppio text; v_visti text[] := '{}'; v_n text;
        v_extra jsonb := '[]'; v_ext_tot int := 0; ex jsonb; opt jsonb; v_q int;
begin
  select * into s from biglietteria_spettacoli where id = nullif(p->>'spettacolo_id', '')::uuid;
  if not found then raise exception 'spettacolo_non_trovato'; end if;
  select * into b from biglietterie where id = s.biglietteria_id;
  if not b.aperta or s.chiuso or s.inizio < now() then raise exception 'prenotazioni_chiuse'; end if;

  v_posti := coalesce((p->>'posti')::int, 0);
  if v_posti < 1 or v_posti > s.max_per_prenotazione then raise exception 'posti_non_validi'; end if;
  -- opzioni extra: p->'extra' = [{id, quantita}]; prezzi e scadenze presi dall'evento, mai dal browser
  v_pizze := 0;
  for ex in select * from jsonb_array_elements(case when jsonb_typeof(p->'extra') = 'array' then p->'extra' else '[]'::jsonb end) loop
    v_q := coalesce((ex->>'quantita')::int, 0);
    continue when v_q = 0;
    if v_q < 0 or v_q > 50 then raise exception 'extra_non_valido'; end if;
    select o into opt from jsonb_array_elements(s.extra) o where o->>'id' = ex->>'id';
    if opt is null then raise exception 'extra_non_valido'; end if;
    if nullif(opt->>'entro', '') is not null and current_date > (opt->>'entro')::date then raise exception 'extra_chiuso:%', opt->>'nome'; end if;
    v_extra := v_extra || jsonb_build_object('id', opt->>'id', 'nome', opt->>'nome', 'quantita', v_q, 'prezzo_cent', coalesce((opt->>'prezzo_cent')::int, 0));
    v_ext_tot := v_ext_tot + v_q * coalesce((opt->>'prezzo_cent')::int, 0);
    v_pizze := v_pizze + v_q;
  end loop;
  v_offerta := case when s.offerta_libera then greatest(coalesce((p->>'offerta_cent')::int, 0), 0) else 0 end;
  if v_offerta > 100000 then raise exception 'offerta_non_valida'; end if;
  v_email := lower(btrim(coalesce(p->>'email', '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_non_valida'; end if;
  if length(btrim(coalesce(p->>'nome', ''))) < 1 or length(btrim(coalesce(p->>'cognome', ''))) < 1 then raise exception 'dati_mancanti'; end if;

  -- i nominativi: uno per posto, tutti diversi
  if coalesce(jsonb_typeof(p->'partecipanti'), '') <> 'array' or jsonb_array_length(p->'partecipanti') <> v_posti then raise exception 'nominativi_mancanti'; end if;
  for x in select * from jsonb_array_elements(p->'partecipanti') loop
    if length(btrim(coalesce(x->>'nome', ''))) < 1 or length(btrim(coalesce(x->>'cognome', ''))) < 1 then raise exception 'nominativi_mancanti'; end if;
    v_n := nome_norm(x->>'nome', x->>'cognome');
    if v_n = any(v_visti) then raise exception 'nominativo_ripetuto:%', btrim(x->>'nome') || ' ' || btrim(x->>'cognome'); end if;
    v_visti := v_visti || v_n;
    v_part := v_part || jsonb_build_array(jsonb_build_object('nome', left(btrim(x->>'nome'), 60), 'cognome', left(btrim(x->>'cognome'), 60)));
  end loop;

  -- un pagamento alla volta per spettacolo: niente doppioni accidentali (stessa email, stesso allievo, in attesa)
  perform pg_advisory_xact_lock(hashtext('biglietteria:' || s.id));

  -- la stessa persona non può essere già prenotata a questo spettacolo (pagata, gratis o in attesa di pagamento)
  select e->>'nome' || ' ' || (e->>'cognome') into v_doppio
    from biglietteria_prenotazioni q, jsonb_array_elements(q.partecipanti) e
   where q.spettacolo_id = s.id
     and (q.stato in ('pagata', 'gratis') or (q.stato = 'da_pagare' and (q.scade_at is null or q.scade_at > now())))
     and nome_norm(e->>'nome', e->>'cognome') = any(v_visti)
   limit 1;
  if v_doppio is not null then raise exception 'nominativo_doppio:%', v_doppio; end if;

  if nullif(p->>'allievo_id', '') is not null then
    select * into al from biglietteria_allievi where id = (p->>'allievo_id')::uuid and spettacolo_id = s.id;
    if not found then raise exception 'allievo_non_trovato'; end if;
    v_ver := biglietteria_verifica(al.id, nullif(p->>'nascita', '')::date);
    if not (v_ver->>'ok')::boolean then return jsonb_build_object('errore', v_ver->>'errore'); end if;
  end if;
  if s.con_allievi and (s.liberi_dal is null or current_date < s.liberi_dal) then
    if al.id is null then raise exception 'scegli_allievo'; end if;
    if biglietteria_occupati(s.id, al.id) + v_posti > s.posti_per_allievo then
      raise exception 'posti_allievo_finiti:%', greatest(s.posti_per_allievo - biglietteria_occupati(s.id, al.id), 0);
    end if;
  end if;
  if s.capienza is not null then
    v_occ := biglietteria_occupati(s.id);
    if v_occ + v_posti > s.capienza then raise exception 'posti_esauriti:%', greatest(s.capienza - v_occ, 0); end if;
  end if;

  -- contributo "a prenotazione": se per questo allievo c'è già una prenotazione valida non si paga di nuovo
  -- (es. nel periodo libero si aggiungono altri posti per lo stesso allievo)
  v_contr := case when not s.contributo_per_posto and al.id is not null and biglietteria_occupati(s.id, al.id) > 0 then 0
                  else s.contributo_cent * case when s.contributo_per_posto then v_posti else 1 end end;
  v_tot := v_contr + v_ext_tot + v_offerta;
  v_stato := case when v_tot = 0 then 'gratis' else 'da_pagare' end;
  loop
    v_cod := codice_corto(6);
    exit when not exists (select 1 from biglietteria_prenotazioni where codice = v_cod);
  end loop;
  insert into biglietteria_prenotazioni (palestra_id, spettacolo_id, allievo_id, allievo_nome, nome, cognome, email, telefono,
                                         posti, pizze, offerta_cent, contributo_cent, totale_cent, stato, metodo, codice, scade_at, note, partecipanti, extra)
  values (s.palestra_id, s.id, al.id, case when al.id is not null then btrim(al.nome || ' ' || al.cognome) end,
          left(btrim(p->>'nome'), 80), left(btrim(p->>'cognome'), 80), left(v_email, 200), left(nullif(btrim(p->>'telefono'), ''), 30),
          v_posti, v_pizze, v_offerta, v_contr, v_tot, v_stato, case when v_tot = 0 then 'gratis' end, v_cod,
          case when v_tot > 0 then biglietteria_scadenza(b.giorni_per_pagare, now(), s.inizio) end,
          left(nullif(btrim(p->>'note'), ''), 300), v_part, v_extra)
  returning id, token into v_id, v_token;
  if v_stato = 'gratis' then perform biglietteria_emetti(v_id); end if;
  return jsonb_build_object('id', v_id, 'token', v_token, 'codice', v_cod, 'totale_cent', v_tot, 'stato', v_stato);
end $$;
revoke all on function biglietteria_prenota(jsonb) from public, anon, authenticated;
grant execute on function biglietteria_prenota(jsonb) to service_role;

create or replace function biglietteria_pubblica(p_palestra_slug text, p_slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select bi.* from biglietterie bi join palestre p on p.id = bi.palestra_id
     where p.slug = p_palestra_slug and (bi.slug = p_slug or (p_slug is null and bi.aperta))
     order by bi.aperta desc, bi.created_at desc limit 1)
  select jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'titolo', b.titolo, 'sottotitolo', b.sottotitolo, 'aperta', b.aperta,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'giorni_per_pagare', b.giorni_per_pagare, 'scadenza_pagamento', biglietteria_scadenza(b.giorni_per_pagare, now(), null), 'paga_in_segreteria', b.paga_in_segreteria, 'locandina_url', b.locandina_url, 'locandina_mobile_url', b.locandina_mobile_url,
    'spettacoli', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'titolo', s.titolo, 'descrizione', s.descrizione, 'inizio', s.inizio,
        'con_allievi', s.con_allievi, 'chiedi_nascita', s.chiedi_nascita, 'posti_per_allievo', s.posti_per_allievo,
        'limite_allievo', s.con_allievi and (s.liberi_dal is null or current_date < s.liberi_dal),
        'liberi_dal', s.liberi_dal, 'capienza', s.capienza,
        'fase', case when not s.con_allievi then 'aperta' when s.liberi_dal is null or current_date < s.liberi_dal then 'riservata' else 'libera' end,
        'max_per_prenotazione', s.max_per_prenotazione,
        'contributo_cent', s.contributo_cent, 'contributo_per_posto', s.contributo_per_posto,
        'offerta_libera', s.offerta_libera,
        'pizza_cent', s.pizza_cent, 'pizza_entro', s.pizza_entro,
        'pizza_aperta', s.pizza_cent is not null and (s.pizza_entro is null or current_date <= s.pizza_entro),
        'extra', coalesce((select jsonb_agg(o || jsonb_build_object('aperta', nullif(o->>'entro', '') is null or current_date <= (o->>'entro')::date) order by ord)
                             from jsonb_array_elements(s.extra) with ordinality t(o, ord)), '[]'::jsonb),
        'chiuso', s.chiuso or s.inizio < now(),
        'posti_liberi', case when s.capienza is null then null else greatest(s.capienza - biglietteria_occupati(s.id), 0) end
      ) order by s.ordine, s.inizio) from biglietteria_spettacoli s where s.biglietteria_id = b.id), '[]'::jsonb))
  from b;
$$;
revoke all on function biglietteria_pubblica(text, text) from public, anon, authenticated;
grant execute on function biglietteria_pubblica(text, text) to service_role;

-- email (promemoria e biglietti): «per eventuali modifiche rivolgiti alla segreteria»
create or replace function biglietteria_promemoria(p_prenotazione uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record; q record; v_righe text := ''; v_tot int := 0; v_scade timestamptz; v_url text;
begin
  select pr.*, b.titolo as evento, b.link_pagamento, b.istruzioni_pagamento, b.paga_in_segreteria, p.base_url, p.nome as scuola
    into r from biglietteria_prenotazioni pr
    join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id
    join palestre p on p.id = pr.palestra_id
   where pr.id = (select coalesce(gruppo_id, id) from biglietteria_prenotazioni where id = p_prenotazione);
  if not found or r.stato <> 'da_pagare' then return false; end if;
  for q in select o.posti, o.pizze, o.extra, o.totale_cent, o.scade_at, s.titolo, s.inizio from biglietteria_ordine(r.id) o
             join biglietteria_spettacoli s on s.id = o.spettacolo_id where o.stato = 'da_pagare' order by s.inizio loop
    v_righe := v_righe || E'\n• ' || q.titolo || ', ' || to_char(q.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ': ' ||
               q.posti || case when q.posti = 1 then ' posto' else ' posti' end ||
               coalesce(' · ' || nullif(biglietteria_extra_testo(q.extra, q.pizze), ''), '') ||
               ' — ' || replace(to_char(q.totale_cent / 100.0, 'FM999990.00'), '.', ',') || ' €';
    v_tot := v_tot + q.totale_cent;
    v_scade := least(coalesce(v_scade, q.scade_at), q.scade_at);
  end loop;
  v_url := rtrim(coalesce(r.base_url, ''), '/') || '/biglietti/' || r.token;
  insert into messaggi_coda (palestra_id, evento, canale, destinatario, oggetto, corpo, chiave)
  values (r.palestra_id, 'biglietti', 'email', r.email,
          'Promemoria pagamento · ' || r.evento || ' · ' || r.codice,
          'Ciao ' || r.nome || E',\n\n' || 'abbiamo tenuto i tuoi posti. Questo è un PROMEMORIA PER IL PAGAMENTO: non è una ricevuta e non è un biglietto.' ||
          E'\n\nPrenotazione ' || r.codice || ':' || v_righe ||
          E'\n\nTotale da pagare: ' || replace(to_char(v_tot / 100.0, 'FM999990.00'), '.', ',') || ' €' ||
          E'\nCausale: SAGGIO ' || r.codice || ' ' || upper(r.cognome) ||
          case when r.link_pagamento is not null then E'\nPaga qui: ' || r.link_pagamento else '' end ||
          case when r.istruzioni_pagamento is not null then E'\n' || r.istruzioni_pagamento else '' end ||
          case when v_scade is not null then E'\n\nPaga entro ' || biglietteria_quando(v_scade) ||
               ': dopo, la prenotazione scade e i posti tornano liberi.' else '' end ||
          case when r.paga_in_segreteria then E'\nOppure passa in segreteria a saldare la prenotazione' ||
               coalesce(' entro ' || biglietteria_quando(v_scade), '') || ', oltre la prenotazione decade.' else '' end ||
          E'\n\nI biglietti (un QR per persona) arrivano in una email nei prossimi giorni, quando il pagamento è stato verificato e confermato dalla segreteria.' ||
          E'\nLa tua prenotazione: ' || v_url || E'\n\nPer eventuali modifiche alla prenotazione rivolgiti alla segreteria.\n\n' || r.scuola,
          'promemoria:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return true;
end $$;
revoke all on function biglietteria_promemoria(uuid) from public, anon, authenticated;
grant execute on function biglietteria_promemoria(uuid) to service_role;

create or replace function biglietteria_emetti(p_prenotazione uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; q record; k int; v_cod text; v_url text; v_righe text := ''; v_capo uuid;
begin
  select pr.*, s.titolo as spettacolo, s.inizio, b.titolo as evento, p.base_url, p.nome as scuola
    into r from biglietteria_prenotazioni pr
    join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id
    join palestre p on p.id = pr.palestra_id
   where pr.id = p_prenotazione;
  if not found or r.stato not in ('pagata', 'gratis') then return 0; end if;
  for k in 1..r.posti loop
    continue when exists (select 1 from biglietteria_biglietti where prenotazione_id = r.id and numero = k);
    loop
      v_cod := codice_corto(10);
      exit when not exists (select 1 from biglietteria_biglietti where codice = v_cod);
    end loop;
    insert into biglietteria_biglietti (palestra_id, prenotazione_id, numero, codice, nome)
    values (r.palestra_id, r.id, k, v_cod, nullif(btrim(coalesce(r.partecipanti -> (k - 1) ->> 'nome', '') || ' ' || coalesce(r.partecipanti -> (k - 1) ->> 'cognome', '')), ''));
  end loop;

  v_capo := coalesce(r.gruppo_id, r.id);
  if r.id <> v_capo then return r.posti; end if;                       -- l'email la manda la capo
  if exists (select 1 from biglietteria_ordine(r.id) o where o.stato not in ('pagata', 'gratis', 'annullata')) then return r.posti; end if;
  for q in select o.posti, o.pizze, o.extra, s.titolo, s.inizio from biglietteria_ordine(r.id) o join biglietteria_spettacoli s on s.id = o.spettacolo_id
            where o.stato in ('pagata', 'gratis') order by s.inizio loop
    v_righe := v_righe || E'\n• ' || q.titolo || ', ' || to_char(q.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ': ' ||
               q.posti || case when q.posti = 1 then ' posto' else ' posti' end ||
               coalesce(' · ' || nullif(biglietteria_extra_testo(q.extra, q.pizze), ''), '');
  end loop;
  v_url := rtrim(coalesce(r.base_url, ''), '/') || '/biglietti/' || r.token;
  insert into messaggi_coda (palestra_id, evento, canale, destinatario, oggetto, corpo, chiave)
  values (r.palestra_id, 'biglietti', 'email', r.email,
          'I tuoi biglietti · ' || r.evento,
          'Ciao ' || r.nome || E',\n\n' || 'grazie! La prenotazione ' || r.codice || ' è confermata:' || v_righe || E'\n\n' ||
          E'Qui trovi i biglietti, uno per persona, con il codice QR da mostrare all''ingresso (sul telefono o stampati):\n' ||
          v_url || E'\n\nPer eventuali modifiche alla prenotazione rivolgiti alla segreteria.\n\n' || 'A presto!' || E'\n' || r.scuola,
          'biglietti:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return r.posti;
end $$;
revoke all on function biglietteria_emetti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_emetti(uuid) to service_role;

-- modifica dalla segreteria. p = { nome, cognome, email, telefono, partecipanti: [{nome, cognome}], extra: [{id, quantita}] }
create or replace function biglietteria_modifica(p_prenotazione uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r biglietteria_prenotazioni; s biglietteria_spettacoli; v_part jsonb := '[]'; x jsonb; v_n text; v_visti text[] := '{}';
        v_doppio text; v_posti int; v_aperta boolean; v_extra jsonb := '[]'; v_ext_tot int := 0; v_q int; ex jsonb; opt jsonb;
        v_qta int := 0; v_contr int; v_tot int; v_email text;
begin
  select * into r from biglietteria_prenotazioni where id = p_prenotazione for update;
  if not found then raise exception 'prenotazione_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if r.stato = 'annullata' then raise exception 'prenotazione_annullata'; end if;
  select * into s from biglietteria_spettacoli where id = r.spettacolo_id;
  v_aperta := r.stato = 'da_pagare';                       -- non ancora pagata: si possono cambiare persone ed extra

  if length(btrim(coalesce(p->>'nome', ''))) < 1 or length(btrim(coalesce(p->>'cognome', ''))) < 1 then raise exception 'dati_mancanti'; end if;
  v_email := lower(btrim(coalesce(p->>'email', '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_non_valida'; end if;

  if coalesce(jsonb_typeof(p->'partecipanti'), '') <> 'array' or jsonb_array_length(p->'partecipanti') < 1 then raise exception 'nominativi_mancanti'; end if;
  for x in select * from jsonb_array_elements(p->'partecipanti') loop
    if length(btrim(coalesce(x->>'nome', ''))) < 1 or length(btrim(coalesce(x->>'cognome', ''))) < 1 then raise exception 'nominativi_mancanti'; end if;
    v_n := nome_norm(x->>'nome', x->>'cognome');
    if v_n = any(v_visti) then raise exception 'nominativo_ripetuto:% %', btrim(x->>'nome'), btrim(x->>'cognome'); end if;
    v_visti := v_visti || v_n;
    v_part := v_part || jsonb_build_object('nome', left(btrim(x->>'nome'), 60), 'cognome', left(btrim(x->>'cognome'), 60));
  end loop;
  select e->>'nome' || ' ' || (e->>'cognome') into v_doppio
    from biglietteria_prenotazioni q, jsonb_array_elements(q.partecipanti) e
   where q.spettacolo_id = r.spettacolo_id and q.id <> r.id
     and (q.stato in ('pagata', 'gratis') or (q.stato = 'da_pagare' and (q.scade_at is null or q.scade_at > now())))
     and nome_norm(e->>'nome', e->>'cognome') = any(v_visti)
   limit 1;
  if v_doppio is not null then raise exception 'nominativo_doppio:%', v_doppio; end if;
  v_posti := jsonb_array_length(v_part);
  if not v_aperta and v_posti <> r.posti then raise exception 'posti_dopo_pagamento'; end if;

  if v_aperta then
    for ex in select * from jsonb_array_elements(case when jsonb_typeof(p->'extra') = 'array' then p->'extra' else '[]'::jsonb end) loop
      v_q := coalesce((ex->>'quantita')::int, 0);
      continue when v_q = 0;
      if v_q < 0 or v_q > 50 then raise exception 'extra_non_valido'; end if;
      select o into opt from jsonb_array_elements(s.extra) o where o->>'id' = ex->>'id';
      if opt is null then raise exception 'extra_non_valido'; end if;
      v_extra := v_extra || jsonb_build_object('id', opt->>'id', 'nome', opt->>'nome', 'quantita', v_q, 'prezzo_cent', coalesce((opt->>'prezzo_cent')::int, 0));
      v_ext_tot := v_ext_tot + v_q * coalesce((opt->>'prezzo_cent')::int, 0);
      v_qta := v_qta + v_q;
    end loop;
    v_contr := case when s.contributo_per_posto then s.contributo_cent * v_posti else r.contributo_cent end;
    v_tot := v_contr + v_ext_tot + r.offerta_cent;
  else
    v_extra := r.extra; v_qta := r.pizze; v_contr := r.contributo_cent; v_tot := r.totale_cent;
  end if;

  update biglietteria_prenotazioni
     set nome = left(btrim(p->>'nome'), 80), cognome = left(btrim(p->>'cognome'), 80), email = left(v_email, 200),
         telefono = left(nullif(btrim(coalesce(p->>'telefono', '')), ''), 30),
         partecipanti = v_part, posti = v_posti, extra = v_extra, pizze = v_qta, contributo_cent = v_contr, totale_cent = v_tot
   where id = r.id;
  -- biglietti già emessi: aggiorno i nomi
  update biglietteria_biglietti x set nome = btrim((v_part -> (x.numero - 1) ->> 'nome') || ' ' || (v_part -> (x.numero - 1) ->> 'cognome'))
   where x.prenotazione_id = r.id and x.numero <= v_posti;
  -- importo cambiato (o email cambiata) su una prenotazione da pagare: riparte il promemoria con i dati nuovi
  if v_aperta and (v_tot <> r.totale_cent or v_email <> lower(r.email)) then
    update messaggi_coda set chiave = chiave || ':' || extract(epoch from now())::bigint
     where palestra_id = r.palestra_id and chiave = 'promemoria:' || coalesce(r.gruppo_id, r.id);
    perform biglietteria_promemoria(r.id);
  end if;
  return jsonb_build_object('totale_cent', v_tot, 'posti', v_posti);
end $$;
revoke all on function biglietteria_modifica(uuid, jsonb) from public, anon;
grant execute on function biglietteria_modifica(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
