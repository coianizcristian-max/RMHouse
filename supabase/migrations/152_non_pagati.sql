-- 152 — Iscritti che non hanno ancora pagato
-- • Sportello: "Non pagato" fra i modi di pagamento. L'iscrizione vale subito (appello, posti), gli incassi restano
--   "da incassare" (pagamenti in_attesa) e la ricevuta si fa quando paga.
-- • da_saldare(): chi deve ancora pagare (incassi in attesa + rate scadute), con le lezioni di oggi e la prossima.
-- • saldi_aperti(): solo chi deve pagare (per segnarlo in rosso in appello e nel calendario).
-- • salda_voci(): incassa adesso, con il metodo scelto, e fa le ricevute.
-- Si può rilanciare.

-- ---------------------------------------------------------------- sportello_conferma: anche "da incassare"
create or replace function sportello_conferma(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public set jit = off as $$
declare
  v_pal uuid := (p->>'palestra_id')::uuid;
  v_all uuid := (p->>'allievo_id')::uuid;
  a allievi; pa palestre; t tipi_abbonamento;
  v_metodo text := coalesce(nullif(p->>'metodo', ''), 'contanti');
  v_incassato boolean := true;
  v_quota_cent int; v_prezzo int; v_iscr uuid; v_pag uuid; v_ric uuid; v_email text; v_corso uuid;
  v_pagamenti uuid[] := '{}'; v_ricevute uuid[] := '{}'; v_email_a text;
  v_lez uuid; v_ws jsonb; v_esiti jsonb := '[]'::jsonb; v_cert date; v_avvisi text[] := '{}';
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = v_all and palestra_id = v_pal;
  if not found then raise exception 'allievo_non_trovato'; end if;
  select * into pa from palestre where id = v_pal;
  -- 152: "non pagato" → si iscrive subito, si incassa dopo (niente ricevuta adesso)
  if v_metodo = 'da_incassare' then
    v_incassato := false;
    v_metodo := 'contanti';   -- segnaposto: il metodo vero si sceglie quando paga
  end if;
  if v_metodo not in ('contanti', 'pos', 'bonifico', 'assegno', 'satispay', 'altro') then raise exception 'metodo_non_valido'; end if;

  -- 1) certificato medico: nuova scadenza scritta dalla segreteria (ha visto il certificato)
  v_cert := nullif(p->>'certificato_scadenza', '')::date;
  if v_cert is not null then
    update allievi set certificato_scadenza = greatest(coalesce(certificato_scadenza, v_cert), v_cert) where id = v_all;
  end if;

  -- 2) quota annuale
  if coalesce((p->>'quota')::boolean, false) then
    v_quota_cent := coalesce(nullif(p->>'quota_cent', '')::int, pa.quota_iscrizione_cent, 0);
    if exists (select 1 from quote_iscrizione q where q.allievo_id = v_all
                and q.stagione = stagione_di(current_date, coalesce(pa.mese_inizio_stagione, 9))) then
      v_avvisi := array_append(v_avvisi, 'quota di questa stagione già registrata: non incassata di nuovo');
    elsif v_quota_cent > 0 then
      v_pag := registra_incasso(jsonb_build_object('palestra_id', v_pal, 'allievo_id', v_all, 'causale', 'quota_iscrizione',
                 'descrizione', 'Quota associativa annuale · ' || trim(a.nome || ' ' || coalesce(a.cognome, '')),
                 'importo_cent', v_quota_cent, 'metodo', v_metodo, 'incassato', v_incassato));
      v_pagamenti := v_pagamenti || v_pag;
    else
      insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent, data)
      values (v_pal, v_all, stagione_di(current_date, coalesce(pa.mese_inizio_stagione, 9)), 0, current_date)
      on conflict do nothing;
    end if;
  end if;

  -- 3) abbonamento
  if nullif(p->>'tipo_abbonamento_id', '') is not null then
    select * into t from tipi_abbonamento where id = (p->>'tipo_abbonamento_id')::uuid and palestra_id = v_pal;
    if not found then raise exception 'abbonamento_non_trovato'; end if;
    v_corso := (p->>'corso_id')::uuid;
    v_prezzo := coalesce(nullif(p->>'prezzo_cent', '')::int, t.prezzo_cent, 0);
    if v_prezzo < 0 then raise exception 'importo_non_valido'; end if;
    v_iscr := crea_iscrizione(v_all, t.id, v_corso, coalesce(nullif(p->>'data_inizio', '')::date, current_date),
                              coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p->'orari', '[]'::jsonb)) x), '{}'),
                              greatest(coalesce(t.prezzo_cent, 0) - v_prezzo, 0), false, nullif(trim(p->>'note'), ''));
    -- "a lezioni" (es. settembre, si parte a metà): l'abbonamento vale fino al giorno scelto
    if nullif(p->>'data_fine', '') is not null then
      update iscrizioni set data_fine = greatest(data_inizio, (p->>'data_fine')::date) where id = v_iscr;
    end if;
    -- lezioni contate a mano (pacchetti a ingressi)
    if nullif(p->>'ingressi', '') is not null then
      update iscrizioni set ingressi_residui = (p->>'ingressi')::int where id = v_iscr;
    end if;
    if v_prezzo > 0 then
      v_pag := registra_incasso(jsonb_build_object('palestra_id', v_pal, 'allievo_id', v_all, 'causale', 'abbonamento',
                 'corso_id', v_corso, 'importo_cent', v_prezzo, 'metodo', v_metodo, 'incassato', v_incassato,
                 'descrizione', t.nome || ' · ' || coalesce((select nome from corsi where id = v_corso), '') || ' · '
                                || trim(a.nome || ' ' || coalesce(a.cognome, ''))));
      update iscrizioni set pagamento_id = v_pag where id = v_iscr;
      v_pagamenti := v_pagamenti || v_pag;
    end if;
  end if;

  -- 3b) workshop (query 147): iscrizione e incasso con lo stesso metodo (la quota annuale è già al punto 2)
  if nullif(p->>'workshop_opzione_id', '') is not null then
    v_ws := iscrivi_workshop((p->>'workshop_opzione_id')::uuid, v_all, 'segreteria',
                             nullif(p->>'workshop_prezzo_cent', '')::int, false, coalesce((p->>'forza')::boolean, false), nullif(trim(p->>'note'), ''));
    if nullif(v_ws->>'pagamento_id', '') is not null then
      if v_incassato then
        update pagamenti set stato = 'pagato', metodo = v_metodo, pagato_at = now() where id = (v_ws->>'pagamento_id')::uuid;
      end if;
      v_pagamenti := v_pagamenti || (v_ws->>'pagamento_id')::uuid;
    end if;
  end if;

  -- 4) ricevute (+ email in coda: parte entro pochi minuti). Non pagato: la ricevuta si fa quando paga.
  if v_incassato and coalesce((p->>'ricevuta')::boolean, true) then
    foreach v_pag in array v_pagamenti loop
      v_ric := emetti_ricevuta(v_pag);
      v_ricevute := v_ricevute || v_ric;
    end loop;
    v_email := nullif(trim(p->>'email'), '');
    if coalesce((p->>'invia_email')::boolean, false) and array_length(v_ricevute, 1) > 0 then
      begin
        foreach v_ric in array v_ricevute loop
          v_email_a := invia_ricevuta_email(v_ric, v_email);
        end loop;
      exception when others then
        v_avvisi := array_append(v_avvisi, 'ricevuta non inviata per email: manca un indirizzo email valido');
        v_email_a := null;
      end;
    end if;
  end if;

  -- 5) posto nelle lezioni scelte (ognuna per conto suo: una lezione piena non annulla la vendita)
  for v_lez in select x::uuid from jsonb_array_elements_text(coalesce(p->'lezioni', '[]'::jsonb)) x loop
    begin
      perform aggiungi_partecipante(v_lez, v_all, 'ingresso', coalesce((p->>'forza')::boolean, false), 'dallo sportello');
      v_esiti := v_esiti || jsonb_build_object('lezione_id', v_lez, 'esito', 'ok');
    exception when others then
      v_esiti := v_esiti || jsonb_build_object('lezione_id', v_lez, 'esito', sqlerrm);
    end;
  end loop;

  -- pagato con Satispay dallo Sportello: il riferimento del pagamento Satispay resta sugli incassi
  if nullif(p->>'satispay_id', '') is not null and array_length(v_pagamenti, 1) > 0 then
    update pagamenti set satispay_id = p->>'satispay_id' where id = any (v_pagamenti);
  end if;
  -- solo controllo (prima di chiedere il pagamento Satispay): se arriva qui è tutto a posto, e non si salva niente
  if coalesce((p->>'prova')::boolean, false) then
    raise exception 'prova_ok:%', coalesce((select sum(importo_cent) from pagamenti where id = any (v_pagamenti)), 0);
  end if;

  return jsonb_build_object('iscrizione_id', v_iscr, 'pagamenti', to_jsonb(v_pagamenti), 'ricevute', to_jsonb(v_ricevute),
                            'email', v_email_a, 'lezioni', v_esiti, 'avvisi', to_jsonb(v_avvisi), 'workshop', v_ws,
                            'da_incassare', not v_incassato);
