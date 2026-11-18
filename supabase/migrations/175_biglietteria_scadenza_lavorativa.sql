-- 175 — Biglietteria: pagamento entro X giorni LAVORATIVI (alle 23:59) e promemoria di pagamento per email
-- • La scadenza dei posti non pagati si conta in giorni lavorativi: niente sabati, domeniche e festivi nazionali
--   (Capodanno, Epifania, Pasquetta, 25 aprile, 1° maggio, 2 giugno, Ferragosto, Ognissanti, Immacolata, Natale,
--   Santo Stefano). Scade alle 23:59 dell'ultimo giorno. Esempio con 2 giorni: prenoti venerdì → paghi entro martedì 23:59.
--   Se l'evento comincia prima, scade all'inizio dell'evento.
-- • Appena si prenota qualcosa da pagare parte un'email "promemoria di pagamento" (non è una ricevuta): importo,
--   causale, link per pagare, scadenza e link alla pagina della prenotazione. Passa dalla coda (limiti Resend).
-- • Nuova impostazione "si può pagare anche in segreteria": nel promemoria compare «oppure passa in segreteria a
--   saldare la prenotazione entro …, oltre la prenotazione decade».
-- • Opzioni extra al posto della sola "pizza": per ogni evento un elenco (nome, descrizione, prezzo, ordinabile fino al…),
--   es. "Pizza margherita", "Pizza per celiaci", "Bibita". La pizza già impostata diventa la prima opzione.
-- Va dopo la 170–174. Si può rilanciare.

alter table biglietterie add column if not exists paga_in_segreteria boolean not null default false;
alter table biglietteria_spettacoli add column if not exists extra jsonb not null default '[]'::jsonb;   -- [{id, nome, descrizione, prezzo_cent, entro}]
alter table biglietteria_prenotazioni add column if not exists extra jsonb not null default '[]'::jsonb; -- [{id, nome, quantita, prezzo_cent}]
-- la pizza impostata finora diventa la prima opzione extra
update biglietteria_spettacoli
   set extra = jsonb_build_array(jsonb_build_object('id', 'pizza', 'nome', 'Pizza', 'descrizione', '', 'prezzo_cent', pizza_cent, 'entro', pizza_entro)),
       pizza_cent = null, pizza_entro = null
 where pizza_cent is not null and extra = '[]'::jsonb;
update biglietteria_prenotazioni pr set extra = jsonb_build_array(jsonb_build_object('id', 'pizza', 'nome', 'Pizza', 'quantita', pr.pizze,
         'prezzo_cent', coalesce((select (o->>'prezzo_cent')::int from biglietteria_spettacoli s, jsonb_array_elements(s.extra) o
                                   where s.id = pr.spettacolo_id and o->>'id' = 'pizza'), 0)))
 where pr.pizze > 0 and pr.extra = '[]'::jsonb;

-- "2 × Pizza margherita, 1 × Bibita"
create or replace function biglietteria_extra_testo(p_extra jsonb, p_pizze int default 0)
returns text language sql immutable as $$
  select coalesce((select string_agg((o->>'quantita') || ' × ' || (o->>'nome'), ', ' order by ord)
                     from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) with ordinality t(o, ord) where (o->>'quantita')::int > 0),
                  case when coalesce(p_pizze, 0) > 0 then p_pizze || case when p_pizze = 1 then ' pizza' else ' pizze' end end, '');
$$;
grant execute on function biglietteria_extra_testo(jsonb, int) to anon, authenticated, service_role;

