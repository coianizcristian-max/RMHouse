-- 163 — "Togli le prove": cancella quello che è stato creato a mano in RMHouse fra i dati che arrivano dai file di
-- APP Palestre (persone, abbonamenti, incassi e ricevute), così reimportando i file contano solo quelli.
-- Si riconoscono dal codice di APP Palestre: chi è importato lo ha (allievi/iscrizioni/pagamenti.codice_esterno).
-- NON tocca: corsi, orari, listino, staff, sale, impostazioni, workshop ed eventi, abbinamenti di "Da sistemare",
-- presenze/prenotazioni/recuperi e i dati messi a mano sulle persone vere (certificati, tessere, moduli, consensi).
-- Niente avvisi ai clienti (nessun trigger di messaggi parte cancellando). Solo amministratori. Si può rilanciare.

-- le persone create in RMHouse che non hanno niente di APP Palestre
create or replace function prove_persone(p_palestra uuid)
returns table (allievo_id uuid)
language sql stable security definer set search_path = public as $$
  select a.id from allievi a
   where a.palestra_id = p_palestra and a.codice_esterno is null and a.cognome <> 'anonimizzata'
     and not exists (select 1 from iscrizioni i where i.allievo_id = a.id and i.codice_esterno is not null)
     and not exists (select 1 from pagamenti p where p.allievo_id = a.id and p.codice_esterno is not null)
     and not exists (select 1 from storico_abbonamenti s where s.allievo_id = a.id and s.fonte = 'app_palestre')
$$;
revoke all on function prove_persone(uuid) from public, anon, authenticated;

-- incassi che si possono togliere: fatti in RMHouse, per abbonamenti, quote o vendite (non workshop, eventi, prove)
create or replace function prove_incasso_ok(p_pagamento uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pagamenti p where p.id = p_pagamento and p.codice_esterno is null
                    and p.causale in ('abbonamento', 'quota_iscrizione', 'altro'))
     and not exists (select 1 from workshop_iscrizioni w where w.pagamento_id = p_pagamento)
     and not exists (select 1 from iscrizioni_evento e where e.pagamento_id = p_pagamento)
     and not exists (select 1 from prove x where x.pagamento_id = p_pagamento)
$$;
revoke all on function prove_incasso_ok(uuid) from public, anon, authenticated;

