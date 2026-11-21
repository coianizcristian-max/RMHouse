-- 178 — Biglietteria: eventi gratuiti confermati subito, scadenza dei non pagati facoltativa, disdette
-- • In un ordine con eventi da pagare e gratuiti, quelli gratuiti sono confermati subito (biglietti per email subito);
--   solo quelli da pagare aspettano il pagamento (e possono scadere).
-- • Impostazione "le prenotazioni non pagate scadono": se la togli, i posti restano tenuti finché la segreteria
--   conferma o annulla (niente scadenza, niente data nel promemoria).
-- • La segreteria può togliere persone anche da una prenotazione già pagata (chi disdice): il suo biglietto non vale
--   più e il posto torna libero; l'incasso non cambia (se va restituito qualcosa, a parte).
-- Va dopo la 170–177. Si può rilanciare.

alter table biglietterie add column if not exists scadenza_attiva boolean not null default true;

-- i biglietti degli eventi gratuiti di un ordine che ha ancora qualcosa da pagare: email subito
create or replace function biglietteria_email_gratis(p_capo uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record; q record; v_righe text := ''; v_url text;
begin
  select pr.*, b.titolo as evento, p.base_url, p.nome as scuola into r
    from biglietteria_prenotazioni pr join biglietteria_spettacoli s on s.id = pr.spettacolo_id
    join biglietterie b on b.id = s.biglietteria_id join palestre p on p.id = pr.palestra_id
   where pr.id = p_capo;
  if not found or coalesce(btrim(r.email), '') = '' then return false; end if;
  for q in select o.posti, o.pizze, o.extra, s.titolo, s.inizio from biglietteria_ordine(r.id) o
             join biglietteria_spettacoli s on s.id = o.spettacolo_id where o.stato = 'gratis' order by s.inizio loop
    v_righe := v_righe || E'\n• ' || q.titolo || ', ' || to_char(q.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ': ' ||
               q.posti || case when q.posti = 1 then ' posto' else ' posti' end ||
               coalesce(' · ' || nullif(biglietteria_extra_testo(q.extra, q.pizze), ''), '');
  end loop;
  if v_righe = '' then return false; end if;
  v_url := rtrim(coalesce(r.base_url, ''), '/') || '/biglietti/' || r.token;
  insert into messaggi_coda (palestra_id, evento, canale, destinatario, oggetto, corpo, chiave)
  values (r.palestra_id, 'biglietti', 'email', r.email, 'I tuoi biglietti (eventi gratuiti) · ' || r.evento,
          'Ciao ' || r.nome || E',\n\n' || 'la prenotazione ' || r.codice || ' per gli eventi gratuiti è confermata:' || v_righe ||
          E'\n\nQui trovi i biglietti, uno per persona, con il codice QR da mostrare all''ingresso:\n' || v_url ||
          E'\n\nPer gli eventi da pagare ti mandiamo i biglietti quando la segreteria avrà verificato il pagamento.' ||
          E'\n\nPer eventuali modifiche alla prenotazione rivolgiti alla segreteria.\n\n' || r.scuola,
          'gratis:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return true;
end $$;
revoke all on function biglietteria_email_gratis(uuid) from public, anon, authenticated;
grant execute on function biglietteria_email_gratis(uuid) to service_role;

create or replace function biglietteria_prenota_tutto(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x jsonb; r jsonb; v_ids uuid[] := '{}'; v_capo uuid; v_tot int; v_titolo text; v_scade timestamptz;
begin
  if coalesce(jsonb_typeof(p->'righe'), '') <> 'array' or jsonb_array_length(p->'righe') < 1 then raise exception 'nessun_evento'; end if;
  if jsonb_array_length(p->'righe') > 10 then raise exception 'troppi_eventi'; end if;
  if (select count(distinct e->>'spettacolo_id') from jsonb_array_elements(p->'righe') e) < jsonb_array_length(p->'righe') then raise exception 'evento_ripetuto'; end if;
  for x in select * from jsonb_array_elements(p->'righe') loop
    select titolo into v_titolo from biglietteria_spettacoli where id = nullif(x->>'spettacolo_id', '')::uuid;
    begin
      r := biglietteria_prenota((p - 'righe') || x);
    exception when others then
      raise exception '%|%', coalesce(v_titolo, 'evento'), sqlerrm;
    end;
    if r ? 'errore' then raise exception '%|%', coalesce(v_titolo, 'evento'), r->>'errore'; end if;
    v_ids := v_ids || (r->>'id')::uuid;
  end loop;
  v_capo := v_ids[1];
  if array_length(v_ids, 1) > 1 then
    update biglietteria_prenotazioni set gruppo_id = v_capo where id = any(v_ids);
    select sum(totale_cent), max(scade_at) into v_tot, v_scade from biglietteria_prenotazioni where id = any(v_ids);
    -- gli eventi gratuiti sono confermati subito, anche se nell'ordine c'è qualcosa da pagare (query 178)
    delete from messaggi_coda where stato = 'in_coda' and chiave in (select 'biglietti:' || unnest(v_ids));
    if v_tot = 0 then perform biglietteria_emetti(v_capo);
    else perform biglietteria_email_gratis(v_capo);       -- subito i biglietti degli eventi gratuiti; gli altri dopo il pagamento
    end if;
  end if;
  return (select jsonb_build_object('id', c.id, 'token', c.token, 'codice', c.codice,
                                    'stato', case when exists (select 1 from biglietteria_prenotazioni where id = any(v_ids) and stato = 'da_pagare') then 'da_pagare' else c.stato end,
                                    'gratuiti', (select count(*) from biglietteria_prenotazioni where id = any(v_ids) and stato = 'gratis'),
                                    'totale_cent', (select sum(totale_cent) from biglietteria_prenotazioni where id = any(v_ids)),
                                    'eventi', array_length(v_ids, 1))
            from biglietteria_prenotazioni c where c.id = v_capo);
end $$;
revoke all on function biglietteria_prenota_tutto(jsonb) from public, anon, authenticated;
grant execute on function biglietteria_prenota_tutto(jsonb) to service_role;

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
          case when v_tot > 0 and b.scadenza_attiva then biglietteria_scadenza(b.giorni_per_pagare, now(), s.inizio) end,
          left(nullif(btrim(p->>'note'), ''), 300), v_part, v_extra)
  returning id, token into v_id, v_token;
  if v_stato = 'gratis' then perform biglietteria_emetti(v_id); end if;
  return jsonb_build_object('id', v_id, 'token', v_token, 'codice', v_cod, 'totale_cent', v_tot, 'stato', v_stato);
end $$;
revoke all on function biglietteria_prenota(jsonb) from public, anon, authenticated;
grant execute on function biglietteria_prenota(jsonb) to service_role;

create or replace function biglietteria_aggiungi(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s biglietteria_spettacoli; b biglietterie; al biglietteria_allievi; x jsonb; v_part jsonb := '[]'; v_visti text[] := '{}'; v_n text;
        v_doppio text; v_posti int; v_extra jsonb := '[]'; v_ext_tot int := 0; v_qta int := 0; v_q int; ex jsonb; opt jsonb;
        v_contr int; v_off int; v_tot int; v_modo text := coalesce(p->>'modo', 'pagata'); v_forza boolean := coalesce((p->>'forza')::boolean, false);
        v_occ int; v_id uuid; v_token uuid; v_cod text; v_email text;
begin
  select * into s from biglietteria_spettacoli where id = nullif(p->>'spettacolo_id', '')::uuid;
  if not found then raise exception 'spettacolo_non_trovato'; end if;
  if not is_gestione(s.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into b from biglietterie where id = s.biglietteria_id;
  if v_modo not in ('pagata', 'omaggio', 'da_pagare') then raise exception 'modo_non_valido'; end if;
  if length(btrim(coalesce(p->>'nome', ''))) < 1 or length(btrim(coalesce(p->>'cognome', ''))) < 1 then raise exception 'dati_mancanti'; end if;
  v_email := lower(btrim(coalesce(p->>'email', '')));
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_non_valida'; end if;

  if coalesce(jsonb_typeof(p->'partecipanti'), '') <> 'array' or jsonb_array_length(p->'partecipanti') < 1 then raise exception 'nominativi_mancanti'; end if;
  for x in select * from jsonb_array_elements(p->'partecipanti') loop
    if length(btrim(coalesce(x->>'nome', ''))) < 1 or length(btrim(coalesce(x->>'cognome', ''))) < 1 then raise exception 'nominativi_mancanti'; end if;
    v_n := nome_norm(x->>'nome', x->>'cognome');
    if v_n = any(v_visti) then raise exception 'nominativo_ripetuto:% %', btrim(x->>'nome'), btrim(x->>'cognome'); end if;
    v_visti := v_visti || v_n;
    v_part := v_part || jsonb_build_object('nome', left(btrim(x->>'nome'), 60), 'cognome', left(btrim(x->>'cognome'), 60));
  end loop;
  v_posti := jsonb_array_length(v_part);
  perform pg_advisory_xact_lock(hashtext('biglietteria:' || s.id::text));
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
  end if;
  if not v_forza then
    if al.id is not null and s.con_allievi and (s.liberi_dal is null or current_date < s.liberi_dal)
       and biglietteria_occupati(s.id, al.id) + v_posti > s.posti_per_allievo then
      raise exception 'posti_allievo_finiti:%', greatest(s.posti_per_allievo - biglietteria_occupati(s.id, al.id), 0);
    end if;
    if s.capienza is not null then
      v_occ := biglietteria_occupati(s.id);
      if v_occ + v_posti > s.capienza then raise exception 'posti_esauriti:%', greatest(s.capienza - v_occ, 0); end if;
    end if;
  end if;

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
  v_contr := case when not s.contributo_per_posto and al.id is not null and biglietteria_occupati(s.id, al.id) > 0 then 0
                  else s.contributo_cent * case when s.contributo_per_posto then v_posti else 1 end end;
  v_off := greatest(coalesce((p->>'offerta_cent')::int, 0), 0);
  v_tot := v_contr + v_ext_tot + v_off;
  if v_modo = 'omaggio' then v_contr := 0; v_off := 0; v_tot := 0; end if;

  loop
    v_cod := codice_corto(6);
    exit when not exists (select 1 from biglietteria_prenotazioni where codice = v_cod);
  end loop;
  insert into biglietteria_prenotazioni (palestra_id, spettacolo_id, allievo_id, allievo_nome, nome, cognome, email, telefono,
                                         posti, pizze, extra, offerta_cent, contributo_cent, totale_cent, stato, metodo, codice, scade_at, note, partecipanti)
  values (s.palestra_id, s.id, al.id, case when al.id is not null then btrim(al.nome || ' ' || al.cognome) end,
          left(btrim(p->>'nome'), 80), left(btrim(p->>'cognome'), 80), left(v_email, 200), left(nullif(btrim(coalesce(p->>'telefono', '')), ''), 30),
          v_posti, v_qta, v_extra, v_off, v_contr, v_tot,
          case when v_tot = 0 then 'gratis' else 'da_pagare' end, case when v_tot = 0 then case when v_modo = 'omaggio' then 'omaggio' else 'gratis' end end,
          v_cod, case when v_tot > 0 and b.scadenza_attiva then biglietteria_scadenza(b.giorni_per_pagare, now(), s.inizio) end,
          'aggiunta dalla segreteria', v_part)
  returning id, token into v_id, v_token;
  if v_tot = 0 then perform biglietteria_emetti(v_id);
  elsif v_modo = 'pagata' then perform biglietteria_conferma(v_id, coalesce(nullif(p->>'metodo', ''), 'contanti'));
  else perform biglietteria_promemoria(v_id);
  end if;
  return (select jsonb_build_object('id', id, 'token', token, 'codice', codice, 'stato', stato, 'totale_cent', totale_cent)
            from biglietteria_prenotazioni where id = v_id);
end $$;
revoke all on function biglietteria_aggiungi(jsonb) from public, anon;
grant execute on function biglietteria_aggiungi(jsonb) to authenticated;

create or replace function biglietteria_pubblica(p_palestra_slug text, p_slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select bi.* from biglietterie bi join palestre p on p.id = bi.palestra_id
     where p.slug = p_palestra_slug and (bi.slug = p_slug or (p_slug is null and bi.aperta))
     order by bi.aperta desc, bi.created_at desc limit 1)
  select jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'titolo', b.titolo, 'sottotitolo', b.sottotitolo, 'aperta', b.aperta,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'giorni_per_pagare', b.giorni_per_pagare, 'scadenza_pagamento', case when b.scadenza_attiva then biglietteria_scadenza(b.giorni_per_pagare, now(), null) end, 'scadenza_attiva', b.scadenza_attiva, 'paga_in_segreteria', b.paga_in_segreteria, 'locandina_url', b.locandina_url, 'locandina_mobile_url', b.locandina_mobile_url,
    'spettacoli', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'titolo', s.titolo, 'descrizione', s.descrizione, 'inizio', s.inizio,
        'con_allievi', s.con_allievi, 'chiedi_nascita', s.chiedi_nascita, 'scelta_allievo', s.scelta_allievo, 'frase_offerta', s.frase_offerta, 'posti_per_allievo', s.posti_per_allievo,
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

create or replace function biglietteria_promemoria(p_prenotazione uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record; q record; v_righe text := ''; v_tot int := 0; v_scade timestamptz; v_url text;
begin
  select pr.*, b.titolo as evento, b.link_pagamento, b.istruzioni_pagamento, b.paga_in_segreteria, p.base_url, p.nome as scuola
    into r from biglietteria_prenotazioni pr
    join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id
    join palestre p on p.id = pr.palestra_id
   where pr.id = (select coalesce(gruppo_id, id) from biglietteria_prenotazioni where id = p_prenotazione);
  if not found or coalesce(btrim(r.email), '') = '' or not exists (select 1 from biglietteria_ordine(r.id) o where o.stato = 'da_pagare') then return false; end if;
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

create or replace function biglietteria_biglietti(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with pr as (select * from biglietteria_prenotazioni where token = p_token),
  o as (select q.*, s.titolo as spettacolo, s.inizio from pr, biglietteria_ordine(pr.id) q join biglietteria_spettacoli s on s.id = q.spettacolo_id)
  select jsonb_build_object(
    'id', pr.id, 'codice', pr.codice,
    -- stato dell'ordine: da pagare se c'è ancora qualcosa da pagare (gli eventi gratuiti sono già confermati)
    'stato', case when exists (select 1 from o where o.stato = 'da_pagare' and (o.scade_at is null or o.scade_at > now())) then 'da_pagare'
                  when exists (select 1 from o where o.stato in ('pagata', 'gratis')) then case when pr.stato in ('pagata', 'gratis') then pr.stato else 'pagata' end
                  when exists (select 1 from o where o.stato = 'da_pagare') then 'scaduta'
                  else pr.stato end,
    'da_pagare_cent', (select coalesce(sum(totale_cent), 0) from o where o.stato = 'da_pagare' and (o.scade_at is null or o.scade_at > now())),
    'nome', pr.nome, 'cognome', pr.cognome, 'posti', (select sum(posti) from o where o.stato <> 'annullata'),
    'pizze', (select sum(pizze) from o where o.stato <> 'annullata'),
    'totale_cent', (select sum(totale_cent) from o where o.stato <> 'annullata'),
    'allievo', pr.allievo_nome, 'scade_at', (select min(scade_at) from o where o.stato = 'da_pagare'), 'partecipanti', pr.partecipanti,
    'spettacolo', s.titolo, 'inizio', s.inizio, 'evento', b.titolo, 'slug', b.slug,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'paga_in_segreteria', b.paga_in_segreteria, 'giorni_per_pagare', b.giorni_per_pagare,
    'eventi', (select jsonb_agg(jsonb_build_object('spettacolo', o.spettacolo, 'inizio', o.inizio, 'posti', o.posti, 'pizze', o.pizze, 'extra_testo', biglietteria_extra_testo(o.extra, o.pizze),
                                                   'totale_cent', o.totale_cent, 'allievo', o.allievo_nome, 'stato', o.stato) order by o.inizio)
                 from o where o.stato <> 'annullata'),
    'biglietti', case when true then coalesce((
        select jsonb_agg(jsonb_build_object('numero', x.numero, 'di', o.posti, 'codice', x.codice, 'nome', x.nome, 'entrato', x.entrato_at is not null,
                                            'spettacolo', o.spettacolo, 'inizio', o.inizio, 'allievo', o.allievo_nome,
                                            'pizze', case when x.numero = 1 then o.pizze else 0 end, 'extra_testo', case when x.numero = 1 then biglietteria_extra_testo(o.extra, o.pizze) end) order by o.inizio, x.numero)
          from o join biglietteria_biglietti x on x.prenotazione_id = o.id where o.stato in ('pagata', 'gratis')), '[]'::jsonb) else '[]'::jsonb end)
    from pr join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id;
$$;
revoke all on function biglietteria_biglietti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_biglietti(uuid) to service_role;

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
  -- già pagata (o gratis): si possono correggere i nomi e TOGLIERE persone (disdette), non aggiungerne
  if not v_aperta and v_posti > r.posti then raise exception 'posti_dopo_pagamento'; end if;
  if not v_aperta and v_posti < r.posti then
    if exists (select 1 from jsonb_array_elements(v_part) e
                where nome_norm(e->>'nome', e->>'cognome') not in (select nome_norm(o->>'nome', o->>'cognome') from jsonb_array_elements(r.partecipanti) o)) then
      raise exception 'togli_e_correggi';
    end if;
    -- il biglietto di chi è tolto non vale più (e il posto torna libero); gli altri si rinumerano
    delete from biglietteria_biglietti x using jsonb_array_elements(r.partecipanti) with ordinality t(o, k)
     where x.prenotazione_id = r.id and x.numero = t.k and not (nome_norm(t.o->>'nome', t.o->>'cognome') = any(v_visti));
    update biglietteria_biglietti set numero = -numero where prenotazione_id = r.id;
    update biglietteria_biglietti x set numero = n.k
      from (select id, row_number() over (order by -numero) k from biglietteria_biglietti where prenotazione_id = r.id) n
     where x.id = n.id;
  end if;

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