end $$;
revoke all on function sportello_conferma(jsonb) from public, anon;
grant execute on function sportello_conferma(jsonb) to authenticated;

-- ---------------------------------------------------------------- le voci ancora da pagare
-- incassi "da incassare" (anche iscrizioni, quote e workshop che non dicono di chi sono) + rate scadute
create or replace function voci_da_saldare(p_palestra uuid, p_allievo uuid default null)
returns table (tipo text, id uuid, allievo_id uuid, descrizione text, importo_cent int, dal date, iscrizione_id uuid)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'pagamento'::text, pg.id,
           coalesce(pg.allievo_id,
                    (select i.allievo_id from iscrizioni i where i.pagamento_id = pg.id limit 1),
                    (select q.allievo_id from quote_iscrizione q where q.pagamento_id = pg.id limit 1),
                    (select w.allievo_id from workshop_iscrizioni w where w.pagamento_id = pg.id limit 1)),
           coalesce(nullif(pg.descrizione, ''), pg.causale), pg.importo_cent,
           (pg.created_at at time zone 'Europe/Rome')::date,
           (select i.id from iscrizioni i where i.pagamento_id = pg.id limit 1)
      from pagamenti pg
     where pg.palestra_id = p_palestra and pg.stato = 'in_attesa' and pg.importo_cent > 0
       -- un workshop disdetto non è un debito
       and not exists (select 1 from workshop_iscrizioni w where w.pagamento_id = pg.id and w.stato <> 'iscritto')
    union all
    select 'rata', r.id, r.allievo_id, r.descrizione || ' · rata ' || r.numero || ' di ' || r.di, r.importo_cent, r.scadenza, r.iscrizione_id
      from rate r
     where r.palestra_id = p_palestra and r.stato = 'da_pagare' and r.scadenza <= (now() at time zone 'Europe/Rome')::date
  ) x (tipo, id, allievo_id, descrizione, importo_cent, dal, iscrizione_id)
  where x.allievo_id is not null and (p_allievo is null or x.allievo_id = p_allievo)
