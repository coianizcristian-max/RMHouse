-- 170 — Biglietteria del saggio (pagina pubblica a sé: prenotazione posti, pagamento, biglietti con QR, ingresso)
-- • Una "biglietteria" (es. Saggio di Natale) con più spettacoli/eventi (es. 15:30 aerea e pole, 18:00 street, 19:00 party).
-- • Spettacoli "con allievi": la segreteria carica UN file (Excel o CSV) con gli iscritti: nome, cognome, gruppo,
--   spettacolo (1, 2…) e data di nascita. Il pubblico sceglie spettacolo → gruppo → allievo e conferma di essere un
--   parente scrivendo la data di nascita dell'allievo; poi prenota fino a N posti per allievo (es. 2). Dopo 8 date
--   sbagliate in un giorno l'allievo si blocca fino al giorno dopo. Dal giorno "liberi dal" il limite per allievo cade:
--   i posti che restano sono di tutti (senza allievo). Lo spettacolo senza allievi (party) è aperto a tutti.
-- • Contributo obbligatorio (a prenotazione o a posto), offerta libera facoltativa, pizza a prezzo fisso entro una data.
-- • Si paga con il link (Satispay o altro) e la segreteria conferma; oppure con carta (Stripe) se acceso: conferma da sola.
--   Gratis (totale 0) = biglietti subito.
-- • Confermato il pagamento: un biglietto con QR per ogni posto, link ai biglietti per email (in coda: rispetta i limiti di
--   Resend, nessuna email si perde). Il giorno dell'evento lo staff inquadra il QR: entrato / già entrato / non valido.
-- • L'incasso confermato va anche negli Incassi (causale evento).
-- Si può rilanciare.

create table if not exists biglietterie (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  slug text not null,
  titolo text not null,
  sottotitolo text,
  aperta boolean not null default false,          -- la pagina pubblica accetta prenotazioni
  link_pagamento text,                            -- es. il link Satispay della scuola
  istruzioni_pagamento text,                      -- es. "nella causale scrivi il codice"
  stripe boolean not null default false,          -- anche pagamento con carta (se Stripe è attivo sul sito)
  giorni_per_pagare int not null default 4,       -- i posti non pagati tornano liberi dopo questi giorni
  created_at timestamptz not null default now(),
  unique (palestra_id, slug)
);

