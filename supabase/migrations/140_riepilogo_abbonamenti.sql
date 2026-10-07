-- =====================================================================
-- RMHouse — 140 RIEPILOGO DEGLI ABBONAMENTI NELLA SCHEDA PERSONA (come la scheda "Abbonamenti" di APP Palestre)
-- • riepilogo_iscrizioni(allievo): per ogni iscrizione i corsi compresi e i numeri delle lezioni
--   (totali nel periodo, fatte, restanti, prenotate, disdette, lezioni in più e recuperi; per i carnet ingressi
--   totali, restanti e prenotati).
-- • modifica_iscrizione: si possono correggere a mano gli ingressi restanti di un carnet.
-- • aggiungi_lezioni: le lezioni in più si possono dare anche su un abbonamento già finito
--   (scegliendo fino a quando valgono), come in APP Palestre.
-- Si può eseguire più volte.
-- =====================================================================

create or replace function riepilogo_iscrizioni(p_allievo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a allievi; v jsonb := '{}'::jsonb; r record; v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_orari uuid[]; v_lez jsonb;
begin
  select * into a from allievi where id = p_allievo;
  if not found then return '{}'::jsonb; end if;
  if not is_staff(a.palestra_id) then raise exception 'non_autorizzato'; end if;

  for r in
    select i.*, t.modalita::text as modalita, t.num_ingressi, t.lezioni_settimanali, t.recuperi_max,
           t.durata_mesi, t.durata_giorni, t.codice, t.prezzo_cent
      from iscrizioni i join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
     where i.allievo_id = p_allievo
  loop
    select coalesce(array_agg(io.orario_id), '{}') into v_orari from iscrizioni_orari io where io.iscrizione_id = r.id;

    with fisse as (       -- lezioni dei suoi giorni fissi nel periodo (già nel calendario)
      select l.id, l.inizio from lezioni l
       where l.orario_id = any (v_orari) and l.data between r.data_inizio and r.data_fine and l.stato <> 'annullata'
         and not exists (select 1 from sospensioni s where s.iscrizione_id = r.id and l.data between s.dal and s.al)
    ), pren as (          -- recuperi, lezioni in più e ingressi prenotati con questo abbonamento
      select l.id, l.inizio, p.tipo from prenotazioni p join lezioni l on l.id = p.lezione_id
       where p.iscrizione_id = r.id and p.stato = 'confermata' and l.stato <> 'annullata'
    )
    select jsonb_build_object(
      'fatte', (select count(*) from presenze pr where pr.allievo_id = p_allievo and pr.presente
                  and pr.lezione_id in (select id from fisse union select id from pren)),
      'assenze', (select count(*) from presenze pr where pr.allievo_id = p_allievo and not pr.presente
                  and pr.lezione_id in (select id from fisse union select id from pren)),
      'disdette', (select count(*) from assenze_avvisate x where x.allievo_id = p_allievo and x.lezione_id in (select id from fisse)),
      'prenotate', (select count(*) from pren where inizio > now()),
      'ingressi_prenotati', (select count(*) from pren where inizio > now() and tipo = 'ingresso')
    ) into v_lez;

    v := v || jsonb_build_object(r.id::text, v_lez || jsonb_build_object(
      'codice', r.codice, 'modalita', r.modalita, 'prezzo_cent', r.prezzo_cent, 'sconto_cent', coalesce(r.sconto_cent, 0),
      'durata_mesi', r.durata_mesi, 'durata_giorni', r.durata_giorni,
      'lezioni_settimanali', r.lezioni_settimanali, 'recuperi_max', r.recuperi_max,
      'corsi', coalesce((select jsonb_agg(c.nome order by lower(c.nome)) from tipi_abbonamento_corsi tc join corsi c on c.id = tc.corso_id
                          where tc.tipo_abbonamento_id = r.tipo_abbonamento_id), '[]'::jsonb),
      -- giorni fissi: quante lezioni nel periodo e quante ne mancano da oggi (chiusure escluse), meno quelle disdette
      'totali', case when r.modalita = 'orari_fissi' then conta_lezioni(v_orari, r.data_inizio, r.data_fine)
                     when r.modalita = 'ingressi' then r.num_ingressi end,
      'da_fare', case when r.modalita = 'orari_fissi' and r.data_fine >= v_oggi
                      then greatest(conta_lezioni(v_orari, greatest(v_oggi, r.data_inizio), r.data_fine)
                             - (select count(*) from assenze_avvisate x join lezioni l on l.id = x.lezione_id
                                 where x.allievo_id = p_allievo and l.orario_id = any (v_orari) and l.data >= v_oggi and l.data <= r.data_fine), 0)
                      else 0 end,
      'ingressi_restanti', case when r.modalita = 'ingressi' then r.ingressi_residui end,
      'extra_disponibili', (select count(*) from crediti_recupero cr where cr.iscrizione_id = r.id and cr.lezione_persa_id is null
                              and cr.usato_in is null and not cr.annullato and cr.scadenza >= v_oggi),
      'extra_usate', (select count(*) from crediti_recupero cr where cr.iscrizione_id = r.id and cr.lezione_persa_id is null and cr.usato_in is not null),
      'recuperi_disponibili', (select count(*) from crediti_recupero cr where cr.iscrizione_id = r.id and cr.lezione_persa_id is not null
                              and cr.usato_in is null and not cr.annullato and cr.scadenza >= v_oggi),
      'recuperi_usati', (select count(*) from crediti_recupero cr where cr.iscrizione_id = r.id and cr.lezione_persa_id is not null and cr.usato_in is not null),
      'sospensioni', coalesce((select jsonb_agg(jsonb_build_object('dal', s.dal, 'al', s.al, 'motivo', s.motivo) order by s.dal)
                                 from sospensioni s where s.iscrizione_id = r.id), '[]'::jsonb)));
  end loop;
  return v;
end $$;
revoke all on function riepilogo_iscrizioni(uuid) from public, anon;
grant execute on function riepilogo_iscrizioni(uuid) to authenticated;

do $$
declare v_def text; v_nuova text;
begin
  -- correzione a mano degli ingressi restanti di un carnet
  select pg_get_functiondef('modifica_iscrizione'::regproc) into v_def;
  if position('p ? ''ingressi_residui''' in v_def) > 0 then
    raise notice 'modifica_iscrizione: già aggiornata';
  else
    v_nuova := replace(v_def, 'ingressi_residui = case',
      'ingressi_residui = case
      when t.modalita = ''ingressi'' and p ? ''ingressi_residui'' and nullif(p->>''ingressi_residui'', '''') is not null
        then greatest((p->>''ingressi_residui'')::int, 0)');
    if v_nuova <> v_def then execute v_nuova; raise notice 'modifica_iscrizione: aggiornata';
    else raise warning 'modifica_iscrizione: testo atteso non trovato, NON aggiornata'; end if;
  end if;

  -- lezioni in più anche su un abbonamento finito (giorni fissi): basta che valgano da oggi in poi
  select pg_get_functiondef('aggiungi_lezioni'::regproc) into v_def;
  if position('''attiva'', ''sospesa'', ''scaduta''' in v_def) > 0 then
    raise notice 'aggiungi_lezioni: già aggiornata';
  else
    v_nuova := replace(v_def, 'if i.stato not in (''attiva'', ''sospesa'') then', 'if i.stato::text not in (''attiva'', ''sospesa'', ''scaduta'') then');
    v_nuova := replace(v_nuova, 'if v_modo = ''ingressi'' then
    update', 'if v_modo = ''ingressi'' then
    if i.data_fine < current_date then raise exception ''carnet_scaduto''; end if;
    update');
    if v_nuova <> v_def then execute v_nuova; raise notice 'aggiungi_lezioni: aggiornata';
    else raise warning 'aggiungi_lezioni: testo atteso non trovato, NON aggiornata'; end if;
  end if;
end $$;