$$;
revoke all on function voci_da_saldare(uuid, uuid) from public, anon, authenticated;

-- chi deve ancora pagare: per la home, lo Sportello e la scheda
create or replace function da_saldare(p_palestra uuid, p_allievo uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb; v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  with voci as (select * from voci_da_saldare(p_palestra, p_allievo)),
  persone as (
    select v.allievo_id, sum(v.importo_cent)::int as totale_cent, min(v.dal) as dal,
           jsonb_agg(jsonb_build_object('tipo', v.tipo, 'id', v.id, 'descrizione', v.descrizione, 'importo_cent', v.importo_cent,
                                        'dal', v.dal, 'iscrizione_id', v.iscrizione_id) order by v.dal) as voci
      from voci v group by v.allievo_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'allievo_id', x.allievo_id, 'nome', a.nome, 'cognome', a.cognome,
      'chi_paga', case when a.is_titolare then null else trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')) end,
      'telefono', ac.telefono, 'email', ac.email,
      'totale_cent', x.totale_cent, 'dal', x.dal, 'giorni', v_oggi - x.dal, 'voci', x.voci,
      'corsi', (select string_agg(distinct c.nome, ', ') from iscrizioni i join corsi c on c.id = i.corso_id
                 where i.allievo_id = x.allievo_id and i.stato in ('attiva', 'sospesa') and i.data_fine >= v_oggi),
      'oggi', (select jsonb_agg(jsonb_build_object('lezione_id', l.id, 'inizio', l.inizio, 'corso', c.nome) order by l.inizio)
                 from v_partecipanti_lezione vp join lezioni l on l.id = vp.lezione_id join corsi c on c.id = l.corso_id
                where vp.allievo_id = x.allievo_id and l.data = v_oggi and l.stato = 'programmata'),
      'prossima', (select jsonb_build_object('lezione_id', l.id, 'inizio', l.inizio, 'corso', c.nome)
                     from v_partecipanti_lezione vp join lezioni l on l.id = vp.lezione_id join corsi c on c.id = l.corso_id
                    where vp.allievo_id = x.allievo_id and l.inizio >= now() and l.stato = 'programmata'
                    order by l.inizio limit 1)
    ) order by x.dal, a.cognome, a.nome), '[]'::jsonb) into v
    from persone x join allievi a on a.id = x.allievo_id left join account ac on ac.id = a.account_id;
  return v;
