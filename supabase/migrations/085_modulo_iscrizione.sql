-- 085 · Il modulo d'iscrizione 2026/2027 si firma dall'app
-- Il PDF "MODULO ISCRIZIONE 2627" diventa due moduli da firmare col dito:
--   1. "Iscrizione e tesseramento 2026/2027": domanda d'iscrizione, regolamento, certificato medico,
--      sicurezza e safeguarding. Sopra il testo compaiono i dati dell'iscritto (e del genitore) presi
--      dalla scheda, che restano "congelati" nella firma insieme a corso, data prova, data iscrizione, tessera.
--   2. "Privacy, comunicazioni e immagini": informativa privacy + tre scelte ACCONSENTO / NON ACCONSENTO
--      (promozioni, gruppo WhatsApp del corso, foto e video). Per i minorenni firmano entrambi i genitori,
--      oppure chi firma dichiara di farlo d'accordo con l'altro (o di essere l'unico).
-- Le scelte finiscono anche sulla scheda della persona (promozioni → consenso già usato da Campagne).
-- Rieseguibile. I tre moduli di partenza (Regolamento, Privacy foto e video, Consenso del genitore)
-- vengono spenti, non cancellati, la prima volta che si creano i nuovi.

-- 1. Moduli: scelte sì/no, secondo genitore, dati dell'iscritto
alter table moduli add column if not exists scelte jsonb not null default '[]'::jsonb;
alter table moduli add column if not exists secondo_genitore boolean not null default false;
alter table moduli add column if not exists con_dati boolean not null default false;

-- 2. Firme: risposte, dati congelati, seconda firma o dichiarazione
alter table firme add column if not exists risposte jsonb;
alter table firme add column if not exists dati jsonb;
alter table firme add column if not exists firma2_nome text;
alter table firme add column if not exists firma2_svg text;
alter table firme add column if not exists dichiarazione text;

-- 3. Consensi sulla persona (null = non ancora chiesto)
alter table allievi add column if not exists consenso_immagini boolean;
alter table allievi add column if not exists consenso_whatsapp boolean;

-- 4. Cambiare testo o scelte di un modulo crea una nuova versione (va firmato di nuovo)
create or replace function trg_moduli_versione()
returns trigger language plpgsql as $$
begin
  if new.testo is distinct from old.testo or new.scelte is distinct from old.scelte then
    new.versione := old.versione + 1;
    new.aggiornato_at := now();
  end if;
  return new;
end $$;

-- 5. I dati dell'iscritto come vanno sul modulo (li vede chi firma, e restano nella firma)
create or replace function dati_modulo(p_allievo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a allievi; acc account; v_ind text; v jsonb; v_manca text[] := '{}';
begin
  select * into a from allievi where id = p_allievo;
  if a.id is null then raise exception 'non_trovato'; end if;
  if not is_staff(a.palestra_id) and (a.account_id is null or a.account_id not in (select miei_account())) then
    raise exception 'non_autorizzato';
  end if;
  select * into acc from account where id = a.account_id;
  v_ind := coalesce(nullif(trim(a.indirizzo), ''),
                    nullif(trim(concat_ws(' ', acc.indirizzo, acc.cap, acc.citta,
                                          case when acc.provincia is not null then '(' || acc.provincia || ')' end)), ''));
  if a.data_nascita is null then v_manca := array_append(v_manca, 'data di nascita'); end if;
  if coalesce(a.luogo_nascita, '') = '' then v_manca := array_append(v_manca, 'luogo di nascita'); end if;
  if coalesce(a.codice_fiscale, '') = '' then v_manca := array_append(v_manca, 'codice fiscale'); end if;
  if v_ind is null then v_manca := array_append(v_manca, 'residenza'); end if;
  if coalesce(acc.telefono, '') = '' then v_manca := array_append(v_manca, 'cellulare'); end if;

  v := jsonb_build_object(
    'nome', trim(a.nome || ' ' || coalesce(a.cognome, '')),
    'nato_a', a.luogo_nascita,
    'nato_il', a.data_nascita,
    'residenza', v_ind,
    'cf', a.codice_fiscale,
    'cellulare', case when a.is_titolare then acc.telefono end,
    'email', case when a.is_titolare then acc.email end,
    'genitore', case when not a.is_titolare and acc.id is not null then jsonb_build_object(
                  'nome', trim(acc.nome || ' ' || coalesce(acc.cognome, '')), 'cellulare', acc.telefono,
                  'email', acc.email, 'cf', acc.codice_fiscale) end,
    'corsi', (select string_agg(distinct c.nome, ', ') from iscrizioni i join corsi c on c.id = i.corso_id
               where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa')
                 and (i.data_fine is null or i.data_fine >= current_date)),
    'data_prova', (select max(l.inizio)::date from prove pr join lezioni l on l.id = pr.lezione_id where pr.allievo_id = a.id),
    'data_iscrizione', (select min(i.data_inizio) from iscrizioni i where i.allievo_id = a.id and i.stato in ('attiva', 'sospesa')
                         and (i.data_fine is null or i.data_fine >= current_date)),
    'tessera', a.tessera,
    'manca', to_jsonb(v_manca));
  return v;
end $$;
revoke execute on function dati_modulo(uuid) from public, anon;
grant execute on function dati_modulo(uuid) to authenticated;

-- 6. La firma: ora con scelte, dati e secondo genitore
create or replace function firma_modulo(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; m moduli; v_id uuid; v_reception boolean; v_minore boolean; s jsonb;
  v_risp jsonb := '{}'::jsonb; v_svg2 text := nullif(p ->> 'firma2_svg', ''); v_dich text;
begin
  select * into a from allievi where id = (p ->> 'allievo_id')::uuid;
  select * into m from moduli where id = (p ->> 'modulo_id')::uuid and attivo;
  if a.id is null or m.id is null or m.palestra_id <> a.palestra_id then raise exception 'non_trovato'; end if;
  v_reception := is_staff(a.palestra_id);
  if not v_reception and (a.account_id is null or a.account_id not in (select miei_account())) then raise exception 'non_autorizzato'; end if;
  if coalesce(trim(p ->> 'firmatario'), '') = '' then raise exception 'nome_mancante'; end if;
  if coalesce(p ->> 'firma_svg', '') not like '<svg%' or length(p ->> 'firma_svg') > 200000
     or p ->> 'firma_svg' ~* '(<script|\son[a-z]+\s*=|javascript:|<foreignobject|href)' then raise exception 'firma_mancante'; end if;

  -- ogni scelta va risposta: sì (acconsento) o no (non acconsento)
  for s in select * from jsonb_array_elements(coalesce(m.scelte, '[]'::jsonb)) loop
    if jsonb_typeof(p -> 'risposte' -> (s ->> 'k')) <> 'boolean' or p -> 'risposte' -> (s ->> 'k') is null then
      raise exception 'scelte_mancanti';
    end if;
    v_risp := v_risp || jsonb_build_object(s ->> 'k', (p -> 'risposte' ->> (s ->> 'k'))::boolean);
  end loop;

  -- minorenni: la firma del secondo genitore, oppure la dichiarazione di chi firma
  v_minore := a.data_nascita is not null and a.data_nascita > current_date - interval '18 years';
  if m.secondo_genitore and v_minore then
    if v_svg2 is not null then
      if v_svg2 not like '<svg%' or length(v_svg2) > 200000
         or v_svg2 ~* '(<script|\son[a-z]+\s*=|javascript:|<foreignobject|href)' then raise exception 'firma2_mancante'; end if;
      if coalesce(trim(p ->> 'firma2_nome'), '') = '' then raise exception 'nome2_mancante'; end if;
    elsif coalesce((p ->> 'dichiarazione')::boolean, false) then
      v_dich := 'Chi firma dichiara di farlo anche con il consenso dell''altro esercente la responsabilità genitoriale, '
             || 'o di esserne l''unico titolare.';
    else
      raise exception 'secondo_genitore';
    end if;
  else
    v_svg2 := null;
  end if;

  insert into firme (palestra_id, modulo_id, versione, allievo_id, firmatario, firmatario_cf, per_conto, titolo, testo,
                     firma_svg, dove, raccolta_da, user_agent, risposte, dati, firma2_nome, firma2_svg, dichiarazione)
  values (a.palestra_id, m.id, m.versione, a.id, trim(p ->> 'firmatario'), nullif(upper(trim(p ->> 'firmatario_cf')), ''),
          coalesce((p ->> 'per_conto')::boolean, false), m.titolo, m.testo, p ->> 'firma_svg',
          case when v_reception then 'reception' else 'area' end, case when v_reception then auth.uid() end,
          left(p ->> 'user_agent', 300),
          case when v_risp = '{}'::jsonb then null else v_risp end,
          case when m.con_dati then dati_modulo(a.id) end,
          case when v_svg2 is not null then trim(p ->> 'firma2_nome') end, v_svg2, v_dich)
  returning id into v_id;

  -- le scelte vanno anche sulla scheda
  if v_risp ? 'immagini' then update allievi set consenso_immagini = (v_risp ->> 'immagini')::boolean where id = a.id; end if;
  if v_risp ? 'whatsapp' then update allievi set consenso_whatsapp = (v_risp ->> 'whatsapp')::boolean where id = a.id; end if;
  if v_risp ? 'promozioni' and a.account_id is not null then
    update account set consenso_marketing = (v_risp ->> 'promozioni')::boolean, consenso_chiesto_at = now() where id = a.account_id;
  end if;
  return v_id;
end $$;
revoke execute on function firma_modulo(jsonb) from public, anon;
grant execute on function firma_modulo(jsonb) to authenticated;

-- 7. I due moduli veri (una volta sola per scuola)
do $$
declare pal record;
begin
  for pal in select id from palestre loop
    if not exists (select 1 from moduli where palestra_id = pal.id and titolo = 'Iscrizione e tesseramento 2026/2027') then
      update moduli set attivo = false
       where palestra_id = pal.id and titolo in ('Regolamento della scuola', 'Privacy, foto e video', 'Consenso del genitore per il minore');

      insert into moduli (palestra_id, titolo, per_chi, obbligatorio, ordine, attivo, con_dati, secondo_genitore, scelte, testo)
      values (pal.id, 'Iscrizione e tesseramento 2026/2027', 'tutti', true, 1, true, true, false, '[]'::jsonb,
$t$DOMANDA DI ISCRIZIONE ALLE ATTIVITÀ SPORTIVE DILETTANTISTICHE E RICHIESTA DI TESSERAMENTO – STAGIONE SPORTIVA 2026/2027
Ritmo Metropolitano S.S.D. a R.L. · sede legale Via Artigianato 24, 36100 Vicenza · P.IVA 03983880240

Il/la sottoscritto/a chiede l'iscrizione alle attività sportive dilettantistiche organizzate da Ritmo Metropolitano S.S.D. a R.L. e richiede, ove previsto, il tesseramento tramite la Società presso l'Ente di Promozione Sportiva ASI, ai fini sportivi, assicurativi e regolamentari. Si impegna a corrispondere nei termini previsti le quote/corrispettivi relativi alle attività prescelte e dichiara di aver preso visione e di accettare il Regolamento di Ritmo Metropolitano S.S.D. a R.L., disponibile presso la sede e/o attraverso i canali messi a disposizione dalla Società. Il partecipante si impegna inoltre a rispettare le disposizioni organizzative, di comportamento e di sicurezza impartite dalla Società e dagli istruttori.

CERTIFICAZIONE MEDICA E CONDIZIONI DI SALUTE
Il partecipante si impegna a consegnare la certificazione medica in corso di validità attestante l'idoneità alla pratica sportiva non agonistica o agonistica, secondo l'attività svolta. In assenza o alla scadenza della certificazione richiesta, la Società potrà sospendere la partecipazione alle attività fino alla regolarizzazione. Il partecipante dichiara di non essere a conoscenza di condizioni incompatibili con l'attività prescelta e si impegna a segnalare tempestivamente eventuali limitazioni o circostanze rilevanti ai fini dello svolgimento dell'attività in sicurezza. La presente dichiarazione non sostituisce la certificazione medica quando prevista dalla normativa vigente.

SICUREZZA E CONSAPEVOLEZZA DEI RISCHI
Il partecipante dichiara di essere consapevole che le attività sportive e motorie, e in particolare quelle acrobatiche, aeree, con attrezzi, sospensioni o esercizi in elevazione, comportano rischi intrinseci, anche quando svolte nel rispetto delle procedure di sicurezza.
Si impegna pertanto a: seguire le indicazioni degli istruttori; utilizzare correttamente attrezzature e dispositivi; non eseguire esercizi, figure o utilizzi degli attrezzi non autorizzati; rispettare il proprio livello tecnico e le progressioni indicate dall'istruttore; comunicare tempestivamente malesseri, difficoltà o condizioni che possano compromettere la sicurezza propria o altrui. Le modalità di utilizzo delle attrezzature e le procedure di sicurezza saranno illustrate dagli istruttori in relazione alla disciplina e al livello praticato. Ritmo Metropolitano S.S.D. a R.L. non risponde, nei limiti consentiti dalla legge, dei danni derivanti da comportamenti imprudenti del partecipante, inosservanza delle istruzioni ricevute, utilizzo improprio o non autorizzato delle attrezzature o circostanze non imputabili alla Società. Restano ferme le responsabilità previste dalla normativa vigente.

REGOLAMENTO – SAFEGUARDING
Il sottoscritto dichiara di essere stato informato della disponibilità del Regolamento interno, del Modello Organizzativo e di Controllo e del Codice di Condotta per la tutela dei minori e la prevenzione di abusi, violenze e discriminazioni, nonché della presenza del Responsabile Safeguarding della Società. La tutela contro abusi, violenze e discriminazioni, in particolare nei confronti dei minori, rientra negli obblighi oggi previsti per il settore sportivo dilettantistico.

Firma per iscrizione, regolamento, certificazione e sicurezza (se minorenne: firma dell'esercente la responsabilità genitoriale).$t$);

      insert into moduli (palestra_id, titolo, per_chi, obbligatorio, ordine, attivo, con_dati, secondo_genitore, scelte, testo)
      values (pal.id, 'Privacy, comunicazioni e immagini', 'tutti', true, 2, true, false, true,
$j$[
 {"k": "promozioni", "titolo": "Comunicazioni promozionali",
  "testo": "Autorizzo Ritmo Metropolitano S.S.D. a R.L. a utilizzare i miei dati di contatto per inviarmi informazioni relative a nuovi corsi, eventi, workshop, spettacoli, iniziative e promozioni tramite e-mail, SMS, telefono e/o WhatsApp. Le comunicazioni strettamente organizzative sul corso frequentato restano invece già comprese nelle finalità necessarie indicate nella privacy."},
 {"k": "whatsapp", "titolo": "Gruppo WhatsApp del corso",
  "testo": "Per esigenze organizzative la Società può utilizzare gruppi WhatsApp riservati agli iscritti al corso. L'interessato prende atto che, con l'inserimento nel gruppo, il proprio nome e numero di telefono potranno essere visibili agli altri partecipanti."},
 {"k": "immagini", "titolo": "Foto, video e immagini",
  "testo": "Durante lezioni, corsi, eventi, saggi, spettacoli, competizioni, workshop e altre attività della Società potranno essere realizzate fotografie e registrazioni audio/video. Il materiale autorizzato potrà essere utilizzato a titolo gratuito per documentare e comunicare le attività di Ritmo Metropolitano, attraverso sito internet, social network ufficiali, newsletter, brochure, locandine, materiale informativo, pubblicitario e promozionale, stampa e presentazioni della Società. Le immagini potranno essere adattate, montate o inserite in contenuti grafici e audiovisivi, nel rispetto della dignità e della reputazione della persona rappresentata. L'interessato prende atto che la pubblicazione online e sui social può comportare la visualizzazione, condivisione o acquisizione del materiale da parte di terzi al di fuori del controllo della Società. Il consenso è facoltativo e revocabile per il futuro. La revoca non pregiudica la liceità delle pubblicazioni effettuate precedentemente."}
]$j$::jsonb,
$t$INFORMATIVA PRIVACY – REG. UE 2016/679 (GDPR)
Ritmo Metropolitano S.S.D. a R.L., Via Artigianato 24, 36100 Vicenza, P. IVA 03983880240, è Titolare del trattamento dei dati personali. I dati anagrafici, fiscali e di contatto, i dati relativi all'iscrizione, al tesseramento, ai pagamenti e alla certificazione di idoneità sportiva sono trattati per:
• gestione dell'iscrizione e delle attività sportive;
• tesseramento e copertura assicurativa;
• gestione amministrativa, contabile e fiscale;
• comunicazioni organizzative relative a corsi, orari, variazioni ed eventi;
• adempimento degli obblighi di legge e sportivi;
• tutela della salute, della sicurezza e dei diritti della Società.

Il trattamento avviene sulla base dell'esecuzione del rapporto con l'interessato, degli obblighi di legge e delle ulteriori basi giuridiche previste dal GDPR. I dati relativi alla salute saranno trattati esclusivamente quando necessario e nei limiti consentiti dalla normativa. I dati potranno essere comunicati, per quanto necessario, all'Ente di Promozione Sportiva di affiliazione, assicurazioni, consulenti, fornitori di servizi gestionali e informatici, istituti di pagamento e soggetti pubblici nei casi previsti dalla legge. I dati saranno conservati per il periodo necessario alla gestione del rapporto e successivamente secondo i termini previsti dagli obblighi civilistici, fiscali, amministrativi e sportivi applicabili. I dati non saranno diffusi, salvo specifica autorizzazione o altra idonea base giuridica. L'interessato può esercitare i diritti previsti dagli artt. 15-22 GDPR, tra cui accesso, rettifica, cancellazione, limitazione, opposizione e, ove applicabile, portabilità, nonché revocare i consensi prestati e proporre reclamo al Garante per la Protezione dei Dati Personali. Per l'esercizio dei diritti privacy e per la revoca dei consensi è possibile contattare Ritmo Metropolitano S.S.D. a R.L. all'indirizzo e-mail info@ritmometropolitano.com

Firma per privacy, comunicazioni e autorizzazione immagine. Per i minorenni: firma di entrambi gli esercenti la responsabilità genitoriale.$t$);
    end if;
  end loop;
end $$;
