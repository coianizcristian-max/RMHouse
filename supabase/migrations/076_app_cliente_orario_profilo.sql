-- =====================================================================
-- RMHouse — 076 APP DEL CLIENTE: ORARIO DELLA SCUOLA E PROFILO
--  1. orario_area(giorno): tutte le lezioni del giorno, con posti liberi
--     e chi della famiglia c'è già
--  2. profilo_area(): per ogni persona della famiglia scadenze
--     (abbonamento, quota, certificato, tessera), abbonamenti e storico,
--     lezioni della stagione, moduli firmati
-- Solo lettura, per chi ha fatto l'accesso. Si può eseguire più volte.
-- =====================================================================

create or replace function orario_area(p_giorno date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acc uuid; v_pal uuid;
begin
  select id, palestra_id into v_acc, v_pal from account where user_id = auth.uid() limit 1;
  if v_pal is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'lezione_id', l.id, 'inizio', l.inizio, 'fine', l.fine, 'stato', l.stato,
      'corso_id', c.id, 'corso', c.nome, 'colore', c.colore, 'disciplina', d.nome,
      'sala', s.nome, 'insegnante', st.nome,
      'capienza', coalesce(l.capienza_override, c.capienza, s.capienza),
      'occupati', (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id),
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
      and c.attivo and coalesce(c.visibilita, 'pubblico') <> 'nascosto'
  ), '[]'::jsonb);
end $$;

create or replace function profilo_area()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acc uuid; v_inizio_stagione date;
begin
  select id into v_acc from account where user_id = auth.uid() limit 1;
  if v_acc is null then return '[]'::jsonb; end if;
  -- la stagione parte il 1° settembre
  v_inizio_stagione := make_date(extract(year from current_date - interval '8 months')::int, 9, 1);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'foto', a.foto_url, 'nascita', a.data_nascita,
      'token', a.token,
      'certificato_scadenza', a.certificato_scadenza,
      'certificato_ok', certificato_valido(a.id),
      'certificato_in_verifica', exists (select 1 from certificati ce where ce.allievo_id = a.id and ce.stato = 'da_verificare'),
      'tessera', (select jsonb_build_object('numero', t.numero, 'stagione', t.stagione, 'stato', t.stato, 'ente', t.ente)
                    from tesseramenti t where t.allievo_id = a.id order by t.stagione desc, t.created_at desc limit 1),
      'quota', (select jsonb_build_object('stagione', q.stagione, 'data', q.data)
                  from quote_iscrizione q where q.allievo_id = a.id order by q.data desc limit 1),
      'quota_mancante', coalesce((select vs.quota_mancante from v_stato_clienti vs where vs.id = a.id), false),
      'attivi', coalesce((select jsonb_agg(jsonb_build_object(
                    'corso', c.nome, 'colore', c.colore, 'abbonamento', ta.nome, 'dal', i.data_inizio, 'al', i.data_fine,
                    'stato', i.stato, 'ingressi', i.ingressi_residui) order by i.data_fine)
                   from iscrizioni i join corsi c on c.id = i.corso_id join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id
                  where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa') and i.data_fine >= current_date), '[]'::jsonb),
      'storico', coalesce((select jsonb_agg(x order by x->>'al' desc) from (
                    select jsonb_build_object('abbonamento', coalesce(ta.nome, c.nome), 'corso', c.nome, 'dal', i.data_inizio, 'al', i.data_fine, 'stato', i.stato) as x
                      from iscrizioni i join corsi c on c.id = i.corso_id left join tipi_abbonamento ta on ta.id = i.tipo_abbonamento_id
                     where i.allievo_id = a.id and (i.data_fine < current_date or i.stato = 'annullata')
                    union all
                    select jsonb_build_object('abbonamento', sa.abbonamento, 'corso', null, 'dal', sa.dal, 'al', sa.al, 'stato', sa.stato)
                      from storico_abbonamenti sa where sa.allievo_id = a.id and sa.iscrizione_id is null
                    order by 1 desc limit 24) s), '[]'::jsonb),
      'stagione', jsonb_build_object(
          'dal', v_inizio_stagione,
          'presenze', (select count(*) from presenze p join lezioni l on l.id = p.lezione_id
                        where p.allievo_id = a.id and p.presente and l.data >= v_inizio_stagione),
          'assenze', (select count(*) from presenze p join lezioni l on l.id = p.lezione_id
                       where p.allievo_id = a.id and not p.presente and l.data >= v_inizio_stagione),
          'cancellate', (select count(*) from assenze_avvisate x join lezioni l on l.id = x.lezione_id
                          where x.allievo_id = a.id and l.data >= v_inizio_stagione),
          'recuperi_fatti', (select count(*) from prenotazioni p join lezioni l on l.id = p.lezione_id
                              where p.allievo_id = a.id and p.tipo = 'recupero' and p.stato = 'confermata'
                                and l.data >= v_inizio_stagione and l.inizio < now())),
      'firme', coalesce((select jsonb_agg(jsonb_build_object('titolo', f.titolo, 'quando', f.firmato_at, 'firmatario', f.firmatario)
                            order by f.firmato_at desc)
                           from firme f where f.allievo_id = a.id), '[]'::jsonb)
    ) order by a.is_titolare desc, a.nome)
    from allievi a where a.account_id = v_acc
  ), '[]'::jsonb);
end $$;

revoke execute on function orario_area(date) from public, anon;
revoke execute on function profilo_area() from public, anon;
grant execute on function orario_area(date) to authenticated;
grant execute on function profilo_area() to authenticated;

-- Recuperi già prenotati per mese, per persona: così l'app non propone un recupero
-- in un mese in cui il limite è già raggiunto. { "allievo": { "2026-10": 2 } }
create or replace function recuperi_per_mese()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(allievo_id, mesi), '{}'::jsonb) from (
    select x.allievo_id, jsonb_object_agg(x.mese, x.n) as mesi from (
      select p.allievo_id, to_char(l.data, 'YYYY-MM') as mese, count(*) as n
        from prenotazioni p join lezioni l on l.id = p.lezione_id join allievi a on a.id = p.allievo_id
       where a.account_id in (select miei_account()) and p.tipo = 'recupero' and p.stato = 'confermata'
         and l.data >= date_trunc('month', current_date)
       group by 1, 2) x
    group by x.allievo_id) y;
$$;
revoke execute on function recuperi_per_mese() from public, anon;
grant execute on function recuperi_per_mese() to authenticated;
