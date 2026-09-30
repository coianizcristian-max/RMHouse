-- =====================================================================
-- RMHouse — 049 "HA AVVISATO" DALL'APPELLO
-- La segreteria segna chi ha avvisato anche a lezione iniziata
-- (finché la lezione non è finita). Il cliente resta a N ore prima.
-- Chi è già segnato presente non si può segnare come "ha avvisato".
-- Si può eseguire più volte. Va dopo la 048.
-- =====================================================================

-- "Non vengo": dal cliente fino a N ore prima, dalla segreteria sempre (prima della lezione)
create or replace function disdici_lezione(p_lezione uuid, p_allievo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l lezioni; v_pal palestre; v_isc uuid; t tipi_abbonamento; v_gest boolean; v_usati int;
        v_credito uuid; v_scad date;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  select * into v_pal from palestre where id = l.palestra_id;
  v_gest := is_gestione(l.palestra_id);
  if not v_gest and not exists (select 1 from allievi a where a.id = p_allievo
                                  and a.account_id in (select miei_account())) then
    raise exception 'non_autorizzato';
  end if;
  if l.stato <> 'programmata' then raise exception 'lezione_annullata'; end if;
  -- il cliente entro il preavviso; la segreteria anche a lezione iniziata, finché non è finita
  if not v_gest and l.inizio <= now() then raise exception 'lezione_gia_iniziata'; end if;
  if v_gest and l.fine <= now() then raise exception 'lezione_finita'; end if;
  if exists (select 1 from presenze where lezione_id = p_lezione and allievo_id = p_allievo and presente) then
    raise exception 'gia_presente';
  end if;
  if not v_gest and l.inizio - make_interval(hours => v_pal.ore_disdetta) < now() then
    raise exception 'troppo_tardi';
  end if;
  if exists (select 1 from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo) then
    raise exception 'gia_disdetta';
  end if;

  v_isc := iscrizione_della_lezione(p_lezione, p_allievo);
  if v_isc is null then raise exception 'non_iscritto_a_questa_lezione'; end if;

  -- il credito, se l'abbonamento prevede recuperi
  select ta.* into t from tipi_abbonamento ta join iscrizioni i on i.tipo_abbonamento_id = ta.id where i.id = v_isc;
  if coalesce(t.recuperi_max, 1) <> 0 then
    select count(*) into v_usati from crediti_recupero where iscrizione_id = v_isc and not annullato;
    if t.recuperi_max is null or v_usati < t.recuperi_max then
      v_scad := l.data + coalesce(t.giorni_validita_recupero, 30);
      insert into crediti_recupero (palestra_id, iscrizione_id, allievo_id, lezione_persa_id, scadenza)
      values (l.palestra_id, v_isc, p_allievo, p_lezione, v_scad)
      on conflict (iscrizione_id, lezione_persa_id) do update set annullato = false
      returning id into v_credito;
    end if;
  end if;

  insert into assenze_avvisate (palestra_id, lezione_id, allievo_id, iscrizione_id, credito_id, da)
  values (l.palestra_id, p_lezione, p_allievo, v_isc, v_credito, case when v_gest then 'segreteria' else 'cliente' end);

  -- il posto liberato va a chi è in lista d'attesa
  begin perform avvisa_lista_attesa(p_lezione); exception when others then null; end;

  return jsonb_build_object('credito', v_credito is not null, 'scadenza', v_scad);
end $$;

-- "Ci vengo lo stesso": annulla la disdetta, se il recupero non è già stato usato
create or replace function ripristina_lezione(p_lezione uuid, p_allievo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare x assenze_avvisate; l lezioni; v_gest boolean; v_cap int;
begin
  select * into x from assenze_avvisate where lezione_id = p_lezione and allievo_id = p_allievo;
  if not found then raise exception 'disdetta_non_trovata'; end if;
  select * into l from lezioni where id = p_lezione;
  v_gest := is_gestione(x.palestra_id);
  if not v_gest and not exists (select 1 from allievi a where a.id = p_allievo
                                  and a.account_id in (select miei_account())) then
    raise exception 'non_autorizzato';
  end if;
  if not v_gest and l.inizio <= now() then raise exception 'lezione_gia_iniziata'; end if;
  if v_gest and l.fine <= now() then raise exception 'lezione_finita'; end if;
  if x.credito_id is not null and exists (select 1 from crediti_recupero where id = x.credito_id and usato_in is not null) then
    raise exception 'credito_gia_usato';
  end if;
  if not v_gest then
    select coalesce(l.capienza_override, co.capienza, s.capienza) into v_cap
      from corsi co left join sale s on s.id = l.sala_id where co.id = l.corso_id;
    if v_cap is not null and (select count(*) from v_partecipanti_lezione where lezione_id = p_lezione) >= v_cap then
      raise exception 'lezione_al_completo';
    end if;
  end if;
  delete from assenze_avvisate where id = x.id;
  if x.credito_id is not null then delete from crediti_recupero where id = x.credito_id; end if;
end $$;

grant execute on function disdici_lezione(uuid, uuid) to authenticated;
grant execute on function ripristina_lezione(uuid, uuid) to authenticated;
