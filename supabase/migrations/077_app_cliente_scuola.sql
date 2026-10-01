-- =====================================================================
-- RMHouse — 077 APP DEL CLIENTE: LA SCUOLA, SEDI NELL'ORARIO, I MIEI DATI
--  1. scuola_area(): tutto quello che serve alla pagina "La scuola"
--     (contatti, orari, social, sedi, staff, corsi, eventi, avvisi,
--      regolamento, responsabile safeguarding)
--  2. orario_area con la sede e il motivo per cui una lezione non è prenotabile
--  3. aggiorna_miei_dati(): il cliente corregge da solo i propri dati
--     (e quelli dei figli): telefono, indirizzo, codice fiscale, nascita…
-- Si può eseguire più volte. Va dopo la 076.
-- =====================================================================

create or replace function scuola_area()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pal uuid;
begin
  select palestra_id into v_pal from account where user_id = auth.uid() limit 1;
  if v_pal is null then return null; end if;
  return (
    select jsonb_build_object(
      'nome', p.nome, 'indirizzo', p.indirizzo, 'telefono', p.telefono, 'email', p.email,
      'sito', p.base_url, 'recensione', p.google_review_url,
      'info', coalesce(p.area_cliente, '{}'::jsonb),
      'sedi', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', s.id, 'nome', s.nome, 'indirizzo', concat_ws(', ', nullif(trim(concat_ws(' ', s.via, s.civico)), ''), s.cap, s.citta),
                  'telefono', s.telefono, 'email', s.email, 'sito', s.sito_web, 'instagram', s.instagram, 'facebook', s.facebook,
                  'logo', s.logo_url, 'principale', s.principale) order by s.principale desc, s.ordine, s.nome)
                 from sedi s where s.palestra_id = v_pal and s.visibile), '[]'::jsonb),
      'staff', coalesce((select jsonb_agg(jsonb_build_object(
                  'nome', trim(st.nome || ' ' || coalesce(st.cognome, '')), 'foto', st.foto_url,
                  'specialita', st.specialita, 'bio', st.bio) order by st.nome)
                 from staff st where st.palestra_id = v_pal and st.attivo and not coalesce(st.archiviato, false)
                   and coalesce(st.visibilita::text, 'pubblico') <> 'nascosto' and st.ruolo = 'insegnante'), '[]'::jsonb),
      'corsi', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', c.id, 'nome', c.nome, 'descrizione', c.descrizione, 'foto', c.foto_url, 'colore', c.colore,
                  'disciplina', d.nome) order by d.nome nulls last, c.nome)
                 from corsi c left join discipline d on d.id = c.disciplina_id
                where c.palestra_id = v_pal and c.attivo and coalesce(c.visibilita::text, 'pubblico') <> 'nascosto'), '[]'::jsonb),
      'eventi', coalesce((select jsonb_agg(jsonb_build_object(
                  'titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo, 'locandina', e.locandina_url) order by e.inizio)
                 from eventi e where e.palestra_id = v_pal and e.inizio > now()
                   and coalesce(e.visibilita::text, 'pubblico') <> 'nascosto'), '[]'::jsonb),
      'avvisi', coalesce((select jsonb_agg(jsonb_build_object(
                  'titolo', b.titolo, 'testo', b.testo, 'immagine', b.immagine_url, 'tipo', b.tipo, 'dal', b.dal) order by b.dal desc nulls last, b.created_at desc)
                 from bacheca b where b.palestra_id = v_pal and coalesce(b.visibilita::text, 'pubblico') <> 'nascosto'
                   and (b.dal is null or b.dal <= current_date) and (b.al is null or b.al >= current_date)), '[]'::jsonb),
      'regolamento', (select jsonb_build_object('titolo', m.titolo, 'testo', m.testo)
                        from moduli m where m.palestra_id = v_pal and m.attivo and m.titolo ilike '%regolament%'
                        order by m.ordine nulls last limit 1)
    )
    from palestre p where p.id = v_pal
  );
end $$;

