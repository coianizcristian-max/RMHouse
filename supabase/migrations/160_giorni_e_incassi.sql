-- 160 — Giorni a settimana e pagamenti: cosa si vede davvero
-- • senza_incasso(): gli abbonamenti attivi a una data che costano qualcosa ma non hanno nessun incasso collegato
--   (né pagato, né "non pagato", né rate). Di solito: venduti con APP Palestre e il pagamento non è stato abbinato,
--   oppure fatti senza passare dallo Sportello. Prima non risultavano né pagati né da saldare.
-- • iscritti_corsi(): come nel 154, in più i giorni a settimana dell'abbonamento ("volte") e "senza_incasso".
-- Si può rilanciare.

create or replace function senza_incasso(p_palestra uuid, p_data date default null)
returns table (allievo_id uuid, iscrizione_id uuid, prezzo_cent int)
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_data, (now() at time zone 'Europe/Rome')::date);
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  return query
    select i.allievo_id, i.id, (coalesce(t.prezzo_cent, 0) - coalesce(i.sconto_cent, 0))::int
      from iscrizioni i
      join tipi_abbonamento t on t.id = i.tipo_abbonamento_id
      left join pagamenti pg on pg.id = i.pagamento_id
     where i.palestra_id = p_palestra and i.stato in ('attiva', 'sospesa') and d between i.data_inizio and i.data_fine
       and coalesce(t.prezzo_cent, 0) - coalesce(i.sconto_cent, 0) > 0
       and (i.pagamento_id is null or pg.stato = 'annullato')
       and not exists (select 1 from rate r where r.iscrizione_id = i.id);
end $$;
revoke all on function senza_incasso(uuid, date) from public, anon;
grant execute on function senza_incasso(uuid, date) to authenticated;

