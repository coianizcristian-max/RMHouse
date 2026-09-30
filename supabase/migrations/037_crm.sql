-- =====================================================================
-- RMHouse — 037 CRM
--
-- 1. Da ricontattare: liste pronte di chi non ha rinnovato, chi non viene
--    più, chi se n'è andato da poco, chi ha fatto la prova e non si è
--    iscritto, chi va richiamato oggi. Con i messaggi WhatsApp modificabili.
-- 2. Campagne email a un pubblico scelto (stato, corsi, etichette), solo a
--    chi ha dato il consenso, con il nome al posto giusto e il link per
--    non ricevere più promozioni.
-- 3. Sondaggi con link personale: stelle, voto 0-10, scelta, testo libero,
--    risultati con media, NPS e risposte.
-- Da eseguire dopo la 036. Si può rieseguire.
-- =====================================================================

alter table palestre add column if not exists crm_testi jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 1. Da ricontattare
-- ---------------------------------------------------------------------
create or replace function da_ricontattare(p_palestra uuid)
returns table (allievo_id uuid, lista text, nome text, cognome text, titolare text, telefono text, email text,
               dettaglio text, data_rif date, ultimo_contatto timestamptz, ultimo_esito text, prossimo_contatto date)
language sql stable security invoker set search_path = public as $$
  with ultimi as (
    select distinct on (c.allievo_id) c.allievo_id, c.quando, c.esito
    from contatti_lead c where c.palestra_id = p_palestra
    order by c.allievo_id, c.quando desc
  ),
  base as (
    select s.id, s.nome, s.cognome, s.titolare_nome || ' ' || coalesce(s.titolare_cognome, '') as titolare,
           s.telefono, s.email, s.stato, s.stato_lead, s.ultima_fine, s.ultima_presenza, a.prossimo_contatto,
           u.quando as ultimo_contatto, u.esito as ultimo_esito
    from v_stato_clienti s
    join allievi a on a.id = s.id
    left join ultimi u on u.allievo_id = s.id
    where s.palestra_id = p_palestra and a.cognome <> 'anonimizzata'
  )
  select id, 'richiamare', nome, cognome, titolare, telefono, email, 'da richiamare', prossimo_contatto,
         ultimo_contatto, ultimo_esito, prossimo_contatto
    from base where prossimo_contatto <= current_date
  union all
  select id, 'no_rinnovo', nome, cognome, titolare, telefono, email, 'scaduto il ' || to_char(ultima_fine, 'DD/MM'), ultima_fine,
         ultimo_contatto, ultimo_esito, prossimo_contatto
    from base where stato = 'no_rinnovo'
     and (ultimo_contatto is null or ultimo_contatto < ultima_fine) and coalesce(ultimo_esito, '') <> 'non_interessato'
  union all
  select id, 'inattivo', nome, cognome, titolare, telefono, email,
         coalesce('ultima presenza il ' || to_char(ultima_presenza, 'DD/MM'), 'nessuna presenza'), ultima_presenza,
         ultimo_contatto, ultimo_esito, prossimo_contatto
    from base where stato = 'inattivo' and (ultimo_contatto is null or ultimo_contatto < now() - interval '14 days')
  union all
  select id, 'ex_recenti', nome, cognome, titolare, telefono, email, 'finito il ' || to_char(ultima_fine, 'DD/MM/YY'), ultima_fine,
         ultimo_contatto, ultimo_esito, prossimo_contatto
    from base where stato = 'perso' and ultima_fine >= current_date - 180
     and (ultimo_contatto is null or ultimo_contatto < ultima_fine) and coalesce(ultimo_esito, '') <> 'non_interessato'
  union all
  select id, 'prove', nome, cognome, titolare, telefono, email, 'prova fatta, non iscritto', null,
         ultimo_contatto, ultimo_esito, prossimo_contatto
    from base where stato_lead = 'prova_effettuata' and stato not in ('iscritto', 'fedele', 'in_scadenza', 'in_esaurimento', 'rientro')
     and (ultimo_contatto is null or ultimo_contatto < now() - interval '7 days');
