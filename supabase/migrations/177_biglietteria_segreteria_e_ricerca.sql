-- 177 — Biglietteria: iscritti aggiunti dalla segreteria, scelta dell'allievo scrivendo il nome
-- • La segreteria può aggiungere a mano una prenotazione (biglietteria_aggiungi): già pagata (con il metodo: va negli
--   Incassi), omaggio o da pagare. I posti si scalano dalla disponibilità e i biglietti con il QR si generano subito
--   (se pagata/omaggio). L'email è facoltativa: senza, i biglietti si stampano o si mostrano dalla pagina.
--   Può superare i limiti (posti per allievo, capienza) solo spuntando "forza".
-- • Per ogni evento: l'allievo si sceglie "gruppo e poi allievo" oppure "scrivendo il nome" (l'elenco si filtra mentre
--   si scrive: biglietteria_cerca).
-- • Raccolta fondi: per ogni evento importi da scegliere (No, 5, 10, 20, altro) oppure solo una frase scritta da te.
-- Va dopo la 170–176. Si può rilanciare.

alter table biglietteria_spettacoli add column if not exists scelta_allievo text not null default 'gruppo';
-- al posto degli importi della raccolta fondi si può mostrare una frase scritta nell'evento
alter table biglietteria_spettacoli add column if not exists frase_offerta text;

