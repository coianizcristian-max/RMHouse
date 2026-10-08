-- 151 — Export per le verifiche
-- Un pacchetto di file (CSV in uno ZIP) da dare a Claude una o due volte l'anno: incrocia clienti, abbonamenti,
-- pagamenti, ricevute, presenze e modifiche e trova quello che non torna (incassi mancanti, ricevute saltate,
-- chi frequenta senza abbonamento, certificati scaduti, contanti non versati...).
-- verifiche_file(palestra, file, dal, al) restituisce le righe di un file (json, colonne nell'ordine giusto);
-- i file "mensili" (lezioni, presenze, ingressi, modifiche) si chiedono un mese alla volta.
-- Si può rilanciare.

-- ---------------------------------------------------------------- registro degli export fatti
create table if not exists verifiche_export (
  id uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  creato_at timestamptz not null default now(),
  creato_da uuid,
  chi text,
  dal date not null,
  al date not null,
  file jsonb not null default '{}'::jsonb
);
create index if not exists verifiche_export_palestra on verifiche_export (palestra_id, creato_at desc);
alter table verifiche_export enable row level security;
revoke all on verifiche_export from anon;
grant select on verifiche_export to authenticated;
grant select, insert, update, delete on verifiche_export to service_role;
drop policy if exists gestione_legge on verifiche_export;
create policy gestione_legge on verifiche_export for select to authenticated using (is_gestione(palestra_id));

-- ---------------------------------------------------------------- aiuti
-- nome di uno dello staff, sia dal suo id sia dall'id del suo accesso
create or replace function vf_staff(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select trim(coalesce(s.nome, '') || ' ' || coalesce(s.cognome, '')) from staff s where s.id = p or s.user_id = p
  order by (s.id = p) desc limit 1
$$;
revoke all on function vf_staff(uuid) from public, anon, authenticated;

-- codice fiscale scritto bene (16 caratteri, anche con omocodia); non controlla il carattere finale
create or replace function vf_cf_ok(p text) returns text
language sql immutable as $$
  select case when nullif(trim(coalesce(p, '')), '') is null then 'manca'
              when upper(replace(p, ' ', '')) ~ '^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$' then 'sì'
              when upper(replace(p, ' ', '')) ~ '^[0-9]{11}$' then 'partita IVA'
              else 'non valido' end
$$;

-- ---------------------------------------------------------------- i file
create or replace function verifiche_file(p_palestra uuid, p_file text, p_dal date, p_al date)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v json;
  v_fuso text;
  v_mese int;
  v_oggi date;
  v_fino date;
  v_stag int;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_dal is null or p_al is null or p_dal > p_al then raise exception 'periodo_non_valido'; end if;
  if p_file in ('lezioni', 'presenze', 'ingressi', 'modifiche') and p_al - p_dal > 62 then
    raise exception 'periodo_troppo_lungo';
  end if;
  select coalesce(fuso_orario, 'Europe/Rome'), coalesce(mese_inizio_stagione, 9) into v_fuso, v_mese from palestre where id = p_palestra;
  v_oggi := (now() at time zone v_fuso)::date;
  v_fino := least(p_al, v_oggi);
  v_stag := stagione_di(v_oggi, v_mese);

  -- ============================================================ CLIENTI (com'è oggi)
  if p_file = 'clienti' then
    select coalesce(json_agg(json_build_object(
        'cliente_id', c.id, 'cognome', coalesce(c.cognome, ''), 'nome', coalesce(c.nome, ''),
        'data_nascita', coalesce(c.data_nascita::text, ''),
        'eta', coalesce(extract(year from age(v_oggi, c.data_nascita))::int::text, ''),
        'sesso', coalesce(a.sesso, ''),
        'codice_fiscale', coalesce(upper(c.codice_fiscale), ''), 'cf_scritto_bene', vf_cf_ok(c.codice_fiscale),
        'paga_lui', case when c.is_titolare then 'sì' else 'no' end,
        'chi_paga_id', coalesce(c.account_id::text, ''),
        'chi_paga', case when c.is_titolare then '' else trim(coalesce(c.titolare_nome, '') || ' ' || coalesce(c.titolare_cognome, '')) end,
        'cf_chi_paga', coalesce(upper(ac.codice_fiscale), ''), 'cf_chi_paga_scritto_bene', vf_cf_ok(ac.codice_fiscale),
        'email', case when nullif(c.email, '') is null then 'manca' else 'sì' end,
        'telefono', case when nullif(c.telefono, '') is null then 'manca' else 'sì' end,
        'stato', coalesce(c.stato, ''), 'abbonamento_attivo', case when c.attivo then 'sì' else 'no' end,
        'cliente_dal', coalesce(c.prima_data::text, ''),
        'abbonamento_fino_al', coalesce(c.fine_prossima::text, ''), 'ultimo_abbonamento_finito_il', coalesce(c.ultima_fine::text, ''),
        'ultima_presenza', coalesce(c.ultima_presenza::text, ''),
        'senza_giorni_assegnati', case when c.senza_orari then 'sì' else '' end,
        'certificato_scadenza', coalesce(c.certificato_scadenza::text, ''),
        'certificato_ultimo_caricato', coalesce((select ce.stato || ' (scade ' || coalesce(ce.scadenza::text, '?') || ')' from certificati ce
                                                  where ce.allievo_id = c.id order by ce.caricato_at desc nulls last limit 1), 'nessuno'),
        'quota_annuale_valida_fino', coalesce(c.quota_valida_fino::text, ''),
        'tesseramento_stagione', coalesce((select t.stato || coalesce(' · ' || nullif(t.ente, ''), '') || case when nullif(t.numero, '') is null then ' · senza numero' else '' end
                                             from tesseramenti t where t.allievo_id = c.id and t.stagione = v_stag order by t.created_at desc limit 1), 'nessuno'),
        'consenso_privacy', coalesce(to_char(ac.consenso_privacy_at at time zone v_fuso, 'YYYY-MM-DD'), 'manca'),
        'creato_il', to_char(c.created_at at time zone v_fuso, 'YYYY-MM-DD'),
        'arrivato_da_app_palestre', case when a.codice_esterno is not null then 'sì' else '' end
      ) order by c.cognome, c.nome), '[]'::json) into v
      from v_stato_clienti c join allievi a on a.id = c.id left join account ac on ac.id = c.account_id
     where c.palestra_id = p_palestra;

  -- ============================================================ LISTINO (com'è oggi)
  elsif p_file = 'listino' then
    select coalesce(json_agg(json_build_object(
        'tipo_id', t.id, 'nome', t.nome, 'famiglie', coalesce(array_to_string(t.famiglie, ', '), t.famiglia, ''),
        'modalita', t.modalita::text, 'durata_mesi', coalesce(t.durata_mesi::text, ''), 'durata_giorni', coalesce(t.durata_giorni::text, ''),
        'lezioni_a_settimana', coalesce(t.lezioni_settimanali::text, ''), 'ingressi', coalesce(t.num_ingressi::text, ''),
        'prezzo', euro_it(t.prezzo_cent), 'prezzo_online', euro_it(t.prezzo_web_cent),
        'attivo', case when t.attivo and not coalesce(t.archiviato, false) then 'sì' else 'no' end
      ) order by t.nome), '[]'::json) into v
      from tipi_abbonamento t where t.palestra_id = p_palestra;

  -- ============================================================ STAFF (com'è oggi)
  elsif p_file = 'staff' then
    select coalesce(json_agg(json_build_object(
        'staff_id', s.id, 'nome', trim(coalesce(s.nome, '') || ' ' || coalesce(s.cognome, '')), 'ruolo', s.ruolo::text,
        'attivo', case when s.attivo and not coalesce(s.archiviato, false) then 'sì' else 'no' end,
        'collaboratore', case when s.collaboratore then 'sì' else '' end, 'compenso_orario', euro_it(s.compenso_ora_cent)
      ) order by s.ruolo, s.nome), '[]'::json) into v
      from staff s where s.palestra_id = p_palestra;

  -- ============================================================ DA SISTEMARE (aperte oggi)
  elsif p_file = 'da_sistemare' then
    select coalesce(json_agg(json_build_object(
        'creata_il', to_char(x.created_at at time zone v_fuso, 'YYYY-MM-DD'),
        'aggiornata_il', coalesce(to_char(x.aggiornata_at at time zone v_fuso, 'YYYY-MM-DD'), ''),
        'gravita', coalesce(x.gravita, ''), 'categoria', coalesce(x.categoria, ''), 'titolo', coalesce(x.titolo, ''),
        'dettaglio', coalesce(x.dettaglio, ''), 'cliente_id', coalesce(x.allievo_id::text, ''),
        'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), '')
      ) order by x.created_at), '[]'::json) into v
      from anomalie_import x left join allievi a on a.id = x.allievo_id
     where x.palestra_id = p_palestra and not x.risolta;

  -- ============================================================ ABBONAMENTI (che toccano il periodo)
  elsif p_file = 'abbonamenti' then
    with ab as (
      select i.*, t.nome as tipo_nome, t.modalita::text as modalita, coalesce(array_to_string(t.famiglie, ', '), t.famiglia) as famiglie,
             t.prezzo_cent as listino_cent, c.nome as corso_nome, pg.importo_cent as pag_importo, pg.stato::text as pag_stato,
             pg.metodo as pag_metodo, pg.pagato_at as pag_at,
             (select count(*) from rate r where r.iscrizione_id = i.id) as n_rate,
             (select sum(r.importo_cent) from rate r where r.iscrizione_id = i.id) as rate_tot,
             (select sum(r.importo_cent) from rate r where r.iscrizione_id = i.id and r.stato = 'pagata') as rate_pagate,
             (select count(*) from rate r where r.iscrizione_id = i.id and r.stato <> 'pagata' and r.scadenza < v_oggi) as rate_scadute
        from iscrizioni i
        left join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
        left join corsi c on c.id = i.corso_id
        left join pagamenti pg on pg.id = i.pagamento_id
       where i.palestra_id = p_palestra
         and (coalesce(i.data_fine, p_al) >= p_dal and i.data_inizio <= p_al
              or (i.created_at at time zone v_fuso)::date between p_dal and p_al)
    ), con_conti as (
      select ab.*,
             coalesce(rate_tot, pag_importo, listino_cent - coalesce(sconto_cent, 0))::int as valore,
             (case when n_rate > 0 then coalesce(rate_pagate, 0) when pag_stato = 'pagato' then coalesce(pag_importo, 0) else 0 end)::int as pagato
        from ab
    )
    select coalesce(json_agg(r order by r.dal, r.cliente), '[]'::json) into v from (
      select x.data_inizio as dal, trim(a.cognome || ' ' || a.nome) as cliente, json_build_object(
        'abbonamento_id', x.id, 'cliente_id', x.allievo_id, 'cliente', trim(a.nome || ' ' || coalesce(a.cognome, '')),
        'tipo', coalesce(x.tipo_nome, ''), 'famiglie', coalesce(x.famiglie, ''), 'modalita', coalesce(x.modalita, ''),
        'corso', coalesce(x.corso_nome, ''),
        'giorni', coalesce((select string_agg(case o.giorno_settimana when 1 then 'Lun' when 2 then 'Mar' when 3 then 'Mer' when 4 then 'Gio'
                                     when 5 then 'Ven' when 6 then 'Sab' else 'Dom' end || ' ' || to_char(o.ora_inizio, 'HH24:MI') || ' ' || coalesce(co.nome, ''), ', '
                                   order by o.giorno_settimana, o.ora_inizio)
                              from iscrizioni_orari io join orari o on o.id = io.orario_id left join corsi co on co.id = o.corso_id
                             where io.iscrizione_id = x.id), ''),
        'dal', x.data_inizio, 'al', coalesce(x.data_fine::text, ''), 'stato', x.stato::text,
        'giorni_sospeso', coalesce((select sum(least(s.al, coalesce(x.data_fine, s.al)) - s.dal + 1) from sospensioni s where s.iscrizione_id = x.id)::text, ''),
        'ingressi_rimasti', coalesce(x.ingressi_residui::text, ''),
        'prezzo_listino', euro_it(x.listino_cent), 'sconto', euro_it(nullif(x.sconto_cent, 0)),
        'valore', euro_it(x.valore), 'pagato', euro_it(x.pagato),
        -- senza un pagamento collegato non si sa: si guarda negli incassi del cliente (colonna dopo e pagamenti.csv)
        'da_pagare', case when x.n_rate > 0 or x.pagamento_id is not null then euro_it(greatest(coalesce(x.valore, 0) - x.pagato, 0)) else '' end,
        'incassi_del_cliente_intorno', euro_it((select sum(p.importo_cent) from pagamenti p
                                                 where p.allievo_id = x.allievo_id and p.stato = 'pagato'
                                                   and (p.pagato_at at time zone v_fuso)::date between x.data_inizio - 45 and coalesce(x.data_fine, x.data_inizio + 30))::int),
        'pagamento', case when x.n_rate > 0 then 'a rate (' || x.n_rate || ')' when x.pagamento_id is null then 'nessun pagamento collegato'
                          else coalesce(x.pag_stato, '') end,
        'metodo', coalesce(x.pag_metodo, ''), 'pagato_il', coalesce(to_char(x.pag_at at time zone v_fuso, 'YYYY-MM-DD'), ''),
        'pagamento_id', coalesce(x.pagamento_id::text, ''),
        'rate_scadute_non_pagate', case when x.rate_scadute > 0 then x.rate_scadute::text else '' end,
        'rinnovo_di', coalesce(x.rinnovo_di::text, ''),
        'creato_il', to_char(x.created_at at time zone v_fuso, 'YYYY-MM-DD'),
        'creato_da', coalesce((select ra.chi from registro_azioni ra where ra.record_id = x.id and ra.tabella = 'iscrizioni' and ra.operazione = 'inserimento' order by ra.quando limit 1), ''),
        'origine', case when x.codice_esterno is not null then 'APP Palestre' else 'RMHouse' end
      ) as r
        from con_conti x join allievi a on a.id = x.allievo_id
      union all   -- storico arrivato da APP Palestre e non diventato un abbonamento di RMHouse
      select st.dal, trim(coalesce(a.cognome, '') || ' ' || coalesce(a.nome, '')), json_build_object(
        'abbonamento_id', '', 'cliente_id', coalesce(st.allievo_id::text, ''), 'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), ''),
        'tipo', coalesce(st.abbonamento, ''), 'famiglie', '', 'modalita', '', 'corso', '', 'giorni', '',
        'dal', coalesce(st.dal::text, ''), 'al', coalesce(st.al::text, ''), 'stato', coalesce(st.stato, ''), 'giorni_sospeso', '',
        'ingressi_rimasti', coalesce(st.restanti::text, ''), 'prezzo_listino', '', 'sconto', '',
        'valore', euro_it(st.valore_cent), 'pagato', '', 'da_pagare', '', 'incassi_del_cliente_intorno', '', 'pagamento', 'storico APP (vedi pagamenti)', 'metodo', '', 'pagato_il', '',
        'pagamento_id', '', 'rate_scadute_non_pagate', '', 'rinnovo_di', '', 'creato_il', '', 'creato_da', '', 'origine', 'APP Palestre (storico)'
      )
        from storico_abbonamenti st left join allievi a on a.id = st.allievo_id
       where st.palestra_id = p_palestra and st.iscrizione_id is null
         and coalesce(st.al, p_al) >= p_dal and coalesce(st.dal, p_dal) <= p_al
    ) r;

  -- ============================================================ PAGAMENTI (creati o incassati nel periodo + tutti quelli ancora da incassare)
  elsif p_file = 'pagamenti' then
    select coalesce(json_agg(json_build_object(
        'pagamento_id', p.id,
        'creato_il', to_char(p.created_at at time zone v_fuso, 'YYYY-MM-DD HH24:MI'),
        'pagato_il', coalesce(to_char(p.pagato_at at time zone v_fuso, 'YYYY-MM-DD HH24:MI'), ''),
        'cliente_id', coalesce(p.allievo_id::text, ''), 'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), ''),
        'chi_paga_id', coalesce(p.account_id::text, ''), 'chi_paga', coalesce(trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')), ''),
        'causale', coalesce(p.causale, ''), 'descrizione', coalesce(p.descrizione, ''), 'corso', coalesce(c.nome, ''),
        'importo', euro_it(p.importo_cent), 'bollo', euro_it(nullif(p.bollo_cent, 0)), 'commissione', euro_it(nullif(p.commissione_cent, 0)),
        'rimborsato', euro_it(nullif(p.rimborsato_cent, 0)),
        'metodo', coalesce(p.metodo, ''), 'stato', p.stato::text,
        'abbonamento_id', coalesce((select i.id::text from iscrizioni i where i.pagamento_id = p.id limit 1),
                                   (select r.iscrizione_id::text from rate r where r.pagamento_id = p.id or r.id = p.rata_id limit 1), ''),
        'rata', coalesce((select r.numero || '/' || r.di from rate r where r.id = p.rata_id or r.pagamento_id = p.id limit 1), ''),
        'ricevute', coalesce((select string_agg(coalesce(n.codice || ' ', '') || r.numero || '/' || r.anno
                                                 || case when r.tipo_documento = 'nota_credito' then ' (nota di credito)' else '' end
                                                 || case when r.annullata then ' (annullata)' else '' end, ', ' order by r.anno, r.numero)
                                from ricevute r left join numerazioni n on n.id = r.numerazione_id where r.pagamento_id = p.id), ''),
        'registrato_da', coalesce((select ra.chi from registro_azioni ra where ra.record_id = p.id and ra.tabella = 'pagamenti'
                                     and ra.operazione = 'inserimento' order by ra.quando limit 1), ''),
        'modifiche_a_mano', coalesce((select count(*) from registro_azioni ra where ra.record_id = p.id and ra.tabella = 'pagamenti'
                                        and ra.operazione = 'modifica' and ra.chi <> 'automatico' and ra.chi not like 'cliente:%')::text, '0'),
        'arrivato_da_app_palestre', case when p.codice_esterno is not null then 'sì' else '' end
      ) order by coalesce(p.pagato_at, p.created_at)), '[]'::json) into v
      from pagamenti p
      left join allievi a on a.id = p.allievo_id left join account ac on ac.id = p.account_id left join corsi c on c.id = p.corso_id
     where p.palestra_id = p_palestra
       and ((coalesce(p.pagato_at, p.created_at) at time zone v_fuso)::date between p_dal and p_al
            or (p.created_at at time zone v_fuso)::date between p_dal and p_al
            or (p.stato = 'in_attesa' and (p.created_at at time zone v_fuso)::date <= p_al));

  -- ============================================================ RICEVUTE E DOCUMENTI (data nel periodo)
  elsif p_file = 'ricevute' then
    select coalesce(json_agg(json_build_object(
        'ricevuta_id', r.id, 'tipo', coalesce(r.tipo_documento, 'ricevuta'), 'sezionale', coalesce(n.codice, ''),
        'anno', r.anno, 'numero', r.numero, 'data', r.data,
        'intestatario', coalesce(r.intestatario, ''), 'codice_fiscale', coalesce(upper(r.codice_fiscale), ''),
        'cf_scritto_bene', vf_cf_ok(r.codice_fiscale),
        'cliente_id', coalesce(r.allievo_id::text, ''), 'descrizione', coalesce(r.descrizione, ''),
        'importo', euro_it(r.importo_cent), 'iva', euro_it(nullif(r.iva_cent, 0)), 'bollo', euro_it(nullif(r.bollo_cent, 0)),
        'metodo', coalesce(r.metodo, ''),
        'annullata', case when r.annullata then 'sì' else '' end, 'motivo_annullo', coalesce(r.motivo_annullo, ''),
        'pagamento_id', coalesce(r.pagamento_id::text, ''), 'stato_pagamento', coalesce(pg.stato::text, 'nessun pagamento'),
        'importo_pagamento', euro_it(pg.importo_cent),
        'riferita_a', coalesce((select coalesce(n2.codice || ' ', '') || r2.numero || '/' || r2.anno from ricevute r2
                                  left join numerazioni n2 on n2.id = r2.numerazione_id where r2.id = r.riferimento_id), ''),
        'creata_il', to_char(r.created_at at time zone v_fuso, 'YYYY-MM-DD HH24:MI'),
        'creata_da', coalesce((select ra.chi from registro_azioni ra where ra.record_id = r.id and ra.tabella = 'ricevute'
                                 and ra.operazione = 'inserimento' order by ra.quando limit 1), '')
      ) order by n.codice nulls first, r.anno, r.numero), '[]'::json) into v
      from ricevute r left join numerazioni n on n.id = r.numerazione_id left join pagamenti pg on pg.id = r.pagamento_id
     where r.palestra_id = p_palestra and r.data between p_dal and p_al;

  -- ============================================================ RATE (scadenza nel periodo + quelle scadute prima e non pagate)
  elsif p_file = 'rate' then
    select coalesce(json_agg(json_build_object(
        'rata_id', r.id, 'cliente_id', coalesce(r.allievo_id::text, ''), 'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), ''),
        'abbonamento_id', coalesce(r.iscrizione_id::text, ''), 'descrizione', coalesce(r.descrizione, ''),
        'rata', r.numero || '/' || r.di, 'importo', euro_it(r.importo_cent), 'scadenza', r.scadenza, 'stato', coalesce(r.stato, ''),
        'pagamento_id', coalesce(r.pagamento_id::text, ''),
        'pagata_il', coalesce((select to_char(p.pagato_at at time zone v_fuso, 'YYYY-MM-DD') from pagamenti p where p.id = r.pagamento_id), '')
      ) order by r.scadenza), '[]'::json) into v
      from rate r left join allievi a on a.id = r.allievo_id
     where r.palestra_id = p_palestra
       and (r.scadenza between p_dal and p_al or (r.scadenza < p_dal and r.stato <> 'pagata'));

  -- ============================================================ QUOTE ANNUALI E TESSERAMENTI
  elsif p_file = 'quote' then
    select coalesce(json_agg(json_build_object(
        'cliente_id', q.allievo_id, 'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), ''),
        'stagione', q.stagione || '/' || right((q.stagione + 1)::text, 2), 'pagata_il', coalesce(q.data::text, ''),
        'valida_fino', coalesce(((q.data + interval '1 year')::date - 1)::text, ''),
        'importo', euro_it(q.importo_cent), 'pagamento_id', coalesce(q.pagamento_id::text, ''),
        'stato_pagamento', coalesce(pg.stato::text, 'nessun pagamento')
      ) order by q.data, a.cognome), '[]'::json) into v
      from quote_iscrizione q left join allievi a on a.id = q.allievo_id left join pagamenti pg on pg.id = q.pagamento_id
     where q.palestra_id = p_palestra
       and (q.data between (p_dal - interval '1 year')::date and p_al
            or q.stagione between stagione_di(p_dal, v_mese) - 1 and stagione_di(p_al, v_mese));

  elsif p_file = 'tesseramenti' then
    select coalesce(json_agg(json_build_object(
        'cliente_id', t.allievo_id, 'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), ''),
        'stagione', t.stagione || '/' || right((t.stagione + 1)::text, 2), 'ente', coalesce(t.ente, ''),
        'numero_tessera', coalesce(t.numero, ''), 'stato', coalesce(t.stato, ''),
        'inviato_il', coalesce(to_char(t.inviato_at at time zone v_fuso, 'YYYY-MM-DD'), '')
      ) order by t.stagione, a.cognome), '[]'::json) into v
      from tesseramenti t left join allievi a on a.id = t.allievo_id
     where t.palestra_id = p_palestra and t.stagione between stagione_di(p_dal, v_mese) and stagione_di(p_al, v_mese);

  -- ============================================================ LEZIONI (un mese alla volta, fino a oggi)
  elsif p_file = 'lezioni' then
    with l as (
      select l.* from lezioni l where l.palestra_id = p_palestra and l.data between p_dal and v_fino
    ), conta as (
      select b.lezione_id, count(*) as attesi,
             count(*) filter (where ps.presente) as presenti, count(*) filter (where ps.presente = false) as assenti,
             count(*) filter (where ps.id is null) as non_segnati
        from l join v_partecipanti_base b on b.lezione_id = l.id
        left join presenze ps on ps.lezione_id = b.lezione_id and ps.allievo_id = b.allievo_id
       group by b.lezione_id
    )
    select coalesce(json_agg(json_build_object(
        'lezione_id', l.id, 'data', l.data, 'inizio', to_char(l.inizio at time zone v_fuso, 'HH24:MI'), 'fine', to_char(l.fine at time zone v_fuso, 'HH24:MI'),
        'corso', coalesce(c.nome, ''), 'sala', coalesce(s.nome, ''), 'insegnante', coalesce(vf_staff(l.insegnante_id), ''),
        'al_posto_di', coalesce(vf_staff(l.insegnante_titolare), ''),
        'stato', l.stato::text, 'svolta_come', coalesce(l.svolta_come, ''),
        'appello', case when l.appello_at is not null then 'fatto' when l.stato = 'annullata' then '' else 'non fatto' end,
        'appello_da', coalesce(vf_staff(l.appello_da), ''),
        'appello_il', coalesce(to_char(l.appello_at at time zone v_fuso, 'YYYY-MM-DD HH24:MI'), ''),
        'ore_dopo_la_fine', coalesce(round(extract(epoch from (l.appello_at - l.fine)) / 3600.0)::int::text, ''),
        'attesi', coalesce(k.attesi, 0), 'presenti', coalesce(k.presenti, 0), 'assenti', coalesce(k.assenti, 0),
        'non_segnati', coalesce(k.non_segnati, 0),
        'presenti_non_attesi', (select count(*) from presenze ps where ps.lezione_id = l.id and ps.presente
                                   and not exists (select 1 from v_partecipanti_base b where b.lezione_id = l.id and b.allievo_id = ps.allievo_id))
      ) order by l.inizio, c.nome), '[]'::json) into v
      from l left join corsi c on c.id = l.corso_id left join sale s on s.id = l.sala_id left join conta k on k.lezione_id = l.id;

  -- ============================================================ PRESENZE (un mese alla volta): chi era atteso o presente a ogni lezione
  elsif p_file = 'presenze' then
    with l as (
      select l.* from lezioni l where l.palestra_id = p_palestra and l.data between p_dal and v_fino and l.stato <> 'annullata'
    ), righe as (
      select l.id as lezione_id, b.allievo_id, b.tipo, b.riferimento_id from l join v_partecipanti_base b on b.lezione_id = l.id
      union all  -- aggiunti all'appello senza essere attesi
      select l.id, ps.allievo_id, 'aggiunto', null from l join presenze ps on ps.lezione_id = l.id
       where not exists (select 1 from v_partecipanti_base b where b.lezione_id = l.id and b.allievo_id = ps.allievo_id)
    ), dett as (
      select r.*, l.data, l.inizio, l.corso_id, l.insegnante_id, ps.presente, ps.registrata_da, ps.registrata_at,
             exists (select 1 from assenze_avvisate x where x.lezione_id = r.lezione_id and x.allievo_id = r.allievo_id) as avvisato,
             case when r.tipo = 'iscritto' then r.riferimento_id
                  when r.tipo in ('recupero', 'ingresso') then (select p.iscrizione_id from prenotazioni p where p.id = r.riferimento_id) end as iscrizione_id
        from righe r join l on l.id = r.lezione_id
        left join presenze ps on ps.lezione_id = r.lezione_id and ps.allievo_id = r.allievo_id
    )
    select coalesce(json_agg(json_build_object(
        'lezione_id', d.lezione_id, 'data', d.data, 'ora', to_char(d.inizio at time zone v_fuso, 'HH24:MI'), 'corso', coalesce(c.nome, ''),
        'insegnante', coalesce(vf_staff(d.insegnante_id), ''),
        'cliente_id', d.allievo_id, 'cliente', trim(a.nome || ' ' || coalesce(a.cognome, '')),
        'tipo', case d.tipo when 'iscritto' then 'orario fisso' when 'aggiunto' then 'aggiunto all''appello' else d.tipo end,
        'presenza', case when d.presente then 'presente' when d.presente = false and d.avvisato then 'assente (avvisato)'
                         when d.presente = false then 'assente' when d.avvisato then 'assenza avvisata' else 'non segnata' end,
        'abbonamento_id', coalesce(d.iscrizione_id::text, ''),
        'abbonamento_valido_quel_giorno',
          case when d.tipo = 'prova' then 'prova'
               when exists (select 1 from iscrizioni i where i.allievo_id = d.allievo_id and i.stato <> 'annullata'
                              and d.data between i.data_inizio and coalesce(i.data_fine, d.data)) then 'sì'
               when exists (select 1 from storico_abbonamenti st where st.allievo_id = d.allievo_id and st.iscrizione_id is null
                              and d.data between st.dal and coalesce(st.al, d.data)) then 'sì (storico APP)'
               else 'no' end,
        'certificato_quel_giorno', case when a.certificato_scadenza is null then 'manca'
                                        when a.certificato_scadenza >= d.data then 'valido' else 'scaduto il ' || a.certificato_scadenza end,
        'segnata_da', coalesce(vf_staff(d.registrata_da), ''),
        'segnata_il', coalesce(to_char(d.registrata_at at time zone v_fuso, 'YYYY-MM-DD HH24:MI'), '')
      ) order by d.inizio, c.nome, a.cognome), '[]'::json) into v
      from dett d join allievi a on a.id = d.allievo_id left join corsi c on c.id = d.corso_id;

  -- ============================================================ INGRESSI ALLA RECEPTION (un mese alla volta)
  elsif p_file = 'ingressi' then
    select coalesce(json_agg(json_build_object(
        'quando', to_char(g.quando at time zone v_fuso, 'YYYY-MM-DD HH24:MI'),
        'cliente_id', g.allievo_id, 'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), ''),
        'lezione', coalesce((select co.nome || ' ' || to_char(l.inizio at time zone v_fuso, 'HH24:MI') from lezioni l left join corsi co on co.id = l.corso_id
                               where l.id = g.lezione_id), ''),
        'esito', coalesce(g.esito, ''), 'avvisi', coalesce(array_to_string(g.avvisi, ' | '), ''),
        'registrato_da', coalesce(vf_staff(g.registrato_da), '')
      ) order by g.quando), '[]'::json) into v
      from ingressi g left join allievi a on a.id = g.allievo_id
     where g.palestra_id = p_palestra and (g.quando at time zone v_fuso)::date between p_dal and p_al;

  -- ============================================================ PROVE (create o fatte nel periodo)
  elsif p_file = 'prove' then
    select coalesce(json_agg(json_build_object(
        'prova_id', pr.id, 'creata_il', to_char(pr.created_at at time zone v_fuso, 'YYYY-MM-DD'),
        'cliente_id', pr.allievo_id, 'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), ''),
        'corso', coalesce(c.nome, ''), 'data_lezione', coalesce(l.data::text, ''), 'stato', pr.stato::text,
        'prezzo', euro_it(nullif(pr.prezzo_cent, 0)), 'stato_pagamento', coalesce(pg.stato::text, case when coalesce(pr.prezzo_cent, 0) > 0 then 'nessun pagamento' else 'gratuita' end),
        'origine', coalesce(pr.origine, ''),
        'prove_della_persona', (select count(*) from prove p2 where p2.allievo_id = pr.allievo_id),
        'iscritto_dopo_il', coalesce((select min(i.created_at at time zone v_fuso)::date::text from iscrizioni i
                                        where i.allievo_id = pr.allievo_id and i.created_at >= pr.created_at and i.stato <> 'annullata'), ''),
        'stato_cliente', coalesce(a.stato_lead::text, '')
      ) order by pr.created_at), '[]'::json) into v
      from prove pr left join allievi a on a.id = pr.allievo_id left join corsi c on c.id = pr.corso_id
      left join lezioni l on l.id = pr.lezione_id left join pagamenti pg on pg.id = pr.pagamento_id
     where pr.palestra_id = p_palestra
       and ((pr.created_at at time zone v_fuso)::date between p_dal and p_al or l.data between p_dal and p_al);

  -- ============================================================ WORKSHOP (con almeno un giorno nel periodo): una riga per iscritto
  elsif p_file = 'workshop' then
    with w as (
      select w.*, (select min(m.inizio) from workshop_momenti m where m.workshop_id = w.id) as primo,
             (select max(m.fine) from workshop_momenti m where m.workshop_id = w.id) as ultimo
        from workshop w where w.palestra_id = p_palestra
    )
    select coalesce(json_agg(json_build_object(
        'workshop', w.titolo, 'dal', coalesce(to_char(w.primo at time zone v_fuso, 'YYYY-MM-DD'), ''),
        'al', coalesce(to_char(w.ultimo at time zone v_fuso, 'YYYY-MM-DD'), ''), 'stato_workshop', coalesce(w.stato, ''),
        'insegnante', coalesce(w.insegnante, ''), 'insegnante_della_scuola', case when w.insegnante_id is not null then 'sì' else 'no' end,
        'compenso', case w.compenso_tipo when 'fisso' then 'fisso ' || euro_it(w.compenso_cent)
                                         when 'percentuale' then w.compenso_percentuale || '% dell''incassato' else '' end,
        'compenso_pagato', case when w.compenso_pagato_at is not null then euro_it(w.compenso_pagato_cent) || ' il ' || to_char(w.compenso_pagato_at at time zone v_fuso, 'YYYY-MM-DD') else '' end,
        'cliente_id', coalesce(wi.allievo_id::text, ''), 'cliente', coalesce(trim(a.nome || ' ' || coalesce(a.cognome, '')), ''),
        'esterno', case when wi.esterno then 'sì' else '' end, 'opzione', coalesce(o.nome, ''), 'stato_iscrizione', coalesce(wi.stato, ''),
        'prezzo', euro_it(wi.prezzo_cent), 'quota_associativa', euro_it(nullif(wi.quota_cent, 0)),
        'stato_pagamento', coalesce(pg.stato::text, case when coalesce(wi.prezzo_cent, 0) > 0 then 'nessun pagamento' else 'gratuito' end),
        'metodo', coalesce(pg.metodo, ''), 'pagato_il', coalesce(to_char(pg.pagato_at at time zone v_fuso, 'YYYY-MM-DD'), ''),
        'presenze', coalesce(cardinality(wi.presenze), 0) || '/' || coalesce(cardinality(o.momenti), (select count(*) from workshop_momenti m where m.workshop_id = w.id))
      ) order by w.primo, w.titolo, a.cognome), '[]'::json) into v
      from w join workshop_iscrizioni wi on wi.workshop_id = w.id
      left join allievi a on a.id = wi.allievo_id left join workshop_opzioni o on o.id = wi.opzione_id left join pagamenti pg on pg.id = wi.pagamento_id
     where (w.primo at time zone v_fuso)::date <= p_al and (w.ultimo at time zone v_fuso)::date >= p_dal;

  -- ============================================================ COMPENSI (mesi del periodo)
  elsif p_file = 'compensi' then
    select coalesce(json_agg(json_build_object(
        'anno', k.anno, 'mese', k.mese, 'insegnante', coalesce(vf_staff(k.staff_id), ''),
        'lezioni', coalesce(k.lezioni, 0), 'ore', coalesce(replace(k.ore::text, '.', ','), ''),
        'tariffa_oraria', euro_it(k.tariffa_cent), 'base', euro_it(k.base_cent), 'forfait', euro_it(nullif(k.forfait_cent, 0)),
        'extra', euro_it(nullif(k.extra_cent, 0)), 'nota_extra', coalesce(k.extra_nota, ''), 'rimborsi', euro_it(nullif(k.rimborsi_cent, 0)),
        'totale', euro_it(k.totale_cent), 'stato', coalesce(k.stato, ''),
        'pagato_il', coalesce(to_char(k.pagato_at at time zone v_fuso, 'YYYY-MM-DD'), ''), 'metodo', coalesce(k.metodo, ''),
        'lezioni_da_verificare', coalesce(nullif(k.da_verificare, 0)::text, ''), 'sostituzioni', coalesce(nullif(k.sostituzioni, 0)::text, ''),
        'segnalazione_insegnante', coalesce(k.segnalazione, '')
      ) order by k.anno, k.mese, vf_staff(k.staff_id)), '[]'::json) into v
      from compensi k
     where k.palestra_id = p_palestra
       and make_date(k.anno, k.mese, 1) between date_trunc('month', p_dal)::date and p_al;

  -- ============================================================ SPESE (data nel periodo)
  elsif p_file = 'spese' then
    select coalesce(json_agg(json_build_object(
        'data', s.data, 'descrizione', coalesce(s.descrizione, ''), 'categoria', coalesce(s.categoria, ''),
        'fornitore', coalesce(f.nome, ''), 'importo', euro_it(s.importo_cent), 'pagata', case when s.pagata then 'sì' else 'no' end,
        'periodicita', coalesce(s.periodicita, '')
      ) order by s.data), '[]'::json) into v
      from spese s left join fornitori f on f.id = s.fornitore_id
     where s.palestra_id = p_palestra and s.data between p_dal and p_al;

  -- ============================================================ BANCA (movimenti caricati in RMHouse, data nel periodo)
  elsif p_file = 'banca' then
    select coalesce(json_agg(json_build_object(
        'conto', coalesce(co.nome, ''), 'data', m.data, 'valuta', coalesce(m.valuta::text, ''), 'importo', euro_it(m.importo_cent),
        'descrizione', coalesce(m.descrizione, ''), 'controparte', coalesce(m.controparte, ''), 'stato', coalesce(m.stato, ''),
        'abbinato_a', coalesce((select string_agg(
                                  case when ab.pagamento_id is not null then 'incasso: ' || coalesce((select coalesce(p.descrizione, p.causale) from pagamenti p where p.id = ab.pagamento_id), '')
                                       when ab.spesa_id is not null then 'spesa: ' || coalesce((select s.descrizione from spese s where s.id = ab.spesa_id), '')
                                       when ab.compenso_id is not null then 'compenso' else '?' end || ' (' || euro_it(ab.importo_cent) || ')', ' | ')
                                 from abbinamenti ab where ab.movimento_id = m.id), '')
      ) order by m.data, m.importo_cent), '[]'::json) into v
      from movimenti_banca m left join conti co on co.id = m.conto_id
     where m.palestra_id = p_palestra and m.data between p_dal and p_al;

  -- ============================================================ MODIFICHE E CANCELLAZIONI (un mese alla volta)
  elsif p_file = 'modifiche' then
    select coalesce(json_agg(json_build_object(
        'quando', to_char(ra.quando at time zone v_fuso, 'YYYY-MM-DD HH24:MI'), 'chi', coalesce(ra.chi, ''),
        'cosa', ra.tabella, 'operazione', ra.operazione, 'record_id', coalesce(ra.record_id::text, ''),
        'cliente_id', coalesce(ra.persona_id::text, ''), 'descrizione', coalesce(ra.descrizione, ''),
        'cambiamenti', coalesce(ra.modifiche::text, '')
      ) order by ra.quando), '[]'::json) into v
      from registro_azioni ra
     where ra.palestra_id = p_palestra
       and ra.quando >= (p_dal::timestamp at time zone v_fuso) and ra.quando < ((p_al + 1)::timestamp at time zone v_fuso)
       and (ra.operazione = 'cancellazione'
            or (ra.operazione = 'modifica' and ra.tabella in ('pagamenti', 'ricevute', 'iscrizioni', 'rate', 'quote_iscrizione', 'presenze',
                                                             'prove', 'workshop_iscrizioni', 'spese', 'compensi', 'tipi_abbonamento', 'tesseramenti')))
       -- i ritocchi automatici dei pagamenti online (commissioni, id di Stripe/Satispay) non servono
       and not (ra.chi = 'automatico' and ra.tabella = 'pagamenti' and ra.operazione = 'modifica'
                and not (ra.modifiche ? 'importo_cent' or ra.modifiche ? 'stato'));

  -- ============================================================ RIEPILOGO PER MESE
  elsif p_file = 'riepilogo_mensile' then
    with mesi as (
      select generate_series(date_trunc('month', p_dal), date_trunc('month', p_al), interval '1 month')::date as m
    ), pag as (
      select date_trunc('month', p.pagato_at at time zone v_fuso)::date as m, p.metodo, p.importo_cent
        from pagamenti p where p.palestra_id = p_palestra and p.stato = 'pagato'
         and (p.pagato_at at time zone v_fuso)::date between p_dal and p_al
    )
    select coalesce(json_agg(json_build_object(
        'mese', to_char(mesi.m, 'YYYY-MM'),
        'incassato', euro_it(coalesce((select sum(importo_cent) from pag where pag.m = mesi.m), 0)::int),
        'contanti', euro_it(coalesce((select sum(importo_cent) from pag where pag.m = mesi.m and pag.metodo = 'contanti'), 0)::int),
        'pos', euro_it(coalesce((select sum(importo_cent) from pag where pag.m = mesi.m and pag.metodo = 'pos'), 0)::int),
        'bonifico', euro_it(coalesce((select sum(importo_cent) from pag where pag.m = mesi.m and pag.metodo = 'bonifico'), 0)::int),
        'satispay', euro_it(coalesce((select sum(importo_cent) from pag where pag.m = mesi.m and pag.metodo = 'satispay'), 0)::int),
        'online_carta', euro_it(coalesce((select sum(importo_cent) from pag where pag.m = mesi.m and pag.metodo in ('online', 'stripe')), 0)::int),
        'altro', euro_it(coalesce((select sum(importo_cent) from pag where pag.m = mesi.m and coalesce(pag.metodo, '') not in ('contanti', 'pos', 'bonifico', 'satispay', 'online', 'stripe')), 0)::int),
        'n_incassi', (select count(*) from pag where pag.m = mesi.m),
        'pagamenti_annullati', (select count(*) from pagamenti p where p.palestra_id = p_palestra and p.stato in ('annullato', 'rimborsato')
                                  and date_trunc('month', p.created_at at time zone v_fuso)::date = mesi.m),
        'ancora_da_incassare_creati_nel_mese', euro_it(coalesce((select sum(p.importo_cent) from pagamenti p where p.palestra_id = p_palestra and p.stato = 'in_attesa'
                                  and date_trunc('month', p.created_at at time zone v_fuso)::date = mesi.m), 0)::int),
        'ricevute_emesse', (select count(*) from ricevute r where r.palestra_id = p_palestra and date_trunc('month', r.data)::date = mesi.m
                              and coalesce(r.tipo_documento, 'ricevuta') <> 'nota_credito'),
        'ricevute_annullate', (select count(*) from ricevute r where r.palestra_id = p_palestra and date_trunc('month', r.data)::date = mesi.m and r.annullata),
        'note_di_credito', euro_it(coalesce((select sum(r.importo_cent) from ricevute r where r.palestra_id = p_palestra and date_trunc('month', r.data)::date = mesi.m
                              and r.tipo_documento = 'nota_credito'), 0)::int),
        'nuovi_abbonamenti', (select count(*) from iscrizioni i where i.palestra_id = p_palestra and i.stato <> 'annullata'
                                and date_trunc('month', i.created_at at time zone v_fuso)::date = mesi.m),
        'prove', (select count(*) from prove pr where pr.palestra_id = p_palestra and date_trunc('month', pr.created_at at time zone v_fuso)::date = mesi.m),
        'spese', euro_it(coalesce((select sum(s.importo_cent) from spese s where s.palestra_id = p_palestra and date_trunc('month', s.data)::date = mesi.m), 0)::int),
        'versamenti_e_accrediti_in_banca', euro_it(coalesce((select sum(mb.importo_cent) from movimenti_banca mb where mb.palestra_id = p_palestra
                              and mb.importo_cent > 0 and date_trunc('month', mb.data)::date = mesi.m), 0)::int)
      ) order by mesi.m), '[]'::json) into v
      from mesi;

  else
    raise exception 'file_sconosciuto';
  end if;
  return v;
end $$;
revoke all on function verifiche_file(uuid, text, date, date) from public, anon;
grant execute on function verifiche_file(uuid, text, date, date) to authenticated, service_role;

-- annota chi ha scaricato il pacchetto, per che periodo e quante righe aveva ogni file
create or replace function registra_verifiche_export(p_palestra uuid, p_dal date, p_al date, p_file jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_staff staff; v_oggi date := (now() at time zone 'Europe/Rome')::date; v_pross date; v_a int;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  select * into v_staff from staff where user_id = auth.uid() and palestra_id = p_palestra limit 1;
  insert into verifiche_export (palestra_id, creato_da, chi, dal, al, file)
  values (p_palestra, v_staff.id, trim(coalesce(v_staff.nome, '') || ' ' || coalesce(v_staff.cognome, '')), p_dal, p_al, coalesce(p_file, '{}'::jsonb))
  returning id into v_id;
  -- il promemoria della prossima verifica (1° febbraio o 1° agosto, almeno due mesi dopo), nella home di chi l'ha scaricata
  v_a := extract(year from v_oggi)::int;
  select d into v_pross from unnest(array[make_date(v_a, 2, 1), make_date(v_a, 8, 1), make_date(v_a + 1, 2, 1), make_date(v_a + 1, 8, 1)]) d
   where d > v_oggi + 60 order by d limit 1;
  delete from promemoria where palestra_id = p_palestra and not fatto and data > v_oggi and testo like 'Export per le verifiche%';
  insert into promemoria (palestra_id, data, testo, creato_da, per_staff)
  values (p_palestra, v_pross,
          'Export per le verifiche: scarica il pacchetto e dallo a Claude (Conti → Export per le verifiche). L''ultima copriva dal '
            || to_char(p_dal, 'DD/MM/YYYY') || ' al ' || to_char(p_al, 'DD/MM/YYYY') || '.',
          'Verifiche', v_staff.id);
  return v_id;
end $$;
revoke all on function registra_verifiche_export(uuid, date, date, jsonb) from public, anon;
grant execute on function registra_verifiche_export(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
