-- =====================================================================
-- RMHouse — DATI DIMOSTRATIVI
-- Riempie il database con un palinsesto credibile, clienti, iscrizioni,
-- presenze passate, prove in vari stadi e statistiche già popolate.
-- Serve per far vedere il sistema funzionante prima di avere i dati veri.
--
-- Tutto ciò che crea è marcato: si cancella con demo_rimuovi.sql.
-- Le email finte non partono: i messaggi generati vengono annullati in fondo.
-- =====================================================================

do $$
declare
  p palestre;
  cat_danza uuid; cat_acro uuid; cat_ben uuid;
  f_kids uuid; f_ragazzi uuid; f_adulti uuid;
  l_base uuid; l_inter uuid; l_avanz uuid;
  s_grande uuid; s_aerea uuid;
  ins_giorgia uuid; ins_marco uuid; ins_elena uuid;
  d record; c record; lez record;
  v_disc uuid; v_corso uuid;
  v_acc uuid; v_all uuid; v_isc uuid; v_prova uuid;
  nomi_f text[] := array['Giulia','Sofia','Martina','Chiara','Alice','Sara','Anna','Elisa','Beatrice','Francesca','Noemi','Ilaria','Viola','Greta','Camilla'];
  nomi_m text[] := array['Luca','Matteo','Andrea','Davide','Simone','Filippo','Nicolò'];
  cognomi text[] := array['Rossi','Bianchi','Ferrari','Esposito','Romano','Colombo','Ricci','Marino','Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi'];
  i int; n int; v_nome text; v_cognome text; v_eta int;
  v_tipo uuid; v_tipo_tri uuid; v_tipo_men uuid;