-- L'orario con la sede (null = tutte) e se la lezione si può prenotare dall'app
drop function if exists orario_area(date);
create or replace function orario_area(p_giorno date, p_sede uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acc uuid; v_pal uuid;
begin
  select id, palestra_id into v_acc, v_pal from account where user_id = auth.uid() limit 1;
  if v_pal is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'lezione_id', l.id, 'inizio', l.inizio, 'fine', l.fine, 'stato', l.stato,
      'corso_id', c.id, 'corso', c.nome, 'colore', c.colore, 'disciplina', d.nome,
      'sala', s.nome, 'insegnante', st.nome, 'sede_id', coalesce(s.sede_id, c.sede_id),
      'capienza', coalesce(l.capienza_override, c.capienza, s.capienza),
      'occupati', (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id),
      'prenotabile', l.prenotabile and c.prenotabile,
      'per_tutti', c.recupero_per_tutti,
      'prova', c.prova_abilitata,
      'miei', coalesce((select jsonb_agg(jsonb_build_object('allievo_id', vp.allievo_id, 'tipo', vp.tipo))
                          from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id
                         where vp.lezione_id = l.id and a.account_id = v_acc), '[]'::jsonb)
    ) order by l.inizio, c.nome)
    from lezioni l
    join corsi c on c.id = l.corso_id
    left join discipline d on d.id = c.disciplina_id
    left join sale s on s.id = l.sala_id
    left join staff st on st.id = l.insegnante_id
    where l.palestra_id = v_pal and l.data = p_giorno
      and c.attivo and coalesce(c.visibilita::text, 'pubblico') <> 'nascosto'
      and (p_sede is null or coalesce(s.sede_id, c.sede_id) = p_sede)
  ), '[]'::jsonb);
end $$;

-- Il cliente corregge i suoi dati (e quelli dei figli). Solo questi campi.
create or replace function aggiorna_miei_dati(p_allievo uuid, p_dati jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a allievi; v_cf text;
begin
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  v_cf := upper(regexp_replace(coalesce(p_dati->>'codice_fiscale', ''), '\s', '', 'g'));
  if v_cf <> '' and v_cf !~ '^[A-Z0-9]{16}$' then raise exception 'codice_fiscale_non_valido'; end if;

  update allievi set
    codice_fiscale = coalesce(nullif(v_cf, ''), codice_fiscale),
    luogo_nascita  = coalesce(nullif(trim(p_dati->>'luogo_nascita'), ''), luogo_nascita),
    data_nascita   = coalesce(nullif(p_dati->>'data_nascita', '')::date, data_nascita),
    sesso          = coalesce(nullif(p_dati->>'sesso', ''), sesso),
    indirizzo      = coalesce(nullif(trim(p_dati->>'indirizzo'), ''), indirizzo)
  where id = p_allievo;

  -- recapiti e indirizzo di chi paga: solo sul titolare dell'account
  if a.is_titolare then
    update account set
      telefono  = coalesce(nullif(regexp_replace(coalesce(p_dati->>'telefono', ''), '[^0-9+]', '', 'g'), ''), telefono),
      indirizzo = coalesce(nullif(trim(p_dati->>'indirizzo'), ''), indirizzo),
      cap       = coalesce(nullif(trim(p_dati->>'cap'), ''), cap),
      citta     = coalesce(nullif(trim(p_dati->>'citta'), ''), citta),
      provincia = coalesce(nullif(upper(trim(p_dati->>'provincia')), ''), provincia),
      codice_fiscale = case when v_cf <> '' then v_cf else codice_fiscale end
    where id = a.account_id;
  end if;
end $$;

-- Nel profilo servono anche i dati da correggere
create or replace function miei_dati_anagrafici()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'titolare', a.is_titolare,
    'codice_fiscale', a.codice_fiscale, 'luogo_nascita', a.luogo_nascita, 'data_nascita', a.data_nascita,
    'sesso', a.sesso, 'indirizzo', coalesce(a.indirizzo, ac.indirizzo),
    'telefono', ac.telefono, 'cap', ac.cap, 'citta', ac.citta, 'provincia', ac.provincia, 'email', ac.email)), '[]'::jsonb)
  from allievi a join account ac on ac.id = a.account_id
  where a.account_id in (select miei_account());
$$;

revoke execute on function scuola_area() from public, anon;
revoke execute on function orario_area(date, uuid) from public, anon;
revoke execute on function aggiorna_miei_dati(uuid, jsonb) from public, anon;
revoke execute on function miei_dati_anagrafici() from public, anon;
grant execute on function scuola_area() to authenticated;
grant execute on function orario_area(date, uuid) to authenticated;
grant execute on function aggiorna_miei_dati(uuid, jsonb) to authenticated;
grant execute on function miei_dati_anagrafici() to authenticated;
