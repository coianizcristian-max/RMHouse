-- 173 — Biglietteria: più eventi nella stessa prenotazione, un solo pagamento
-- • Dalla stessa pagina si possono scegliere più eventi (es. lo spettacolo delle 15:30 e la festa): una prenotazione
--   per evento, legate in un "ordine" (gruppo_id = la prima). Un solo codice da scrivere nella causale, un solo totale,
--   un solo pagamento; la segreteria conferma una volta sola e parte UNA email con tutti i biglietti.
-- • In un ordine con qualcosa da pagare anche l'evento gratuito aspetta il pagamento (i biglietti arrivano insieme).
-- • Prenotazioni singole: tutto come prima.
-- Va dopo la 170, 171, 172. Si può rilanciare.

alter table biglietteria_prenotazioni add column if not exists gruppo_id uuid;
create index if not exists biglietteria_prenotazioni_g on biglietteria_prenotazioni (gruppo_id) where gruppo_id is not null;

-- le prenotazioni dello stesso ordine (o solo quella, se è singola), la "capo" per prima
create or replace function biglietteria_ordine(p_prenotazione uuid)
returns setof biglietteria_prenotazioni language sql stable security definer set search_path = public as $$
  select q.* from biglietteria_prenotazioni r, biglietteria_prenotazioni q
   where r.id = p_prenotazione and (q.id = r.id or (r.gruppo_id is not null and q.gruppo_id = r.gruppo_id))
   order by (q.id = coalesce(r.gruppo_id, r.id)) desc, q.created_at;
$$;

