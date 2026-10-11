-- 158 — Dichiarazione e ricevuta per il 730 (sport dei ragazzi), come il vostro modello Word
-- • dichiarazioni_730(): i dati per una ricevuta (anche più ricevute) oppure per tutto un anno (uno per ragazzo, 5–18 anni).
-- • palestre.dichiarazione: testo dell'intestazione, "presso", firma; palestra_file: il timbro con la firma
--   (si carica in Struttura → Sede e contatti; NON è un file pubblico: lo leggono solo lo staff e il PDF).
-- • cerca_ricevute(): uguale al 155, in più la data di nascita (per il bottone "730" sui minori).
-- Si può rilanciare.

alter table palestre add column if not exists dichiarazione jsonb not null default '{}'::jsonb;

create table if not exists palestra_file (
  palestra_id uuid not null references palestre(id) on delete cascade,
  chiave text not null,                 -- es. 'timbro_firma'
  tipo text not null,                   -- image/png, image/jpeg
  dati text not null,                   -- base64
  updated_at timestamptz not null default now(),
  primary key (palestra_id, chiave)
);
alter table palestra_file enable row level security;
drop policy if exists staff_legge on palestra_file;
create policy staff_legge on palestra_file for select using (palestra_id in (select palestre_gestione()));
drop policy if exists gestione_scrive on palestra_file;
create policy gestione_scrive on palestra_file for all using (palestra_id in (select palestre_gestione()))
  with check (palestra_id in (select palestre_gestione()));
grant select, insert, update, delete on palestra_file to authenticated;