end $$;
revoke all on function da_saldare(uuid, uuid) from public, anon;
grant execute on function da_saldare(uuid, uuid) to authenticated;

-- solo chi: per segnare in rosso in appello e nel calendario (gli insegnanti vedono chi, non quanto)
create or replace function saldi_aperti(p_palestra uuid)
returns table (allievo_id uuid, totale_cent int)
language plpgsql stable security definer set search_path = public as $$
declare v_gest boolean;
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  v_gest := is_gestione(p_palestra);
  return query
    select v.allievo_id, case when v_gest then sum(v.importo_cent)::int end
      from voci_da_saldare(p_palestra, null) v group by v.allievo_id;
end $$;
revoke all on function saldi_aperti(uuid) from public, anon;
grant execute on function saldi_aperti(uuid) to authenticated;

-- incassa adesso le voci scelte (incassi in attesa e rate), con il metodo e le ricevute
create or replace function salda_voci(p_palestra uuid, p_voci jsonb, p_metodo text, p_ricevuta boolean default true, p_email text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; v_pag uuid; v_ric uuid; v_ricevute uuid[] := '{}'; v_pagati uuid[] := '{}'; v_avvisi text[] := '{}';
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_metodo not in ('contanti', 'pos', 'bonifico', 'assegno', 'satispay', 'altro') then raise exception 'metodo_non_valido'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_voci, '[]'::jsonb)) loop
    if x->>'tipo' = 'rata' then
      v_pag := incassa_rata((x->>'id')::uuid, p_metodo);
    else
      v_pag := (x->>'id')::uuid;
      if not exists (select 1 from pagamenti where id = v_pag and palestra_id = p_palestra and stato = 'in_attesa') then
        v_avvisi := array_append(v_avvisi, 'un incasso era già stato registrato: saltato');
        continue;
      end if;
      perform segna_pagato(v_pag, p_metodo, now());
      -- il workshop: l'iscrizione resta quella, cambia solo il pagamento
    end if;
    v_pagati := v_pagati || v_pag;
    if p_ricevuta then
      v_ric := emetti_ricevuta(v_pag);
      v_ricevute := v_ricevute || v_ric;
    end if;
  end loop;
  if p_ricevuta and nullif(trim(p_email), '') is not null then
    begin
      foreach v_ric in array v_ricevute loop perform invia_ricevuta_email(v_ric, trim(p_email)); end loop;
    exception when others then v_avvisi := array_append(v_avvisi, 'ricevuta non inviata per email');
    end;
  end if;
  return jsonb_build_object('pagamenti', to_jsonb(v_pagati), 'ricevute', to_jsonb(v_ricevute), 'avvisi', to_jsonb(v_avvisi));
end $$;
revoke all on function salda_voci(uuid, jsonb, text, boolean, text) from public, anon;
grant execute on function salda_voci(uuid, jsonb, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