-- i biglietti; l'email parte una sola volta per ordine (dalla prenotazione capo) e contiene tutti gli eventi
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
  for q in select o.posti, o.pizze, s.titolo, s.inizio from biglietteria_ordine(r.id) o join biglietteria_spettacoli s on s.id = o.spettacolo_id
            where o.stato in ('pagata', 'gratis') order by s.inizio loop
    v_righe := v_righe || E'\n• ' || q.titolo || ', ' || to_char(q.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') || ': ' ||
               q.posti || case when q.posti = 1 then ' posto' else ' posti' end ||
               case when q.pizze > 0 then ' · ' || q.pizze || case when q.pizze = 1 then ' pizza' else ' pizze' end else '' end;
  end loop;
  v_url := rtrim(coalesce(r.base_url, ''), '/') || '/biglietti/' || r.token;
  insert into messaggi_coda (palestra_id, evento, canale, destinatario, oggetto, corpo, chiave)
  values (r.palestra_id, 'biglietti', 'email', r.email,
          'I tuoi biglietti · ' || r.evento,
          'Ciao ' || r.nome || E',\n\n' || 'grazie! La prenotazione ' || r.codice || ' è confermata:' || v_righe || E'\n\n' ||
          E'Qui trovi i biglietti, uno per persona, con il codice QR da mostrare all''ingresso (sul telefono o stampati):\n' ||
          v_url || E'\n\n' || 'A presto!' || E'\n' || r.scuola,
          'biglietti:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return r.posti;
end $$;
revoke all on function biglietteria_emetti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_emetti(uuid) to service_role;

-- più eventi insieme: p = { nome, cognome, email, telefono, note, righe: [ {spettacolo_id, allievo_id, nascita, posti,
--   pizze, offerta_cent, partecipanti} ] }. Tutto o niente: un errore su un evento annulla l'ordine intero.
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
    if v_tot > 0 then
      -- c'è qualcosa da pagare: anche gli eventi gratuiti dell'ordine aspettano il pagamento (biglietti tutti insieme)
      delete from biglietteria_biglietti where prenotazione_id = any(v_ids);
      update biglietteria_prenotazioni set stato = 'da_pagare', metodo = null, scade_at = coalesce(v_scade, now() + interval '4 days')
       where id = any(v_ids) and stato = 'gratis';
    end if;
    -- un'email sola: tolgo quelle già in coda per i singoli eventi e la rifaccio dalla capo (se è tutto gratis)
    delete from messaggi_coda where stato = 'in_coda' and chiave in (select 'biglietti:' || unnest(v_ids));
    if v_tot = 0 then perform biglietteria_emetti(v_capo); end if;
  end if;
  return (select jsonb_build_object('id', c.id, 'token', c.token, 'codice', c.codice, 'stato', c.stato,
                                    'totale_cent', (select sum(totale_cent) from biglietteria_prenotazioni where id = any(v_ids)),
                                    'eventi', array_length(v_ids, 1))
            from biglietteria_prenotazioni c where c.id = v_capo);
end $$;
revoke all on function biglietteria_prenota_tutto(jsonb) from public, anon, authenticated;
grant execute on function biglietteria_prenota_tutto(jsonb) to service_role;

-- pagamento arrivato: conferma TUTTO l'ordine (si può partire da una qualunque delle sue prenotazioni)
create or replace function biglietteria_conferma(p_prenotazione uuid, p_metodo text default 'satispay',
                                                 p_session text default null, p_intent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r biglietteria_prenotazioni; q biglietteria_prenotazioni; s biglietteria_spettacoli; v_pag uuid; n int := 0; v_gia boolean := true; v_capo uuid;
begin
  select * into r from biglietteria_prenotazioni where id = p_prenotazione;
  if not found then raise exception 'prenotazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_metodo not in ('satispay', 'bonifico', 'contanti', 'pos', 'stripe', 'altro') then raise exception 'metodo_non_valido'; end if;
  v_capo := coalesce(r.gruppo_id, r.id);
  for q in select * from biglietteria_ordine(r.id) loop
    perform 1 from biglietteria_prenotazioni where id = q.id for update;
    continue when q.stato = 'annullata';
    if q.stato in ('pagata', 'gratis') then n := n + q.posti; continue; end if;
    v_gia := false; v_pag := null;
    select * into s from biglietteria_spettacoli where id = q.spettacolo_id;
    if q.totale_cent > 0 then
      insert into pagamenti (palestra_id, causale, descrizione, importo_cent, metodo, stato, pagato_at, stripe_session_id, stripe_payment_intent)
      values (q.palestra_id, 'evento',
              s.titolo || ' · ' || q.nome || ' ' || q.cognome || ' · ' || q.posti || case when q.posti = 1 then ' posto' else ' posti' end
                || case when q.pizze > 0 then ' + ' || q.pizze || ' pizz' || case when q.pizze = 1 then 'a' else 'e' end else '' end
                || ' (' || (select codice from biglietteria_prenotazioni where id = v_capo) || ')',
              q.totale_cent, p_metodo, 'pagato', now(), p_session, p_intent)
      returning id into v_pag;
    end if;
    update biglietteria_prenotazioni
       set stato = case when q.totale_cent > 0 then 'pagata' else 'gratis' end, metodo = p_metodo, pagata_at = now(), confermata_da = auth.uid(),
           stripe_session = coalesce(p_session, stripe_session), pagamento_id = v_pag, scade_at = null
     where id = q.id;
  end loop;
  -- biglietti di tutti (la capo per ultima: così manda l'email quando sono pronti tutti)
  for q in select * from biglietteria_ordine(r.id) loop
    if q.id <> v_capo then perform biglietteria_emetti(q.id); end if;
  end loop;
  perform biglietteria_emetti(v_capo);
  select coalesce(sum(posti), 0) into n from biglietteria_ordine(r.id) where stato in ('pagata', 'gratis');
  return jsonb_build_object('gia', v_gia, 'biglietti', n);
end $$;
revoke all on function biglietteria_conferma(uuid, text, text, text) from public, anon;
grant execute on function biglietteria_conferma(uuid, text, text, text) to authenticated, service_role;

-- la pagina dei biglietti: tutto l'ordine (ogni biglietto con il suo evento), totale e codice dell'ordine
create or replace function biglietteria_biglietti(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with pr as (select * from biglietteria_prenotazioni where token = p_token),
  o as (select q.*, s.titolo as spettacolo, s.inizio from pr, biglietteria_ordine(pr.id) q join biglietteria_spettacoli s on s.id = q.spettacolo_id)
  select jsonb_build_object(
    'id', pr.id, 'codice', pr.codice, 'stato', case when pr.stato = 'da_pagare' and pr.scade_at < now() then 'scaduta' else pr.stato end,
    'nome', pr.nome, 'cognome', pr.cognome, 'posti', (select sum(posti) from o where o.stato <> 'annullata'),
    'pizze', (select sum(pizze) from o where o.stato <> 'annullata'),
    'totale_cent', (select sum(totale_cent) from o where o.stato <> 'annullata'),
    'allievo', pr.allievo_nome, 'scade_at', pr.scade_at, 'partecipanti', pr.partecipanti,
    'spettacolo', s.titolo, 'inizio', s.inizio, 'evento', b.titolo, 'slug', b.slug,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'eventi', (select jsonb_agg(jsonb_build_object('spettacolo', o.spettacolo, 'inizio', o.inizio, 'posti', o.posti, 'pizze', o.pizze,
                                                   'totale_cent', o.totale_cent, 'allievo', o.allievo_nome, 'stato', o.stato) order by o.inizio)
                 from o where o.stato <> 'annullata'),
    'biglietti', case when pr.stato in ('pagata', 'gratis') then coalesce((
        select jsonb_agg(jsonb_build_object('numero', x.numero, 'di', o.posti, 'codice', x.codice, 'nome', x.nome, 'entrato', x.entrato_at is not null,
                                            'spettacolo', o.spettacolo, 'inizio', o.inizio, 'allievo', o.allievo_nome,
                                            'pizze', case when x.numero = 1 then o.pizze else 0 end) order by o.inizio, x.numero)
          from o join biglietteria_biglietti x on x.prenotazione_id = o.id where o.stato in ('pagata', 'gratis')), '[]'::jsonb) else '[]'::jsonb end)
    from pr join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id;
$$;
revoke all on function biglietteria_biglietti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_biglietti(uuid) to service_role;

-- rimanda l'email: quella dell'ordine (dalla capo)
create or replace function biglietteria_reinvia(p_prenotazione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r biglietteria_prenotazioni; v_capo uuid;
begin
  select * into r from biglietteria_prenotazioni where id = p_prenotazione;
  if not found then raise exception 'prenotazione_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if r.stato not in ('pagata', 'gratis') then raise exception 'non_confermata'; end if;
  v_capo := coalesce(r.gruppo_id, r.id);
  update messaggi_coda set chiave = chiave || ':' || extract(epoch from now())::bigint
   where palestra_id = r.palestra_id and chiave = 'biglietti:' || v_capo;
  perform biglietteria_emetti(v_capo);
end $$;
grant execute on function biglietteria_reinvia(uuid) to authenticated;

notify pgrst, 'reload schema';
