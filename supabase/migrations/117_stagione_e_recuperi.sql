-- =====================================================================
-- RMHouse — 117 LA STAGIONE SPORTIVA È IL LIMITE DI TUTTO; RECUPERI SECONDO L'ABBONAMENTO
-- Regole della direzione:
-- 1. Tutto scade nella stagione sportiva, niente passa a quella dopo. La stagione finisce con luglio
--    (nuova impostazione mese_fine_stagione, 7): ogni abbonamento, annuale compreso, scade al più tardi il 31/07.
--    L'annuale va da ottobre a luglio: chi parte a novembre ha la stessa scadenza e la segreteria scala l'importo.
--    I recuperi (query 115) seguono lo stesso limite.
-- 2. Recuperi al mese = lezioni a settimana dell'abbonamento: 1 volta → 1, 2 volte → 2, 3 → 3, 4 → 4.
--    Gli abbonamenti open (tutte le lezioni) non hanno recuperi.
-- Si può eseguire più volte. Va dopo la 116.
-- =====================================================================

alter table palestre add column if not exists mese_fine_stagione smallint not null default 7;     -- luglio: tutto scade qui
alter table palestre add column if not exists mese_inizio_annuale smallint not null default 10;   -- ottobre: da qui parte l'annuale
do $$ begin
  alter table palestre add constraint palestre_mese_fine_stagione_check check (mese_fine_stagione between 1 and 12);
exception when duplicate_object then null; end $$;

-- ─── 1. fine della stagione: l'ultimo giorno del mese di chiusura ───────────────────────────────
create or replace function fine_stagione(p_palestra uuid, p_data date)
returns date language sql stable set search_path = public as $$
  select case when extract(month from p_data) > p.mese_fine_stagione
              then make_date(extract(year from p_data)::int + 1, p.mese_fine_stagione, 1)
              else make_date(extract(year from p_data)::int, p.mese_fine_stagione, 1) end
         + interval '1 month' - interval '1 day'
    from palestre p where p.id = p_palestra;
$$;

