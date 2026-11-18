-- 171 — Biglietteria: allievi con lo stesso nome e la stessa iniziale del cognome; nome per esteso dopo la conferma
-- • Nell'elenco del gruppo, se due allievi si chiamerebbero uguali (es. due "Sofia R."), si mostrano più lettere del
--   cognome finché sono diversi ("Sofia Ros." / "Sofia Rom."). Se anche il cognome è identico: "Sofia Rossi (1)", "(2)".
-- • Dopo la data di nascita giusta la pagina mostra nome e cognome per esteso (es. "Sofia Rossi · Aerea Kids 1 ✓"),
--   così il parente è sicuro di aver scelto l'allievo giusto.
-- • Registro d'ingresso per la segreteria: spunta a mano chi entra (biglietteria_segna), anche senza QR.
-- • Nominativi di ogni persona, mai due volte nello stesso spettacolo (vedi sotto).
-- Va dopo la 170. Si può rilanciare.

create or replace function biglietteria_elenco(p_spettacolo uuid, p_gruppo text)
returns jsonb language sql stable security definer set search_path = public as $$
  with g as (
    select a.id, a.nome, a.cognome, lower(btrim(a.nome)) n, lower(btrim(a.cognome)) c
      from biglietteria_allievi a
     where a.spettacolo_id = p_spettacolo and coalesce(nullif(a.gruppo, ''), 'Altri') = p_gruppo
  ), l as (
    -- quante lettere del cognome servono perché nessun altro con lo stesso nome abbia lo stesso inizio
    select g.*,
           coalesce((select min(k) from generate_series(1, greatest(length(g.c), 1)) k
                      where not exists (select 1 from g x where x.id <> g.id and x.n = g.n and left(x.c, k) = left(g.c, k))), length(g.c) + 1) as lettere,
           row_number() over (partition by g.n, g.c order by g.cognome, g.id) as num,
           count(*) over (partition by g.n, g.c) as uguali
      from g
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome,
           'cognome', case
             when length(l.cognome) = 0 then case when l.uguali > 1 then '(' || l.num || ')' else '' end
             when l.uguali > 1 then l.cognome || ' (' || l.num || ')'                                   -- stesso nome e cognome
             when l.lettere >= length(l.cognome) then l.cognome                                        -- serve tutto il cognome
             else left(l.cognome, greatest(l.lettere, 1)) || '.' end)
         order by l.nome, l.cognome, l.num), '[]'::jsonb)
    from l;
$$;
revoke all on function biglietteria_elenco(uuid, text) from public, anon, authenticated;
grant execute on function biglietteria_elenco(uuid, text) to service_role;

-- conferma con la data di nascita: come prima, ma con nome e cognome per esteso
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
  if a.errori_nascita >= 8 then return jsonb_build_object('ok', false, 'errore', 'troppi_tentativi'); end if;
  if a.data_nascita is not null and a.data_nascita is distinct from p_nascita then
    update biglietteria_allievi set errori_nascita = errori_nascita + 1, errori_dal = coalesce(errori_dal, now()) where id = a.id;
    return jsonb_build_object('ok', false, 'errore', 'nascita_errata');
  end if;
  select * into s from biglietteria_spettacoli where id = a.spettacolo_id;
  return jsonb_build_object('ok', true, 'nome', btrim(a.nome || ' ' || a.cognome), 'gruppo', a.gruppo,
                            'spettacolo', s.titolo, 'senza_data', a.data_nascita is null,
                            'rimasti', greatest(s.posti_per_allievo - biglietteria_occupati(s.id, a.id), 0));
end $$;
revoke all on function biglietteria_verifica(uuid, date) from public, anon, authenticated;
grant execute on function biglietteria_verifica(uuid, date) to service_role;