create or replace function cerca_ricevute(p_palestra uuid, p_dal date, p_al date, p_metodi text[] default null,
                                          p_tipi uuid[] default null, p_allievo uuid default null, p_documenti text[] default null,
                                          p_account uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb; a allievi;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_allievo is not null then select * into a from allievi where id = p_allievo and palestra_id = p_palestra; end if;
  with base as (
    select r.*, n.codice, rif.tipo_documento as rif_tipo,
           i.id as iscrizione_id, i.tipo_abbonamento_id, t.nome as tipo_nome, c.nome as corso_nome,
           coalesce(r.allievo_id, pg.allievo_id, i.allievo_id) as chi_id, pg.causale,
           ac.email as acc_email, ac.telefono as acc_telefono, ac.nome as acc_nome
      from ricevute r
      left join numerazioni n on n.id = r.numerazione_id
      left join ricevute rif on rif.id = r.riferimento_id
      left join pagamenti pg on pg.id = r.pagamento_id
      left join lateral (select x.* from iscrizioni x where x.pagamento_id = r.pagamento_id limit 1) i on true
      left join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
      left join corsi c on c.id = i.corso_id
      left join account ac on ac.id = r.account_id
     where r.palestra_id = p_palestra and r.data between p_dal and p_al
       and (p_metodi is null or coalesce(r.metodo, '') = any (p_metodi))
       and (p_documenti is null or coalesce(r.tipo_documento, 'ricevuta') = any (p_documenti))
       and (p_tipi is null or i.tipo_abbonamento_id = any (p_tipi))
       -- chi paga (titolare) vede anche quelle dei figli; un figlio solo le sue
       and (p_account is null or r.account_id = p_account)
       and (p_allievo is null
            or (a.is_titolare and r.account_id = a.account_id)
            or (not a.is_titolare and (r.allievo_id = a.id or pg.allievo_id = a.id or i.allievo_id = a.id)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'tipo_documento', coalesce(b.tipo_documento, 'ricevuta'), 'codice', b.codice, 'numero', b.numero, 'anno', b.anno, 'data', b.data,
      'intestatario', b.intestatario, 'codice_fiscale', b.codice_fiscale, 'indirizzo', b.indirizzo, 'descrizione', b.descrizione,
      'importo_cent', b.importo_cent, 'iva_cent', b.iva_cent, 'metodo', b.metodo, 'annullata', b.annullata, 'motivo_annullo', b.motivo_annullo,
      'xml_scaricato_at', b.xml_scaricato_at, 'rif_tipo', b.rif_tipo, 'pagamento_id', b.pagamento_id, 'causale', b.causale,
      'iscrizione_id', b.iscrizione_id, 'tipo_abbonamento_id', b.tipo_abbonamento_id, 'tipo_nome', b.tipo_nome, 'corso_nome', b.corso_nome,
      'allievo_id', b.chi_id, 'cliente', (select trim(x.nome || ' ' || coalesce(x.cognome, '')) from allievi x where x.id = b.chi_id),
      'nascita', (select x.data_nascita from allievi x where x.id = b.chi_id),
      'email', b.acc_email, 'telefono', b.acc_telefono, 'nome_account', b.acc_nome, 'token', b.token, 'note', b.note
    ) order by b.data desc, b.numero desc), '[]'::jsonb) into v
    from (select * from base order by data desc, numero desc limit 5000) b;
  return v;
end $$;
revoke all on function cerca_ricevute(uuid, date, date, text[], uuid[], uuid, text[], uuid) from public, anon;
grant execute on function cerca_ricevute(uuid, date, date, text[], uuid[], uuid, text[], uuid) to authenticated;

-- il testo del vostro modello (solo la prima volta e solo per la vostra P.IVA)
update palestre set dichiarazione = jsonb_build_object(
    'intestazione', 'Ritmo Metropolitano S.s.d. a R.L. con sede legale in Piazzetta Monsignor Lorenzon n 26, Vicenza e sede operativa in Via Dell''Artigianato n 24 - 36100 Vicenza, P.iva 03983880240. Società regolarmente affiliata ASI e iscritta al CONI / Sport e Salute',
    'presso', 'la sede operativa di Via Dell''Artigianato 24, Vicenza',
    'firma', 'Legale Rappresentante')
 where fatturazione ->> 'piva' = '03983880240' and dichiarazione = '{}'::jsonb;

-- i dati delle dichiarazioni: p_ricevute (una o più ricevute) oppure p_anno (tutti i ragazzi, o solo p_allievo)
create or replace function dichiarazioni_730(p_palestra uuid, p_ricevute uuid[] default null, p_anno int default null, p_allievo uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_ricevute is not null then
    with r as (
      select r.*, i.id as iscr_id, i.data_inizio, i.data_fine, i.corso_id,
             coalesce(r.allievo_id, pg.allievo_id, i.allievo_id,
                      (select q.allievo_id from quote_iscrizione q where q.pagamento_id = r.pagamento_id limit 1),
                      (select wi.allievo_id from workshop_iscrizioni wi where wi.pagamento_id = r.pagamento_id limit 1),
                      (select a1.id from allievi a1 where a1.account_id = r.account_id and (select count(*) from allievi a2 where a2.account_id = r.account_id) = 1)) as chi
        from ricevute r
        left join pagamenti pg on pg.id = r.pagamento_id
        left join lateral (select x.* from iscrizioni x where x.pagamento_id = r.pagamento_id limit 1) i on true
       where r.palestra_id = p_palestra and r.id = any (p_ricevute) and not r.annullata
         and coalesce(r.tipo_documento, 'ricevuta') in ('ricevuta', 'fattura')
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'ricevuta', jsonb_build_object('id', r.id, 'numero', r.numero, 'anno', r.anno, 'data', r.data),
        'allievo_id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'codice_fiscale', upper(a.codice_fiscale), 'data_nascita', a.data_nascita,
        'comune', acc.citta, 'indirizzo', coalesce(a.indirizzo, acc.indirizzo),
        'pagante', r.intestatario, 'pagante_cf', upper(coalesce(r.codice_fiscale, case when a.is_titolare then a.codice_fiscale else acc.codice_fiscale end)),
        'attivita', coalesce(c.nome, r.descrizione), 'descrizione', r.descrizione,
        'presso', case when s.id is not null then trim(s.nome || coalesce(', ' || s.indirizzo, '') || coalesce(', ' || s.citta, '')) end,
        'principale', coalesce(s.principale, true),
        'dal', coalesce(r.data_inizio, r.data), 'al', coalesce(r.data_fine, r.data),
        'importo_cent', r.importo_cent + r.iva_cent, 'metodi', jsonb_build_array(r.metodo), 'versato_il', r.data
      ) order by r.data, r.numero), '[]'::jsonb) into v
      from r
      left join allievi a on a.id = r.chi
      left join account acc on acc.id = a.account_id
      left join corsi c on c.id = r.corso_id
      left join sedi s on s.id = c.sede_id;
    return v;
  end if;

  with v as (
    -- incassi dell'anno (come per gli attestati: abbonamenti, quote, prove), ricondotti al ragazzo
    select coalesce(pg.allievo_id,
                    (select i.allievo_id from iscrizioni i where i.pagamento_id = pg.id limit 1),
                    (select q.allievo_id from quote_iscrizione q where q.pagamento_id = pg.id limit 1),
                    (select a.id from allievi a where a.account_id = pg.account_id
                       and (select count(*) from allievi a2 where a2.account_id = pg.account_id) = 1)) as allievo_id,
           pg.pagato_at::date as data, pg.importo_cent as importo, pg.metodo
      from pagamenti pg
     where pg.palestra_id = p_palestra and pg.stato = 'pagato' and extract(year from pg.pagato_at) = p_anno
       and pg.causale in ('abbonamento', 'quota_iscrizione', 'prova')
    union all
    -- abbonamenti venduti con APP Palestre
    select st.allievo_id, st.dal, st.valore_cent, null
      from storico_abbonamenti st
     where st.palestra_id = p_palestra and st.iscrizione_id is null and extract(year from st.dal) = p_anno and coalesce(st.valore_cent, 0) > 0
  ),
  per as (
    select v.allievo_id, sum(v.importo)::bigint as totale, min(v.data) as dal, max(v.data) as al,
           coalesce(jsonb_agg(distinct v.metodo) filter (where v.metodo is not null), '[]'::jsonb) as metodi,
           bool_or(v.metodo is null) as storico
      from v where v.allievo_id is not null group by v.allievo_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'allievo_id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'codice_fiscale', upper(a.codice_fiscale), 'data_nascita', a.data_nascita,
      'comune', acc.citta, 'indirizzo', coalesce(a.indirizzo, acc.indirizzo),
      'pagante', case when a.is_titolare then trim(a.nome || ' ' || coalesce(a.cognome, '')) else trim(coalesce(acc.nome, '') || ' ' || coalesce(acc.cognome, '')) end,
      'pagante_cf', upper(case when a.is_titolare then a.codice_fiscale else acc.codice_fiscale end),
      'attivita', (select string_agg(distinct c.nome, ', ') from iscrizioni i join corsi c on c.id = i.corso_id
                    where i.allievo_id = a.id and i.stato <> 'annullata' and extract(year from i.data_inizio) <= p_anno and extract(year from i.data_fine) >= p_anno),
      'presso', (select string_agg(distinct trim(s.nome || coalesce(', ' || s.indirizzo, '') || coalesce(', ' || s.citta, '')), ' e ')
                   from iscrizioni i join corsi c on c.id = i.corso_id join sedi s on s.id = c.sede_id
                  where i.allievo_id = a.id and i.stato <> 'annullata' and extract(year from i.data_inizio) <= p_anno and extract(year from i.data_fine) >= p_anno),
      'principale', coalesce((select bool_and(s.principale) from iscrizioni i join corsi c on c.id = i.corso_id join sedi s on s.id = c.sede_id
                  where i.allievo_id = a.id and i.stato <> 'annullata' and extract(year from i.data_inizio) <= p_anno and extract(year from i.data_fine) >= p_anno), true),
      'dal', make_date(p_anno, 1, 1), 'al', make_date(p_anno, 12, 31), 'primo', per.dal, 'ultimo', per.al,
      'importo_cent', per.totale, 'metodi', per.metodi, 'storico', per.storico
    ) order by a.cognome, a.nome), '[]'::jsonb) into v
    from per
    join allievi a on a.id = per.allievo_id
    join account acc on acc.id = a.account_id
   where a.palestra_id = p_palestra and (p_allievo is null or a.id = p_allievo)
     and a.data_nascita is not null and extract(year from a.data_nascita) between p_anno - 18 and p_anno - 5;
  return v;
end $$;
revoke all on function dichiarazioni_730(uuid, uuid[], int, uuid) from public, anon;
grant execute on function dichiarazioni_730(uuid, uuid[], int, uuid) to authenticated;

notify pgrst, 'reload schema';