create table if not exists biglietteria_spettacoli (
  id uuid primary key default gen_random_uuid(),
  biglietteria_id uuid not null references biglietterie(id) on delete cascade,
  palestra_id uuid not null references palestre(id) on delete cascade,
  titolo text not null,
  descrizione text,
  inizio timestamptz not null,
  ordine int not null default 0,
  con_allievi boolean not null default true,      -- si prenota associandosi a un allievo dell'elenco
  posti_per_allievo int not null default 2,
  liberi_dal date,                                -- da questo giorno niente limite per allievo (resta la capienza)
  capienza int,                                   -- vuoto = senza limite
  max_per_prenotazione int not null default 10,
  contributo_cent int not null default 0,         -- obbligatorio; 0 = ingresso gratuito
  contributo_per_posto boolean not null default false,
  offerta_libera boolean not null default false,  -- "contribuisci alla raccolta fondi" (facoltativo, importo libero)
  pizza_cent int,                                 -- vuoto = niente pizza
  pizza_entro date,
  chiuso boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists biglietteria_spettacoli_b on biglietteria_spettacoli (biglietteria_id, ordine, inizio);

create table if not exists biglietteria_allievi (
  id uuid primary key default gen_random_uuid(),
  spettacolo_id uuid not null references biglietteria_spettacoli(id) on delete cascade,
  palestra_id uuid not null references palestre(id) on delete cascade,
  nome text not null,
  cognome text not null default '',
  gruppo text,                                    -- il gruppo/corso: il pubblico sceglie prima questo
  data_nascita date,                              -- la scrive il parente per confermare
  errori_nascita int not null default 0,          -- date sbagliate (si azzera dopo un giorno)
  errori_dal timestamptz,
  created_at timestamptz not null default now()
);
alter table biglietteria_allievi add column if not exists data_nascita date;
alter table biglietteria_allievi add column if not exists errori_nascita int not null default 0;
alter table biglietteria_allievi add column if not exists errori_dal timestamptz;
create index if not exists biglietteria_allievi_s on biglietteria_allievi (spettacolo_id);

create table if not exists biglietteria_prenotazioni (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  spettacolo_id uuid not null references biglietteria_spettacoli(id) on delete cascade,
  allievo_id uuid references biglietteria_allievi(id) on delete set null,
  allievo_nome text,                              -- copiato: resta anche se l'elenco viene ricaricato
  nome text not null,
  cognome text not null,
  email text not null,
  telefono text,
  posti int not null check (posti between 1 and 100),
  pizze int not null default 0 check (pizze between 0 and 100),
  offerta_cent int not null default 0 check (offerta_cent between 0 and 100000),
  contributo_cent int not null default 0,
  totale_cent int not null default 0,
  stato text not null default 'da_pagare' check (stato in ('da_pagare', 'pagata', 'gratis', 'annullata')),
  metodo text,
  codice text not null unique,                    -- da scrivere nella causale del pagamento
  token uuid not null unique default gen_random_uuid(),   -- il link dei biglietti
  scade_at timestamptz,
  pagata_at timestamptz,
  confermata_da uuid,
  stripe_session text,
  pagamento_id uuid references pagamenti(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists biglietteria_prenotazioni_s on biglietteria_prenotazioni (spettacolo_id, stato);
create index if not exists biglietteria_prenotazioni_a on biglietteria_prenotazioni (allievo_id);

create table if not exists biglietteria_biglietti (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  prenotazione_id uuid not null references biglietteria_prenotazioni(id) on delete cascade,
  numero int not null,
  codice text not null unique,
  entrato_at timestamptz,
  entrato_da uuid,
  unique (prenotazione_id, numero)
);

-- permessi: lo staff legge, la gestione scrive; il pubblico passa solo dalle funzioni qui sotto (dal server)
do $$
declare t text;
begin
  foreach t in array array['biglietterie', 'biglietteria_spettacoli', 'biglietteria_allievi', 'biglietteria_prenotazioni', 'biglietteria_biglietti'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_legge on %I', t);
    execute format('create policy staff_legge on %I for select to authenticated using (is_staff(palestra_id))', t);
    execute format('drop policy if exists gestione_scrive on %I', t);
    execute format('create policy gestione_scrive on %I for all to authenticated using (is_gestione(palestra_id)) with check (is_gestione(palestra_id))', t);
  end loop;
end $$;

-- un codice corto e leggibile (niente 0/O, 1/I/L)
create or replace function codice_corto(n int)
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
    from generate_series(1, n);
$$;

-- posti occupati di uno spettacolo: pagati, gratis e quelli in attesa di pagamento non ancora scaduti
create or replace function biglietteria_occupati(p_spettacolo uuid, p_allievo uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(posti), 0)::int from biglietteria_prenotazioni
   where spettacolo_id = p_spettacolo and (p_allievo is null or allievo_id = p_allievo)
     and (stato in ('pagata', 'gratis') or (stato = 'da_pagare' and (scade_at is null or scade_at > now())));
$$;

-- la pagina pubblica: la biglietteria aperta (o quella dello slug) con i suoi spettacoli
create or replace function biglietteria_pubblica(p_palestra_slug text, p_slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select bi.* from biglietterie bi join palestre p on p.id = bi.palestra_id
     where p.slug = p_palestra_slug and (bi.slug = p_slug or (p_slug is null and bi.aperta))
     order by bi.aperta desc, bi.created_at desc limit 1)
  select jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'titolo', b.titolo, 'sottotitolo', b.sottotitolo, 'aperta', b.aperta,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'giorni_per_pagare', b.giorni_per_pagare,
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

drop function if exists biglietteria_cerca(uuid, text);

-- i gruppi di uno spettacolo (primo menu della pagina pubblica)
create or replace function biglietteria_gruppi(p_spettacolo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('gruppo', g, 'allievi', n) order by g), '[]'::jsonb)
    from (select coalesce(nullif(gruppo, ''), 'Altri') g, count(*) n from biglietteria_allievi where spettacolo_id = p_spettacolo group by 1) x;
$$;
revoke all on function biglietteria_gruppi(uuid) from public, anon, authenticated;

-- gli allievi di un gruppo (secondo menu): nome e iniziale del cognome, niente altro
create or replace function biglietteria_elenco(p_spettacolo uuid, p_gruppo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome,
                    'cognome', case when length(a.cognome) > 0 then left(a.cognome, 1) || '.' else '' end) order by a.nome, a.cognome), '[]'::jsonb)
    from biglietteria_allievi a
   where a.spettacolo_id = p_spettacolo and coalesce(nullif(a.gruppo, ''), 'Altri') = p_gruppo;
$$;
revoke all on function biglietteria_elenco(uuid, text) from public, anon, authenticated;

-- il parente conferma con la data di nascita dell'allievo. Conta gli errori (8 al giorno, poi bloccato fino a domani).
-- Non solleva errori: così il conteggio resta salvato anche quando la data è sbagliata.
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
  return jsonb_build_object('ok', true, 'nome', a.nome || case when length(a.cognome) > 0 then ' ' || left(a.cognome, 1) || '.' else '' end,
                            'gruppo', a.gruppo, 'rimasti', greatest(s.posti_per_allievo - biglietteria_occupati(s.id, a.id), 0));
end $$;
revoke all on function biglietteria_verifica(uuid, date) from public, anon, authenticated;

-- i biglietti (uno per posto) e l'email con il link, in coda: parte rispettando i limiti di Resend
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
    insert into biglietteria_biglietti (palestra_id, prenotazione_id, numero, codice) values (r.palestra_id, r.id, k, v_cod);
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

-- prenotazione dalla pagina pubblica (la chiama il server del sito)
create or replace function biglietteria_prenota(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s biglietteria_spettacoli; b biglietterie; al biglietteria_allievi; v_posti int; v_pizze int; v_offerta int;
        v_contr int; v_tot int; v_id uuid; v_cod text; v_stato text; v_occ int; v_email text; v_token uuid; v_ver jsonb;
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

  -- un pagamento alla volta per spettacolo: niente doppioni accidentali (stessa email, stesso allievo, in attesa)
  perform pg_advisory_xact_lock(hashtext('biglietteria:' || s.id));

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
                                         posti, pizze, offerta_cent, contributo_cent, totale_cent, stato, metodo, codice, scade_at, note)
  values (s.palestra_id, s.id, al.id, case when al.id is not null then btrim(al.nome || ' ' || al.cognome) end,
          left(btrim(p->>'nome'), 80), left(btrim(p->>'cognome'), 80), left(v_email, 200), left(nullif(btrim(p->>'telefono'), ''), 30),
          v_posti, v_pizze, v_offerta, v_contr, v_tot, v_stato, case when v_tot = 0 then 'gratis' end, v_cod,
          case when v_tot > 0 then now() + make_interval(days => greatest(b.giorni_per_pagare, 1)) end,
          left(nullif(btrim(p->>'note'), ''), 300))
  returning id, token into v_id, v_token;
  if v_stato = 'gratis' then perform biglietteria_emetti(v_id); end if;
  return jsonb_build_object('id', v_id, 'token', v_token, 'codice', v_cod, 'totale_cent', v_tot, 'stato', v_stato);
end $$;
revoke all on function biglietteria_prenota(jsonb) from public, anon, authenticated;

-- pagamento arrivato: dalla segreteria (link Satispay, bonifico, contanti…) o da Stripe (webhook, senza utente)
-- → biglietti + email, e l'incasso negli Incassi
create or replace function biglietteria_conferma(p_prenotazione uuid, p_metodo text default 'satispay',
                                                 p_session text default null, p_intent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r biglietteria_prenotazioni; s biglietteria_spettacoli; v_pag uuid;
begin
  select * into r from biglietteria_prenotazioni where id = p_prenotazione for update;
  if not found then raise exception 'prenotazione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_metodo not in ('satispay', 'bonifico', 'contanti', 'pos', 'stripe', 'altro') then raise exception 'metodo_non_valido'; end if;
  if r.stato in ('pagata', 'gratis') then return jsonb_build_object('gia', true, 'biglietti', r.posti); end if;
  select * into s from biglietteria_spettacoli where id = r.spettacolo_id;
  if r.totale_cent > 0 then
    insert into pagamenti (palestra_id, causale, descrizione, importo_cent, metodo, stato, pagato_at, stripe_session_id, stripe_payment_intent)
    values (r.palestra_id, 'evento',
            s.titolo || ' · ' || r.nome || ' ' || r.cognome || ' · ' || r.posti || case when r.posti = 1 then ' posto' else ' posti' end
              || case when r.pizze > 0 then ' + ' || r.pizze || ' pizz' || case when r.pizze = 1 then 'a' else 'e' end else '' end
              || ' (' || r.codice || ')',
            r.totale_cent, p_metodo, 'pagato', now(), p_session, p_intent)
    returning id into v_pag;
  end if;
  update biglietteria_prenotazioni
     set stato = 'pagata', metodo = p_metodo, pagata_at = now(), confermata_da = auth.uid(), stripe_session = coalesce(p_session, stripe_session),
         pagamento_id = v_pag, scade_at = null
   where id = r.id;
  return jsonb_build_object('gia', false, 'biglietti', biglietteria_emetti(r.id));
end $$;
revoke all on function biglietteria_conferma(uuid, text, text, text) from public, anon;
grant execute on function biglietteria_conferma(uuid, text, text, text) to authenticated;

-- annulla una prenotazione (i biglietti non valgono più; un incasso già registrato va rimborsato a parte)
create or replace function biglietteria_annulla(p_prenotazione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r biglietteria_prenotazioni;
begin
  select * into r from biglietteria_prenotazioni where id = p_prenotazione;
  if not found then raise exception 'prenotazione_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  update biglietteria_prenotazioni set stato = 'annullata', scade_at = null where id = r.id;
end $$;
grant execute on function biglietteria_annulla(uuid) to authenticated;

-- rimanda l'email con i biglietti (es. indirizzo sbagliato corretto dalla segreteria)
create or replace function biglietteria_reinvia(p_prenotazione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r biglietteria_prenotazioni;
begin
  select * into r from biglietteria_prenotazioni where id = p_prenotazione;
  if not found then raise exception 'prenotazione_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if r.stato not in ('pagata', 'gratis') then raise exception 'non_confermata'; end if;
  update messaggi_coda set chiave = chiave || ':' || extract(epoch from now())::bigint
   where palestra_id = r.palestra_id and chiave = 'biglietti:' || r.id;
  perform biglietteria_emetti(r.id);
end $$;
grant execute on function biglietteria_reinvia(uuid) to authenticated;

-- la pagina dei biglietti (dal link nell'email): niente dati se il token non esiste
create or replace function biglietteria_biglietti(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', pr.id, 'codice', pr.codice, 'stato', case when pr.stato = 'da_pagare' and pr.scade_at < now() then 'scaduta' else pr.stato end,
    'nome', pr.nome, 'cognome', pr.cognome, 'posti', pr.posti, 'pizze', pr.pizze, 'totale_cent', pr.totale_cent,
    'allievo', pr.allievo_nome, 'scade_at', pr.scade_at,
    'spettacolo', s.titolo, 'inizio', s.inizio, 'evento', b.titolo, 'slug', b.slug,
    'link_pagamento', b.link_pagamento, 'istruzioni_pagamento', b.istruzioni_pagamento, 'stripe', b.stripe,
    'biglietti', case when pr.stato in ('pagata', 'gratis') then coalesce((select jsonb_agg(jsonb_build_object('numero', x.numero, 'codice', x.codice, 'entrato', x.entrato_at is not null) order by x.numero)
                     from biglietteria_biglietti x where x.prenotazione_id = pr.id), '[]'::jsonb) else '[]'::jsonb end)
    from biglietteria_prenotazioni pr join biglietteria_spettacoli s on s.id = pr.spettacolo_id join biglietterie b on b.id = s.biglietteria_id
   where pr.token = p_token;
$$;
revoke all on function biglietteria_biglietti(uuid) from public, anon, authenticated;

-- ingresso: lo staff inquadra il QR (o scrive il codice). Segna l'entrata una volta sola.
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
    'nome', r.nome || ' ' || r.cognome, 'allievo', r.allievo_nome, 'pizze', case when x.numero = 1 then r.pizze else 0 end,
    'spettacolo', s.titolo, 'spettacolo_id', s.id, 'inizio', s.inizio, 'entrato_prima', v_prima, 'stato', r.stato,
    'entrati', (select count(*) from biglietteria_biglietti y join biglietteria_prenotazioni z on z.id = y.prenotazione_id
                 where z.spettacolo_id = s.id and y.entrato_at is not null),
    'attesi', (select coalesce(sum(posti), 0) from biglietteria_prenotazioni where spettacolo_id = s.id and stato in ('pagata', 'gratis')));
end $$;
grant execute on function biglietteria_ingresso(text, uuid) to authenticated;

-- carica l'elenco degli iscritti (un file per tutta la biglietteria, incollato da Excel o letto dal file)
-- p_righe: [{nome, cognome, gruppo, spettacolo, nascita}]; "spettacolo" = 1, 2… (l'ordine), l'ora (15:30) o un pezzo del titolo.
-- Chi c'è già (stesso spettacolo, nome e cognome) viene aggiornato (gruppo, data di nascita).
-- Con p_sostituisci prima toglie chi non ha prenotazioni.
drop function if exists biglietteria_carica_allievi(uuid, jsonb, boolean);
create or replace function biglietteria_carica_allievi(p_biglietteria uuid, p_righe jsonb, p_sostituisci boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b biglietterie; x jsonb; v_sp uuid; v_t text; n_nuovi int := 0; n_agg int := 0; n_tolti int := 0;
        v_scartate jsonb := '[]'; v_nome text; v_cogn text; v_id uuid; v_nasc date;
begin
  select * into b from biglietterie where id = p_biglietteria;
  if not found then raise exception 'biglietteria_non_trovata'; end if;
  if not is_gestione(b.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_sostituisci then
    delete from biglietteria_allievi a using biglietteria_spettacoli s
     where s.id = a.spettacolo_id and s.biglietteria_id = b.id
       and not exists (select 1 from biglietteria_prenotazioni pr where pr.allievo_id = a.id);
    get diagnostics n_tolti = row_count;
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    v_nome := left(btrim(coalesce(x->>'nome', '')), 80); v_cogn := left(btrim(coalesce(x->>'cognome', '')), 80);
    v_t := lower(btrim(coalesce(x->>'spettacolo', '')));
    continue when v_nome = '';
    v_sp := null;
    if v_t ~ '^\d+$' then
      select id into v_sp from biglietteria_spettacoli where biglietteria_id = b.id and con_allievi and ordine = v_t::int limit 1;
    elsif v_t ~ '^\d{1,2}[:.]\d{2}$' then
      select id into v_sp from biglietteria_spettacoli where biglietteria_id = b.id and con_allievi
         and to_char(inizio at time zone 'Europe/Rome', 'HH24:MI') = lpad(replace(v_t, '.', ':'), 5, '0') limit 1;
    elsif v_t <> '' then
      select id into v_sp from biglietteria_spettacoli where biglietteria_id = b.id and con_allievi and lower(titolo) like '%' || v_t || '%'
       order by ordine limit 1;
    end if;
    if v_sp is null then
      v_scartate := v_scartate || jsonb_build_array(trim(v_nome || ' ' || v_cogn) || coalesce(' (' || nullif(x->>'spettacolo', '') || ')', ' (spettacolo mancante)'));
      continue;
    end if;
    v_nasc := case when coalesce(x->>'nascita', '') ~ '^\d{4}-\d{2}-\d{2}$' then (x->>'nascita')::date end;
    select id into v_id from biglietteria_allievi where spettacolo_id = v_sp and lower(nome) = lower(v_nome) and lower(cognome) = lower(v_cogn);
    if v_id is not null then
      update biglietteria_allievi set gruppo = coalesce(left(nullif(btrim(coalesce(x->>'gruppo', '')), ''), 80), gruppo),
                                      data_nascita = coalesce(v_nasc, data_nascita)
       where id = v_id;
      n_agg := n_agg + 1;
    else
      insert into biglietteria_allievi (spettacolo_id, palestra_id, nome, cognome, gruppo, data_nascita)
      values (v_sp, b.palestra_id, v_nome, v_cogn, left(nullif(btrim(coalesce(x->>'gruppo', '')), ''), 80), v_nasc);
      n_nuovi := n_nuovi + 1;
    end if;
  end loop;
  return jsonb_build_object('nuovi', n_nuovi, 'aggiornati', n_agg, 'tolti', n_tolti, 'scartate', v_scartate,
    'senza_nascita', (select count(*) from biglietteria_allievi a join biglietteria_spettacoli s on s.id = a.spettacolo_id
                       where s.biglietteria_id = b.id and a.data_nascita is null),
    'totale', (select count(*) from biglietteria_allievi a join biglietteria_spettacoli s on s.id = a.spettacolo_id where s.biglietteria_id = b.id));
end $$;
grant execute on function biglietteria_carica_allievi(uuid, jsonb, boolean) to authenticated;

-- il riepilogo per la segreteria
create or replace function biglietteria_riepilogo(p_biglietteria uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(r.dati order by r.ordine, r.inizio), '[]'::jsonb) from (
    select s.ordine, s.inizio, jsonb_build_object(
      'spettacolo_id', s.id, 'titolo', s.titolo, 'capienza', s.capienza,
      'allievi', (select count(*) from biglietteria_allievi a where a.spettacolo_id = s.id),
      'posti_confermati', coalesce(sum(pr.posti) filter (where pr.stato in ('pagata', 'gratis')), 0),
      'posti_in_attesa', coalesce(sum(pr.posti) filter (where pr.stato = 'da_pagare' and (pr.scade_at is null or pr.scade_at > now())), 0),
      'pizze', coalesce(sum(pr.pizze) filter (where pr.stato in ('pagata', 'gratis')), 0),
      'incassato_cent', coalesce(sum(pr.totale_cent) filter (where pr.stato = 'pagata'), 0),
      'da_incassare_cent', coalesce(sum(pr.totale_cent) filter (where pr.stato = 'da_pagare' and (pr.scade_at is null or pr.scade_at > now())), 0),
      'entrati', (select count(*) from biglietteria_biglietti y join biglietteria_prenotazioni z on z.id = y.prenotazione_id
                   where z.spettacolo_id = s.id and y.entrato_at is not null)) as dati
      from biglietteria_spettacoli s left join biglietteria_prenotazioni pr on pr.spettacolo_id = s.id
     where s.biglietteria_id = p_biglietteria and is_staff(s.palestra_id)
     group by s.id) r;
$$;
grant execute on function biglietteria_riepilogo(uuid) to authenticated;

-- il server del sito (service role) usa le funzioni del pubblico
grant execute on function biglietteria_pubblica(text, text), biglietteria_gruppi(uuid), biglietteria_elenco(uuid, text),
                          biglietteria_verifica(uuid, date), biglietteria_prenota(jsonb),
                          biglietteria_biglietti(uuid), biglietteria_emetti(uuid), biglietteria_conferma(uuid, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