-- registro dell'ingresso dalla segreteria (spunta a mano, senza QR): segna o toglie l'entrata di un biglietto
create or replace function biglietteria_segna(p_biglietto uuid, p_entrato boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x biglietteria_biglietti; r biglietteria_prenotazioni;
begin
  select * into x from biglietteria_biglietti where id = p_biglietto;
  if not found then raise exception 'biglietto_non_trovato'; end if;
  if not is_staff(x.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into r from biglietteria_prenotazioni where id = x.prenotazione_id;
  if r.stato not in ('pagata', 'gratis') then raise exception 'non_valido'; end if;
  update biglietteria_biglietti
     set entrato_at = case when p_entrato then coalesce(entrato_at, now()) end,
         entrato_da = case when p_entrato then coalesce(entrato_da, auth.uid()) end
   where id = x.id
  returning * into x;
  return jsonb_build_object('id', x.id, 'entrato_at', x.entrato_at);
end $$;
grant execute on function biglietteria_segna(uuid, boolean) to authenticated;


-- • Nominativi: chi prenota scrive nome e cognome di OGNI persona (uno per posto). La stessa persona non può
--   comparire due volte nello stesso spettacolo (neanche in due prenotazioni diverse, finché non è annullata o
--   scaduta). Il nome va sul biglietto, nel registro e all'ingresso.
alter table biglietteria_prenotazioni add column if not exists partecipanti jsonb not null default '[]';
alter table biglietteria_biglietti add column if not exists nome text;

-- "  Rossi  Mário " → "mario rossi" (per confrontare i nominativi)
create or replace function nome_norm(p_nome text, p_cognome text)
returns text language sql immutable as $$
  select btrim(regexp_replace(lower(translate(coalesce(p_nome, '') || ' ' || coalesce(p_cognome, ''),
           'ÀÁÂÄàáâäÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÖòóôöÙÚÛÜùúûüÇçÑñ''’', 'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuCcNn  ')), '\s+', ' ', 'g'));
$$;

create or replace function biglietteria_emetti(p_prenotazione uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; k int; v_cod text; v_url text;
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
  v_url := rtrim(coalesce(r.base_url, ''), '/') || '/biglietti/' || r.token;
  insert into messaggi_coda (palestra_id, evento, canale, destinatario, oggetto, corpo, chiave)
  values (r.palestra_id, 'biglietti', 'email', r.email,
          'I tuoi biglietti · ' || r.evento,
          'Ciao ' || r.nome || E',\n\n' ||
          'grazie! La prenotazione ' || r.codice || ' è confermata: ' || r.posti || case when r.posti = 1 then ' posto' else ' posti' end ||
          ' per «' || r.spettacolo || '», ' || to_char(r.inizio at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI') ||
          case when r.pizze > 0 then ' · ' || r.pizze || case when r.pizze = 1 then ' pizza' else ' pizze' end else '' end || E'.\n\n' ||
          E'Qui trovi i biglietti, uno per persona, con il codice QR da mostrare all''ingresso (sul telefono o stampati):\n' ||
          v_url || E'\n\n' || 'A presto!' || E'\n' || r.scuola,
          'biglietti:' || r.id)
  on conflict (palestra_id, chiave) do nothing;
  return r.posti;
end $$;
revoke all on function biglietteria_emetti(uuid) from public, anon, authenticated;

create or replace function biglietteria_prenota(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s biglietteria_spettacoli; b biglietterie; al biglietteria_allievi; v_posti int; v_pizze int; v_offerta int;
        v_contr int; v_tot int; v_id uuid; v_cod text; v_stato text; v_occ int; v_email text; v_token uuid; v_ver jsonb;
        v_part jsonb := '[]'; x jsonb; v_doppio text; v_visti text[] := '{}'; v_n text;
begin
  select * into s from biglietteria_spettacoli where id = nullif(p->>'spettacolo_id', '')::uuid;
  if not found then raise exception 'spettacolo_non_trovato'; end if;
  select * into b from biglietterie where id = s.biglietteria_id;
  if not b.aperta or s.chiuso or s.inizio < now() then raise exception 'prenotazioni_chiuse'; end if;

  v_posti := coalesce((p->>'posti')::int, 0);
  if v_posti < 1 or v_posti > s.max_per_prenotazione then raise exception 'posti_non_validi'; end if;
  v_pizze := coalesce((p->>'pizze')::int, 0);
  if v_pizze < 0 or v_pizze > 50 then raise exception 'pizze_non_valide'; end if;
  if v_pizze > 0 and not (s.pizza_cent is not null and (s.pizza_entro is null or current_date <= s.pizza_entro)) then
    raise exception 'pizza_chiusa';
  end if;
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
  v_tot := v_contr + v_pizze * coalesce(s.pizza_cent, 0) + v_offerta;
  v_stato := case when v_tot = 0 then 'gratis' else 'da_pagare' end;
  loop
    v_cod := codice_corto(6);
    exit when not exists (select 1 from biglietteria_prenotazioni where codice = v_cod);
  end loop;
  insert into biglietteria_prenotazioni (palestra_id, spettacolo_id, allievo_id, allievo_nome, nome, cognome, email, telefono,
                                         posti, pizze, offerta_cent, contributo_cent, totale_cent, stato, metodo, codice, scade_at, note, partecipanti)
  values (s.palestra_id, s.id, al.id, case when al.id is not null then btrim(al.nome || ' ' || al.cognome) end,
          left(btrim(p->>'nome'), 80), left(btrim(p->>'cognome'), 80), left(v_email, 200), left(nullif(btrim(p->>'telefono'), ''), 30),
          v_posti, v_pizze, v_offerta, v_contr, v_tot, v_stato, case when v_tot = 0 then 'gratis' end, v_cod,
          case when v_tot > 0 then now() + make_interval(days => greatest(b.giorni_per_pagare, 1)) end,
          left(nullif(btrim(p->>'note'), ''), 300), v_part)
  returning id, token into v_id, v_token;
  if v_stato = 'gratis' then perform biglietteria_emetti(v_id); end if;
  return jsonb_build_object('id', v_id, 'token', v_token, 'codice', v_cod, 'totale_cent', v_tot, 'stato', v_stato);
end $$;
revoke all on function biglietteria_prenota(jsonb) from public, anon, authenticated;

create or replace function biglietteria_biglietti(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', pr.id, 'codice', pr.codice, 'stato', case when pr.stato = 'da_pagare' and pr.scade_at < now() then 'scaduta' else pr.stato end,
    'nome', pr.nome, 'cognome', pr.cognome, 'posti', pr.posti, 'pizze', pr.pizze, 'totale_cent', pr.totale_cent,
    'allievo', pr.allievo_nome, 'scade_at', pr.scade_at, 'partecipanti', pr.partecipanti,
    'spettacolo', s.titolo, 'inizio', s.inizio, 'evento', b.titolo, 'slug', b.slug,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'biglietti', case when pr.stato in ('pagata', 'gratis') then coalesce((select jsonb_agg(jsonb_build_object('numero', x.numero, 'codice', x.codice, 'nome', x.nome, 'entrato', x.entrato_at is not null) order by x.numero)
                     from biglietteria_biglietti x where x.prenotazione_id = pr.id), '[]'::jsonb) else '[]'::jsonb end)
    from biglietteria_prenotazioni pr join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id
   where pr.token = p_token;
$$;
revoke all on function biglietteria_biglietti(uuid) from public, anon, authenticated;

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
    'nome', coalesce(x.nome, r.nome || ' ' || r.cognome), 'prenotato_da', r.nome || ' ' || r.cognome, 'allievo', r.allievo_nome, 'pizze', case when x.numero = 1 then r.pizze else 0 end,
    'spettacolo', s.titolo, 'spettacolo_id', s.id, 'inizio', s.inizio, 'entrato_prima', v_prima, 'stato', r.stato,
    'entrati', (select count(*) from biglietteria_biglietti y join biglietteria_prenotazioni z on z.id = y.prenotazione_id
                 where z.spettacolo_id = s.id and y.entrato_at is not null),
    'attesi', (select coalesce(sum(posti), 0) from biglietteria_prenotazioni where spettacolo_id = s.id and stato in ('pagata', 'gratis')));
end $$;
grant execute on function biglietteria_ingresso(text, uuid) to authenticated;

notify pgrst, 'reload schema';
