-- =====================================================================
-- RMHouse — 079 ISCRIZIONI DALL'APP: APERTE, IN PARTENZA, CHIUSE
-- Per ogni corso la segreteria decide se dall'app si può comprare e
-- prenotare:
--   aperte    → si compra l'abbonamento e si prenota (normale)
--   attesa    → "in partenza": non si compra né si prenota, ma il cliente
--               tocca "Avvisami quando parte" (es. manca il numero minimo)
--   chiuse    → non si compra né si prenota dall'app
-- La segreteria può sempre iscrivere e prenotare a mano.
-- Quando un corso "in partenza" diventa "aperte", chi aveva chiesto di
-- essere avvisato riceve la notifica.
-- Si può eseguire più volte. Va dopo la 078.
-- =====================================================================

alter table corsi add column if not exists iscrizioni_app text not null default 'aperte';
alter table corsi drop constraint if exists corsi_iscrizioni_app_check;
alter table corsi add constraint corsi_iscrizioni_app_check check (iscrizioni_app in ('aperte', 'attesa', 'chiuse'));
alter table corsi add column if not exists nota_iscrizioni text;     -- es. "Parte con 6 iscritti"

-- 1. Nessuna prenotazione del cliente in un corso non aperto (qualunque strada usi)
create or replace function trg_prenotazioni_corso_aperto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_stato text;
begin
  if new.stato = 'confermata' and new.origine = 'cliente'
     and (tg_op = 'INSERT' or old.stato is distinct from 'confermata') then
    select c.iscrizioni_app into v_stato from lezioni l join corsi c on c.id = l.corso_id where l.id = new.lezione_id;
    if coalesce(v_stato, 'aperte') <> 'aperte' then raise exception 'corso_non_prenotabile'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_prenotazioni_corso_aperto on prenotazioni;
create trigger trg_prenotazioni_corso_aperto before insert or update of stato on prenotazioni
  for each row execute function trg_prenotazioni_corso_aperto();

-- 2. Le liste di lezioni prenotabili e per i recuperi non propongono i corsi non aperti
do $$
declare v text;
begin
  v := pg_get_functiondef('lezioni_prenotabili(uuid)'::regprocedure);
  if v not ilike '%iscrizioni_app%' then
    v := replace(v, 'and l.stato = ''programmata'' and l.prenotabile and l.inizio > now()',
                    'and l.stato = ''programmata'' and l.prenotabile and l.inizio > now() and co.iscrizioni_app = ''aperte''');
    execute v;
  end if;
  v := pg_get_functiondef('lezioni_per_recupero(uuid)'::regprocedure);
  if v not ilike '%iscrizioni_app%' then
    v := replace(v, 'and (l.prenotabile or co.recupero_per_tutti)',
                    'and (l.prenotabile or co.recupero_per_tutti) and co.iscrizioni_app = ''aperte''');
    execute v;
  end if;
  -- 3. niente richiesta di abbonamento con bonifico per un corso non aperto
  v := pg_get_functiondef('richiedi_abbonamento(uuid, uuid, uuid, uuid[], date)'::regprocedure);
  if v not ilike '%iscrizioni_app%' then
    v := replace(v, 'if not found then raise exception ''corso_non_disponibile''; end if;',
                    'if not found then raise exception ''corso_non_disponibile''; end if;
  if c.iscrizioni_app <> ''aperte'' then raise exception ''corso_non_aperto''; end if;');
    execute v;
  end if;
end $$;

-- 4. L'orario dell'app dice lo stato delle iscrizioni del corso
do $$
declare v text;
begin
  v := pg_get_functiondef('orario_area(date, uuid)'::regprocedure);
  if v not ilike '%iscrizioni_app%' then
    v := replace(v, '''prova'', c.prova_abilitata,',
                    '''prova'', c.prova_abilitata, ''iscrizioni'', c.iscrizioni_app, ''nota_iscrizioni'', c.nota_iscrizioni,');
    execute v;
  end if;
end $$;

-- 5. "Avvisami quando parte": il cliente si mette in lista per un corso in partenza
create or replace function avvisami_partenza(p_allievo uuid, p_corso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a allievi;
begin
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  if exists (select 1 from liste_attesa where corso_id = p_corso and allievo_id = p_allievo and stato = 'in_attesa' and lezione_id is null) then
    return;
  end if;
  insert into liste_attesa (palestra_id, tipo, corso_id, allievo_id, account_id, note)
  values (a.palestra_id, 'iscrizione', p_corso, a.id, a.account_id, 'dall''app: avvisami quando parte');
end $$;
revoke execute on function avvisami_partenza(uuid, uuid) from public, anon;
grant execute on function avvisami_partenza(uuid, uuid) to authenticated;

-- 6. Il corso parte: avvisa chi aspettava
create or replace function trg_corsi_partenza()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.iscrizioni_app = 'aperte' and old.iscrizioni_app = 'attesa' then
    for r in select la.id, la.account_id from liste_attesa la
              where la.corso_id = new.id and la.stato = 'in_attesa' and la.lezione_id is null loop
      begin
        perform accoda_push(r.account_id, new.nome || ' parte! 🎉',
          'Le iscrizioni sono aperte: scegli l''abbonamento e prenota il tuo posto.', '/area/acquista?corso=' || new.id, 'parte:' || r.id);
      exception when others then null; end;
      update liste_attesa set stato = 'avvisato', avvisato_at = now() where id = r.id;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_corsi_partenza on corsi;
create trigger trg_corsi_partenza after update of iscrizioni_app on corsi
  for each row execute function trg_corsi_partenza();
