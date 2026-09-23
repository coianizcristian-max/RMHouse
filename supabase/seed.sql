-- =====================================================================
-- RMHouse — SEED: dati iniziali di Ritmo Metropolitano
-- I corsi e gli orari qui sotto sono ESEMPI per provare il flusso:
-- vanno sostituiti con il palinsesto reale (da Table Editor o da CSV).
-- =====================================================================

insert into palestre (slug, nome, email, base_url, google_review_url, email_mittente, regime_fiscale)
values ('rmhouse', 'Ritmo Metropolitano', 'info@esempio.it',
        'https://TUO-SITO.vercel.app',          -- da aggiornare dopo il deploy
        'https://g.page/r/INSERIRE-LINK-RECENSIONE/review',
        'Ritmo Metropolitano <onboarding@resend.dev>',     -- da cambiare quando il dominio è verificato su Resend
        'forfettario')
on conflict (slug) do nothing;

do $$
declare
  p uuid := (select id from palestre where slug = 'rmhouse');
  f_kids uuid; f_teen uuid; f_adulti uuid;
  l_base uuid; l_inter uuid; l_avanz uuid;
  d_aerea uuid; d_pole uuid;
  s_1 uuid; s_2 uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid;
begin
  -- fasce d'età (modificabili)
  insert into fasce_eta (palestra_id, nome, eta_min, eta_max, adulti, ordine) values
    (p, 'Kids',   5, 11,  false, 1),
    (p, 'Teen',   12, 17, false, 2),
    (p, 'Adulti', 18, null, true, 3)
  on conflict (palestra_id, nome) do nothing;
  select id into f_kids   from fasce_eta where palestra_id = p and nome = 'Kids';
  select id into f_teen   from fasce_eta where palestra_id = p and nome = 'Teen';
  select id into f_adulti from fasce_eta where palestra_id = p and nome = 'Adulti';

  -- livelli
  insert into livelli (palestra_id, nome, descrizione, ordine) values
    (p, 'Base',       'Mai fatto o quasi: si parte da zero', 1),
    (p, 'Intermedio', 'Hai già qualche mese di esperienza',  2),
    (p, 'Avanzato',   'Pratichi con continuità da tempo',   3)
  on conflict (palestra_id, nome) do nothing;
  select id into l_base  from livelli where palestra_id = p and nome = 'Base';
  select id into l_inter from livelli where palestra_id = p and nome = 'Intermedio';
  select id into l_avanz from livelli where palestra_id = p and nome = 'Avanzato';

  -- discipline (ESEMPIO: completare con tutte quelle reali)
  insert into discipline (palestra_id, nome, ordine) values
    (p, 'Danza Aerea', 1), (p, 'Pole Dance', 2)
  on conflict (palestra_id, nome) do nothing;
  select id into d_aerea from discipline where palestra_id = p and nome = 'Danza Aerea';
  select id into d_pole  from discipline where palestra_id = p and nome = 'Pole Dance';

  -- sale (ESEMPIO)
  insert into sale (palestra_id, nome, capienza) values (p, 'Sala Aerea', 10), (p, 'Sala Pole', 12)
  on conflict (palestra_id, nome) do nothing;
  select id into s_1 from sale where palestra_id = p and nome = 'Sala Aerea';
  select id into s_2 from sale where palestra_id = p and nome = 'Sala Pole';

  -- corsi d'esempio
  if not exists (select 1 from corsi where palestra_id = p) then
    insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, info_prova, prezzo_prova_cent)
    values (p, d_aerea, f_kids, l_base, 'Danza Aerea Kids Base',
            'Porta leggings e maglietta aderente, niente gioielli. Arriva 10 minuti prima.', 0)
    returning id into c1;
    insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, info_prova, prezzo_prova_cent)
    values (p, d_aerea, f_adulti, l_base, 'Danza Aerea Adulti Base',
            'Abbigliamento aderente che copra gambe e braccia. Niente creme sul corpo.', 1000)
    returning id into c2;
    insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, info_prova, prezzo_prova_cent)
    values (p, d_pole, f_adulti, l_base, 'Pole Dance Base',
            'Shorts e top, niente creme o oli sulla pelle. Si pratica a piedi nudi.', 1500)
    returning id into c3;
    insert into corsi (palestra_id, disciplina_id, fascia_eta_id, livello_id, nome, info_prova, prezzo_prova_cent)
    values (p, d_pole, f_adulti, l_inter, 'Pole Dance Intermedio',
            'Shorts e top, niente creme o oli sulla pelle.', 1500)
    returning id into c4;

    -- orari settimanali (1=lun ... 7=dom): le lezioni si generano da sole
    insert into orari (palestra_id, corso_id, giorno_settimana, ora_inizio, durata_min, sala_id) values
      (p, c1, 3, '17:00', 60, s_1), (p, c1, 6, '10:00', 60, s_1),
      (p, c2, 1, '19:00', 75, s_1), (p, c2, 4, '19:00', 75, s_1),
      (p, c3, 2, '18:00', 60, s_2), (p, c3, 4, '18:00', 60, s_2),
      (p, c4, 2, '19:15', 75, s_2), (p, c4, 5, '19:15', 75, s_2);
  end if;

  -- tipi di abbonamento (ESEMPIO: da definire)
  if not exists (select 1 from tipi_abbonamento where palestra_id = p) then
    insert into tipi_abbonamento (palestra_id, nome, modalita, durata_mesi, lezioni_settimanali, prezzo_cent) values
      (p, 'Mensile 1 volta a settimana',     'orari_fissi', 1, 1, 5000),
      (p, 'Mensile 2 volte a settimana',     'orari_fissi', 1, 2, 7000),
      (p, 'Trimestrale 2 volte a settimana', 'orari_fissi', 3, 2, 19000);
    insert into tipi_abbonamento (palestra_id, nome, modalita, durata_mesi, num_ingressi, prezzo_cent, scadenza_fine_mese) values
      (p, 'Carnet 10 ingressi', 'ingressi', 3, 10, 12000, false);
  end if;

  -- testi dei messaggi (modificabili; segnaposto tra doppie graffe)
  insert into messaggi_template (palestra_id, evento, oggetto, corpo, giorni) values
  (p, 'prova_confermata', 'La tua lezione di prova di {{disciplina}} è confermata',
'Ciao {{nome_titolare}},

la lezione di prova di {{nome}} è confermata:

{{corso}}
{{giorno}} {{data}} alle {{ora}} — {{sala}}

Cosa sapere prima di venire:
{{info_prova}}

Se non puoi più venire, rispondi a questa email così liberiamo il posto.

A presto,
{{palestra}}', 0),

  (p, 'promemoria_prova', 'Domani la tua prova di {{disciplina}}',
'Ciao {{nome_titolare}},

ti ricordiamo che domani alle {{ora}} {{nome}} ha la lezione di prova di {{corso}}.

{{info_prova}}

Ti aspettiamo!
{{palestra}}', 1),

  (p, 'follow_up_prova', 'Com''è andata la prova di {{disciplina}}?',
'Ciao {{nome_titolare}},

grazie per aver provato {{corso}} con noi! Speriamo che a {{nome}} sia piaciuto.

Vuoi continuare? Puoi attivare subito l''abbonamento da qui:
{{link_abbonamento}}

Se ti sei trovato bene, una recensione ci aiuta tantissimo:
{{link_recensione}}

{{palestra}}', 0),

  (p, 'sondaggio_perso', 'Ci aiuti a migliorare?',
'Ciao {{nome_titolare}},

qualche giorno fa {{nome}} ha provato {{corso}}. Se hai deciso di non continuare, ci diresti cosa non ti ha convinto? Bastano 10 secondi:
{{link_feedback}}

Se invece vuoi iscriverti, trovi tutto qui:
{{link_abbonamento}}

Grazie,
{{palestra}}', 3),

  (p, 'scadenza_abbonamento', 'Il tuo abbonamento a {{corso}} scade il {{data}}',
'Ciao {{nome}},

il tuo abbonamento a {{corso}} scade il {{data}}. Rinnovalo per non perdere il tuo posto nel corso.

{{palestra}}', 5),

  (p, 'scadenza_certificato', 'Il certificato medico scade il {{data}}',
'Ciao {{nome}},

il certificato medico registrato scade il {{data}}. Ricordati di portarci quello nuovo per continuare ad allenarti.

{{palestra}}', 15),

  (p, 'compleanno', 'Buon compleanno {{nome}}!',
'Tanti auguri {{nome}}!

Tutto lo staff di {{palestra}} ti augura un compleanno fantastico.', 0)
  on conflict (palestra_id, evento, canale) do nothing;
end $$;
