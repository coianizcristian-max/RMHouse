-- =====================================================================
-- RMHouse — 065 RECUPERI NEI CORSI APERTI A TUTTI
-- Un corso "aperto a tutti per i recuperi" (es. Flexy) si può usare per
-- recuperare anche se nel palinsesto le sue lezioni non sono prenotabili
-- dal sito. Per gli altri corsi non cambia nulla.
-- Si può eseguire più volte. Va dopo la 055 (e dopo la 052).
-- =====================================================================

create or replace function prenota_recupero_base(p_credito uuid, p_lezione uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c crediti_recupero; l lezioni; v_cap int; v_pren uuid; v_mio boolean;
begin
  select * into c from crediti_recupero where id = p_credito for update;
  if not found or c.annullato or c.usato_in is not null then raise exception 'credito_non_valido'; end if;

  select exists (select 1 from allievi a where a.id = c.allievo_id and a.account_id in (select miei_account()))
    into v_mio;
  if auth.uid() is not null and not is_staff(c.palestra_id) and not v_mio then
    raise exception 'non_autorizzato';
  end if;

  -- nei corsi aperti a tutti per i recuperi si recupera anche se la lezione non è prenotabile dal sito
  select l2.* into l from lezioni l2
   where l2.id = p_lezione and l2.stato = 'programmata' and l2.inizio > now()
     and (l2.prenotabile or exists (select 1 from corsi x where x.id = l2.corso_id and x.recupero_per_tutti))
   for update of l2;
  if not found then raise exception 'lezione_non_disponibile'; end if;
  if l.data > c.scadenza then raise exception 'credito_scaduto'; end if;
  if not exists (select 1 from corsi_recupero(c.iscrizione_id) cr where cr.corso_id = l.corso_id) then
    raise exception 'corso_non_ammesso_per_recupero';
  end if;
  if not certificato_valido(c.allievo_id, l.data) then raise exception 'certificato_scaduto'; end if;

  select coalesce(l.capienza_override, co.capienza, s.capienza) into v_cap
    from corsi co left join sale s on s.id = l.sala_id where co.id = l.corso_id;
  if v_cap is not null and (select count(*) from v_partecipanti_lezione where lezione_id = l.id) >= v_cap then
    raise exception 'lezione_al_completo';
  end if;

  insert into prenotazioni (palestra_id, lezione_id, allievo_id, iscrizione_id, tipo, origine)
  values (l.palestra_id, l.id, c.allievo_id, c.iscrizione_id, 'recupero', 'cliente')
  returning id into v_pren;
  update crediti_recupero set usato_in = v_pren where id = c.id;
  return v_pren;
end $$;
revoke all on function prenota_recupero_base(uuid, uuid) from public, anon, authenticated;

create or replace function lezioni_per_recupero(p_credito uuid)
returns table (lezione_id uuid, corso text, inizio timestamptz, sala text, insegnante text, liberi int)
language plpgsql stable security definer set search_path = public as $$
declare c crediti_recupero; v_mio boolean;
begin
  select * into c from crediti_recupero where id = p_credito;
  if not found then raise exception 'credito_non_valido'; end if;
  select exists (select 1 from allievi a where a.id = c.allievo_id and a.account_id in (select miei_account()))
    into v_mio;
  if auth.uid() is not null and not is_staff(c.palestra_id) and not v_mio then raise exception 'non_autorizzato'; end if;

  return query
    select l.id, co.nome, l.inizio, s.nome, st.nome,
           greatest(coalesce(l.capienza_override, co.capienza, s.capienza)
                    - (select count(*)::int from v_partecipanti_lezione vp where vp.lezione_id = l.id), 0)
    from lezioni l
    join corsi co on co.id = l.corso_id
    left join sale s on s.id = l.sala_id
    left join staff st on st.id = l.insegnante_id
    where l.palestra_id = c.palestra_id
      and l.stato = 'programmata' and (l.prenotabile or co.recupero_per_tutti)
      and l.inizio > now() and l.data <= c.scadenza
      and l.corso_id in (select cr.corso_id from corsi_recupero(c.iscrizione_id) cr)
      and not exists (select 1 from v_partecipanti_lezione vp
                       where vp.lezione_id = l.id and vp.allievo_id = c.allievo_id)
    order by l.inizio
    limit 40;
end $$;
grant execute on function lezioni_per_recupero(uuid) to authenticated;
