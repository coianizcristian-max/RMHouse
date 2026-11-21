-- 181 — Email dei biglietti con logo e immagine dell'evento
-- • In «Email e biglietto» si possono mettere il logo (in alto) e sotto l'immagine dell'evento: l'email di conferma
--   con i biglietti parte in versione grafica (immagini, testo, bottone «Apri i biglietti») e, per chi non vede le
--   immagini, anche in testo semplice come prima.
-- • Capienza: per ogni evento si può scegliere se gli allievi in elenco (che si esibiscono) occupano posti della sala.
--   Se sì, i posti liberi = capienza − posti prenotati − allievi in elenco.
-- • Ogni evento può avere la sua locandina (si vede nella scelta dell'evento e nei suoi dettagli).
-- Va dopo la 170–180. Si può rilanciare.

alter table biglietterie add column if not exists email_logo_url text;
alter table biglietterie add column if not exists email_immagine_url text;
alter table messaggi_coda add column if not exists html text;
alter table biglietteria_spettacoli add column if not exists capienza_con_allievi boolean not null default false;
-- la locandina del singolo evento (oltre a quella generale della biglietteria)
alter table biglietteria_spettacoli add column if not exists locandina_url text;

-- posti occupati: prenotazioni valide (+ gli allievi in elenco, se l'evento li conta nella capienza)
create or replace function biglietteria_occupati(p_spettacolo uuid, p_allievo uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(posti) from biglietteria_prenotazioni
                     where spettacolo_id = p_spettacolo and (p_allievo is null or allievo_id = p_allievo)
                       and (stato in ('pagata', 'gratis') or (stato = 'da_pagare' and (scade_at is null or scade_at > now())))), 0)
        + case when p_allievo is null and (select capienza_con_allievi from biglietteria_spettacoli where id = p_spettacolo)
               then (select count(*) from biglietteria_allievi where spettacolo_id = p_spettacolo) else 0 end)::int;
$$;

-- testo → email HTML semplice e sicura (testo con i caratteri speciali sistemati, link cliccabili)
create or replace function biglietteria_email_html(p_testo text, p_logo text, p_immagine text, p_link text, p_colore text)
returns text language sql immutable as $$
  with t as (select replace(replace(replace(coalesce(p_testo, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') x),
  l as (select regexp_replace(x, '(https?://[^\s<]+)', '<a href="\1" style="color:' || coalesce(p_colore, '#e50914') || '">\1</a>', 'g') x from t)
  select case when coalesce(p_logo, '') = '' and coalesce(p_immagine, '') = '' then null else
    '<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center" style="padding:20px 10px">'
    || '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#222">'
    || case when coalesce(p_logo, '') <> '' then '<tr><td align="center" style="padding:22px 20px 10px"><img src="' || replace(p_logo, '"', '') || '" alt="" style="max-height:70px;max-width:60%;display:block"></td></tr>' else '' end
    || case when coalesce(p_immagine, '') <> '' then '<tr><td><img src="' || replace(p_immagine, '"', '') || '" alt="" width="600" style="width:100%;max-width:600px;height:auto;display:block"></td></tr>' else '' end
    || '<tr><td style="padding:22px 24px;font-size:16px;line-height:1.5">' || replace(l.x, E'\n', '<br>') || '</td></tr>'
    || '<tr><td align="center" style="padding:0 24px 28px"><a href="' || replace(coalesce(p_link, ''), '"', '') || '" style="display:inline-block;padding:14px 26px;border-radius:999px;background:'
    || coalesce(p_colore, '#e50914') || ';color:#ffffff;font-weight:bold;text-decoration:none;font-size:16px">Apri i biglietti</a></td></tr>'
    || '</table></td></tr></table></body></html>' end
  from l;
$$;

create or replace function biglietteria_emetti(p_prenotazione uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_corpo text; q record; k int; v_cod text; v_url text; v_righe text := ''; v_capo uuid;
begin
  select pr.*, s.titolo as spettacolo, s.inizio, b.titolo as evento, b.email_oggetto, b.email_testo, b.email_logo_url, b.email_immagine_url, b.biglietto, p.base_url, p.nome as scuola
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
  v_corpo :=
          case when nullif(btrim(r.email_testo), '') is null then
            'Ciao ' || r.nome || E',\n\n' || 'grazie! La prenotazione ' || r.codice || ' è confermata:' || v_righe || E'\n\n' ||
            E'Qui trovi i biglietti, uno per persona, con il codice QR da mostrare all''ingresso (sul telefono o stampati):\n' ||
            v_url || E'\n\nPer eventuali modifiche alla prenotazione rivolgiti alla segreteria.\n\n' || 'A presto!' || E'\n' || r.scuola
          else
            -- testo scritto dalla segreteria; il link ai biglietti c'è sempre (se manca {link} lo aggiungo in fondo)
            biglietteria_segnaposti(r.email_testo, r.nome, r.cognome, r.codice, ltrim(v_righe, E'\n'), v_url, r.scuola, r.evento)
            || case when position('{link}' in r.email_testo) = 0 then E'\n\nI tuoi biglietti: ' || v_url else '' end
          end;
  insert into messaggi_coda (palestra_id, evento, canale, destinatario, oggetto, corpo, html, chiave)
  values (r.palestra_id, 'biglietti', 'email', r.email,
          biglietteria_segnaposti(coalesce(nullif(btrim(r.email_oggetto), ''), 'I tuoi biglietti · {evento}'), r.nome, r.cognome, r.codice, ltrim(v_righe, E'\n'), v_url, r.scuola, r.evento),
          v_corpo,
          biglietteria_email_html(v_corpo, r.email_logo_url, r.email_immagine_url, v_url, coalesce(r.biglietto->>'accento', '#e50914')),
          'biglietti:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return r.posti;
end $$;
revoke all on function biglietteria_emetti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_emetti(uuid) to service_role;

-- pagina pubblica: anche la locandina di ogni evento
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
        'id', s.id, 'titolo', s.titolo, 'locandina_url', s.locandina_url, 'descrizione', s.descrizione, 'inizio', s.inizio,
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
