-- =====================================================================
-- RMHouse — 014 AREA DEL CLIENTE
-- Chi frequenta entra con la sua email e trova le proprie lezioni,
-- l'abbonamento, il certificato e i recuperi da prenotare.
-- Da eseguire dopo 001…013.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PRIMO ACCESSO: collega l'utente all'anagrafica già esistente
--    L'email con cui entra deve essere quella registrata in segreteria.
-- ---------------------------------------------------------------------
create or replace function collega_account()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_email text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'non_autenticato'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then raise exception 'email_mancante'; end if;

  -- se è già collegato non si tocca nulla
  select id into v_id from account where user_id = auth.uid() limit 1;
  if v_id is not null then return v_id; end if;

  update account set user_id = auth.uid()
   where lower(email) = v_email and user_id is null
  returning id into v_id;

  return v_id;   -- null se quell'email non è registrata in segreteria
end $$;

grant execute on function collega_account() to authenticated;

-- ---------------------------------------------------------------------
-- 2. COSA PUÒ LEGGERE IL CLIENTE
-- ---------------------------------------------------------------------
-- Il calendario delle lezioni della propria scuola (è già pubblico sul sito)
drop policy if exists cliente_legge on lezioni;
create policy cliente_legge on lezioni for select to authenticated
  using (palestra_id in (select palestra_id from account where user_id = auth.uid()));

-- Le proprie attese
drop policy if exists cliente_legge on liste_attesa;
create policy cliente_legge on liste_attesa for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));

-- Il proprio posto in coda lo può anche togliere
drop policy if exists cliente_annulla on liste_attesa;
create policy cliente_annulla on liste_attesa for update to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())))
  with check (allievo_id in (select id from allievi where account_id in (select miei_account())));

-- Gli orari e i corsi servono per capire cosa c'è in programma
drop policy if exists cliente_legge on orari;
create policy cliente_legge on orari for select to authenticated using (attivo);

-- ---------------------------------------------------------------------
-- 3. RECUPERI PRENOTATI DAL CLIENTE
--    Vale la stessa regola della segreteria, più il controllo che il
--    credito sia davvero suo.
-- ---------------------------------------------------------------------
create or replace function prenota_recupero(p_credito uuid, p_lezione uuid)
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

  select * into l from lezioni
   where id = p_lezione and stato = 'programmata' and inizio > now() and prenotabile
   for update;
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

grant execute on function prenota_recupero(uuid, uuid) to authenticated;

