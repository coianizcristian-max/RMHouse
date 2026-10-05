# Beta test RMHouse — 5 ottobre 2026

## Come l'ho fatto

Ho simulato una scuola vera con 10 persone, ognuna con il suo accesso, che usano l'app come la userebbero davvero:

- **Amministrazione**: Simona.
- **Insegnanti**: Sara (Pole e Flexy, 25 €/h) e Marta (Aerea Kids, 20 €/h).
- **Clienti**:
  - Giulia paga con carta e fa disdette e recuperi.
  - Marco paga con bonifico, disdice tardi e si arrabbia.
  - Laura è mamma di Sofia e Luca.
  - Anna ha il certificato scaduto e se ne va.
  - Chiara trova il corso pieno e va in lista d'attesa.
  - Elena prende 10 ingressi a rate.
  - Paolo prenota una prova dal sito e poi passa al rinnovo automatico.

Ho creato 3 corsi (uno da 4 posti, per riempirlo), 5 orari e 4 tipi di abbonamento.

Tutto passa dalle stesse strade dell'app: il database con i permessi di ciascuno, le API del sito e i webhook di Stripe con la firma vera. Al posto di Stripe c'è un finto Stripe.

Per fare gli appelli senza aspettare i giorni veri, le lezioni della settimana sono state "portate" all'ora attuale una alla volta.

Alla fine ho fatto un giro dell'interfaccia: 84 pagine aperte da computer e da telefono (390 px), per tutti i ruoli.

## Risultato

- **298 controlli superati, 0 falliti** (dopo le correzioni).
- **84 pagine** senza errori. Nessuna pagina più larga del telefono. Ogni pagina si apre in meno di 1 secondo.
- **Problemi trovati e corretti: 21**, di cui 6 seri (soldi o persone che non ricevono avvisi).

## Problemi trovati e già corretti (aggiornamento 114)

### Seri

1. **Corso pieno venduto lo stesso.** L'acquisto online non controllava i posti dell'orario. Chiara poteva comprare il lunedì già pieno e diventare la 5ª su 4 posti.
   - Ora l'acquisto (carta e bonifico) si blocca.
   - Nell'app il giorno pieno appare "completo" e non si può scegliere.
2. **Bonifico senza incasso.** Con "Bonifico arrivato: attiva" l'abbonamento partiva, ma il pagamento non risultava da nessuna parte: né al cliente, né negli incassi, né tra le ricevute da emettere.
   - Ora l'incasso si registra da solo.
3. **Abbonamento annullato ma Stripe continuava ad addebitare.** Annullando dalla scheda un abbonamento con rinnovo automatico, Stripe continuava ad addebitare ogni mese e creava un nuovo abbonamento.
   - Ora l'annullamento ferma anche il rinnovo su Stripe.
   - Sulla scheda del cliente c'è il riquadro "Rinnovo automatico" con "ferma il rinnovo".
   - Se arriva comunque un addebito dopo la disdetta, l'abbonamento non riparte e compare il promemoria per il rimborso.
4. **Lezione annullata: chi non ha le notifiche non sapeva nulla** (Marco ed Elena).
   - Ora chi non ha le notifiche attive riceve un'email.
5. **Le notifiche sul telefono non partivano senza Resend.** Senza la chiave Resend il programma di invio si fermava e non mandava nemmeno le notifiche push.
   - Ora le push partono comunque.
