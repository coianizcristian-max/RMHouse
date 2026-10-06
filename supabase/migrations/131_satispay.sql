-- =====================================================================
-- RMHouse — 131 SATISPAY TRA I METODI DI PAGAMENTO
--
--  • "satispay" diventa un metodo di pagamento come contanti, POS, bonifico, assegno
--    (Sportello, Incassa, correzione incassi, rate, conti, esportazione, import da APP Palestre).
--  • Gli incassi Satispay importati da APP Palestre finiti sotto "altro" con "(Satispay)" nella descrizione
--    passano a Satispay (anche sulle loro ricevute).
--  • Nel controllo con la banca Satispay sta con bonifici e POS (arriva sul conto).
--  • Corretto anche "segna pagato" che non accettava l'assegno.
-- In fondo: lo Sportello con Satispay (e corretto l'avviso "quota già registrata" che bloccava la conferma).
-- Si può eseguire più volte. Va dopo la 130.
-- =====================================================================

alter table pagamenti drop constraint if exists pagamenti_metodo_check;
alter table pagamenti add constraint pagamenti_metodo_check
  check (metodo = any (array['stripe', 'online', 'contanti', 'pos', 'bonifico', 'assegno', 'satispay', 'altro']));

CREATE OR REPLACE FUNCTION public.segna_pagato(p_pagamento uuid, p_metodo text DEFAULT 'contanti'::text, p_quando timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pg pagamenti;
begin
  select * into pg from pagamenti where id = p_pagamento;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_metodo not in ('contanti', 'bonifico', 'pos', 'online', 'assegno', 'satispay', 'altro') then raise exception 'metodo_non_valido'; end if;

  update pagamenti set stato = 'pagato'::stato_pagamento, metodo = p_metodo, pagato_at = p_quando
   where id = p_pagamento;
end $function$;

CREATE OR REPLACE FUNCTION public.correggi_pagamento(p_pagamento uuid, p_metodo text DEFAULT NULL::text, p_pagato_at date DEFAULT NULL::date, p_descrizione text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pg pagamenti; v_ric int;
begin
  select * into pg from pagamenti where id = p_pagamento for update;
  if not found then raise exception 'pagamento_non_trovato'; end if;
  if not is_gestione(pg.palestra_id) then raise exception 'non_autorizzato'; end if;
  if pg.metodo in ('stripe', 'online') or pg.stripe_payment_intent is not null then raise exception 'pagamento_online'; end if;
  if pg.stato <> 'pagato' then raise exception 'non_pagato'; end if;
  if p_metodo is not null and p_metodo not in ('contanti', 'pos', 'bonifico', 'assegno', 'satispay', 'altro') then raise exception 'metodo_non_valido'; end if;
  if p_pagato_at is not null and p_pagato_at > current_date then raise exception 'data_futura'; end if;

  update pagamenti
     set metodo = coalesce(p_metodo, metodo),
         -- la data cambia, l'ora del giorno resta quella registrata (serve all'ordine nella giornata)
         pagato_at = case when p_pagato_at is null then pagato_at
                          else p_pagato_at + coalesce(pagato_at::time, '12:00'::time) end,
         descrizione = coalesce(nullif(trim(p_descrizione), ''), descrizione)
   where id = p_pagamento;

  -- la ricevuta già emessa non cambia da sola: la data e il metodo sul documento restano quelli del momento
  select count(*) into v_ric from ricevute where pagamento_id = p_pagamento and not annullata and tipo_documento in ('ricevuta', 'fattura');
  if v_ric > 0 and (p_pagato_at is not null or p_metodo is not null) then
    insert into promemoria (palestra_id, data, testo, creato_da)
    values (pg.palestra_id, current_date,
            'Incasso corretto (' || coalesce(p_metodo, pg.metodo) || coalesce(', ' || to_char(p_pagato_at, 'DD/MM/YYYY'), '') || ') ma la ricevuta era già emessa: '
            || 'se serve, annullala e riemettila da Conti → Ricevute e fatture.', 'Sistema');
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.differenze_banca(p_palestra uuid, p_dal date, p_al date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'movimenti_senza_incasso', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'data', m.data, 'importo_cent', m.importo_cent,
                                          'descrizione', m.descrizione) order by m.data desc)
      from movimenti_banca m
      where m.palestra_id = p_palestra and m.data between p_dal and p_al
        and m.stato = 'da_verificare' and m.importo_cent > 0), '[]'::jsonb),
    'incassi_senza_movimento', coalesce((
      select jsonb_agg(jsonb_build_object('id', pg.id, 'data', coalesce(pg.pagato_at::date, pg.created_at::date),
                                          'importo_cent', pg.importo_cent, 'descrizione', pg.descrizione,
                                          'metodo', pg.metodo) order by pg.pagato_at desc)
      from pagamenti pg
      where pg.palestra_id = p_palestra and pg.stato = 'pagato'
        and coalesce(pg.pagato_at::date, pg.created_at::date) between p_dal and p_al
        and coalesce(pg.metodo, '') in ('bonifico', 'pos', 'satispay')
        and not exists (select 1 from abbinamenti a where a.pagamento_id = pg.id)), '[]'::jsonb),
    'contanti_non_versati_cent', coalesce((
      select sum(pg.importo_cent) from pagamenti pg
      where pg.palestra_id = p_palestra and pg.stato = 'pagato' and pg.metodo = 'contanti'
        and coalesce(pg.pagato_at::date, pg.created_at::date) between p_dal and p_al
        and not exists (select 1 from abbinamenti a where a.pagamento_id = pg.id)), 0)
  );
$function$;

-- gli incassi Satispay già importati
with s as (
  update pagamenti set metodo = 'satispay', descrizione = regexp_replace(descrizione, '\s*\(satispay\)\s*$', '', 'i')
   where metodo = 'altro' and descrizione ~* '\(satispay\)\s*$'
  returning id)
update ricevute set metodo = 'satispay' where pagamento_id in (select id from s) and coalesce(metodo, 'altro') = 'altro';

-- Sportello: Satispay tra i metodi
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

  return jsonb_build_object('iscrizione_id', v_iscr, 'pagamenti', to_jsonb(v_pagamenti), 'ricevute', to_jsonb(v_ricevute),
                            'email', v_email_a, 'lezioni', v_esiti, 'avvisi', to_jsonb(v_avvisi));
end $$;
alter function sportello_conferma(jsonb) set jit = off;