begin
  select * into p from palestre where slug = 'rmhouse';
  if not found then raise exception 'Esegui prima seed.sql'; end if;

  -- ---------- palinsesto d'esempio ----------
  select id into cat_danza from categorie where palestra_id = p.id and nome = 'Danza';
  select id into cat_acro  from categorie where palestra_id = p.id and nome = 'Acrobatica';
  select id into cat_ben   from categorie where palestra_id = p.id and nome = 'Benessere';
  select id into f_kids    from fasce_eta where palestra_id = p.id and nome = 'Kids';
  select id into f_ragazzi from fasce_eta where palestra_id = p.id and nome = 'Ragazzi';
  select id into f_adulti  from fasce_eta where palestra_id = p.id and nome = 'Adulti';
  select id into l_base    from livelli where palestra_id = p.id and nome = 'Base';
  select id into l_inter   from livelli where palestra_id = p.id and nome = 'Intermedio';
  select id into l_avanz   from livelli where palestra_id = p.id and nome = 'Avanzato';

  insert into sale (palestra_id, nome, capienza) values (p.id, 'Sala Grande', 16), (p.id, 'Sala Specchi', 12)
  on conflict (palestra_id, nome) do nothing;
  select id into s_grande from sale where palestra_id = p.id and nome = 'Sala Grande';
  select id into s_aerea  from sale where palestra_id = p.id and nome = 'Sala Aerea';

  insert into staff (palestra_id, ruolo, nome, cognome, email) values
    (p.id, 'insegnante', 'Giorgia', 'Ferri', 'giorgia@esempio.it'),
    (p.id, 'insegnante', 'Marco', 'Villa', 'marco@esempio.it'),
    (p.id, 'insegnante', 'Elena', 'Sartori', 'elena@esempio.it');
  select id into ins_giorgia from staff where palestra_id = p.id and nome = 'Giorgia' limit 1;
  select id into ins_marco   from staff where palestra_id = p.id and nome = 'Marco' limit 1;
  select id into ins_elena   from staff where palestra_id = p.id and nome = 'Elena' limit 1;

  insert into discipline (palestra_id, nome, categoria_id, ordine) values
    (p.id, 'Danza Contemporanea', cat_danza, 3),
    (p.id, 'Danza Classica',      cat_danza, 4),
    (p.id, 'Hip Hop',             cat_danza, 5),
    (p.id, 'Tessuti Aerei',       cat_acro,  6),
    (p.id, 'Acrobatica',          cat_acro,  7),
    (p.id, 'Pilates',             cat_ben,   8),
    (p.id, 'Yoga',                cat_ben,   9)
  on conflict (palestra_id, nome) do nothing;

  -- corsi: solo per alcune discipline, altrimenti i corsi sono tanti e semivuoti
  for d in select id, nome, categoria_id from discipline where palestra_id = p.id order by ordine limit 3 loop
    -- adulti base
    insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, info_prova, prezzo_prova_cent, capienza)
    values (p.id, d.id, f_adulti, l_base, d.nome || ' Adulti Base',
            'Abbigliamento comodo e aderente. Arriva 10 minuti prima per l''accoglienza.',
            case when d.categoria_id = cat_acro then 1500 when d.categoria_id = cat_ben then 0 else 1000 end,
            case when d.categoria_id = cat_acro then 10 else 14 end)
    on conflict do nothing;
    -- adulti intermedio solo per danza e acrobatica
    if d.categoria_id in (cat_danza, cat_acro) then
      insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, info_prova, prezzo_prova_cent, capienza)
      values (p.id, d.id, f_adulti, l_inter, d.nome || ' Adulti Intermedio',
              'Serve già un po'' di pratica. Porta calzini antiscivolo.',
              case when d.categoria_id = cat_acro then 1500 else 1000 end, 12)
      on conflict do nothing;
    end if;
    -- kids e ragazzi solo per danza e acrobatica
    if d.categoria_id in (cat_danza, cat_acro) then
      insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, info_prova, prezzo_prova_cent, capienza)
      values (p.id, d.id, f_kids, l_base, d.nome || ' Kids', 'Capelli raccolti, niente gioielli, borraccia.', 0, 12)
      on conflict do nothing;
      insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, info_prova, prezzo_prova_cent, capienza)
      values (p.id, d.id, f_ragazzi, l_base, d.nome || ' Ragazzi', 'Capelli raccolti, abbigliamento aderente.', 0, 14)
      on conflict do nothing;
    end if;
  end loop;

  -- orari: due volte a settimana per corso, distribuiti nella settimana
  n := 0;
  for c in select id, nome, fascia_eta_id from corsi where palestra_id = p.id
           and not exists (select 1 from orari ox where ox.corso_id = corsi.id) order by nome loop
    n := n + 1;
    insert into orari (palestra_id, corso_id, giorno_settimana, ora_inizio, durata_min, sala_id, insegnante_id, valido_dal)
    values (p.id, c.id, 1 + (n % 5),
            case when c.fascia_eta_id = f_kids then time '17:00'
                 when c.fascia_eta_id = f_ragazzi then time '18:00'
                 else (time '19:00' + make_interval(mins => 30 * (n % 3))) end,
            60, case when n % 2 = 0 then s_grande else s_aerea end,
            case n % 3 when 0 then ins_giorgia when 1 then ins_marco else ins_elena end,
            current_date - 120);
    insert into orari (palestra_id, corso_id, giorno_settimana, ora_inizio, durata_min, sala_id, insegnante_id, valido_dal)
    values (p.id, c.id, 1 + ((n + 2) % 5),
            case when c.fascia_eta_id = f_kids then time '17:00'
                 when c.fascia_eta_id = f_ragazzi then time '18:00'
                 else (time '19:00' + make_interval(mins => 30 * (n % 3))) end,
            60, case when n % 2 = 0 then s_grande else s_aerea end,
            case n % 3 when 0 then ins_giorgia when 1 then ins_marco else ins_elena end,
            current_date - 120);
  end loop;

  -- lezioni: due mesi indietro e tre avanti
  perform genera_lezioni(p.id, current_date - 60, current_date + 90);

  -- abbonamenti
  select id into v_tipo_men from tipi_abbonamento where palestra_id = p.id and nome like 'Mensile 2%';
  select id into v_tipo_tri from tipi_abbonamento where palestra_id = p.id and nome like 'Trimestrale%';

  -- ---------- clienti ----------
  for i in 1..120 loop
    v_nome := case when i % 6 = 0 then nomi_m[1 + (i % array_length(nomi_m, 1))]
                   else nomi_f[1 + (i % array_length(nomi_f, 1))] end;
    v_cognome := cognomi[1 + (i % array_length(cognomi, 1))];
    v_eta := case when i % 3 = 0 then 7 + (i % 5) when i % 3 = 1 then 13 + (i % 4) else 20 + (i % 25) end;

    insert into account (palestra_id, nome, cognome, email, telefono, fonte, consenso_privacy_at, consenso_marketing, note)
    values (p.id, case when v_eta < 17 then nomi_f[1 + ((i + 3) % array_length(nomi_f, 1))] else v_nome end,
            v_cognome, 'demo' || i || '@esempio.it', '333 000 00' || lpad(i::text, 2, '0'),
            case i % 4 when 0 then 'instagram' when 1 then 'sito' when 2 then 'passaparola' else 'facebook' end,
            now(), i % 3 = 0, 'DEMO')
    returning id into v_acc;

    insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare,
                         certificato_scadenza)
    values (p.id, v_acc, v_nome, v_cognome,
            (current_date - make_interval(years => v_eta, days => (i * 11) % 360))::date,
            v_eta >= 17,
            case when i % 7 = 0 then null
                 when i % 9 = 0 then current_date + 12
                 else current_date + 120 + i end)
    returning id into v_all;

    -- corso coerente con l'età
    select t.id into v_corso from (
      select id from corsi
       where palestra_id = p.id
         and fascia_eta_id = (case when v_eta < 12 then f_kids when v_eta < 17 then f_ragazzi else f_adulti end)
    ) t order by md5(t.id::text || i::text) limit 1;

    if i <= 92 then
      -- storico: un abbonamento mensile di qualche mese fa, così i grafici hanno una storia
      if i % 3 = 0 then
        insert into iscrizioni (palestra_id, allievo_id, tipo_abbonamento_id, corso_id, data_inizio, stato)
        values (p.id, v_all, v_tipo_men, v_corso,
                (date_trunc('month', current_date) - interval '3 months')::date, 'scaduta');
      end if;

      -- abbonamento in corso, con gli orari del corso
      insert into iscrizioni (palestra_id, allievo_id, tipo_abbonamento_id, corso_id, data_inizio)
      values (p.id, v_all, v_tipo_tri, v_corso, date_trunc('month', current_date)::date)
      returning id into v_isc;
      insert into iscrizioni_orari (iscrizione_id, orario_id)
      select v_isc, o2.id from orari o2 where o2.corso_id = v_corso;

      insert into lead_eventi (palestra_id, allievo_id, corso_id, evento) values
        (p.id, v_all, v_corso, 'richiesta'), (p.id, v_all, v_corso, 'prova_prenotata'),
        (p.id, v_all, v_corso, 'prova_effettuata')
      on conflict do nothing;

      if i % 5 = 0 then
        insert into quote_iscrizione (palestra_id, allievo_id, stagione, importo_cent)
        values (p.id, v_all, stagione_di(current_date, p.mese_inizio_stagione), p.quota_iscrizione_cent)
        on conflict do nothing;
      end if;

      -- presenze delle lezioni passate (qualche assenza sparsa)
      for lez in select l.id, l.palestra_id from lezioni l
                 join iscrizioni_orari io on io.orario_id = l.orario_id and io.iscrizione_id = v_isc
                 where l.inizio < now() and l.data >= date_trunc('month', current_date)::date loop
        insert into presenze (palestra_id, lezione_id, allievo_id, presente)
        values (lez.palestra_id, lez.id, v_all, not (md5(lez.id::text || v_all::text) like 'a%'))
        on conflict do nothing;
      end loop;
    else
      -- lead in vari stadi: prova prenotata, fatta, persa
      select l.id into v_prova from lezioni l
       where l.corso_id = v_corso and l.stato = 'programmata'
         and l.inizio > case when i % 3 = 0 then now() else now() - interval '10 days' end
       order by l.inizio limit 1;

      if v_prova is not null then
        insert into prove (palestra_id, allievo_id, corso_id, lezione_id, prezzo_cent, stato)
        select p.id, v_all, v_corso, v_prova, c2.prezzo_prova_cent, 'confermata'
        from corsi c2 where c2.id = v_corso;

        -- diario del funnel, come lo scriverebbe il percorso pubblico
        insert into lead_eventi (palestra_id, allievo_id, corso_id, evento) values
          (p.id, v_all, v_corso, 'richiesta'), (p.id, v_all, v_corso, 'prova_prenotata')
        on conflict do nothing;
        update allievi set stato_lead = 'prova_prenotata' where id = v_all and stato_lead = 'nuovo';

        if i % 3 <> 0 then
          -- prova già passata: registriamo la presenza
          insert into presenze (palestra_id, lezione_id, allievo_id, presente)
          values (p.id, v_prova, v_all, i % 4 <> 0) on conflict do nothing;

          if i % 4 = 1 then
            -- si è iscritto dopo la prova
            insert into iscrizioni (palestra_id, allievo_id, tipo_abbonamento_id, corso_id, data_inizio)
            values (p.id, v_all, v_tipo_men, v_corso, current_date - 5) returning id into v_isc;
            insert into iscrizioni_orari (iscrizione_id, orario_id)
            select v_isc, o2.id from orari o2 where o2.corso_id = v_corso;
          elsif i % 4 = 2 then
            -- ha risposto al sondaggio
            perform registra_feedback((select token from prove where allievo_id = v_all limit 1),
                                      case when i % 8 = 2 then 'orari' else 'prezzo' end, null);
          end if;
        end if;
      end if;
    end if;
  end loop;

  -- costi: compensi orari, costo sala e spese fisse
  update staff set compenso_ora_cent = 2500 where palestra_id = p.id and ruolo = 'insegnante' and compenso_ora_cent is null;
  update sale set costo_ora_cent = 900 where palestra_id = p.id and costo_ora_cent is null;
  insert into fornitori (palestra_id, nome, categoria) values
    (p.id, 'Immobiliare Centro', 'affitto'), (p.id, 'Energia Più', 'utenze'), (p.id, 'Studio Grafico Nord', 'marketing')
  on conflict (palestra_id, nome) do nothing;
  insert into spese (palestra_id, descrizione, categoria, importo_cent, data, periodicita, fornitore_id)
  select p.id, 'Affitto locali', 'affitto', 190000, date_trunc('month', current_date)::date, 'mensile', f.id
  from fornitori f where f.palestra_id = p.id and f.nome = 'Immobiliare Centro'
  on conflict do nothing;
  insert into spese (palestra_id, descrizione, categoria, importo_cent, data, periodicita) values
    (p.id, 'Utenze (luce, acqua, riscaldamento)', 'utenze', 42000, date_trunc('month', current_date)::date, 'mensile'),
    (p.id, 'Assicurazione', 'assicurazioni', 96000, date_trunc('year', current_date)::date, 'annuale'),
    (p.id, 'Campagna social', 'marketing', 30000, date_trunc('month', current_date)::date, 'mensile'),
    (p.id, 'Gestionale e dominio', 'software', 4500, date_trunc('month', current_date)::date, 'mensile')
  on conflict do nothing;

  -- qualcuno in lista d'attesa
  insert into liste_attesa (palestra_id, tipo, corso_id, lezione_id, allievo_id, account_id)
  select p.id, 'iscrizione', c2.id, null, a.id, a.account_id
  from allievi a, corsi c2
  where a.palestra_id = p.id and c2.palestra_id = p.id
  order by md5(a.id::text) limit 3;

  -- qualche richiesta di affitto sala e una festa, per vedere la sezione spazi piena
  if to_regclass('public.prenotazioni_spazi') is not null then
    insert into prenotazioni_spazi (palestra_id, sala_id, tipo, titolo, contatto_nome, email, telefono,
                                    inizio, fine, stato, prezzo_cent, note)
    select p.id, s_grande, 'noleggio', 'Prove compagnia Aurora', 'Marta Fini', 'demo-spazi1@esempio.it', '333 1234567',
           (current_date + 3 + time '15:00') at time zone p.fuso_orario,
           (current_date + 3 + time '18:00') at time zone p.fuso_orario,
           'richiesta', 12000, 'Ci servirebbe anche l''impianto audio.'
    where not exists (select 1 from prenotazioni_spazi where palestra_id = p.id);

    insert into prenotazioni_spazi (palestra_id, sala_id, tipo, pacchetto_id, titolo, contatto_nome, email, telefono,
                                    inizio, fine, ospiti, stato, prezzo_cent, acconto_cent, incassato_cent)
    select p.id, s_aerea, 'evento', (select id from pacchetti_evento where palestra_id = p.id order by prezzo_cent limit 1),
           'Festa di compleanno di Emma', 'Silvia Conti', 'demo-spazi2@esempio.it', '333 7654321',
           (current_date + 9 + time '16:00') at time zone p.fuso_orario,
           (current_date + 9 + time '18:00') at time zone p.fuso_orario,
           18, 'confermata', 27400, 8220, 8220
    where not exists (select 1 from prenotazioni_spazi where palestra_id = p.id and tipo = 'evento');

    insert into prenotazioni_spazi (palestra_id, sala_id, tipo, titolo, contatto_nome, email, telefono,
                                    inizio, fine, stato, prezzo_cent)
    select p.id, s_grande, 'interno', 'Prove saggio di Natale', 'Interno', null, null,
           (current_date + 5 + time '20:30') at time zone p.fuso_orario,
           (current_date + 5 + time '22:00') at time zone p.fuso_orario,
           'confermata', 0
    where not exists (select 1 from prenotazioni_spazi where palestra_id = p.id and tipo = 'interno');
  end if;

  -- le email di questi clienti finti non devono partire
  update messaggi_coda m set stato = 'annullato'
   where m.palestra_id = p.id and m.stato = 'in_coda'
     and (m.account_id in (select id from account where palestra_id = p.id and note = 'DEMO')
          or m.destinatario like 'demo%@esempio.it' or m.evento like 'spazio%');

  raise notice 'Dati dimostrativi creati.';
end $$;

-- Riepilogo di ciò che è stato creato
select 'corsi' as cosa, count(*) from corsi
union all select 'orari', count(*) from orari
union all select 'lezioni', count(*) from lezioni
union all select 'clienti demo', count(*) from account where note = 'DEMO'
union all select 'iscrizioni', count(*) from iscrizioni
union all select 'presenze', count(*) from presenze
union all select 'prove', count(*) from prove
union all select 'prenotazioni spazi', count(*) from prenotazioni_spazi;
