-- 172 — Biglietteria per qualsiasi evento: si sceglie quanti spettacoli/eventi e com'è fatto ciascuno
-- • Correzione: creando la biglietteria del saggio usciva "null value in column offerta_libera": la biglietteria
--   veniva creata ma gli spettacoli no. Ora tutto si crea in un colpo solo (o niente), con la funzione qui sotto.
-- • Se c'è già una biglietteria con lo stesso nome rimasta senza spettacoli (quella dell'errore), la riusa.
-- • Locandina (computer e telefono) come pagina di benvenuto del link pubblico.
-- Va dopo la 170 e la 171. Si può rilanciare.

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
                                         contributo_cent, contributo_per_posto, offerta_libera, pizza_cent, pizza_entro)
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
            nullif(x->>'pizza_entro', '')::date);
  end loop;
  if not exists (select 1 from biglietteria_spettacoli where biglietteria_id = v_id) then raise exception 'nessuno_spettacolo'; end if;
  return v_id;
end $$;
revoke all on function biglietteria_crea(jsonb) from public, anon;
grant execute on function biglietteria_crea(jsonb) to authenticated;

-- la locandina: è la pagina di benvenuto del link pubblico (tocchi l'immagine e si apre la prenotazione).
-- Una per computer e, se serve, una diversa per il telefono (verticale).
alter table biglietterie add column if not exists locandina_url text;
alter table biglietterie add column if not exists locandina_mobile_url text;

create or replace function biglietteria_pubblica(p_palestra_slug text, p_slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select bi.* from biglietterie bi join palestre p on p.id = bi.palestra_id
     where p.slug = p_palestra_slug and (bi.slug = p_slug or (p_slug is null and bi.aperta))
     order by bi.aperta desc, bi.created_at desc limit 1)
  select jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'titolo', b.titolo, 'sottotitolo', b.sottotitolo, 'aperta', b.aperta,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'giorni_per_pagare', b.giorni_per_pagare, 'locandina_url', b.locandina_url, 'locandina_mobile_url', b.locandina_mobile_url,
    'spettacoli', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'titolo', s.titolo, 'descrizione', s.descrizione, 'inizio', s.inizio,
        'con_allievi', s.con_allievi, 'posti_per_allievo', s.posti_per_allievo,
        'limite_allievo', s.con_allievi and (s.liberi_dal is null or current_date < s.liberi_dal),
        'liberi_dal', s.liberi_dal, 'max_per_prenotazione', s.max_per_prenotazione,
        'contributo_cent', s.contributo_cent, 'contributo_per_posto', s.contributo_per_posto,
        'offerta_libera', s.offerta_libera,
        'pizza_cent', s.pizza_cent, 'pizza_entro', s.pizza_entro,
        'pizza_aperta', s.pizza_cent is not null and (s.pizza_entro is null or current_date <= s.pizza_entro),
        'chiuso', s.chiuso or s.inizio < now(),
        'posti_liberi', case when s.capienza is null then null else greatest(s.capienza - biglietteria_occupati(s.id), 0) end
      ) order by s.ordine, s.inizio) from biglietteria_spettacoli s where s.biglietteria_id = b.id), '[]'::jsonb))
  from b;
$$;
revoke all on function biglietteria_pubblica(text, text) from public, anon, authenticated;
grant execute on function biglietteria_pubblica(text, text) to service_role;

notify pgrst, 'reload schema';