6. **Rinnovo automatico non riuscito (carta rifiutata): nessuno lo sapeva.**
   - Ora la segreteria riceve l'avviso.
   - Il cliente riceve "aggiorna la carta" (notifica o, se non ce l'ha, email).

### Medi

7. **Recupero non riprenotabile.** Dopo aver annullato un recupero non si poteva più riprenotare la stessa lezione (errore). Corretto.
8. **La lezione appena disdetta compariva tra quelle proposte per il recupero.** Tolta.
9. **Due fratelli non potevano stare in lista d'attesa dello stesso corso** (il limite era per famiglia, non per persona). Corretto.
10. **Segreteria e lista d'attesa.** Se la segreteria metteva in lista d'attesa una persona che si era già iscritta dall'app, usciva un errore. Ora non succede più.
11. **Avvisi "si è liberato un posto".** Portavano alla pagina delle prove.
    - Ora portano all'area clienti, o direttamente all'acquisto del corso.
    - Arrivano anche come notifica sul telefono.
12. **Lista d'attesa avvisata troppo presto.** Annullare un abbonamento che partiva fra un mese avvisava subito chi aspettava, anche se il posto non era libero. Ora l'avviso parte solo se il posto si libera davvero adesso.
13. **Persona nuova segnalata in appello.** La segreteria non riceveva nessuna notifica. Ora sì.
14. **Persona aggiunta in più in appello.** Non restava scritto chi l'aveva aggiunta. Ora sì.
15. **"L'ho tenuta io" sulla lezione di un'altra insegnante.** Le ore passano a chi conferma, ma la titolare non ne sapeva nulla. Ora vengono avvisate sia la titolare sia la segreteria.
16. **Riservatezza.** Gli insegnanti potevano leggere dal database tutti i pagamenti e le note di contatto dei clienti. Ora solo segreteria e amministrazione.

### Eventi

17. **Quota non chiusa.** Chi si cancellava da un evento a pagamento restava con la quota "da incassare".
    - Ora la quota si chiude.
    - Se aveva già pagato, la segreteria trova il promemoria per il rimborso.
18. **La segreteria non vedeva chi era iscritto a un evento** (solo il numero).
    - Ora c'è "Vedi iscritti", con telefono, note e quota.
    - Si può incassare (contanti o POS), segnare la presenza o togliere una persona.
19. **Evento eliminato.** Gli iscritti non venivano avvisati e le quote restavano aperte. Ora vengono avvisati e le quote si chiudono.

### Piccoli

20. **Cliente con soli abbonamenti annullati.** Risultava "Lead / mai iscritto". Ora risulta "Ritirata/Ritirato".
21. **Pagamenti nell'app del cliente.**
    - Ora mostrano le quote "Da pagare in segreteria" e i rimborsi ricevuti.
    - Chi compra un secondo abbonamento sullo stesso corso vede che parte alla fine di quello in corso.
    - La segreteria, registrando una persona già presente, vede "c'era già, scheda aggiornata".

## Cosa funziona bene (verificato)

- **Accesso**
  - Primo accesso del cliente con le ultime 4 cifre del cellulare.
  - Codice d'accesso per le insegnanti, che vale una volta sola.
  - Un cliente non vede né modifica i dati di un altro.
- **Moduli**
  - Dati mancanti richiesti prima della firma.
  - Scelte privacy obbligatorie.
  - Minorenni con firma del secondo genitore o con la dichiarazione.
  - Firma in reception registrata come tale.
  - Firme "con codice dentro" rifiutate.
- **Pagamenti**
  - Carta, con quota annuale, ricevuta automatica e commissione.
  - Evento Stripe ripetuto senza doppioni.
  - Cassa abbandonata che si chiude.
  - Rinnovo anticipato che parte dopo la scadenza.
  - Rate in contanti e online.
  - Prova pagata dal sito.
  - Rinnovo automatico mensile.
  - Rimborso parziale con nota di credito, senza doppione quando Stripe conferma.
- **Disdette e recuperi**
  - Con più di 4 ore di anticipo il cliente riceve il recupero.
  - Con meno di 4 ore è bloccato; la segreteria può segnare l'assenza.
  - Massimo 2 recuperi per abbonamento.
  - Solo nei corsi ammessi.
  - Il posto liberato va a chi è in lista d'attesa.
- **Certificati**
  - Scaduto: persona in rosso in appello.
  - Recupero bloccato senza certificato.
  - Caricamento dal link e approvazione della segreteria, con sblocco immediato.
- **Insegnanti**
  - Appello, "Tutti presenti", correzioni registrate (chi e quando).
  - L'ingresso viene scalato con la presenza.
  - "Fatti sostituire".
  - Sostituzione per un periodo su tutto il corso, con una notifica sola.
  - Le ore vanno a chi tiene la lezione; la titolare ha la riga "tenuta da …" a 0 €.
  - Un'insegnante non vede compensi, rate e statistiche economiche, e non fa rimborsi.
- **Amministrazione**
  - Lamentele e note sulla scheda.
  - Bacheca: email a tutti più notifiche.
  - Promemoria assegnati e spuntati.
  - Statistiche (ogni sezione in meno di 0,1 s).
  - "Attività dello staff" visibile solo a Erika e Cristian.
  - Cronologia delle azioni.

## Da decidere (non ho cambiato nulla)

1. **Lezione annullata dalla scuola.** Oggi i clienti vengono avvisati ma non ricevono un recupero. Lo diamo in automatico?
2. **Eventi.** Solo segreteria e amministrazione possono crearli. Le insegnanti devono poter creare i loro workshop?
3. **Note sulla scheda.** Le insegnanti leggono le note sulla scheda del cliente (es. "si lamenta spesso"). Utile per gli infortuni, ma sono visibili. Va bene così?
4. **Lista d'attesa di una lezione.** Un cliente che trova una lezione al completo non può mettersi in lista d'attesa dall'app: deve chiamare. Aggiungo il pulsante "avvisami se si libera"?
5. **Chi non ha le notifiche** riceve l'email solo per gli avvisi importanti (lezione annullata, bacheca, posto libero, pagamento non riuscito). Per "abbonamento attivato" lo vede solo aprendo l'app. Va bene?

## Da sapere per la messa online

- **Email.** Con l'indirizzo di prova di Resend (`onboarding@resend.dev`) le email arrivano solo all'indirizzo del proprietario dell'account Resend. Per scrivere ai clienti serve verificare il dominio su Resend.
- **Notifiche push.** Su Vercel serve `VAPID_PRIVATE_KEY`, oltre alla chiave pubblica.
- **Limiti del test.** Le email e le notifiche non sono state consegnate davvero: è verificato che partano e a chi. Anche Stripe era finto, ma con la stessa firma dei webhook. Prima di aprire ai clienti conviene un giro con le carte di prova di Stripe vero.
