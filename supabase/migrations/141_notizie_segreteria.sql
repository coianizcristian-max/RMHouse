-- =====================================================================
-- RMHouse — 141 PANNELLO "NOTIZIE" DELLA HOME (a destra, come in APP Palestre)
-- Le cose successe negli ultimi giorni e quelle che aspettano la segreteria, in una lista sola:
-- prenotazioni e disdette fatte dai clienti dall'app, prove prenotate, certificati caricati da verificare,
-- richieste dall'app da confermare. (Le notifiche dello staff — nuovi clienti, pagamenti online… — le aggiunge la pagina.)
-- Solo lettura, niente tabelle nuove. Si può eseguire più volte.
-- =====================================================================

create or replace function notizie_segreteria(p_palestra uuid, p_giorni int default 7)
returns table (tipo text, quando timestamptz, titolo text, testo text, url text, da_fare boolean, chiave text)
language plpgsql stable security definer set search_path = public as $$
declare v_da timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_giorni, 7), 60)));
begin
  if not is_staff(p_palestra) then raise exception 'non_autorizzato'; end if;
  return query
  -- prenotazioni fatte dal cliente (ingressi, recuperi, lezioni in più)
  select 'prenotazione'::text, p.created_at, trim(a.nome || ' ' || coalesce(a.cognome, '')),
         'Prenotazione: ' || c.nome || ' · ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM HH24:MI')
           || case when p.tipo = 'recupero' then ' (recupero)' else '' end,
         '/gestione/appello/' || l.id, false, 'p' || p.id
    from prenotazioni p join allievi a on a.id = p.allievo_id join lezioni l on l.id = p.lezione_id join corsi c on c.id = l.corso_id
   where p.palestra_id = p_palestra and p.origine = 'cliente' and p.created_at >= v_da
  union all
  -- disdette dal cliente
  select 'disdetta', x.created_at, trim(a.nome || ' ' || coalesce(a.cognome, '')),
         'Disdetta: ' || c.nome || ' · ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
         '/gestione/persone/' || a.id, false, 'd' || x.id
    from assenze_avvisate x join allievi a on a.id = x.allievo_id join lezioni l on l.id = x.lezione_id join corsi c on c.id = l.corso_id
   where x.palestra_id = p_palestra and coalesce(x.da, 'cliente') = 'cliente' and x.created_at >= v_da
  union all
  -- prove prenotate
  select 'prova', pr.created_at, trim(a.nome || ' ' || coalesce(a.cognome, '')),
         'Prova di ' || coalesce(c.nome, 'un corso')
           || coalesce(' · ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM HH24:MI'), '')
           || case when pr.origine is not null and pr.origine <> 'segreteria' then ' (dal sito)' else '' end,
         '/gestione/persone/' || a.id, false, 'v' || pr.id
    from prove pr join allievi a on a.id = pr.allievo_id left join corsi c on c.id = pr.corso_id left join lezioni l on l.id = pr.lezione_id
   where pr.palestra_id = p_palestra and pr.created_at >= v_da
  union all
  -- certificati caricati da verificare (finché non sono verificati, di qualunque giorno)
  select 'certificato', ce.caricato_at, trim(a.nome || ' ' || coalesce(a.cognome, '')),
         'Certificato medico caricato, da verificare' || coalesce(' · scade il ' || to_char(ce.scadenza, 'DD/MM/YYYY'), ''),
         '/gestione/certificati', true, 'c' || ce.id
    from certificati ce join allievi a on a.id = ce.allievo_id
   where ce.palestra_id = p_palestra and ce.stato = 'da_verificare'
  union all
  -- richieste dall'app da confermare
  select 'richiesta', r.created_at, trim(a.nome || ' ' || coalesce(a.cognome, '')),
         'Richiesta dall''app: ' || replace(coalesce(r.tipo, 'richiesta'), '_', ' ')
           || coalesce(' · ' || to_char(r.importo_cent / 100.0, 'FM999G990D00') || ' €', ''),
         '/gestione/richieste', true, 'r' || r.id
    from richieste_cliente r join allievi a on a.id = r.allievo_id
   where r.palestra_id = p_palestra and r.stato = 'da_confermare'
  order by 2 desc
  limit 150;
end $$;
revoke all on function notizie_segreteria(uuid, int) from public, anon;
grant execute on function notizie_segreteria(uuid, int) to authenticated;
