-- =====================================================================
-- RMHouse — 115 TRE REGOLE DECISE DALLA DIREZIONE (dopo il test di stagione)
-- 1. I cedolini degli insegnanti li approva, li paga e li ritocca (extra) solo l'amministrazione.
--    La segreteria li calcola e li controlla, ma non li chiude.
-- 2. La sospensione non sposta la scadenza dell'abbonamento (mai, né mensili né annuali): la persona
--    non compare nelle lezioni in quei giorni e la segreteria riceve un promemoria per decidere
--    (sconto sul rinnovo o recuperi). Le date devono stare almeno in parte dentro l'abbonamento.
-- 3. I recuperi: un recupero maturato a fine mese si può fare nel mese seguente (vale almeno fino alla
--    fine del mese dopo la lezione persa), ma nessun recupero sopravvive alla stagione: scade al più
--    tardi il giorno prima dell'inizio della stagione nuova (mese di inizio stagione nelle impostazioni).
-- Si può eseguire più volte. Va dopo la 114.
-- =====================================================================

-- ─── 1. compensi: approvazione, pagamento ed extra solo all'amministrazione ──────────────────────
do $$
declare v text; v0 text; f text;
begin
  foreach f in array array['approva_compensi(uuid, integer, integer)', 'paga_compenso(uuid, text, date)', 'aggiorna_compenso(uuid, integer, text, numeric, text)'] loop
    v := pg_get_functiondef(f::regprocedure); v0 := v;
    v := replace(v, 'if not is_gestione(c.palestra_id) then raise exception ''non_autorizzato''; end if;', 'if not is_admin(c.palestra_id) then raise exception ''solo_amministrazione''; end if;');
    v := replace(v, 'if not is_gestione(p_palestra) then raise exception ''non_autorizzato''; end if;', 'if not is_admin(p_palestra) then raise exception ''solo_amministrazione''; end if;');
    if v <> v0 then execute v; end if;
  end loop;
end $$;

-- ─── 2. sospensioni: la scadenza non si muove ───────────────────────────────────────────────────
create or replace function trg_sospensioni()
returns trigger language plpgsql security definer set search_path = public as $$
declare i iscrizioni; v_giorni int; v_nome text;
begin
  select * into i from iscrizioni where id = new.iscrizione_id for update;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  v_giorni := least(new.al, i.data_fine) - greatest(new.dal, i.data_inizio) + 1;
  if v_giorni <= 0 then raise exception 'sospensione_fuori_periodo'; end if;
  select trim(nome || ' ' || coalesce(cognome, '')) into v_nome from allievi where id = i.allievo_id;
  insert into promemoria (palestra_id, data, testo, creato_da)
  values (i.palestra_id, current_date,
          'Sospensione di ' || coalesce(v_nome, '?') || ' dal ' || to_char(new.dal, 'DD/MM') || ' al ' || to_char(new.al, 'DD/MM')
          || coalesce(' (' || new.motivo || ')', '') || ': ' || v_giorni || ' giorni dentro l''abbonamento. La scadenza resta il '
          || to_char(i.data_fine, 'DD/MM/YYYY') || ': se serve, sconto sul rinnovo o recuperi.',
          'Sistema');
  return new;
end $$;

-- ─── 3. recuperi: fino alla fine del mese dopo, mai oltre la stagione ───────────────────────────
-- l'ultimo giorno della stagione in cui cade una data (il giorno prima del mese di inizio stagione)
create or replace function fine_stagione(p_palestra uuid, p_data date)
returns date language sql stable set search_path = public as $$
  select case when extract(month from p_data) >= p.mese_inizio_stagione
              then make_date(extract(year from p_data)::int + 1, p.mese_inizio_stagione, 1) - 1
              else make_date(extract(year from p_data)::int, p.mese_inizio_stagione, 1) - 1 end
    from palestre p where p.id = p_palestra;
$$;

-- la scadenza di un recupero secondo le regole: almeno fine del mese dopo la lezione persa, mai oltre la stagione
create or replace function scadenza_recupero_regola(p_palestra uuid, p_lezione_persa uuid, p_scadenza date)
returns date language plpgsql stable set search_path = public as $$
declare v_data date;
begin
  select data into v_data from lezioni where id = p_lezione_persa;
  if v_data is null then return p_scadenza; end if;
  return least(greatest(p_scadenza, (date_trunc('month', v_data) + interval '2 months')::date - 1), fine_stagione(p_palestra, v_data));
end $$;

create or replace function trg_crediti_scadenza()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fine date;
begin
  if (select scadenza_recupero from palestre where id = new.palestra_id) = 'abbonamento' then
    select data_fine into v_fine from iscrizioni where id = new.iscrizione_id;
    if v_fine is not null then new.scadenza := v_fine; end if;
  end if;
  new.scadenza := scadenza_recupero_regola(new.palestra_id, new.lezione_persa_id, new.scadenza);
  return new;
end $$;

create or replace function trg_iscrizioni_fine_crediti()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.data_fine is distinct from old.data_fine
     and (select scadenza_recupero from palestre where id = new.palestra_id) = 'abbonamento' then
    update crediti_recupero set scadenza = scadenza_recupero_regola(palestra_id, lezione_persa_id, new.data_fine)
     where iscrizione_id = new.id and usato_in is null and not annullato;
  end if;
  return new;
end $$;

create or replace function trg_iscrizioni_rinnovo_crediti()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato <> 'attiva' or (select scadenza_recupero from palestre where id = new.palestra_id) <> 'abbonamento' then
    return new;
  end if;
  update crediti_recupero cr set iscrizione_id = new.id, scadenza = scadenza_recupero_regola(cr.palestra_id, cr.lezione_persa_id, new.data_fine)
    from iscrizioni vecchia
   where cr.iscrizione_id = vecchia.id
     and vecchia.id <> new.id and vecchia.allievo_id = new.allievo_id
     and (vecchia.id = new.rinnovo_di or vecchia.corso_id = new.corso_id)
     and vecchia.data_fine >= new.data_inizio - 15
     and vecchia.data_fine <= new.data_fine
     and cr.usato_in is null and not cr.annullato
     and not exists (select 1 from crediti_recupero x where x.iscrizione_id = new.id and x.lezione_persa_id = cr.lezione_persa_id);
  return new;
end $$;

-- i recuperi aperti di oggi seguono la regola nuova (si allungano fino a fine mese dopo, si fermano a fine stagione)
update crediti_recupero cr set scadenza = scadenza_recupero_regola(cr.palestra_id, cr.lezione_persa_id, cr.scadenza)
 where cr.usato_in is null and not cr.annullato and cr.lezione_persa_id is not null
   and cr.scadenza <> scadenza_recupero_regola(cr.palestra_id, cr.lezione_persa_id, cr.scadenza);
