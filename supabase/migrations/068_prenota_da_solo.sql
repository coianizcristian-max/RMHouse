-- =====================================================================
-- RMHouse — 068 IL CLIENTE PRENOTA DA SOLO
--  1. Con un pacchetto a ingressi o un abbonamento ad accesso libero,
--     il cliente vede le lezioni dei suoi corsi e le prenota dall'app
--     (gli ingressi si scalano come sempre quando viene segnata la presenza;
--      non si può prenotare più lezioni degli ingressi rimasti)
--  2. "Cancella prenotazione": una funzione sola per ogni tipo
--     (giorni fissi, recupero, ingresso), entro le ore di preavviso
-- Si può eseguire più volte. Va dopo la 065.
-- =====================================================================

-- Gli abbonamenti a ingressi / liberi validi di una persona, con quanti posti può ancora prenotare
create or replace function abbonamenti_prenotabili(p_allievo uuid)
returns table (iscrizione_id uuid, nome text, modalita text, data_fine date, restano int, prenotate int)
language sql stable security definer set search_path = public as $$
  select i.id, t.nome, t.modalita::text, i.data_fine,
         case when t.modalita = 'ingressi' then coalesce(i.ingressi_residui, 0) end,
         (select count(*)::int from prenotazioni p join lezioni l on l.id = p.lezione_id
           where p.iscrizione_id = i.id and p.tipo = 'ingresso' and p.stato = 'confermata' and l.inizio > now()
             and not exists (select 1 from presenze pr where pr.lezione_id = l.id and pr.allievo_id = p.allievo_id))
    from iscrizioni i join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
   where i.allievo_id = p_allievo and i.stato = 'attiva' and i.data_fine >= current_date
     and t.modalita in ('ingressi', 'libero')
     and (auth.uid() is null or is_staff(i.palestra_id)
          or exists (select 1 from allievi a where a.id = p_allievo and a.account_id in (select miei_account())));
$$;

-- Le lezioni che può prenotare con quegli abbonamenti
create or replace function lezioni_prenotabili(p_allievo uuid)
returns table (lezione_id uuid, iscrizione_id uuid, corso text, colore text, inizio timestamptz, sala text, insegnante text, liberi int)
language plpgsql stable security definer set search_path = public as $$
declare a allievi; v_giorni int;
begin
  select * into a from allievi where id = p_allievo;
  if not found then return; end if;
  if auth.uid() is not null and not is_staff(a.palestra_id)
     and not (a.account_id in (select miei_account())) then raise exception 'non_autorizzato'; end if;
  select coalesce(giorni_prenotabili, 21) into v_giorni from palestre where id = a.palestra_id;

  return query
    select distinct on (l.inizio, l.id) l.id, ab.iscrizione_id, co.nome, co.colore, l.inizio, s.nome, st.nome,
           greatest(coalesce(l.capienza_override, co.capienza, s.capienza)
                    - (select count(*)::int from v_partecipanti_lezione vp where vp.lezione_id = l.id), 0)
      from abbonamenti_prenotabili(p_allievo) ab
      join iscrizioni i on i.id = ab.iscrizione_id
      join lezioni l on l.palestra_id = a.palestra_id
      join corsi co on co.id = l.corso_id
      left join sale s on s.id = l.sala_id
      left join staff st on st.id = l.insegnante_id
     where (ab.modalita = 'libero' or ab.restano - ab.prenotate > 0)
       and l.stato = 'programmata' and l.prenotabile and l.inizio > now()
       and l.data between i.data_inizio and i.data_fine
       and l.data <= current_date + v_giorni
       and (l.corso_id = i.corso_id
            or exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = i.tipo_abbonamento_id and tc.corso_id = l.corso_id)
            or not exists (select 1 from tipi_abbonamento_corsi tc where tc.tipo_abbonamento_id = i.tipo_abbonamento_id))
       and not exists (select 1 from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.allievo_id = p_allievo)
     order by l.inizio, l.id, ab.data_fine
     limit 80;
end $$;

-- Prenota una lezione con un pacchetto a ingressi / accesso libero
create or replace function prenota_lezione(p_lezione uuid, p_allievo uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; l lezioni; r record; v_cap int; v_pren uuid;
begin
  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  if not is_staff(a.palestra_id) and not (a.account_id in (select miei_account())) then raise exception 'non_autorizzato'; end if;

  select * into r from lezioni_prenotabili(p_allievo) x where x.lezione_id = p_lezione limit 1;
  if r.lezione_id is null then raise exception 'lezione_non_disponibile'; end if;
  select * into l from lezioni where id = p_lezione for update;
  if not certificato_valido(p_allievo, l.data) then raise exception 'certificato_scaduto'; end if;
  select coalesce(l.capienza_override, co.capienza, s.capienza) into v_cap
    from corsi co left join sale s on s.id = l.sala_id where co.id = l.corso_id;
  if v_cap is not null and (select count(*) from v_partecipanti_lezione where lezione_id = l.id) >= v_cap then
    raise exception 'lezione_al_completo';
  end if;

  insert into prenotazioni (palestra_id, lezione_id, allievo_id, iscrizione_id, tipo, origine)
  values (l.palestra_id, l.id, p_allievo, r.iscrizione_id, 'ingresso', case when is_staff(l.palestra_id) then 'segreteria' else 'cliente' end)
  on conflict (lezione_id, allievo_id) do update set stato = 'confermata', tipo = 'ingresso',
    iscrizione_id = excluded.iscrizione_id, origine = excluded.origine
  returning id into v_pren;
  return v_pren;
end $$;

-- "Cancella prenotazione" per una prenotazione (recupero o ingresso)
create or replace function cancella_prenotazione(p_prenotazione uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p prenotazioni; l lezioni; v_ore int;
begin
  select * into p from prenotazioni where id = p_prenotazione;
  if not found or p.stato <> 'confermata' then raise exception 'prenotazione_non_trovata'; end if;
  if p.tipo = 'recupero' then
    perform annulla_recupero(p_prenotazione);      -- controlla le ore e restituisce il recupero
    return 'recupero';
  end if;
  if not is_gestione(p.palestra_id) then
    if not exists (select 1 from allievi a where a.id = p.allievo_id and a.account_id in (select miei_account())) then
      raise exception 'non_autorizzato';
    end if;
    select * into l from lezioni where id = p.lezione_id;
    select ore_disdetta into v_ore from palestre where id = p.palestra_id;
    if l.inizio - make_interval(hours => coalesce(v_ore, 0)) < now() then raise exception 'troppo_tardi'; end if;
  end if;
  update prenotazioni set stato = 'annullata' where id = p_prenotazione;
  begin perform avvisa_lista_attesa(p.lezione_id); exception when others then null; end;
  return 'ingresso';
end $$;

grant execute on function abbonamenti_prenotabili(uuid) to authenticated;
grant execute on function lezioni_prenotabili(uuid) to authenticated;
grant execute on function prenota_lezione(uuid, uuid) to authenticated;
grant execute on function cancella_prenotazione(uuid) to authenticated;

-- Nelle prossime lezioni dell'area serve l'id anche delle prenotazioni a ingresso (per cancellarle)
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('area_riepilogo()'::regprocedure);
  if v_def ilike '%when vp.tipo = ''recupero'' then vp.riferimento_id end%' then
    v_def := replace(v_def, $a$case when vp.tipo = 'recupero' then vp.riferimento_id end$a$,
                            $a$case when vp.tipo in ('recupero', 'ingresso') then vp.riferimento_id end$a$);
    execute v_def;
  end if;
end $$;
