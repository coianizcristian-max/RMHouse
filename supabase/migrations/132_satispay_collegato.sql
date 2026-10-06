-- =====================================================================
-- RMHouse — 132 SATISPAY COLLEGATO (pagamenti confermati da soli)
--
--  • satispay_chiavi: le chiavi del collegamento con Satispay Business. Le legge SOLO il server
--    (nessun accesso da app o browser). Si creano da Impostazioni → Pagamenti con il codice di attivazione.
--  • satispay_stato: per la pagina Impostazioni (collegato sì/no, prova o reale), senza mostrare le chiavi.
--  • satispay_id su pagamenti e acquisti online: il riferimento del pagamento Satispay.
--  • sportello_conferma: salva il riferimento Satispay e ha il "solo controllo" (prima di chiedere i soldi
--    al cliente si verifica che la vendita vada a buon fine, senza salvare niente).
-- Si può eseguire più volte. Va dopo la 131.
-- =====================================================================

create table if not exists satispay_chiavi (
  palestra_id    uuid primary key references palestre(id) on delete cascade,
  key_id         text not null,
  chiave_privata text not null,
  ambiente       text not null default 'reale' check (ambiente in ('prova', 'reale')),
  collegato_at   timestamptz not null default now()
);
alter table satispay_chiavi enable row level security;   -- nessuna regola: solo il server (service role) la vede
revoke all on satispay_chiavi from anon, authenticated;
grant select, insert, update, delete on satispay_chiavi to service_role;

create or replace function satispay_stato(p_palestra uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when is_gestione(p_palestra) then
    coalesce((select jsonb_build_object('collegato', true, 'ambiente', ambiente, 'collegato_at', collegato_at)
                from satispay_chiavi where palestra_id = p_palestra), jsonb_build_object('collegato', false)) end;
$$;
revoke execute on function satispay_stato(uuid) from public, anon;
grant execute on function satispay_stato(uuid) to authenticated;

alter table pagamenti add column if not exists satispay_id text;
alter table acquisti_online add column if not exists satispay_id text;
create index if not exists pagamenti_satispay on pagamenti (satispay_id) where satispay_id is not null;
create index if not exists acquisti_satispay on acquisti_online (satispay_id) where satispay_id is not null;

create or replace function sportello_conferma(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal uuid := (p->>'palestra_id')::uuid;
  v_all uuid := (p->>'allievo_id')::uuid;
  a allievi; pa palestre; t tipi_abbonamento;
  v_metodo text := coalesce(nullif(p->>'metodo', ''), 'contanti');
  v_quota_cent int; v_prezzo int; v_iscr uuid; v_pag uuid; v_ric uuid; v_email text; v_corso uuid;
  v_pagamenti uuid[] := '{}'; v_ricevute uuid[] := '{}'; v_email_a text;
  v_lez uuid; v_esiti jsonb := '[]'::jsonb; v_cert date; v_avvisi text[] := '{}';
begin
  if not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = v_all and palestra_id = v_pal;
  if not found then raise exception 'allievo_non_trovato'; end if;
  select * into pa from palestre where id = v_pal;
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
                 'importo_cent', v_quota_cent, 'metodo', v_metodo));
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
                 'corso_id', v_corso, 'importo_cent', v_prezzo, 'metodo', v_metodo,
                 'descrizione', t.nome || ' · ' || coalesce((select nome from corsi where id = v_corso), '') || ' · '
                                || trim(a.nome || ' ' || coalesce(a.cognome, ''))));
      update iscrizioni set pagamento_id = v_pag where id = v_iscr;
      v_pagamenti := v_pagamenti || v_pag;
    end if;
  end if;

  -- 4) ricevute (+ email in coda: parte entro pochi minuti)
  if coalesce((p->>'ricevuta')::boolean, true) then
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
  -- (e dice quanto si incasserebbe davvero: es. la quota già pagata non si richiede)
  if coalesce((p->>'prova')::boolean, false) then
    raise exception 'prova_ok:%', coalesce((select sum(importo_cent) from pagamenti where id = any (v_pagamenti)), 0);
  end if;

  return jsonb_build_object('iscrizione_id', v_iscr, 'pagamenti', to_jsonb(v_pagamenti), 'ricevute', to_jsonb(v_ricevute),
                            'email', v_email_a, 'lezioni', v_esiti, 'avvisi', to_jsonb(v_avvisi));
end $$;
revoke execute on function sportello_conferma(jsonb) from public, anon;
grant execute on function sportello_conferma(jsonb) to authenticated;
alter function sportello_conferma(jsonb) set jit = off;
