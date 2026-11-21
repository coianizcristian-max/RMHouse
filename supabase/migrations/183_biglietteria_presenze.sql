-- 183 — Ingresso del saggio: presenze (quanti sono entrati, quanti mancano e chi)
-- • biglietteria_presenze: per lo spettacolo scelto (o tutti) i numeri e l'elenco di chi deve ancora entrare
--   (e di chi è entrato, con l'ora). Lo usa la pagina Ingresso (scanner dei QR) delle segretarie.
-- • Colore di ogni evento impostabile (vuoto = automatico: 1° rosso, 2° blu, 3° viola…).
-- Va dopo la 170–182. Si può rilanciare.

create or replace function biglietteria_presenze(p_biglietteria uuid, p_spettacolo uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pal uuid;
begin
  select palestra_id into v_pal from biglietterie where id = p_biglietteria;
  if v_pal is null or not is_staff(v_pal) then raise exception 'non_autorizzato'; end if;
  return (
    with t as (
      select x.id, x.codice, x.numero, x.entrato_at, coalesce(x.nome, pr.nome || ' ' || pr.cognome) as nome,
             pr.nome || ' ' || pr.cognome as prenotato_da, pr.allievo_nome as allievo, s.id as spettacolo_id, s.titolo as spettacolo, s.inizio
        from biglietteria_biglietti x
        join biglietteria_prenotazioni pr on pr.id = x.prenotazione_id
        join biglietteria_spettacoli s on s.id = pr.spettacolo_id
       where s.biglietteria_id = p_biglietteria and pr.stato in ('pagata', 'gratis')
         and (p_spettacolo is null or s.id = p_spettacolo))
    select jsonb_build_object(
      'attesi', (select count(*) from t),
      'entrati', (select count(*) from t where entrato_at is not null),
      'mancanti', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'codice', codice, 'nome', nome, 'prenotato_da', prenotato_da,
                              'allievo', allievo, 'spettacolo', spettacolo, 'inizio', inizio) order by inizio, nome) from t where entrato_at is null), '[]'::jsonb),
      'dentro', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'codice', codice, 'nome', nome, 'prenotato_da', prenotato_da,
                              'allievo', allievo, 'spettacolo', spettacolo, 'entrato_at', entrato_at) order by entrato_at desc) from t where entrato_at is not null), '[]'::jsonb))
  );
end $$;
revoke all on function biglietteria_presenze(uuid, uuid) from public, anon;
grant execute on function biglietteria_presenze(uuid, uuid) to authenticated;

alter table biglietteria_spettacoli add column if not exists colore text;

create or replace function biglietteria_pubblica(p_palestra_slug text, p_slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select bi.* from biglietterie bi join palestre p on p.id = bi.palestra_id
     where p.slug = p_palestra_slug and (bi.slug = p_slug or (p_slug is null and bi.aperta))
     order by bi.aperta desc, bi.created_at desc limit 1)
  select jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'titolo', b.titolo, 'sottotitolo', b.sottotitolo, 'aperta', b.aperta,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'giorni_per_pagare', b.giorni_per_pagare, 'scadenza_pagamento', case when b.scadenza_attiva then biglietteria_scadenza(b.giorni_per_pagare, now(), null) end, 'scadenza_attiva', b.scadenza_attiva, 'paga_in_segreteria', b.paga_in_segreteria, 'testo_conferma', b.testo_conferma, 'testo_riepilogo', b.testo_riepilogo, 'locandina_url', b.locandina_url, 'locandina_mobile_url', b.locandina_mobile_url,
    'spettacoli', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'titolo', s.titolo, 'locandina_url', s.locandina_url, 'colore', s.colore, 'descrizione', s.descrizione, 'inizio', s.inizio,
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

create or replace function biglietteria_biglietti(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with pr as (select * from biglietteria_prenotazioni where token = p_token),
  o as (select q.*, s.titolo as spettacolo, s.inizio, s.colore as colore_evento,
              -- posizione dell'evento nel programma (1, 2, 3…): dà il colore, come nella pagina di prenotazione
              (select count(*) from biglietteria_spettacoli z where z.biglietteria_id = s.biglietteria_id
                  and (z.ordine < s.ordine or (z.ordine = s.ordine and z.inizio <= s.inizio))) as n_evento
         from pr, biglietteria_ordine(pr.id) q join biglietteria_spettacoli s on s.id = q.spettacolo_id)
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
                                            'spettacolo', o.spettacolo, 'inizio', o.inizio, 'allievo', o.allievo_nome, 'n_evento', o.n_evento, 'colore', o.colore_evento,
                                            'pizze', case when x.numero = 1 then o.pizze else 0 end, 'extra_testo', case when x.numero = 1 then biglietteria_extra_testo(o.extra, o.pizze) end) order by o.inizio, x.numero)
          from o join biglietteria_biglietti x on x.prenotazione_id = o.id where o.stato in ('pagata', 'gratis')), '[]'::jsonb) else '[]'::jsonb end)
    from pr join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id;
$$;
revoke all on function biglietteria_biglietti(uuid) from public, anon, authenticated;
grant execute on function biglietteria_biglietti(uuid) to service_role;

notify pgrst, 'reload schema';