-- Disdire un recupero: il credito torna disponibile
create or replace function annulla_recupero(p_prenotazione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p prenotazioni; l lezioni; v_mio boolean;
begin
  select * into p from prenotazioni where id = p_prenotazione;
  if not found or p.stato <> 'confermata' then raise exception 'prenotazione_non_valida'; end if;
  select * into l from lezioni where id = p.lezione_id;

  select exists (select 1 from allievi a where a.id = p.allievo_id and a.account_id in (select miei_account()))
    into v_mio;
  if auth.uid() is not null and not is_staff(p.palestra_id) and not v_mio then
    raise exception 'non_autorizzato';
  end if;
  if l.inizio < now() then raise exception 'lezione_gia_passata'; end if;

  update prenotazioni set stato = 'annullata' where id = p_prenotazione;
  update crediti_recupero set usato_in = null where usato_in = p_prenotazione;
  perform avvisa_lista_attesa(p.lezione_id);
end $$;

grant execute on function annulla_recupero(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. COSA VEDE IL CLIENTE QUANDO ENTRA
-- ---------------------------------------------------------------------
create or replace function area_riepilogo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acc uuid; v_pal uuid; r jsonb;
begin
  select id, palestra_id into v_acc, v_pal from account where user_id = auth.uid() limit 1;
  if v_acc is null then return jsonb_build_object('collegato', false); end if;

  select jsonb_build_object(
    'collegato', true,
    'titolare', (select jsonb_build_object('nome', nome, 'cognome', cognome, 'email', email, 'telefono', telefono)
                   from account where id = v_acc),
    'allievi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'foto', a.foto_url,
        'certificato_scadenza', a.certificato_scadenza,
        'certificato_ok', certificato_valido(a.id),
        'token', a.token,
        'iscrizioni', (select jsonb_agg(jsonb_build_object(
                          'corso', c.nome, 'colore', c.colore, 'dal', i.data_inizio, 'al', i.data_fine,
                          'stato', i.stato) order by i.data_fine desc)
                         from iscrizioni i join corsi c on c.id = i.corso_id
                        where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa'))
      ) order by a.nome)
      from allievi a where a.account_id = v_acc), '[]'::jsonb),
    'prossime', coalesce((
      select jsonb_agg(x order by x->>'inizio')
      from (
        select jsonb_build_object(
          'lezione_id', l.id, 'allievo', a.nome, 'allievo_id', a.id,
          'corso', c.nome, 'colore', c.colore, 'inizio', l.inizio, 'fine', l.fine,
          'sala', s.nome, 'insegnante', st.nome, 'tipo', vp.tipo, 'stato_lezione', l.stato,
          'prenotazione_id', case when vp.tipo = 'recupero' then vp.riferimento_id end) as x
        from v_partecipanti_lezione vp
        join allievi a on a.id = vp.allievo_id
        join lezioni l on l.id = vp.lezione_id
        join corsi c on c.id = l.corso_id
        left join sale s on s.id = l.sala_id
        left join staff st on st.id = l.insegnante_id
        where a.account_id = v_acc and l.inizio > now() and l.inizio < now() + interval '21 days'
        order by l.inizio limit 20) t), '[]'::jsonb),
    'crediti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cr.id, 'allievo', a.nome, 'allievo_id', a.id, 'corso', c.nome,
        'scadenza', cr.scadenza, 'iscrizione_id', cr.iscrizione_id) order by cr.scadenza)
      from crediti_recupero cr
      join allievi a on a.id = cr.allievo_id
      join iscrizioni i on i.id = cr.iscrizione_id
      join corsi c on c.id = i.corso_id
      where a.account_id = v_acc and not cr.annullato and cr.usato_in is null
        and cr.scadenza >= current_date), '[]'::jsonb),
    'prove', coalesce((
      select jsonb_agg(jsonb_build_object(
        'corso', c.nome, 'inizio', l.inizio, 'stato', pr.stato, 'allievo', a.nome) order by l.inizio)
      from prove pr
      join allievi a on a.id = pr.allievo_id
      join corsi c on c.id = pr.corso_id
      join lezioni l on l.id = pr.lezione_id
      where a.account_id = v_acc and pr.stato in ('in_attesa_pagamento', 'confermata') and l.inizio > now()), '[]'::jsonb),
    'attese', coalesce((
      select jsonb_agg(jsonb_build_object('id', la.id, 'corso', c.nome, 'allievo', a.nome) order by la.created_at)
      from liste_attesa la
      join allievi a on a.id = la.allievo_id
      join corsi c on c.id = la.corso_id
      where a.account_id = v_acc and la.stato = 'in_attesa'), '[]'::jsonb),
    'avvisi', coalesce((
      select jsonb_agg(jsonb_build_object('titolo', b.titolo, 'testo', b.testo, 'immagine', b.immagine_url,
                                          'quando', b.created_at) order by b.created_at desc)
      from bacheca b
      where b.palestra_id = v_pal and b.visibilita in ('pubblico', 'privato')
        and (b.dal is null or b.dal <= now()) and (b.al is null or b.al >= now())
      limit 5), '[]'::jsonb),
    'eventi', coalesce((
      select jsonb_agg(jsonb_build_object('titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo,
                                          'locandina', e.locandina_url, 'prenotabile', e.prenotabile) order by e.inizio)
      from eventi e
      where e.palestra_id = v_pal and e.visibilita in ('pubblico', 'privato') and e.inizio > now()
      limit 3), '[]'::jsonb)
  ) into r;
  return r;
end $$;

grant execute on function area_riepilogo() to authenticated;

-- Le lezioni su cui si può usare un credito di recupero
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
      and l.stato = 'programmata' and l.prenotabile
      and l.inizio > now() and l.data <= c.scadenza
      and l.corso_id in (select cr.corso_id from corsi_recupero(c.iscrizione_id) cr)
      and not exists (select 1 from v_partecipanti_lezione vp
                       where vp.lezione_id = l.id and vp.allievo_id = c.allievo_id)
    order by l.inizio
    limit 40;
end $$;

grant execute on function lezioni_per_recupero(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. CERTIFICATO CARICATO DALL'AREA (senza bisogno del link via email)
-- ---------------------------------------------------------------------
create or replace function registra_certificato_mio(p_allievo uuid, p_file text, p_nome_file text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; v_id uuid;
begin
  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  if a.account_id not in (select miei_account()) then raise exception 'non_autorizzato'; end if;

  insert into certificati (palestra_id, allievo_id, file_path, nome_file, stato)
  values (a.palestra_id, a.id, p_file, p_nome_file, 'da_verificare')
  returning id into v_id;
  return v_id;
end $$;

grant execute on function registra_certificato_mio(uuid, text, text) to authenticated;
