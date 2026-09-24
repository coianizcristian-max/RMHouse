# RMHouse

Gestionale per scuole di danza e sport: percorso del nuovo cliente (lead → prova → iscrizione),
appello, messaggi automatici e statistiche. Primo cliente: **Ritmo Metropolitano — acrobatic and dance center**
(slug `rmhouse`, che resta anche il nome del progetto e del repo).

Marchio: logo in `public/logo.png`, rosso `#f40000`, nero e bianco. I colori stanno tutti in `app/globals.css`
sotto `:root`, quindi si cambiano da lì.

Stack: Next.js 15 (App Router) · Supabase (Postgres, Auth, RLS, pg_cron) · Resend (email) · Vercel.
I pagamenti online (Stripe) e la fatturazione elettronica arrivano **dopo**, quando tutto il resto gira:
la struttura per agganciarli c'è già. Vedi `docs/ARCHITETTURA.md`.

---

## Installazione (prima volta)

### 1. Database su Supabase
1. Crea un nuovo progetto Supabase. **Regione: Europa (Frankfurt)**, per il GDPR.
2. Apri **SQL Editor** ed esegui in quest'ordine il contenuto di:
   1. `supabase/migrations/001_schema.sql`
   2. `supabase/migrations/002_logica.sql`
   3. `supabase/seed.sql` (fasce d'età, livelli, corsi d'esempio, testi dei messaggi)
   4. `supabase/migrations/004_regole.sql` (recuperi, liste d'attesa, blocco certificato, quota annuale, sospensioni)
   5. `supabase/migrations/005_categorie.sql` (categorie, fasce d'età reali, certificato caricato dal cliente)
   6. `supabase/migrations/006_gestione.sql` (funzioni di segreteria e ultimi permessi)
   7. `supabase/migrations/007_costi_statistiche.sql` (costi, fornitori, calendario e statistiche)
   8. `supabase/migrations/008_spazi.sql` (affitto sale, feste ed eventi)
   9. `supabase/migrations/009_sedi_bacheca.sql` (sedi, foto e colori, bacheca, eventi, note)
   10. `supabase/migrations/010_calendario.sql` (azioni rapide sulla lezione, pannello del giorno)
   11. `supabase/migrations/011_prenotati.sql` (gestione dei prenotati e messaggi alla lezione)
   12. `supabase/migrations/012_palinsesto.sql` (nomi di sala e insegnante nel palinsesto)
   13. `supabase/migrations/013_anagrafiche.sql` (sede completa, staff con foto e colore, sale, foto allievi, pagina pubblica dei corsi)
   14. `supabase/migrations/014_area_cliente.sql` (area del cliente: accesso, lezioni, recuperi, certificato)
   15. `supabase/migrations/015_colori.sql` (colore per disciplina e gradazioni automatiche dei corsi)
   16. `supabase/migrations/016_registrazioni.sql` (registrare persone, incassi e liste d'attesa dal banco)
   17. `supabase/migrations/017_postazioni_calendario.sql` (posti numerati, calendario degli insegnanti, eventi dall'area cliente, filtro per sede)
   18. `supabase/migrations/018_lead.sql` (gestione dei lead: contatti, esiti, promemoria)
   19. `supabase/migrations/019_push_materiali.sql` (notifiche push, materiali della lezione, lezione singola)
   20. `supabase/migrations/020_pulizia.sql` (toglie la vecchia invia_bacheca doppia)
   21. `supabase/migrations/021_spazi_segreteria.sql` (prenotazione sale dal banco, verifica immediata, niente email)
   22. `supabase/migrations/022_attese.sql` (liste d'attesa: posizione, avvisi, esito)
   23. `supabase/migrations/023_rinnovi_promo.sql` (rinnovi in blocco, promozioni, esportazione contabile)
   24. `supabase/migrations/024_banca_compensi.sql` (movimenti bancari, riconciliazione, cedolini, flusso di cassa)
   25. `supabase/migrations/025_ricevute.sql` (ricevute non fiscali con IVA a zero)
   26. `supabase/migrations/026_fatture.sql` (registro fatture elettroniche e catena fattura → spesa → banca)
3. In **Table Editor → palestre** aggiorna la riga `rmhouse`: `email`, `google_review_url` e, dopo il deploy, `base_url`.

### 2. Il tuo utente amministratore
1. **Authentication → Users → Add user**: inserisci la tua email e una password (spunta *Auto confirm*).
2. Nell'SQL Editor, sostituendo l'email:
```sql
insert into staff (palestra_id, user_id, ruolo, nome)
select p.id, u.id, 'admin', 'Cristian'
from palestre p, auth.users u
where p.slug = 'rmhouse' and u.email = 'TUA@EMAIL.it';
```
Per segreteria e insegnanti fai lo stesso con `ruolo` = `segreteria` o `insegnante`.

### 3. In locale (D:\SITO\RMHouse)
1. Copia i file del progetto nella cartella del repo.
2. Copia `.env.example` in `.env.local` e compila i valori (Supabase → Project Settings → API).
3. Esegui:
```bash
npm install
npm run dev
```
4. Apri http://localhost:3000/prova (percorso pubblico) e http://localhost:3000/login (area staff).

### 4. GitHub e Vercel
1. `git add . && git commit -m "Fase 1: fondamenta" && git push`
   Il repo è pubblico: `.env.local` è escluso da `.gitignore`, **non togliere mai quella riga**.
2. Su Vercel: *Add New → Project → importa `RMHouse`*.
3. In **Settings → Environment Variables** inserisci le stesse variabili di `.env.local`.
4. Dopo il deploy, metti l'indirizzo del sito nel campo `base_url` della tabella `palestre`.

### 5. Email (Resend)
1. Su resend.com crea una API key e mettila in `RESEND_API_KEY`.
2. Finché non verifichi un dominio, Resend invia **solo al tuo indirizzo** (va bene per i test).
   Per andare live: *Domains → Add domain* (es. rmhouse.it), aggiungi i record DNS, poi aggiorna
   `email_mittente` in `palestre` (es. `RM House <info@rmhouse.it>`).

### 6. Automatismi (cron)
1. Supabase → **Database → Extensions**: attiva `pg_cron` e `pg_net`.
2. Apri `supabase/migrations/003_cron.sql`, sostituisci l'indirizzo del sito e il `CRON_SECRET`, eseguilo.

Da quel momento:
- ogni 5 minuti partono le email in coda (conferme, promemoria, follow-up);
- ogni notte si generano le lezioni dei prossimi 90 giorni e si accodano scadenze, compleanni e sondaggi.

---

## Vuoi vedere subito il sistema pieno?
Esegui `supabase/demo.sql` nell'SQL Editor: crea un palinsesto credibile (7 discipline, 33 corsi con orari),
34 clienti, iscrizioni, presenze, prove in vari stadi e statistiche già popolate. Le email di quei clienti finti
non partono, sono annullate in partenza. Quando arrivano i dati veri, `supabase/demo_rimuovi.sql` cancella
tutto ciò che ha creato (il palinsesto resta, così puoi correggerlo invece di riscriverlo).

## Prima configurazione (dopo il primo accesso)
Tutto si fa dall'app, in questo ordine:
1. **Impostazioni → Palinsesto**: categorie (danza, acrobatica, benessere), discipline, livelli, fasce d'età, sale, insegnanti.
2. **Corsi → Nuovo corso**: un corso per ogni combinazione disciplina + fascia + livello, con prezzo della prova e cosa portare.
   Dentro ogni corso aggiungi gli **orari settimanali**: le lezioni dei tre mesi successivi si creano da sole.
3. **Impostazioni → Abbonamenti e regole**: tipi di abbonamento, quanti recuperi e dove si possono fare, quota annuale.
4. **Impostazioni → Palinsesto → Chiusure**: ferie e festività.
5. **Altro → Messaggi automatici**: controlla i testi di conferme, promemoria e scadenze, con anteprima e invio di prova a te stesso.
6. Prova il percorso da `/prova` come se fossi un cliente.

### Perché i margini escano giusti
In **Altro → Costi** vanno messi il compenso orario degli insegnanti, il costo orario delle sale
(affitto mensile diviso le ore in cui la sala è davvero usata) e le spese fisse con la loro periodicità.
Senza questi dati le statistiche mostrano i ricavi ma non il margine.

### Hai già i dati in un altro gestionale?
**Altro → Importa da CSV**: carichi il file esportato, abbini le colonne (le indovina già da solo), vedi l'anteprima
e importi fino a 500 righe per volta. Se il file contiene anche corso e abbonamento, crea pure le iscrizioni
con tutti gli orari di quel corso. Le righe con problemi vengono elencate una per una, senza bloccare le altre.

## Uso quotidiano

| Cosa | Dove |
|---|---|
| Link per ads e landing | `https://SITO/prova?utm_source=instagram&utm_campaign=NOME` |
| Link per l'affitto delle sale | `https://SITO/spazi` |
| Pagina pubblica di un corso (per le ads) | `https://SITO/corsi/<slug>` — il link è nella scheda del corso |
| Area dei clienti | `https://SITO/area` — si entra con l'email registrata in segreteria |
| Palinsesto (categorie, discipline, livelli, fasce, sale, insegnanti, chiusure) | `/gestione/palinsesto` |
| Corsi e orari settimanali | `/gestione/corsi` |
| Iscrivere una persona a un corso | `/gestione/persone` → scheda → Nuova iscrizione |
| Sospensioni (infortunio, gravidanza) | Scheda persona → iscrizione → Sospendi (la scadenza si sposta da sola) |
| Prenotare un recupero | Scheda persona → Recuperi |
| Abbonamenti, recuperi ammessi, quota annuale | `/gestione/abbonamenti` |
| Liste d'attesa | `/gestione/attese` |
| Testi dei messaggi automatici | `/gestione/messaggi` (con anteprima e invio di prova) |
| Importare anagrafiche e iscrizioni | `/gestione/importa` |
| Appello e prenotati | `/gestione` → tocca una lezione (aggiungi, togli, scrivi al gruppo, esporta) |
| Lead da seguire | `/gestione/lead` |
| Chi è iscritto a un corso | `/gestione/corsi` → apri il corso (con esportazione CSV) |
| Certificati caricati dai clienti | `/gestione/certificati` |
| Settimana a colpo d'occhio | `/gestione/calendario` |
| Statistiche e margini | `/gestione/statistiche` |
| Affitti, fornitori, compensi orari | `/gestione/costi` |
| Avvisi e novità per gli iscritti | `/gestione/bacheca` |
| Open day, saggi, stage, campus | `/gestione/eventi` |
| Richieste di affitto sala e feste | `/gestione/spazi` |
| Listino orario e pacchetti feste | `/gestione/spazi/listino` |

## Test rapido del flusso
1. `/prova` → "Un bambino o ragazzo", data di nascita di 8 anni → vedi solo le categorie con corsi Kids.
2. Prenota un orario: arriva l'email di conferma (se il cron è attivo) e in `messaggi_coda` c'è il promemoria.
3. `/gestione` → apri la lezione: la persona compare evidenziata come "In prova".
4. Segna "Sì": lo stato del lead diventa "Prova fatta" e si accoda il follow-up.

## Com'è organizzata l'area di gestione
Cinque aree, ognuna con il suo sottomenù. Su desktop le aree stanno nella colonna a sinistra, su telefono
nella barra in basso; le voci dell'area diventano chip scorrevoli sotto l'intestazione.

| Area | Voci |
|---|---|
| **Oggi** | Riepilogo · Agenda del giorno · Lead · Liste d'attesa |
| **Calendari** | Palinsesto (schede) · Agenda settimanale (griglia oraria) · Sale e affitti · Eventi |
| **Struttura** | Corsi · Staff · Sale · Categorie e livelli · Bacheca · Sede e contatti |
| **Persone** | Anagrafiche e recuperi · Registra una persona · Rinnovi in scadenza · Certificati · Importa da CSV |
| **Conti** | Statistiche e margini · Incassi · Ricevute · Fatture · Banca e cassa · Compensi insegnanti · Costi e fornitori · Abbonamenti, recuperi e sconti · Messaggi automatici · Promozioni |

## Sul telefono
L'app è pensata prima per il telefono: barra di navigazione in basso, raggiungibile col pollice, elenchi compatti,
pulsanti alti almeno 44 px. Su desktop la stessa barra torna in alto.

Si installa come app: su Android, Chrome → menu → "Installa app"; su iPhone, Safari → Condividi → "Aggiungi a Home".
Compare l'icona RM House e si apre a schermo intero, senza barra del browser. Comodo per gli insegnanti in sala.

## Struttura
```
app/
  prova/          percorso pubblico della lezione di prova
  feedback/       "cosa non ti ha convinto" (link nell'email)
  abbonamento/    acquisto abbonamento (fase 3, per ora pagina informativa)
  login/          accesso staff
  certificato/    caricamento del certificato dal link personale
  spazi/          richiesta pubblica di affitto sala o festa
  gestione/       agenda di oggi, appello, calendario settimanale, corsi e orari,
                  persone e iscrizioni, lead, certificati, liste d'attesa, abbonamenti,
                  palinsesto, messaggi, importa, costi, spazi, statistiche
  api/            prova (catalogo, slot, prenota), feedback, cron
lib/              client Supabase, formattazione, utility
supabase/
  migrations/     001 schema · 002 logica e sicurezza · 003 cron · 004 regole
                  005 categorie e certificati · 006 funzioni di segreteria
                  007 costi e statistiche · 008 affitto spazi ed eventi
                  009 sedi, bacheca ed eventi · 010 azioni sul calendario
                  011 prenotati · 012 palinsesto
  demo.sql        dati dimostrativi · demo_rimuovi.sql per toglierli
  seed.sql        dati iniziali RM House
docs/ARCHITETTURA.md  modello dati, flussi, ruoli, roadmap
```
