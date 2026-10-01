# RM House — GDPR e sicurezza: cosa fare fuori dal codice

Il codice (pacchetto 070) mette a posto il sito. Queste cose invece si fanno a mano, una volta sola.
Spunta man mano. Le voci con ⚠️ sono le più importanti.

## 1. Dati della scuola (5 minuti, in segreteria)
- [ ] ⚠️ Impostazioni → compila **email**, **indirizzo**, **telefono** e **dati fiscali** (ragione sociale, P.IVA/CF, sede legale): finiscono nell'informativa privacy, nel piè di pagina e in security.txt.
- [ ] Fai rileggere **/privacy** e **/cookie** a chi vi segue (commercialista/consulente privacy), in particolare i **tempi di conservazione** (li ho proposti io: 2 anni dopo la fine del rapporto, 10 anni le ricevute, certificato fino a scadenza + 1 anno, richieste di prova 24 mesi) e la base giuridica del **certificato medico**. Se cambiano, dimmelo e aggiorno il testo.

## 2. Supabase
- [ ] ⚠️ **Regione**: Project Settings → General → Region. Deve essere in Europa (ideale `eu-central-1`, Francoforte, vicino a Vercel `fra1`). L'informativa dice "server nell'Unione Europea": se non è così, dimmelo.
- [ ] ⚠️ **Chiavi JWT asimmetriche**: Project Settings → JWT Keys → passa alle "JWT Signing Keys" (asimmetriche). Così il sito controlla l'accesso senza chiamare Supabase a ogni pagina: meno CPU su Vercel e pagine più veloci. Le chiavi vecchie restano valide finché non le revochi: nessuno viene buttato fuori.
- [ ] **Authentication → Providers → Email**: attiva "Leaked password protection" (blocca le password già rubate in rete) e lunghezza minima almeno 10 caratteri.
- [ ] **Account Supabase**: attiva l'autenticazione a due fattori (2FA) per chi entra nel pannello.
- [ ] **Backup**: con il piano a pagamento i backup sono giornalieri; con il gratuito no → valuta il piano Pro, oppure fai un'esportazione periodica.
- [ ] **DPA** (accordo sul trattamento dei dati): Supabase lo rende disponibile dal pannello (Organization → Legal/Documents). Scaricalo e conservalo.

## 3. Vercel e GitHub
- [ ] Attiva la 2FA sugli account Vercel e GitHub.
- [ ] Vercel → Settings → Functions: regione `fra1` (già impostata da vercel.json) e "Fluid compute" attivo.
- [ ] Il repository GitHub deve restare **privato**.
- [ ] Conserva il DPA di Vercel (è nei termini, scaricabile da vercel.com/legal).

## 4. Email (Resend) e pagamenti (Stripe)
- [ ] Quando imposti Resend per RM House: dominio verificato (SPF/DKIM) e DPA di Resend.
- [ ] Stripe: DPA accettato con i termini; verifica che l'account sia intestato alla scuola.

## 5. In segreteria (obblighi del GDPR)
- [ ] ⚠️ **Registro dei trattamenti** (art. 30): un documento con cosa trattate, perché, per quanto, chi ci accede, quali fornitori. Te ne preparo una bozza quando vuoi.
- [ ] ⚠️ **Autorizzati al trattamento**: una lettera per chi lavora con i dati (segreteria, insegnanti) con le istruzioni (non condividere le password, non scaricare dati su dispositivi personali, uscire dall'app sui computer condivisi).
- [ ] **Profili**: ognuno entra con il suo utente (mai account condivisi). Gli insegnanti con ruolo "insegnante": vedono solo appelli e lezioni.
- [ ] **Richieste dei clienti** (accesso, cancellazione…): arrivano in "Da fare oggi"; rispondere entro **30 giorni**. La copia dei dati si scarica dalla scheda persona (Privacy → Scarica i suoi dati), la cancellazione la fa un amministratore (Privacy → Cancella i dati).
- [ ] **Violazione dei dati** (data breach: account rubato, dati finiti a chi non doveva): annotarla e, se c'è rischio per le persone, comunicarla al Garante **entro 72 ore** dal sito garanteprivacy.it.
- [ ] **Minori**: consensi (privacy, foto/video) firmati dal genitore — già nei Moduli dell'app.
- [ ] **Computer della segreteria**: password all'avvio, blocco schermo automatico, sistema e browser aggiornati.

## 6. Da ricordare per il futuro
- Se un giorno aggiungete statistiche (Google Analytics, PostHog, Meta Pixel…) o video incorporati (YouTube, mappe di Google), **serve il banner dei cookie** con il consenso prima di caricarli: avvisami prima di metterli.
- L'invito all'app per i 450 tesserati partirà solo con le email impostate su Resend e con l'informativa compilata.