-- la scadenza di un abbonamento non supera mai la fine della stagione (le prove e le lezioni singole restano com'erano)
create or replace function scadenza_abbonamento(p_tipo uuid, p_inizio date)
returns date language sql stable set search_path = public as $$
  select case
    -- l'annuale (9 mesi o più) finisce sempre con la stagione, da qualunque mese parta
    when t.modalita <> 'ingressi' and coalesce(t.durata_mesi, 1) >= 9 and (t.durata_giorni is null or t.durata_giorni >= 28)
      then fine_stagione(t.palestra_id, p_inizio)
    when t.durata_giorni is not null and (t.durata_giorni < 28 or not t.scadenza_fine_mese)
      then least(p_inizio + t.durata_giorni - 1, fine_stagione(t.palestra_id, p_inizio))
    else least(fine_periodo(p_inizio, greatest(coalesce(t.durata_mesi, 1), 1), t.scadenza_fine_mese), fine_stagione(t.palestra_id, p_inizio))
  end
  from tipi_abbonamento t where t.id = p_tipo;
$$;

-- ─── 2. recuperi: tanti al mese quante le lezioni a settimana; gli open non ne hanno ─────────────
update tipi_abbonamento set recuperi_max = 0 where modalita = 'libero' and coalesce(recuperi_max, -1) <> 0;

create or replace function prenota_recupero(p_credito uuid, p_lezione uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c crediti_recupero; l lezioni; v_max int;
begin
  select * into c from crediti_recupero where id = p_credito;
  select * into l from lezioni where id = p_lezione;
  if c.id is not null and l.id is not null then
    -- non si recupera nella lezione che si è disdetta
    if l.id = c.lezione_persa_id or exists (select 1 from assenze_avvisate x where x.lezione_id = l.id and x.allievo_id = c.allievo_id) then
      raise exception 'lezione_disdetta';
    end if;
    -- al mese: tanti recuperi quante le lezioni a settimana dell'abbonamento (altrimenti il limite della scuola)
    select coalesce(t.lezioni_settimanali, p.recuperi_max_mese) into v_max
      from iscrizioni i join tipi_abbonamento t on t.id = i.tipo_abbonamento_id join palestre p on p.id = i.palestra_id
     where i.id = c.iscrizione_id;
    if v_max is not null and not c.dalla_scuola and recuperi_nel_mese(c.allievo_id, l.data) >= v_max then
      raise exception 'limite_recuperi_mese';
    end if;
  end if;
  return prenota_recupero_base(p_credito, p_lezione);
end $$;

-- i recuperi aperti seguono il limite nuovo della stagione (luglio)
update crediti_recupero cr set scadenza = scadenza_recupero_regola(cr.palestra_id, cr.lezione_persa_id, cr.scadenza)
 where cr.usato_in is null and not cr.annullato and cr.lezione_persa_id is not null
   and cr.scadenza <> scadenza_recupero_regola(cr.palestra_id, cr.lezione_persa_id, cr.scadenza);

-- ─── 3. l'annuale a stagione avviata si fa in segreteria (che scala i mesi) ─────────────────────
-- i mesi dell'anno sportivo già passati quando parte un annuale (0 se parte a ottobre o prima)
create or replace function mesi_persi_annuale(p_palestra uuid, p_dal date)
returns int language sql stable set search_path = public as $$
  select case
           -- anno sportivo dentro l'anno solare (es. gennaio → dicembre)
           when p.mese_inizio_annuale <= p.mese_fine_stagione then
             case when extract(month from p_dal) > p.mese_inizio_annuale and extract(month from p_dal) <= p.mese_fine_stagione
                  then (extract(month from p_dal) - p.mese_inizio_annuale)::int else 0 end
           -- a cavallo (ottobre → luglio): novembre-dicembre, poi gennaio-luglio
           when extract(month from p_dal) > p.mese_inizio_annuale then (extract(month from p_dal) - p.mese_inizio_annuale)::int
           when extract(month from p_dal) <= p.mese_fine_stagione then (extract(month from p_dal) + 12 - p.mese_inizio_annuale)::int
           else 0 end
    from palestre p where p.id = p_palestra;
$$;
-- vero se l'abbonamento è annuale (9 mesi o più) e parte dopo l'inizio dell'anno sportivo
create or replace function annuale_a_stagione_avviata(p_tipo uuid, p_dal date)
returns boolean language sql stable set search_path = public as $$
  select t.modalita <> 'ingressi' and coalesce(t.durata_mesi, 1) >= 9 and mesi_persi_annuale(t.palestra_id, p_dal) > 0
    from tipi_abbonamento t where t.id = p_tipo;
$$;

do $$
declare v text; v0 text; f text;
begin
  foreach f in array array['prepara_acquisto', 'richiedi_abbonamento'] loop
    select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f;
    v0 := v;
    if v not like '%annuale_in_segreteria%' then
      v := replace(v, 'if a_mese_solare(t.id) and extract(day from v_inizio) <> 1 then raise exception ''inizio_meta_mese''; end if;',
                      'if a_mese_solare(t.id) and extract(day from v_inizio) <> 1 then raise exception ''inizio_meta_mese''; end if;
  if annuale_a_stagione_avviata(t.id, v_inizio) then raise exception ''annuale_in_segreteria''; end if;');
      if v = v0 then raise exception '%: testo non trovato', f; end if;
      execute v;
    end if;
  end loop;
end $$;

-- ─── 4. gli open non maturano recuperi, nemmeno quando è la scuola ad annullare ─────────────────
do $$
declare v text; v0 text;
begin
  select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'disdici_lezione';
  v0 := v;
  v := replace(v, 'if coalesce(t.recuperi_max, 1) <> 0', 'if coalesce(t.recuperi_max, 1) <> 0 and t.modalita <> ''libero''');
  if v <> v0 then execute v; end if;

  select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'trg_lezioni_annullata_prenotazioni';
  v0 := v;
  v := replace(v, 'where b.lezione_id = new.id and b.tipo = ''iscritto''
      on conflict (iscrizione_id, lezione_persa_id) do nothing;',
                  'where b.lezione_id = new.id and b.tipo = ''iscritto'' and t.modalita <> ''libero''
      on conflict (iscrizione_id, lezione_persa_id) do nothing;');
  if v <> v0 then execute v; end if;
  -- il "almeno 30 giorni" del recupero dato dalla scuola resta dentro la regola (fine mese dopo, mai oltre la stagione)
  v := replace(v, 'update crediti_recupero set scadenza = greatest(scadenza, new.data + 30)
       where lezione_persa_id = new.id and dalla_scuola;',
                  'update crediti_recupero set scadenza = scadenza_recupero_regola(palestra_id, lezione_persa_id, greatest(scadenza, new.data + 30))
       where lezione_persa_id = new.id and dalla_scuola;');
  if v <> v0 then execute v; end if;
end $$;