create or replace function iscritti_corsi(p_palestra uuid, p_data date default null)
returns jsonb
language plpgsql stable security definer set search_path = public set jit = off as $$
declare v jsonb; d date := coalesce(p_data, (now() at time zone 'Europe/Rome')::date);
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  with att as (
    -- iscrizioni valide oggi o che partono più avanti (rinnovi), una per persona e corso (la più vicina a oggi)
    select i.*, row_number() over (partition by i.corso_id, i.allievo_id order by (i.data_inizio <= d) desc, i.data_inizio) as rn,
           max(i.data_fine) over (partition by i.corso_id, i.allievo_id) as fino_al,
           min(i.data_inizio) over (partition by i.corso_id, i.allievo_id) as dal_primo
      from iscrizioni i
     where i.palestra_id = p_palestra and i.stato in ('attiva', 'sospesa') and i.data_fine >= d and i.corso_id is not null
  ), uno as (select * from att where rn = 1),
  giorni as (
    select a.corso_id, a.allievo_id, array_agg(distinct io.orario_id) as orari
      from att a join iscrizioni_orari io on io.iscrizione_id = a.id group by a.corso_id, a.allievo_id
  ),
  saldi as (select x.allievo_id, sum(x.importo_cent)::int as cent from voci_da_saldare(p_palestra, null) x group by x.allievo_id),
  senza as (select x.iscrizione_id from senza_incasso(p_palestra, d) x),
  tess as (select distinct on (t.allievo_id) t.* from tesseramenti t where t.palestra_id = p_palestra order by t.allievo_id, t.stagione desc, t.created_at desc),
  quote as (select q.allievo_id, max(q.data) as data from quote_iscrizione q where q.palestra_id = p_palestra group by q.allievo_id),
  prime_prove as (
    select pr.allievo_id, pr.corso_id, min(l.data) as data from prove pr join lezioni l on l.id = pr.lezione_id
     where pr.palestra_id = p_palestra group by pr.allievo_id, pr.corso_id
  ),
  persone as (
    select u.corso_id, jsonb_agg(jsonb_build_object(
        'iscrizione_id', u.id, 'allievo_id', a.id, 'nome', a.nome, 'cognome', a.cognome,
        'eta', extract(year from age(d, a.data_nascita))::int,
        'chi_paga', case when a.is_titolare then null else trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')) end,
        'telefono', ac.telefono, 'email', ac.email,
        'orari', coalesce(g.orari, '{}'::uuid[]),
        'abbonamento', t.nome, 'modalita', t.modalita, 'volte', t.lezioni_settimanali,
        'senza_incasso', exists (select 1 from senza sz where sz.iscrizione_id = u.id), 'dal', u.data_inizio, 'al', u.data_fine, 'fino_al', u.fino_al,
        'stato', u.stato, 'ingressi', u.ingressi_residui, 'futuro', u.data_inizio > d,
        'certificato', a.certificato_scadenza,
        'tessera', case when ts.id is null then null else jsonb_build_object('numero', ts.numero, 'stato', ts.stato, 'stagione', ts.stagione, 'ente', ts.ente) end,
        'quota', case when qu.data is null then null else (qu.data + interval '1 year')::date - 1 end,
        'da_saldare', s.cent,
        'prova', pp.data,
        'altri', (select string_agg(c2.nome, ', ' order by c2.nome) from uno u2 join corsi c2 on c2.id = u2.corso_id
                   where u2.allievo_id = u.allievo_id and u2.corso_id <> u.corso_id),
        'note', u.note
      ) order by a.cognome, a.nome) as elenco, count(*) as quanti
      from uno u
      join allievi a on a.id = u.allievo_id
      left join account ac on ac.id = a.account_id
      left join tipi_abbonamento t on t.id = u.tipo_abbonamento_id
      left join giorni g on g.corso_id = u.corso_id and g.allievo_id = u.allievo_id
      left join saldi s on s.allievo_id = u.allievo_id
      left join tess ts on ts.allievo_id = u.allievo_id
      left join quote qu on qu.allievo_id = u.allievo_id
      left join prime_prove pp on pp.allievo_id = u.allievo_id and pp.corso_id = u.corso_id
     group by u.corso_id
  ),
  prove as (
    -- in prova (da 45 giorni fa in poi) e non ancora iscritti a quel corso
    select pr.corso_id, jsonb_agg(jsonb_build_object('prova_id', pr.id, 'allievo_id', a.id, 'nome', a.nome, 'cognome', a.cognome,
             'telefono', ac.telefono, 'data', l.data, 'inizio', l.inizio, 'stato', pr.stato) order by l.inizio) as elenco
      from prove pr join lezioni l on l.id = pr.lezione_id join allievi a on a.id = pr.allievo_id left join account ac on ac.id = a.account_id
     where pr.palestra_id = p_palestra and pr.stato in ('in_attesa_pagamento', 'confermata', 'presente', 'assente')
       and l.data >= d - 45
       and not exists (select 1 from uno u where u.corso_id = pr.corso_id and u.allievo_id = pr.allievo_id)
     group by pr.corso_id
  ),
  attese as (
    select coalesce(la.corso_id, l.corso_id) as corso_id,
           jsonb_agg(jsonb_build_object('id', la.id, 'allievo_id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'telefono', ac.telefono,
                                        'dal', la.created_at, 'lezione', l.inizio, 'note', la.note) order by la.created_at) as elenco
      from liste_attesa la left join lezioni l on l.id = la.lezione_id
      join allievi a on a.id = la.allievo_id left join account ac on ac.id = a.account_id
     where la.palestra_id = p_palestra and la.stato in ('in_attesa', 'avvisato') and (l.id is null or l.inizio >= now())
     group by coalesce(la.corso_id, l.corso_id)
  )
  select jsonb_build_object('data', d, 'corsi', coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'colore', c.colore, 'capienza', c.capienza,
      'disciplina', di.nome, 'categoria', ca.nome, 'categoria_ordine', ca.ordine,
      'orari', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'giorno', o.giorno_settimana, 'ora', to_char(o.ora_inizio, 'HH24:MI'),
                                   'durata', o.durata_min, 'gruppo', o.gruppo, 'insegnante', trim(coalesce(s.nome, '') || ' ' || coalesce(s.cognome, '')),
                                   'sala', sa.nome) order by o.giorno_settimana, o.ora_inizio)
                          from orari o left join staff s on s.id = o.insegnante_id left join sale sa on sa.id = o.sala_id
                         where o.corso_id = c.id and o.attivo), '[]'::jsonb),
      'persone', coalesce(pe.elenco, '[]'::jsonb), 'quanti', coalesce(pe.quanti, 0),
      'prove', coalesce(pv.elenco, '[]'::jsonb), 'attese', coalesce(at.elenco, '[]'::jsonb)
    ) order by ca.ordine nulls last, ca.nome nulls last, di.nome nulls last, c.nome), '[]'::jsonb)) into v
    from corsi c
    left join discipline di on di.id = c.disciplina_id
    left join categorie ca on ca.id = di.categoria_id
    left join persone pe on pe.corso_id = c.id
    left join prove pv on pv.corso_id = c.id
    left join attese at on at.corso_id = c.id
   where c.palestra_id = p_palestra and (c.attivo or pe.quanti > 0);
  return v;
end $$;
revoke all on function iscritti_corsi(uuid, date) from public, anon;
grant execute on function iscritti_corsi(uuid, date) to authenticated;

notify pgrst, 'reload schema';