-- ricerca per nome nella pagina pubblica: si scrive nome e cognome (o cognome e nome); si vedono nome e iniziali
-- del cognome (come nell'elenco per gruppo) con il gruppo, al massimo 10
create or replace function biglietteria_cerca(p_spettacolo uuid, p_testo text)
returns jsonb language sql stable security definer set search_path = public as $$
  with g as (
    select a.id, a.nome, a.cognome, coalesce(nullif(a.gruppo, ''), 'Altri') gruppo, lower(btrim(a.nome)) n, lower(btrim(a.cognome)) c
      from biglietteria_allievi a where a.spettacolo_id = p_spettacolo
  ), l as (
    select g.*,
           coalesce((select min(k) from generate_series(1, greatest(length(g.c), 1)) k
                      where not exists (select 1 from g x where x.id <> g.id and x.n = g.n and left(x.c, k) = left(g.c, k))), length(g.c) + 1) as lettere,
           row_number() over (partition by g.n, g.c order by g.gruppo, g.id) as num,
           count(*) over (partition by g.n, g.c) as uguali
      from g
  ), t as (select lower(btrim(coalesce(p_testo, ''))) q)
  select coalesce(jsonb_agg(x order by x->>'nome', x->>'cognome'), '[]'::jsonb) from (
    select jsonb_build_object('id', l.id, 'nome', l.nome, 'gruppo', l.gruppo,
             'cognome', case
               when length(l.cognome) = 0 then case when l.uguali > 1 then '(' || l.num || ')' else '' end
               when l.uguali > 1 then l.cognome || ' (' || l.num || ')'
               when l.lettere >= length(l.cognome) then l.cognome
               else left(l.cognome, greatest(l.lettere, 1)) || '.' end) x
      from l, t
     where length(t.q) >= 2
       -- si scrive «nome cognome» o «cognome nome», anche a metà: ogni parola scritta deve essere l'inizio
       -- del nome o del cognome (o di una loro parola). Nel risultato il cognome resta abbreviato.
       and not exists (select 1 from regexp_split_to_table(t.q, '\s+') w
                        where w <> '' and not (l.n like w || '%' or l.c like w || '%' or l.n like '% ' || w || '%' or l.c like '% ' || w || '%'))
     order by l.nome, l.cognome limit 10) z;
$$;
revoke all on function biglietteria_cerca(uuid, text) from public, anon, authenticated;
grant execute on function biglietteria_cerca(uuid, text) to service_role;

-- prenotazione aggiunta dalla segreteria. p = { spettacolo_id, allievo_id, nome, cognome, email, telefono,
--   partecipanti: [{nome, cognome}], extra: [{id, quantita}], offerta_cent, modo: pagata|omaggio|da_pagare, metodo, forza }
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
          v_cod, case when v_tot > 0 then biglietteria_scadenza(b.giorni_per_pagare, now(), s.inizio) end,
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

-- senza email (aggiunte dalla segreteria): niente email; incassi con le opzioni extra nella descrizione
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
  if coalesce(btrim(r.email), '') = '' then return r.posti; end if;   -- aggiunta dalla segreteria senza email: niente email
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

create or replace function biglietteria_promemoria(p_prenotazione uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record; q record; v_righe text := ''; v_tot int := 0; v_scade timestamptz; v_url text;
begin
  select pr.*, b.titolo as evento, b.link_pagamento, b.istruzioni_pagamento, b.paga_in_segreteria, p.base_url, p.nome as scuola
    into r from biglietteria_prenotazioni pr
    join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id
    join palestre p on p.id = pr.palestra_id
   where pr.id = (select coalesce(gruppo_id, id) from biglietteria_prenotazioni where id = p_prenotazione);
  if not found or r.stato <> 'da_pagare' or coalesce(btrim(r.email), '') = '' then return false; end if;
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
                || coalesce(' + ' || nullif(biglietteria_extra_testo(q.extra, q.pizze), ''), '')
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

-- pagina pubblica: anche come si sceglie l'allievo
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

-- creazione: anche come si sceglie l'allievo
create or replace function biglietteria_crea(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pal uuid := nullif(p->>'palestra_id', '')::uuid; v_id uuid; v_slug text; x jsonb; k int := 0;
begin
  if v_pal is null or not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if length(btrim(coalesce(p->>'titolo', ''))) < 2 then raise exception 'titolo_mancante'; end if;
  if coalesce(jsonb_array_length(p->'spettacoli'), 0) < 1 then raise exception 'nessuno_spettacolo'; end if;
  v_slug := left(btrim(regexp_replace(lower(translate(p->>'titolo', 'àáâäèéêëìíîïòóôöùúûüç', 'aaaaeeeeiiiioooouuuuc')), '[^a-z0-9]+', '-', 'g'), '-'), 50)
            || coalesce('-' || nullif(p->>'anno', ''), '');
  select id into v_id from biglietterie b where b.palestra_id = v_pal and b.slug = v_slug;
  if v_id is not null then
    if exists (select 1 from biglietteria_spettacoli where biglietteria_id = v_id) then raise exception 'esiste_gia'; end if;
    update biglietterie set titolo = btrim(p->>'titolo'), sottotitolo = coalesce(nullif(btrim(p->>'sottotitolo'), ''), sottotitolo) where id = v_id;
  else
    insert into biglietterie (palestra_id, slug, titolo, sottotitolo, aperta)
    values (v_pal, v_slug, btrim(p->>'titolo'), nullif(btrim(p->>'sottotitolo'), ''), false)
    returning id into v_id;
  end if;
  for x in select * from jsonb_array_elements(p->'spettacoli') loop
    k := k + 1;
    continue when length(btrim(coalesce(x->>'titolo', ''))) = 0;
    insert into biglietteria_spettacoli (biglietteria_id, palestra_id, ordine, titolo, descrizione, inizio, con_allievi,
                                         posti_per_allievo, liberi_dal, capienza, max_per_prenotazione,
                                         contributo_cent, contributo_per_posto, offerta_libera, pizza_cent, pizza_entro, chiedi_nascita, extra, scelta_allievo)
    values (v_id, v_pal, k, left(btrim(x->>'titolo'), 120), nullif(btrim(coalesce(x->>'descrizione', '')), ''),
            (x->>'inizio')::timestamptz,
            coalesce((x->>'con_allievi')::boolean, false),
            greatest(coalesce(nullif(x->>'posti_per_allievo', '')::int, 2), 1),
            nullif(x->>'liberi_dal', '')::date,
            nullif(x->>'capienza', '')::int,
            greatest(coalesce(nullif(x->>'max_per_prenotazione', '')::int, 10), 1),
            greatest(coalesce(nullif(x->>'contributo_cent', '')::int, 0), 0),
            coalesce((x->>'contributo_per_posto')::boolean, false),
            coalesce((x->>'offerta_libera')::boolean, false),
            nullif(x->>'pizza_cent', '')::int,
            nullif(x->>'pizza_entro', '')::date,
            coalesce((x->>'chiedi_nascita')::boolean, true),
            case when jsonb_typeof(x->'extra') = 'array' then x->'extra' else '[]'::jsonb end,
            case when x->>'scelta_allievo' = 'nome' then 'nome' else 'gruppo' end);
  end loop;
  if not exists (select 1 from biglietteria_spettacoli where biglietteria_id = v_id) then raise exception 'nessuno_spettacolo'; end if;
  return v_id;
end $$;
revoke all on function biglietteria_crea(jsonb) from public, anon;
grant execute on function biglietteria_crea(jsonb) to authenticated;

notify pgrst, 'reload schema';
