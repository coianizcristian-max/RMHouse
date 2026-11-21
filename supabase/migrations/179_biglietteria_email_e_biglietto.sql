-- 179 — Biglietteria: email dei biglietti personalizzabile e grafica del biglietto
-- • Pagamento e testi → «Email e biglietto»: oggetto e testo dell'email di conferma (con i biglietti) scritti da te,
--   con i segnaposti {nome} {cognome} {codice} {eventi} {link} {evento} {scuola}. Vuoto = testo di sempre.
-- • Il biglietto: una schermata di telefono per persona, con colori, logo, immagine, titolo, testi e il QR grande.
-- • Messaggio personalizzato nella pagina che compare appena finita la prenotazione.
-- Va dopo la 170–178. Si può rilanciare.

alter table biglietterie add column if not exists email_oggetto text;
alter table biglietterie add column if not exists email_testo text;
alter table biglietterie add column if not exists biglietto jsonb not null default '{}'::jsonb;
-- messaggio nella pagina che si vede appena finita la prenotazione
alter table biglietterie add column if not exists testo_conferma text;

create or replace function biglietteria_segnaposti(t text, p_nome text, p_cognome text, p_codice text, p_eventi text, p_link text, p_scuola text, p_evento text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(coalesce(t, ''),
    '{nome}', coalesce(p_nome, '')), '{cognome}', coalesce(p_cognome, '')), '{codice}', coalesce(p_codice, '')),
    '{eventi}', coalesce(p_eventi, '')), '{link}', coalesce(p_link, '')), '{scuola}', coalesce(p_scuola, '')), '{evento}', coalesce(p_evento, ''));
$$;

create or replace function biglietteria_emetti(p_prenotazione uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; q record; k int; v_cod text; v_url text; v_righe text := ''; v_capo uuid;
begin
  select pr.*, s.titolo as spettacolo, s.inizio, b.titolo as evento, b.email_oggetto, b.email_testo, p.base_url, p.nome as scuola
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
          biglietteria_segnaposti(coalesce(nullif(btrim(r.email_oggetto), ''), 'I tuoi biglietti · {evento}'), r.nome, r.cognome, r.codice, ltrim(v_righe, E'\n'), v_url, r.scuola, r.evento),
          case when nullif(btrim(r.email_testo), '') is null then
            'Ciao ' || r.nome || E',\n\n' || 'grazie! La prenotazione ' || r.codice || ' è confermata:' || v_righe || E'\n\n' ||
            E'Qui trovi i biglietti, uno per persona, con il codice QR da mostrare all''ingresso (sul telefono o stampati):\n' ||
            v_url || E'\n\nPer eventuali modifiche alla prenotazione rivolgiti alla segreteria.\n\n' || 'A presto!' || E'\n' || r.scuola
          else
            -- testo scritto dalla segreteria; il link ai biglietti c'è sempre (se manca {link} lo aggiungo in fondo)
            biglietteria_segnaposti(r.email_testo, r.nome, r.cognome, r.codice, ltrim(v_righe, E'\n'), v_url, r.scuola, r.evento)
            || case when position('{link}' in r.email_testo) = 0 then E'\n\nI tuoi biglietti: ' || v_url else '' end
          end,
          'biglietti:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return r.posti;
end $$;
revoke all on function biglietteria_emetti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_emetti(uuid) to service_role;

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
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe, 'biglietto', b.biglietto,
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

-- pagina pubblica: anche il messaggio dopo la prenotazione
create or replace function biglietteria_pubblica(p_palestra_slug text, p_slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select bi.* from biglietterie bi join palestre p on p.id = bi.palestra_id
     where p.slug = p_palestra_slug and (bi.slug = p_slug or (p_slug is null and bi.aperta))
     order by bi.aperta desc, bi.created_at desc limit 1)
  select jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'titolo', b.titolo, 'sottotitolo', b.sottotitolo, 'aperta', b.aperta,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'giorni_per_pagare', b.giorni_per_pagare, 'scadenza_pagamento', case when b.scadenza_attiva then biglietteria_scadenza(b.giorni_per_pagare, now(), null) end, 'scadenza_attiva', b.scadenza_attiva, 'paga_in_segreteria', b.paga_in_segreteria, 'testo_conferma', b.testo_conferma, 'locandina_url', b.locandina_url, 'locandina_mobile_url', b.locandina_mobile_url,
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

notify pgrst, 'reload schema';
