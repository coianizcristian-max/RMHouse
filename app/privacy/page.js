import Testata from '../Testata';
import PiePagina from '../PiePagina';
import { datiScuola } from '@/lib/scuola';

export const revalidate = 3600;
export const metadata = { title: 'Informativa privacy · Ritmo Metropolitano' };

// Informativa ai sensi degli artt. 13-14 del Regolamento UE 2016/679 (GDPR).
// I dati della scuola (titolare, indirizzo, email, dati fiscali) vengono da Impostazioni.
export default async function Privacy() {
  const s = await datiScuola();
  const contatto = s.email || 'l\'indirizzo email della segreteria';
  return (
    <>
      <Testata />
      <main className="pagina legale">
        <h1>Informativa sul trattamento dei dati personali</h1>
        <p className="muto">Ai sensi degli articoli 13 e 14 del Regolamento UE 2016/679 (GDPR). Ultimo aggiornamento: ottobre 2026.</p>

        <h2>1. Chi tratta i tuoi dati</h2>
        <p>
          Il titolare del trattamento è <strong>{s.nome}</strong>
          {s.dati_fiscali ? <>, {s.dati_fiscali.split('\n').join(', ')}</> : null}
          {s.indirizzo ? <>, con sede in {s.indirizzo}</> : null}.
          Per qualsiasi domanda sui tuoi dati scrivi a <strong>{contatto}</strong>{s.telefono ? <> o chiama il {s.telefono}</> : null}.
        </p>

        <h2>2. Quali dati trattiamo</h2>
        <ul>
          <li><strong>Anagrafici e di contatto</strong>: nome, cognome, data e luogo di nascita, codice fiscale, indirizzo, email, telefono; per i minori anche quelli del genitore o di chi ne fa le veci.</li>
          <li><strong>Iscrizione e frequenza</strong>: corsi, abbonamenti, prenotazioni, presenze, recuperi, tesseramento all'ente di promozione sportiva.</li>
          <li><strong>Pagamenti</strong>: importi, date, metodo, ricevute. I dati della carta li tratta solo il gestore dei pagamenti (Stripe): noi non li vediamo.</li>
          <li><strong>Certificato medico</strong> per l'attività sportiva: è un dato relativo alla salute e lo conserviamo con accesso limitato alla segreteria.</li>
          <li><strong>Immagini</strong> (foto e video durante corsi, saggi ed eventi) solo se hai dato il consenso.</li>
          <li><strong>Dati tecnici</strong> necessari a far funzionare il sito e l'app (sessione di accesso, sicurezza).</li>
        </ul>

        <h2>3. Perché li trattiamo e su quale base</h2>
        <ul>
          <li>Gestire prova, iscrizione, lezioni, prenotazioni, recuperi, pagamenti e comunicazioni di servizio (conferme, promemoria, scadenze): <em>esecuzione del contratto</em> (art. 6.1.b).</li>
          <li>Ricevute, contabilità, obblighi fiscali e assicurativi, tesseramento sportivo: <em>obbligo di legge</em> (art. 6.1.c).</li>
          <li>Certificato medico per l'idoneità all'attività sportiva: <em>obblighi in materia di tutela sanitaria dell'attività sportiva</em> (art. 9.2.b e 9.2.h).</li>
          <li>Novità, promozioni, eventi: solo con il tuo <em>consenso</em> (art. 6.1.a), che puoi togliere in ogni momento.</li>
          <li>Foto e video: solo con il tuo <em>consenso</em> (o quello del genitore per i minori).</li>
          <li>Sicurezza del sito, prevenzione di abusi e difesa in caso di contestazioni: <em>legittimo interesse</em> (art. 6.1.f).</li>
        </ul>

        <h2>4. Minori</h2>
        <p>
          Per chi ha meno di 14 anni i dati li fornisce e i consensi li dà il genitore o chi esercita la responsabilità genitoriale,
          che gestisce anche l'accesso all'area clienti.
        </p>

        <h2>5. A chi li comunichiamo</h2>
        <p>Non vendiamo né cediamo i tuoi dati. Li trattano per nostro conto, come responsabili del trattamento, solo i fornitori necessari al servizio:</p>
        <ul>
          <li><strong>Supabase</strong>: database e accesso all'app (server nell'Unione Europea);</li>
          <li><strong>Vercel</strong>: ospita il sito (elaborazione nell'Unione Europea, Francoforte);</li>
          <li><strong>Resend</strong>: invio delle email;</li>
          <li><strong>Stripe</strong>: pagamenti online;</li>
          <li>l'<strong>ente di promozione sportiva</strong> per il tesseramento e l'assicurazione, il <strong>commercialista</strong> e gli enti pubblici quando lo richiede la legge.</li>
        </ul>
        <p>
          Alcuni di questi fornitori hanno sede negli Stati Uniti: il trasferimento avviene solo con le garanzie previste dal GDPR
          (decisione di adeguatezza EU-USA "Data Privacy Framework" o clausole contrattuali standard della Commissione europea).
        </p>

        <h2>6. Per quanto tempo</h2>
        <ul>
          <li>Dati di iscrizione e frequenza: per tutta la durata del rapporto e poi per 2 anni, salvo contestazioni in corso.</li>
          <li>Ricevute e documenti contabili: 10 anni, come prevede la legge.</li>
          <li>Certificato medico: fino alla sua scadenza e poi per 1 anno.</li>
          <li>Richieste di prova o informazioni senza iscrizione: 24 mesi.</li>
          <li>Consenso a novità e promozioni: finché non lo togli.</li>
          <li>Registro delle modifiche fatte dal personale (sicurezza): 2 anni.</li>
        </ul>

        <h2>7. I tuoi diritti</h2>
        <p>
          Puoi chiedere in ogni momento di <strong>vedere</strong> i tuoi dati e averne una copia, <strong>correggerli</strong>,
          <strong> cancellarli</strong> (salvo quelli che la legge ci obbliga a tenere), <strong>limitarne</strong> l'uso,
          <strong> opporti</strong> al trattamento, riceverli in un formato leggibile (<strong>portabilità</strong>) e
          <strong> togliere un consenso</strong> senza conseguenze su quanto fatto prima.
        </p>
        <p>
          Dall'app, nella pagina <a href="/area/privacy">I miei dati</a>, puoi scaricare i tuoi dati, cambiare il consenso alle
          promozioni e chiedere la cancellazione. Oppure scrivi a <strong>{contatto}</strong>: rispondiamo entro 30 giorni.
          Se ritieni che i tuoi dati siano trattati in modo non corretto puoi rivolgerti al Garante per la protezione dei dati
          personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">garanteprivacy.it</a>).
        </p>

        <h2>8. Sicurezza</h2>
        <p>
          I dati viaggiano cifrati (HTTPS) e sono conservati in database protetti, con accesso solo al personale autorizzato e
          ognuno con il suo profilo. Ogni modifica fatta dal personale viene registrata. Il certificato medico e i documenti
          non sono mai pubblici.
        </p>

        <h2>9. Obbligo di fornire i dati</h2>
        <p>
          I dati anagrafici, di contatto e il certificato medico sono necessari per iscriverti e frequentare i corsi: senza,
          non possiamo procedere. I consensi a promozioni e immagini sono facoltativi.
        </p>

        <p className="muto piccolo">Questa informativa può essere aggiornata: la versione valida è sempre quella pubblicata in questa pagina. Per i cookie vedi la <a href="/cookie">cookie policy</a>.</p>
      </main>
      <PiePagina nome={s.nome} datiFiscali={s.dati_fiscali} />
    </>
  );
}