$$;
grant execute on function da_ricontattare(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Campagne
-- ---------------------------------------------------------------------
create table if not exists sondaggi (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  titolo       text not null,
  intro        text,
  domande      jsonb not null default '[]'::jsonb,  -- [{id, tipo: stelle|nps|scelta|testo, testo, opzioni: []}]
  anonimo      boolean not null default false,
  attivo       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table sondaggi enable row level security;
drop policy if exists gestione_tutto on sondaggi;
create policy gestione_tutto on sondaggi for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

create table if not exists campagne (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  titolo       text not null,
  oggetto      text not null,
  corpo        text not null,
  pubblico     jsonb not null default '{}'::jsonb,  -- {stati: [], corsi: [], etichette: [], servizio: bool}
  sondaggio_id uuid references sondaggi(id) on delete set null,
  destinatari  int,
  inviata_at   timestamptz,
  creata_da    uuid,
  created_at   timestamptz not null default now()
);
alter table campagne enable row level security;
drop policy if exists gestione_tutto on campagne;
create policy gestione_tutto on campagne for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Il pubblico: una riga per famiglia (un'email per chi paga)
create or replace function pubblico_campagna(p_palestra uuid, p jsonb)
returns table (account_id uuid, allievo_id uuid, nome text, email text, telefono text, consenso boolean)
language sql stable security invoker set search_path = public as $$
  select distinct on (s.account_id) s.account_id, s.id,
         case when s.is_titolare then s.nome else coalesce(nullif(s.titolare_nome, ''), s.nome) end,
         s.email, s.telefono, coalesce(acc.consenso_marketing, false)
  from v_stato_clienti s
  join account acc on acc.id = s.account_id
  where s.palestra_id = p_palestra and acc.cognome is distinct from 'anonimizzato'
    and (coalesce(jsonb_array_length(p -> 'stati'), 0) = 0
         or s.stato in (select jsonb_array_elements_text(p -> 'stati')))
    and (coalesce(jsonb_array_length(p -> 'etichette'), 0) = 0
         or s.etichette_id && array(select jsonb_array_elements_text(p -> 'etichette'))::uuid[])
    and (coalesce(jsonb_array_length(p -> 'corsi'), 0) = 0
         or exists (select 1 from iscrizioni i where i.allievo_id = s.id
                      and i.corso_id in (select (jsonb_array_elements_text(p -> 'corsi'))::uuid)
                      and (coalesce((p ->> 'anche_passati')::boolean, false) or (i.stato = 'attiva' and i.data_fine >= current_date))))
  order by s.account_id, s.is_titolare desc, s.created_at;
$$;

create or replace function conta_pubblico(p_palestra uuid, p jsonb)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'famiglie', count(*),
    'con_email', count(*) filter (where email is not null),
    'con_consenso', count(*) filter (where email is not null and consenso),
    'con_telefono', count(*) filter (where telefono is not null),
    'telefoni', coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'telefono', telefono)) filter (where telefono is not null), '[]'::jsonb)
  )
  from pubblico_campagna(p_palestra, p);