-- l'elenco da mostrare: { persone, abbonamenti, incassi, ultimo_import, prossima_ricevuta }
create or replace function prove_da_togliere(p_palestra uuid)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb;
begin
  if not is_admin(p_palestra) then raise exception 'non_autorizzato'; end if;
  with fp as (select allievo_id from prove_persone(p_palestra)),
  persone as (
    select a.id, a.nome, a.cognome, a.created_at, ac.fonte, a.is_titolare,
           trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')) as famiglia, ac.user_id is not null as accesso_app,
           (select count(*) from iscrizioni i where i.allievo_id = a.id) as abbonamenti,
           (select count(*) from pagamenti p where p.allievo_id = a.id) as incassi,
           (select coalesce(sum(p.importo_cent), 0) from pagamenti p where p.allievo_id = a.id and p.stato = 'pagato') as incassato_cent,
           (select count(*) from ricevute r where r.allievo_id = a.id) as ricevute,
           (select count(*) from presenze x where x.allievo_id = a.id) as presenze,
           (select count(*) from workshop_iscrizioni w where w.allievo_id = a.id) as workshop,
           (select count(*) from iscrizioni_evento e where e.allievo_id = a.id) as eventi,
           (select count(*) from prove x where x.allievo_id = a.id) as prove
      from fp join allievi a on a.id = fp.allievo_id left join account ac on ac.id = a.account_id
  ),
  abbonamenti as (
    select i.id, i.allievo_id, a.nome, a.cognome, c.nome as corso, t.nome as abbonamento, i.data_inizio, i.data_fine, i.stato, i.created_at,
           p.id as pagamento_id, p.importo_cent, p.stato as stato_incasso, p.metodo,
           (select string_agg(r.numero || '/' || r.anno, ', ') from ricevute r where r.pagamento_id = p.id) as ricevute
      from iscrizioni i join allievi a on a.id = i.allievo_id
      left join corsi c on c.id = i.corso_id left join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
      left join pagamenti p on p.id = i.pagamento_id and p.codice_esterno is null
     where i.palestra_id = p_palestra and i.codice_esterno is null and i.allievo_id not in (select allievo_id from fp)
  ),
  incassi as (
    select p.id, coalesce(a.nome, ac.nome) as nome, coalesce(a.cognome, ac.cognome) as cognome, p.causale, p.descrizione,
           p.importo_cent, p.stato, p.metodo, coalesce(p.pagato_at, p.created_at) as quando,
           (select string_agg(r.numero || '/' || r.anno, ', ') from ricevute r where r.pagamento_id = p.id) as ricevute,
           (select string_agg(coalesce(c.nome, '') || case when i.codice_esterno is not null then ' (di APP Palestre)' else '' end, ', ')
              from iscrizioni i left join corsi c on c.id = i.corso_id where i.pagamento_id = p.id) as per_abbonamento
      from pagamenti p left join allievi a on a.id = p.allievo_id left join account ac on ac.id = p.account_id
     where p.palestra_id = p_palestra and prove_incasso_ok(p.id)
       and (p.allievo_id is null or p.allievo_id not in (select allievo_id from fp))
       -- quelli degli abbonamenti qui sopra vanno via con l'abbonamento
       and not exists (select 1 from abbonamenti x where x.pagamento_id = p.id)
  )
  select jsonb_build_object(
    'persone', coalesce((select jsonb_agg(to_jsonb(x) order by x.cognome, x.nome) from persone x), '[]'),
    'abbonamenti', coalesce((select jsonb_agg(to_jsonb(x) order by x.cognome, x.nome, x.data_inizio) from abbonamenti x), '[]'),
    'incassi', coalesce((select jsonb_agg(to_jsonb(x) order by x.quando desc) from incassi x), '[]'),
    'ultimo_import', (select max(coalesce(finita_at, iniziata_at)) from importazioni where palestra_id = p_palestra and fonte = 'app_palestre'),
    'ultima_ricevuta', (select jsonb_build_object('numero', max(r.numero), 'anno', max(r.anno)) from ricevute r
                         where r.palestra_id = p_palestra and r.tipo_documento = 'ricevuta'
                           and r.anno = extract(year from now() at time zone 'Europe/Rome')::int)
  ) into v;
  return v;
end $$;
revoke all on function prove_da_togliere(uuid) from public, anon;
grant execute on function prove_da_togliere(uuid) to authenticated;

