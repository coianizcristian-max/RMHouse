-- =====================================================================
-- RMHouse — 139 LEZIONI IN PIÙ SULL'ABBONAMENTO
-- La segreteria aggiunge a un abbonamento N lezioni da prenotare (scheda persona → iscrizione → "+ Lezioni"),
-- senza sceglierle: il cliente le prenota da solo dall'app (Prenota), come un recupero.
-- • abbonamento a giorni fissi: N "lezioni in più" (crediti di recupero senza lezione persa, dati dalla scuola:
--   non contano nel limite dei recuperi al mese né nel massimo dei recuperi dell'abbonamento), valide fino alla
--   fine dell'abbonamento o alla data scelta, nei corsi dove si può recuperare;
-- • carnet a ingressi: N ingressi in più.
-- Si possono togliere finché non sono prenotate. Si può eseguire più volte.
-- =====================================================================

alter table crediti_recupero alter column lezione_persa_id drop not null;
alter table crediti_recupero add column if not exists nota text;

-- elenco dei recuperi della scheda persona: anche le lezioni in più (senza lezione persa)
create or replace view v_crediti with (security_invoker = true) as
 select cr.id, cr.palestra_id, cr.allievo_id, cr.iscrizione_id, cr.scadenza, cr.annullato, cr.usato_in,
        l.data as data_persa, c.nome as corso_nome, i.corso_id,
        case when cr.annullato then 'annullato'
             when cr.usato_in is not null then 'usato'
             when cr.scadenza < current_date then 'scaduto'
             else 'disponibile' end as stato,
        lr.data as data_recupero, cr2.nome as corso_recupero,
        cr.lezione_persa_id is null as aggiunta, cr.nota, cr.dalla_scuola, cr.created_at
   from crediti_recupero cr
   left join lezioni l on l.id = cr.lezione_persa_id
   join iscrizioni i on i.id = cr.iscrizione_id
   join corsi c on c.id = i.corso_id
   left join prenotazioni p on p.id = cr.usato_in
   left join lezioni lr on lr.id = p.lezione_id
   left join corsi cr2 on cr2.id = lr.corso_id;

-- le lezioni in più tengono la scadenza scelta dalla segreteria
create or replace function trg_crediti_scadenza() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fine date;
begin
  if new.lezione_persa_id is null then return new; end if;
  if (select scadenza_recupero from palestre where id = new.palestra_id) = 'abbonamento' then
    select data_fine into v_fine from iscrizioni where id = new.iscrizione_id;
    if v_fine is not null then new.scadenza := v_fine; end if;
  end if;
  new.scadenza := scadenza_recupero_regola(new.palestra_id, new.lezione_persa_id, new.scadenza);
  return new;
end $$;

-- aggiunge N lezioni (giorni fissi) o N ingressi (carnet) a un'iscrizione
create or replace function aggiungi_lezioni(p_iscrizione uuid, p_quante int, p_scadenza date default null, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i iscrizioni; v_modo text; v_scad date; k int;
begin
  select * into i from iscrizioni where id = p_iscrizione for update;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  if not is_staff(i.palestra_id) then raise exception 'non_autorizzato'; end if;
  if i.stato not in ('attiva', 'sospesa') then raise exception 'iscrizione_non_attiva'; end if;
  if p_quante is null or p_quante < 1 or p_quante > 50 then raise exception 'numero_non_valido'; end if;
  select t.modalita::text into v_modo from tipi_abbonamento t where t.id = i.tipo_abbonamento_id;

  if v_modo = 'ingressi' then
    update iscrizioni set ingressi_residui = coalesce(ingressi_residui, 0) + p_quante where id = i.id;
    return jsonb_build_object('modo', 'ingressi', 'aggiunte', p_quante);
  end if;
  if v_modo = 'libero' then raise exception 'accesso_libero'; end if;

  v_scad := coalesce(p_scadenza, i.data_fine);
  if v_scad is null or v_scad < current_date then raise exception 'scadenza_passata'; end if;
  for k in 1 .. p_quante loop
    insert into crediti_recupero (palestra_id, iscrizione_id, allievo_id, lezione_persa_id, scadenza, dalla_scuola, nota)
    values (i.palestra_id, i.id, i.allievo_id, null, v_scad, true, nullif(btrim(coalesce(p_nota, '')), ''));
  end loop;
  return jsonb_build_object('modo', 'lezioni', 'aggiunte', p_quante, 'scadenza', v_scad);
end $$;
revoke all on function aggiungi_lezioni(uuid, int, date, text) from public, anon;
grant execute on function aggiungi_lezioni(uuid, int, date, text) to authenticated;

-- toglie una lezione in più non ancora prenotata
create or replace function togli_lezione_in_piu(p_credito uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c crediti_recupero;
begin
  select * into c from crediti_recupero where id = p_credito for update;
  if not found then raise exception 'credito_non_valido'; end if;
  if not is_staff(c.palestra_id) then raise exception 'non_autorizzato'; end if;
  if c.usato_in is not null then raise exception 'credito_gia_usato'; end if;
  if c.lezione_persa_id is not null then raise exception 'non_aggiunta'; end if;
  delete from crediti_recupero where id = c.id;
end $$;
revoke all on function togli_lezione_in_piu(uuid) from public, anon;
grant execute on function togli_lezione_in_piu(uuid) to authenticated;

do $$
declare v_def text; v_nuova text;
begin
  -- il massimo dei recuperi dell'abbonamento non conta le lezioni in più
  select pg_get_functiondef('trg_presenze_credito'::regproc) into v_def;
  if position('and lezione_persa_id is not null' in v_def) > 0 then
    raise notice 'trg_presenze_credito: già aggiornata';
  else
    v_nuova := replace(v_def,
      'select count(*) into v_usati from crediti_recupero where iscrizione_id = v_isc.id and not annullato;',
      'select count(*) into v_usati from crediti_recupero where iscrizione_id = v_isc.id and not annullato and lezione_persa_id is not null;');
    if v_nuova <> v_def then execute v_nuova; raise notice 'trg_presenze_credito: aggiornata';
    else raise warning 'trg_presenze_credito: testo atteso non trovato, NON aggiornata'; end if;
  end if;

  -- l'app del cliente distingue le lezioni in più dai recuperi
  select pg_get_functiondef('area_riepilogo'::regproc) into v_def;
  if position('''aggiunta'', cr.lezione_persa_id is null' in v_def) > 0 then
    raise notice 'area_riepilogo: già aggiornata';
  else
    v_nuova := replace(v_def,
      '''scadenza'', cr.scadenza, ''iscrizione_id'', cr.iscrizione_id)',
      '''scadenza'', cr.scadenza, ''iscrizione_id'', cr.iscrizione_id, ''aggiunta'', cr.lezione_persa_id is null, ''dalla_scuola'', cr.dalla_scuola, ''nota'', cr.nota)');
    if v_nuova <> v_def then execute v_nuova; raise notice 'area_riepilogo: aggiornata';
    else raise warning 'area_riepilogo: testo atteso non trovato, NON aggiornata'; end if;
  end if;
end $$;

-- i contatori "recuperi di questo mese" dell'app non contano le lezioni date dalla scuola (come il controllo vero)
do $$
declare v_def text; v_nuova text; f text;
begin
  foreach f in array array['recuperi_per_mese', 'disdette_area'] loop
    select pg_get_functiondef(f::regproc) into v_def;
    if position('cr.usato_in = p.id and cr.dalla_scuola' in v_def) > 0 then
      raise notice '%: già aggiornata', f;
    else
      v_nuova := replace(v_def, 'p.tipo = ''recupero'' and p.stato = ''confermata''',
        'p.tipo = ''recupero'' and p.stato = ''confermata'' and not exists (select 1 from crediti_recupero cr where cr.usato_in = p.id and cr.dalla_scuola)');
      if v_nuova <> v_def then execute v_nuova; raise notice '%: aggiornata', f;
      else raise warning '%: testo atteso non trovato, NON aggiornata', f; end if;
    end if;
  end loop;
end $$;