$$;
grant execute on function pubblico_campagna(uuid, jsonb) to authenticated;
grant execute on function conta_pubblico(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Sondaggi
-- ---------------------------------------------------------------------
create table if not exists sondaggi_inviti (
  token        uuid primary key default gen_random_uuid(),
  sondaggio_id uuid not null references sondaggi(id) on delete cascade,
  palestra_id  uuid not null references palestre(id) on delete cascade,
  account_id   uuid references account(id) on delete set null,
  allievo_id   uuid references allievi(id) on delete set null,
  risposto_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (sondaggio_id, account_id)
);
alter table sondaggi_inviti enable row level security;
drop policy if exists gestione_legge on sondaggi_inviti;
create policy gestione_legge on sondaggi_inviti for select to authenticated using (is_gestione(palestra_id));

create table if not exists sondaggi_risposte (
  id           uuid primary key default gen_random_uuid(),
  sondaggio_id uuid not null references sondaggi(id) on delete cascade,
  palestra_id  uuid not null references palestre(id) on delete cascade,
  invito_token uuid unique references sondaggi_inviti(token) on delete set null,
  risposte     jsonb not null,
  created_at   timestamptz not null default now()
);
alter table sondaggi_risposte enable row level security;
drop policy if exists gestione_legge on sondaggi_risposte;
create policy gestione_legge on sondaggi_risposte for select to authenticated using (is_gestione(palestra_id));

-- Risultati: per ogni domanda media, distribuzione, NPS o risposte scritte
create or replace function risultati_sondaggio(p_sondaggio uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare s sondaggi; d jsonb; out jsonb := '[]'::jsonb; v jsonb;
begin
  select * into s from sondaggi where id = p_sondaggio;
  if not found then return null; end if;
  for d in select * from jsonb_array_elements(s.domande) loop
    if d ->> 'tipo' in ('stelle', 'nps') then
      select jsonb_build_object(
        'risposte', count(*),
        'media', round(avg((r.risposte ->> (d ->> 'id'))::numeric), 1),
        'distribuzione', coalesce((select jsonb_object_agg(val, n) from (
            select r2.risposte ->> (d ->> 'id') as val, count(*) as n from sondaggi_risposte r2
             where r2.sondaggio_id = s.id and r2.risposte ? (d ->> 'id') group by 1) x), '{}'::jsonb),
        'nps', case when d ->> 'tipo' = 'nps' and count(*) > 0 then
          round(100.0 * (count(*) filter (where (r.risposte ->> (d ->> 'id'))::int >= 9)
                       - count(*) filter (where (r.risposte ->> (d ->> 'id'))::int <= 6)) / count(*)) end)
      into v from sondaggi_risposte r where r.sondaggio_id = s.id and r.risposte ? (d ->> 'id');
    elsif d ->> 'tipo' = 'scelta' then
      select jsonb_build_object('risposte', count(*),
        'distribuzione', coalesce(jsonb_object_agg(val, n), '{}'::jsonb))
      into v from (select r.risposte ->> (d ->> 'id') as val, count(*) as n from sondaggi_risposte r
                    where r.sondaggio_id = s.id and r.risposte ? (d ->> 'id') group by 1) x;
      v := v || jsonb_build_object('risposte', (select count(*) from sondaggi_risposte r where r.sondaggio_id = s.id and r.risposte ? (d ->> 'id')));
    else
      select jsonb_build_object('risposte', count(*), 'testi', coalesce(jsonb_agg(jsonb_build_object(
               'testo', r.risposte ->> (d ->> 'id'),
               'chi', case when s.anonimo then null else trim(a.nome || ' ' || coalesce(a.cognome, '')) end,
               'quando', r.created_at) order by r.created_at desc), '[]'::jsonb))
      into v from sondaggi_risposte r
      left join sondaggi_inviti i on i.token = r.invito_token
      left join allievi a on a.id = i.allievo_id
      where r.sondaggio_id = s.id and coalesce(r.risposte ->> (d ->> 'id'), '') <> '';
    end if;
    out := out || jsonb_build_array(d || jsonb_build_object('risultato', v));
  end loop;
  return jsonb_build_object(
    'inviti', (select count(*) from sondaggi_inviti where sondaggio_id = s.id),
    'risposte', (select count(*) from sondaggi_risposte where sondaggio_id = s.id),
    'domande', out);
end $$;
grant execute on function risultati_sondaggio(uuid) to authenticated;

-- Inviare la campagna: una email per famiglia, nome al posto di {nome},
-- link personale al sondaggio al posto di {sondaggio}
create or replace function invia_campagna(p_campagna uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c campagne; p palestre; r record; n int := 0; v_corpo text; v_token uuid; v_servizio boolean;
begin
  select * into c from campagne where id = p_campagna;
  if not found then raise exception 'campagna_non_trovata'; end if;
  if not is_gestione(c.palestra_id) then raise exception 'non_autorizzato'; end if;
  if c.inviata_at is not null then raise exception 'gia_inviata'; end if;
  select * into p from palestre where id = c.palestra_id;
  v_servizio := coalesce((c.pubblico ->> 'servizio')::boolean, false);

  for r in select * from pubblico_campagna(c.palestra_id, c.pubblico) x
            where x.email is not null and (v_servizio or x.consenso) loop
    v_corpo := replace(c.corpo, '{nome}', coalesce(r.nome, ''));
    if c.sondaggio_id is not null then
      insert into sondaggi_inviti (sondaggio_id, palestra_id, account_id, allievo_id)
      values (c.sondaggio_id, c.palestra_id, r.account_id, r.allievo_id)
      on conflict (sondaggio_id, account_id) do update set allievo_id = excluded.allievo_id
      returning token into v_token;
      v_corpo := replace(v_corpo, '{sondaggio}', coalesce(p.base_url, '') || '/sondaggio?t=' || v_token);
    end if;
    if not v_servizio then
      v_corpo := v_corpo || E'\n\n—\nNon vuoi più ricevere novità e promozioni? '
        || coalesce(p.base_url, '') || '/disiscriviti?t=' || (select token from allievi where id = r.allievo_id);
    end if;
    insert into messaggi_coda (palestra_id, account_id, allievo_id, evento, canale, destinatario, oggetto, corpo, chiave)
    values (c.palestra_id, r.account_id, r.allievo_id, 'campagna', 'email', r.email,
            replace(c.oggetto, '{nome}', coalesce(r.nome, '')), v_corpo, 'campagna:' || c.id || ':' || r.account_id)
    on conflict (palestra_id, chiave) do nothing;
    n := n + 1;
  end loop;

  update campagne set inviata_at = now(), destinatari = n where id = c.id;
  return n;
end $$;
grant execute on function invia_campagna(uuid) to authenticated;

-- Esito di ogni campagna: inviate, in coda, non partite, risposte al sondaggio
create or replace view v_campagne with (security_invoker = true) as
  select c.*,
         (select count(*) from messaggi_coda m where m.palestra_id = c.palestra_id and m.chiave like 'campagna:' || c.id || ':%' and m.stato = 'inviato') as inviate,
         (select count(*) from messaggi_coda m where m.palestra_id = c.palestra_id and m.chiave like 'campagna:' || c.id || ':%' and m.stato = 'in_coda') as in_coda,
         (select count(*) from messaggi_coda m where m.palestra_id = c.palestra_id and m.chiave like 'campagna:' || c.id || ':%' and m.stato = 'errore') as errori,
         s.titolo as sondaggio
  from campagne c left join sondaggi s on s.id = c.sondaggio_id;

-- Disiscrizione dalle promozioni dal link nell'email (chiamata lato server)
create or replace function disiscrivi(p_token uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_acc uuid; v_nome text;
begin
  select a.account_id, a.nome into v_acc, v_nome from allievi a where a.token = p_token;
  if v_acc is null then return null; end if;
  update account set consenso_marketing = false where id = v_acc;
  return v_nome;
end $$;
revoke execute on function disiscrivi(uuid) from public, anon, authenticated;

select 'da ricontattare' as cosa, count(*) from da_ricontattare((select id from palestre limit 1));

-- ---------------------------------------------------------------------
-- 4. Consenso alle promozioni dall'area clienti
--    Gli importati da APP Palestre non hanno il consenso registrato: glielo
--    si chiede una volta, con un sì o un no, quando entrano nell'area.
-- ---------------------------------------------------------------------
alter table account add column if not exists consenso_chiesto_at timestamptz;

create or replace function imposta_consenso_marketing(p_si boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update account set consenso_marketing = p_si, consenso_chiesto_at = now()
   where user_id = auth.uid();
end $$;
grant execute on function imposta_consenso_marketing(boolean) to authenticated;
