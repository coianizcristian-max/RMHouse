# Velocità del gestionale con l'archivio di una scuola vera

## Come ho provato

Ho costruito un archivio grande come sarà il vostro fra un paio d'anni, e ci ho fatto girare sopra tutto il gestionale:

| Cosa | Quanti |
|---|---|
| persone in archivio | 2.484 (come oggi) |
| abbonamenti | 7.400 in due stagioni, 458 attivi oggi |
| lezioni | 6.900 |
| presenze | 37.500 |
| pagamenti e ricevute | 7.400 |
| righe del registro azioni | 61.000 |
| messaggi ai clienti | 25.000 |

Poi tre prove:

1. **Ogni pagina, una per una.** 99 pagine con 4 ruoli (amministratrice, segreteria, insegnante, cliente). Di ogni pagina ho misurato il tempo e, dal registro interno del database, ogni singola query che fa.
2. **Tante persone insieme.** 10, 30 e 60 richieste in contemporanea per 40 secondi, con il mix vero: clienti che aprono l'app e l'orario, segreteria sulle schede e sul calendario, insegnante sull'appello, amministratrice sulle statistiche.
3. **Chi vede cosa.** Per ogni ruolo ho contato le righe visibili di tutte le 109 tabelle e viste, prima e dopo: devono essere identiche.

## Cosa ho trovato

Con 2.500 persone il gestionale era lento quasi dappertutto, e alcune pagine non si aprivano:

| Pagina | Prima | Dopo |
|---|---|---|
| Statistiche → Economia / Iscrizioni / Frequenza | non si apriva (oltre 60 s) | 0,9 s |
| Statistiche → Corsi | 15,4 s | 0,85 s |
| Statistiche → Panoramica, Persone, Prove | 9 s | 0,8 s |
| Calendario e Agenda | 4,3 – 6,9 s | 0,9 s |
| Persone (elenco, ricerca, filtri) | 4 s | 0,7 s |
| CRM → Da ricontattare | 3,7 s | 0,7 s |
| Riepilogo (Oggi) | 3-4 s | 0,7 s |

Media su tutte le 99 pagine: **da 3,4 a 0,7 secondi**. Tempo totale passato nel database per aprirle tutte: **da 429 a 10 secondi**. I tempi delle pagine comprendono circa mezzo secondo di attesa dello strumento di prova; il tempo vero è più basso.

Con 30 persone in contemporanea:

| | Prima | Dopo |
|---|---|---|
| richieste servite al secondo | 13,7 | 20,8 |
| metà delle risposte entro | 2,3 s | 1,5 s |
| il 95% delle risposte entro | 4,2 s | 2,9 s |

Queste ultime cifre sono del mio computer di prova, dove sito e database girano insieme su due processori: su Vercel e Supabase i numeri assoluti saranno diversi, ma il rapporto resta.

## Le cause, in ordine di peso

### 1. Le regole di accesso venivano ricontrollate riga per riga (query 110)

Ogni tabella ha la regola "lo staff della scuola legge e scrive". Era scritta come `is_staff(palestra_id)`: una funzione che il database chiamava per ogni riga letta, con una ricerca sulla tabella dello staff ogni volta. Leggere le presenze di una stagione voleva dire 37.000 ricerche. Ora la regola è "la scuola è tra quelle in cui sono staff", e quella lista si calcola una volta sola per query.

Riscritte 137 regole in un colpo solo, più quelle delle notifiche e dei giorni dell'abbonamento che facevano la stessa cosa in un altro modo. **Chi vede cosa non cambia**: l'ho verificato tabella per tabella, ruolo per ruolo, 545 controlli, zero differenze.

### 2. Il database "compilava" le query (query 111)

Postgres può compilare le query complesse prima di eseguirle (JIT). Con tante regole di accesso le query diventano enormi e la compilazione costa più della query stessa: il Calendario impiegava 2,6 secondi, di cui 2,5 di compilazione. L'ho spento per questo database. Le query restano identiche.

### 3. Le statistiche contavano lezione per lezione (query 111 e 113)

Per ogni lezione del periodo il database faceva 4 conteggi separati (iscritti, prove, presenti, assenti). Su una stagione intera sono 14.000 conteggi. Ora i conteggi si fanno in un passaggio solo: Panoramica da 4,3 a 0,3 secondi, Corsi da 4,6 a 0,15. I risultati sono identici, confrontati numero per numero.

### 4. L'app dei clienti ricostruiva l'elenco di tutti (query 112)

Ogni pagina dell'app chiede "il mio riepilogo". Per trovare le prossime lezioni della famiglia, il database ricostruiva l'elenco dei partecipanti di tutte le lezioni (44.000 righe) e poi teneva quelle della famiglia. Ora parte dalle persone della famiglia: da 86 a 10 millisecondi. Con 500 iscritti che aprono l'app è la voce che pesava di più sul database durante la prova di carico.

### 5. Alcune pagine aspettavano il database una chiamata dopo l'altra (file dell'app)

Il Riepilogo faceva tre chiamate in fila dopo le altre; l'app dei clienti, per una famiglia con tre figli, aspettava tre viaggi al database uno dopo l'altro. Ora partono insieme. Su Vercel ogni viaggio al database costa 20-50 millisecondi, quindi conta.

## Cosa resta

- **Le statistiche su una stagione intera** restano le pagine più pesanti (0,2-0,3 secondi di database ciascuna). Vanno bene per l'uso dell'amministrazione; non sono pagine da aprire di continuo.
- **Il Riepilogo** fa ancora un calcolo di circa 0,1 secondi (lo stato di tutte le 2.500 persone) a ogni apertura. Se un giorno dovesse pesare, si può aggiornare lo stato a intervalli invece che a ogni apertura.
- **Su Supabase il piano conta.** Con il piano gratuito il database è piccolo e si addormenta dopo una settimana senza uso; con 500 iscritti attivi serve almeno il piano Pro, con il database che resta sveglio.
- **Un'indicazione per il futuro:** quando aggiungeremo pagine, la regola è "una chiamata al database per cosa da mostrare, tutte insieme"; e mai ricalcolare per tutte le persone quello che serve per una.

## Verifiche

- Chi vede cosa: 109 tabelle e viste × 5 ruoli, prima e dopo, nessuna differenza.
- Statistiche: risultati identici prima e dopo, confrontati numero per numero.
- Primo scenario rifatto da capo: 310 su 310. Prova del mese solare: 22 su 22.
- Grande simulazione di sei mesi rifatta da capo con le regole nuove: 198 controlli, 0 falliti; 15 casi limite superati.
- Query 110-113 eseguite due volte di seguito senza errori. Build ok.