-- cancella: le persone scelte (con tutto quello che hanno), gli abbonamenti scelti (con il loro incasso fatto in RMHouse,
-- ricevute, rate e prenotazioni) e gli altri incassi scelti (con le ricevute). Ricontrolla tutto: passa solo quello
-- che è davvero fatto in RMHouse.
create or replace function togli_prove(p_palestra uuid, p_persone uuid[] default '{}', p_iscrizioni uuid[] default '{}', p_pagamenti uuid[] default '{}')
returns jsonb
language plpgsql security definer set search_path = public set jit = off as $$
declare v_pers uuid[]; v_isc uuid[]; v_pag uuid[]; v_ric uuid[]; v_acc uuid[]; n_pers int; n_isc int; n_pag int; n_ric int; n_acc int;
begin
  if not is_admin(p_palestra) then raise exception 'non_autorizzato'; end if;

  select coalesce(array_agg(f.allievo_id), '{}') into v_pers
    from prove_persone(p_palestra) f where f.allievo_id = any(coalesce(p_persone, '{}'));
  -- abbonamenti: quelli scelti (fatti in RMHouse) + tutti quelli delle persone tolte
  select coalesce(array_agg(i.id), '{}') into v_isc from iscrizioni i
   where i.palestra_id = p_palestra and i.codice_esterno is null
     and (i.id = any(coalesce(p_iscrizioni, '{}')) or i.allievo_id = any(v_pers));
  -- incassi: quelli scelti + quelli degli abbonamenti tolti (se fatti in RMHouse e non usati da altri abbonamenti)
  --          + tutti quelli fatti in RMHouse delle persone tolte
  select coalesce(array_agg(distinct p.id), '{}') into v_pag from pagamenti p
   where p.palestra_id = p_palestra and p.codice_esterno is null and (
         (p.id = any(coalesce(p_pagamenti, '{}')) and prove_incasso_ok(p.id))
      or ((p.id in (select i.pagamento_id from iscrizioni i where i.id = any(v_isc))
           or p.id in (select r.pagamento_id from rate r where r.iscrizione_id = any(v_isc)))
          and not exists (select 1 from iscrizioni i where i.pagamento_id = p.id and not (i.id = any(v_isc))))
      or p.allievo_id = any(v_pers)
      or (p.allievo_id is null and p.account_id in (select a.account_id from allievi a where a.id = any(v_pers))
          and not exists (select 1 from allievi a where a.account_id = p.account_id and not (a.id = any(v_pers)))));
  -- ricevute (e note di credito che le stornano) di quegli incassi o delle persone tolte; mai quelle importate
  select coalesce(array_agg(distinct r.id), '{}') into v_ric from ricevute r
   where r.palestra_id = p_palestra
     and (r.pagamento_id = any(v_pag) or r.allievo_id = any(v_pers))
     and not exists (select 1 from import_pagamenti ip where ip.ricevuta_id = r.id);
  select v_ric || coalesce(array_agg(r.id), '{}') into v_ric from ricevute r where r.riferimento_id = any(v_ric) and not (r.id = any(v_ric));
  -- le famiglie (account) che restano vuote, se non vengono da APP Palestre
  select coalesce(array_agg(distinct a.account_id), '{}') into v_acc from allievi a
    join account ac on ac.id = a.account_id
   where a.id = any(v_pers) and coalesce(ac.fonte, '') <> 'app_palestre' and ac.codice_esterno is null
     and not exists (select 1 from allievi b where b.account_id = a.account_id and not (b.id = any(v_pers)));

  n_pers := coalesce(array_length(v_pers, 1), 0); n_isc := coalesce(array_length(v_isc, 1), 0);
  n_pag := coalesce(array_length(v_pag, 1), 0); n_ric := coalesce(array_length(v_ric, 1), 0);

  delete from ricevute where id = any(v_ric);
  delete from documenti_fiscali where pagamento_id = any(v_pag);
  delete from quote_iscrizione where pagamento_id = any(v_pag);
  -- abbonamenti: prima ciò che li tiene legati
  delete from prenotazioni where iscrizione_id = any(v_isc);
  delete from rate where iscrizione_id = any(v_isc) or allievo_id = any(v_pers) or pagamento_id = any(v_pag) and iscrizione_id is null;
  update iscrizioni set rinnovo_di = null where rinnovo_di = any(v_isc) and not (id = any(v_isc));
  update iscrizioni set pagamento_id = null where pagamento_id = any(v_pag) and not (id = any(v_isc));
  delete from iscrizioni where id = any(v_isc);
  -- persone (con certificati, tessere, firme, presenze, prenotazioni… che vanno via con loro)
  delete from allievi where id = any(v_pers);
  update prove set pagamento_id = null where pagamento_id = any(v_pag);
  delete from pagamenti where id = any(v_pag);
  -- famiglie rimaste vuote (se non hanno altri incassi)
  delete from account ac where ac.id = any(v_acc)
     and not exists (select 1 from pagamenti p where p.account_id = ac.id)
     and not exists (select 1 from allievi a where a.account_id = ac.id);
  get diagnostics n_acc = row_count;

  return jsonb_build_object('persone', n_pers, 'abbonamenti', n_isc, 'incassi', n_pag, 'ricevute', n_ric, 'famiglie', n_acc,
    'ultima_ricevuta', (select max(r.numero) from ricevute r where r.palestra_id = p_palestra and r.tipo_documento = 'ricevuta'
                          and r.anno = extract(year from now() at time zone 'Europe/Rome')::int));
end $$;
revoke all on function togli_prove(uuid, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function togli_prove(uuid, uuid[], uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';
