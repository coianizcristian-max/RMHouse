-- =====================================================================
-- RMHouse — 035 IMPOSTAZIONI, CERTIFICATO CON SCADENZA, RIEPILOGO DEL LUNEDÌ
--
-- 1. Il cliente che carica il certificato scrive anche la data di scadenza:
--    la segreteria la trova già compilata e approva con un tocco.
-- 2. Impostazioni della scuola in quattro gruppi (colonne jsonb della
--    palestra): funzioni attive, sconti suggeriti, area clienti, riepilogo.
-- 3. Riepilogo del lunedì: ogni lunedì alle 7 un'email con i numeri della
--    settimana a chi è indicato nelle impostazioni.
-- Da eseguire dopo la 034. Si può rieseguire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Certificato: la scadenza la scrive chi lo carica
-- ---------------------------------------------------------------------
drop function if exists registra_certificato(uuid, text, text);
create or replace function registra_certificato(p_token uuid, p_file text, p_nome_file text, p_scadenza date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; v_id uuid;
begin
  select * into a from allievi where token = p_token;
  if not found then raise exception 'link_non_valido'; end if;
  insert into certificati (palestra_id, allievo_id, file_path, nome_file, scadenza, stato)
  values (a.palestra_id, a.id, p_file, p_nome_file, p_scadenza, 'da_verificare')
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function registra_certificato(uuid, text, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Impostazioni
-- ---------------------------------------------------------------------
alter table palestre add column if not exists funzioni jsonb not null default '{}'::jsonb;      -- {"rate": false, …}
alter table palestre add column if not exists sconti jsonb not null default '{}'::jsonb;        -- percentuali suggerite
alter table palestre add column if not exists area_cliente jsonb not null default '{}'::jsonb;  -- benvenuto, avviso, colore
alter table palestre add column if not exists riepilogo jsonb not null default '{}'::jsonb;     -- attivo, destinatari

-- ---------------------------------------------------------------------
-- 3. Riepilogo del lunedì
-- ---------------------------------------------------------------------
create or replace function accoda_riepilogo_settimanale()
returns int language plpgsql security definer set search_path = public as $$
declare p palestre; k jsonb; v_corpo text; v_dest text; n int := 0; v_incassato int; v_lezioni int; v_sotto int;
begin
  for p in select * from palestre where coalesce((riepilogo ->> 'attivo')::boolean, false) loop
    k := cruscotto(p.id);
    select coalesce(sum(importo_cent), 0) into v_incassato from pagamenti
     where palestra_id = p.id and stato = 'pagato' and pagato_at >= now() - interval '7 days';
    select count(*), count(*) filter (where capienza > 0 and (iscritti + prove) * 100 < capienza * 30)
      into v_lezioni, v_sotto
      from v_occupazione where palestra_id = p.id and stato = 'programmata'
       and data between current_date - 7 and current_date - 1;

    v_corpo := 'Buongiorno,' || E'\n\n' || 'ecco com''è andata la settimana a ' || p.nome || '.' || E'\n\n'
      || '• Iscritti attivi: ' || (k ->> 'attivi') || E'\n'
      || '• Incassato negli ultimi 7 giorni: ' || replace(to_char(v_incassato / 100.0, 'FM99999990.00'), '.', ',') || ' €' || E'\n'
      || '• Nuovi iscritti nel mese: ' || (k ->> 'nuovi_mese') || E'\n'
      || '• Lezioni fatte: ' || v_lezioni || ' (sotto il 30% dei posti: ' || v_sotto || ')' || E'\n\n'
      || 'Da sistemare questa settimana:' || E'\n'
      || '• Abbonamenti da rinnovare nei prossimi 14 giorni: ' || (k -> 'da_rinnovare_14' ->> 'quanti')
      || ' (valgono ' || replace(to_char((k -> 'da_rinnovare_14' ->> 'valore')::int / 100.0, 'FM99999990.00'), '.', ',') || ' €)' || E'\n'
      || '• Non hanno rinnovato: ' || (k ->> 'no_rinnovo') || E'\n'
      || '• Certificati scaduti o mancanti: ' || (k ->> 'certificati_scaduti') || E'\n'
      || '• Iscritti senza giorni assegnati: ' || (k ->> 'senza_orari') || E'\n'
      || '• Quote annuali da pagare: ' || (k ->> 'quota_mancante') || E'\n\n'
      || 'Tutto il dettaglio: ' || coalesce(p.base_url, '') || '/gestione' || E'\n';

    for v_dest in select distinct lower(trim(x)) from jsonb_array_elements_text(coalesce(p.riepilogo -> 'destinatari', '[]'::jsonb)) x
                   where trim(x) like '%@%' loop
      insert into messaggi_coda (palestra_id, evento, canale, destinatario, oggetto, corpo, chiave, programmato_per)
      values (p.id, 'riepilogo_settimanale', 'email', v_dest,
              'La settimana di ' || p.nome || ' · ' || to_char(current_date, 'DD/MM'), v_corpo,
              'riepilogo:' || current_date || ':' || v_dest, now())
      on conflict (palestra_id, chiave) do nothing;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function accoda_riepilogo_settimanale() from public, anon, authenticated;

-- Ogni lunedì alle 5 UTC (le 7 in Italia d'estate, le 6 d'inverno)
do $$
begin
  perform cron.unschedule('rmhouse-riepilogo-lunedi');
exception when others then null;
end $$;
do $$
begin
  perform cron.schedule('rmhouse-riepilogo-lunedi', '0 5 * * 1', 'select public.accoda_riepilogo_settimanale();');
  raise notice 'Riepilogo del lunedì programmato.';
exception when others then
  raise notice 'pg_cron non disponibile: il riepilogo del lunedì non è programmato (%).', sqlerrm;
end $$;

-- Stato delle notifiche: chi dello staff riceve le email, quanti clienti hanno le notifiche sul telefono
create or replace function stato_notifiche(p_palestra uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'in_coda', (select count(*) from messaggi_coda where palestra_id = p_palestra and stato = 'in_coda'),
    'inviate_14', (select count(*) from messaggi_coda where palestra_id = p_palestra and stato = 'inviato'
                     and inviato_at >= now() - interval '14 days'),
    'errori_14', (select count(*) from messaggi_coda where palestra_id = p_palestra and stato = 'errore'
                    and created_at >= now() - interval '14 days'),
    'ultimi_errori', (select coalesce(jsonb_agg(jsonb_build_object('quando', created_at, 'a', destinatario,
                                    'oggetto', oggetto, 'errore', left(errore, 160)) order by created_at desc), '[]'::jsonb)
                        from (select * from messaggi_coda where palestra_id = p_palestra and stato = 'errore'
                                order by created_at desc limit 5) e),
    'clienti_con_email', (select count(*) from account where palestra_id = p_palestra and email is not null),
    'clienti_con_notifiche', (select count(distinct account_id) from push_iscrizioni where palestra_id = p_palestra and attiva),
    'push_in_errore', (select count(*) from push_iscrizioni where palestra_id = p_palestra and attiva and errori > 0)
  );
$$;
grant execute on function stato_notifiche(uuid) to authenticated;

select 'impostazioni pronte' as cosa, count(*) as funzioni from pg_proc where proname in ('accoda_riepilogo_settimanale', 'stato_notifiche', 'registra_certificato');