-- festivi nazionali italiani (Pasqua con l'algoritmo di Gauss/Meeus)
create or replace function festivo_it(d date)
returns boolean language plpgsql immutable as $$
declare y int := extract(year from d); a int; b int; c int; dd int; e int; f int; g int; h int; i int; k int; l int; m int; mese int; giorno int;
begin
  if to_char(d, 'MM-DD') in ('01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26') then return true; end if;
  a := y % 19; b := y / 100; c := y % 100; dd := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - dd - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  mese := (h + l - 7 * m + 114) / 31; giorno := ((h + l - 7 * m + 114) % 31) + 1;
  return d = make_date(y, mese, giorno) + 1;                                -- lunedì dell'Angelo
end $$;

-- la scadenza: p_giorni giorni lavorativi dopo oggi (oggi non conta), alle 23:59:59 ora italiana; mai dopo p_limite
create or replace function biglietteria_scadenza(p_giorni int, p_da timestamptz default now(), p_limite timestamptz default null)
returns timestamptz language plpgsql stable as $$
declare d date := (p_da at time zone 'Europe/Rome')::date; n int := 0; v timestamptz;
begin
  while n < greatest(coalesce(p_giorni, 4), 1) loop
    d := d + 1;
    if extract(isodow from d) < 6 and not festivo_it(d) then n := n + 1; end if;
  end loop;
  v := ((d + 1)::timestamp at time zone 'Europe/Rome') - interval '1 second';
  return case when p_limite is not null and p_limite < v then p_limite else v end;
end $$;
grant execute on function festivo_it(date) to anon, authenticated, service_role;
grant execute on function biglietteria_scadenza(int, timestamptz, timestamptz) to authenticated, service_role;

-- "entro mercoledì 10/12 alle 23:59"
create or replace function biglietteria_quando(t timestamptz)
returns text language sql immutable as $$
  select (array['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'])[extract(dow from t at time zone 'Europe/Rome')::int + 1]
         || ' ' || to_char(t at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');
$$;

-- il promemoria di pagamento per email (una volta per ordine, dalla prenotazione capo)
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
          E'\nLa tua prenotazione: ' || v_url || E'\n\n' || r.scuola,
          'promemoria:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return true;
end $$;
revoke all on function biglietteria_promemoria(uuid) from public, anon, authenticated;
grant execute on function biglietteria_promemoria(uuid) to service_role;

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

  v_contr := s.contributo_cent * case when s.contributo_per_posto then v_posti else 1 end;
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
        'liberi_dal', s.liberi_dal, 'max_per_prenotazione', s.max_per_prenotazione,
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

-- la pagina della prenotazione: anche "si può pagare in segreteria" (per il promemoria)
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
    'paga_in_segreteria', b.paga_in_segreteria, 'giorni_per_pagare', b.giorni_per_pagare,
    'eventi', (select jsonb_agg(jsonb_build_object('spettacolo', o.spettacolo, 'inizio', o.inizio, 'posti', o.posti, 'pizze', o.pizze, 'extra_testo', biglietteria_extra_testo(o.extra, o.pizze),
                                                   'totale_cent', o.totale_cent, 'allievo', o.allievo_nome, 'stato', o.stato) order by o.inizio)
                 from o where o.stato <> 'annullata'),
    'biglietti', case when pr.stato in ('pagata', 'gratis') then coalesce((
        select jsonb_agg(jsonb_build_object('numero', x.numero, 'di', o.posti, 'codice', x.codice, 'nome', x.nome, 'entrato', x.entrato_at is not null,
                                            'spettacolo', o.spettacolo, 'inizio', o.inizio, 'allievo', o.allievo_nome,
                                            'pizze', case when x.numero = 1 then o.pizze else 0 end, 'extra_testo', case when x.numero = 1 then biglietteria_extra_testo(o.extra, o.pizze) end) order by o.inizio, x.numero)
          from o join biglietteria_biglietti x on x.prenotazione_id = o.id where o.stato in ('pagata', 'gratis')), '[]'::jsonb) else '[]'::jsonb end)
    from pr join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id;
$$;
revoke all on function biglietteria_biglietti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_biglietti(uuid) to service_role;

-- email dei biglietti: con le opzioni extra
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
          v_url || E'\n\n' || 'A presto!' || E'\n' || r.scuola,
          'biglietti:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return r.posti;
end $$;
revoke all on function biglietteria_emetti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_emetti(uuid) to service_role;

-- ingresso: con le opzioni extra
create or replace function biglietteria_ingresso(p_codice text, p_spettacolo uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x biglietteria_biglietti; r biglietteria_prenotazioni; s biglietteria_spettacoli; v_esito text; v_prima timestamptz;
begin
  select * into x from biglietteria_biglietti where codice = upper(btrim(coalesce(p_codice, '')));
  if not found then return jsonb_build_object('esito', 'non_trovato'); end if;
  if not is_staff(x.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into r from biglietteria_prenotazioni where id = x.prenotazione_id;
  select * into s from biglietteria_spettacoli where id = r.spettacolo_id;
  v_prima := x.entrato_at;
  if r.stato not in ('pagata', 'gratis') then v_esito := 'non_valido';
  elsif p_spettacolo is not null and p_spettacolo <> s.id then v_esito := 'altro_spettacolo';
  elsif x.entrato_at is not null then v_esito := 'gia_entrato';
  else
    update biglietteria_biglietti set entrato_at = now(), entrato_da = auth.uid() where id = x.id;
    v_esito := 'ok';
  end if;
  return jsonb_build_object('esito', v_esito, 'codice', x.codice, 'numero', x.numero, 'di', r.posti,
    'nome', coalesce(x.nome, r.nome || ' ' || r.cognome), 'prenotato_da', r.nome || ' ' || r.cognome, 'allievo', r.allievo_nome, 'pizze', case when x.numero = 1 then r.pizze else 0 end, 'extra_testo', case when x.numero = 1 then biglietteria_extra_testo(r.extra, r.pizze) end,
    'spettacolo', s.titolo, 'spettacolo_id', s.id, 'inizio', s.inizio, 'entrato_prima', v_prima, 'stato', r.stato,
    'entrati', (select count(*) from biglietteria_biglietti y join biglietteria_prenotazioni z on z.id = y.prenotazione_id
                 where z.spettacolo_id = s.id and y.entrato_at is not null),
    'attesi', (select coalesce(sum(posti), 0) from biglietteria_prenotazioni where spettacolo_id = s.id and stato in ('pagata', 'gratis')));
end $$;
grant execute on function biglietteria_ingresso(text, uuid) to authenticated;

-- creazione: con le opzioni extra
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
                                         contributo_cent, contributo_per_posto, offerta_libera, pizza_cent, pizza_entro, chiedi_nascita, extra)
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
            case when jsonb_typeof(x->'extra') = 'array' then x->'extra' else '[]'::jsonb end);
  end loop;
  if not exists (select 1 from biglietteria_spettacoli where biglietteria_id = v_id) then raise exception 'nessuno_spettacolo'; end if;
  return v_id;
end $$;
revoke all on function biglietteria_crea(jsonb) from public, anon;
grant execute on function biglietteria_crea(jsonb) to authenticated;

notify pgrst, 'reload schema';
