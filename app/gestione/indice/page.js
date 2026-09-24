import Link from 'next/link';
import { staffCorrente } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// Indice di tutto quello che il gestionale sa fare, con il link diretto.
// Serve quando una funzione esiste ma non si ricorda dove sta di casa.
const SEZIONI = [
  {
    area: 'Ogni giorno',
    voci: [
      ['Riepilogo di oggi', '/gestione', 'Lezioni, persone attese, prove in arrivo e l\'elenco "Da fare".'],
      ['Agenda del giorno', '/gestione/oggi', 'Le lezioni una sotto l\'altra, con l\'appello a portata di dito.'],
      ['Appello', '/gestione', 'Si apre da una lezione: presenze, aggiungi o togli qualcuno, scrivi ai prenotati, scarica la lista.'],
      ['Lead e prove', '/gestione/lead', 'Chi ha chiesto informazioni o prenotato una prova, diviso per stato, con WhatsApp diretto.'],
      ['Liste d\'attesa', '/gestione/attese', 'Chi aspetta un posto, con l\'inserimento manuale dal banco: quando qualcuno disdice, l\'avviso parte da solo.'],
    ],
  },
  {
    area: 'Calendari',
    voci: [
      ['Palinsesto', '/gestione/calendario', 'La settimana a schede: colori del corso, iscritti, posti liberi, prove e note del giorno.'],
      ['Agenda settimanale', '/gestione/agenda', 'La stessa settimana come griglia oraria, per ragionare a fasce.'],
      ['Azioni rapide sulla lezione', '/gestione/calendario', 'Toccando una lezione: colore, posti solo per quella volta, blocco prenotazioni, annullamento, anche "da oggi in avanti".'],
      ['Affitto sale e feste', '/gestione/spazi', 'Richieste da confermare, agenda delle sale, incassi, blocco manuale di una sala.'],
      ['Listino degli affitti', '/gestione/spazi/listino', 'Tariffe orarie per sala e pacchetti festa: è quello che fa il preventivo automatico sul sito.'],
      ['Eventi', '/gestione/eventi', 'Open day, saggi, stage e campus con locandina, posti, iscrizioni e fino a tre in evidenza.'],
    ],
  },
  {
    area: 'Struttura',
    voci: [
      ['Corsi', '/gestione/corsi', 'Anagrafica del corso, foto, colore, capienza, orari settimanali, iscritti e lista d\'attesa.'],
      ['Pagina pubblica del corso', '/gestione/corsi', 'Dentro ogni corso, accanto a "modifica": il link con foto e orari da usare nelle campagne.'],
      ['Staff', '/gestione/staff', 'Insegnanti e segreteria: foto, specialità, colore, compenso orario, archivio.'],
      ['Sale', '/gestione/sale', 'Foto, capienza, attrezzatura e costo orario (serve per i margini).'],
      ['Categorie, discipline, livelli, fasce d\'età, chiusure', '/gestione/palinsesto', 'Gli elementi con cui sono costruiti i corsi e i giorni di chiusura.'],
      ['Bacheca', '/gestione/bacheca', 'Avvisi e novità con immagine e periodo di validità, da mandare per email agli iscritti.'],
      ['Sede e contatti', '/gestione/sede', 'Dati della scuola, mittente delle email, indirizzo del sito, sedi con logo e indirizzo.'],
    ],
  },
  {
    area: 'Persone',
    voci: [
      ['Registra una persona nuova', '/gestione/persone/nuova', 'Chi paga e chi frequenta al banco: poi dalla scheda si crea l\'iscrizione al corso.'],
      ['Anagrafiche', '/gestione/persone', 'Ricerca per nome, email o telefono; dentro la scheda: iscrizioni, sospensioni, recuperi, prove, certificati.'],
      ['Recuperi', '/gestione/persone', 'Nella scheda della persona: crediti maturati, scadenza e prenotazione del recupero.'],
      ['Rinnovi in scadenza', '/gestione/rinnovi', 'Gli abbonamenti che scadono: si spuntano e si rinnovano tutti insieme.'],
      ['Certificati medici', '/gestione/certificati', 'Documenti caricati dai clienti da approvare, con scadenza e blocco automatico.'],
      ['Importa da CSV', '/gestione/importa', 'Porta dentro l\'elenco che hai oggi: abbini le colonne, vedi l\'anteprima, e crea persone e iscrizioni.'],
    ],
  },
  {
    area: 'Conti e impostazioni',
    voci: [
      ['Statistiche e margini', '/gestione/statistiche', 'Iscritti, abbandono, riempimento, conversione delle prove, ricavi, costi e margine per corso, insegnante e sala.'],
      ['Motivi di chi non si iscrive', '/gestione/statistiche', 'In fondo alle statistiche: le risposte del sondaggio mandato a chi ha provato e non si è iscritto.'],
      ['Incassi', '/gestione/incassi', 'Quote, abbonamenti, prove e affitti incassati, totali per metodo e quello che resta da incassare.'],
      ['Ricevute', '/gestione/ricevute', 'Ricevute non fiscali con IVA a zero per quote e abbonamenti, numerate e stampabili.'],
      ['Fatture', '/gestione/fatture', 'Carichi gli XML dello SDI: le fatture dei fornitori diventano spese e si abbinano ai movimenti.'],
      ['Banca e cassa', '/gestione/banca', "Carichi l'estratto conto e il sistema lo incrocia con gli incassi registrati."],
      ['Compensi insegnanti', '/gestione/compensi', 'Ore svolte, compenso del mese, extra e pagamento: diventa una spesa nei costi.'],
      ['Costi e fornitori', '/gestione/costi', 'Spese fisse e variabili, fornitori, compensi orari, costo orario delle sale.'],
      ['Abbonamenti, recuperi e sconti', '/gestione/abbonamenti', 'Tipi di abbonamento, quota annuale, regole dei recuperi, preavvisi.'],
      ['Promozioni', '/gestione/promo', 'Un messaggio mirato agli iscritti di certi corsi, solo a chi ha dato il consenso.'],
      ['Esportazione contabile', '/gestione/incassi', 'In fondo agli incassi: il CSV del periodo da girare al commercialista.'],
      ['Messaggi automatici', '/gestione/messaggi', 'I testi di ogni email automatica, con segnaposto, anteprima dal vivo, invio di prova e coda di partenza.'],
    ],
  },
];

const PUBBLICHE = [
  ['Prenotazione della prova', '/prova', 'Il percorso per chi arriva dal sito: età, categoria, livello, orario, dati e conferma.'],
  ['Affitto sala e feste', '/spazi', 'Disponibilità in tempo reale e preventivo automatico dal listino.'],
  ['Caricamento del certificato', '/certificato', 'Ogni allievo ha il suo link personale: lo trovi nella sua scheda.'],
  ['Sondaggio post-prova', '/feedback', 'Arriva per email a chi ha provato e non si è iscritto.'],
];

export default async function Indice() {
  const { staff } = await staffCorrente();
  const gestione = staff.ruolo !== 'insegnante';

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Guida</div>
        <h1>Tutte le funzioni</h1>
        <p>Cosa sa fare il gestionale e dove sta di casa ogni cosa.</p>
      </div>

      {SEZIONI.map((s) => (
        <div key={s.area}>
          <h2 className="sezione">{s.area}</h2>
          <div className="da-fare">
            {s.voci.map(([testo, href, spiega]) => (
              <Link key={testo + href} href={href}>
                <span>
                  <strong style={{ color: 'var(--nero)' }}>{testo}</strong>
                  <span className="piccolo muto" style={{ display: 'block' }}>{spiega}</span>
                </span>
                <span className="conta">›</span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {gestione && (
        <>
          <h2 className="sezione">Pagine pubbliche</h2>
          <p className="piccolo muto" style={{ marginTop: -4 }}>
            Quelle che vedono i clienti: aprile in una scheda nuova per controllarle.
          </p>
          <div className="da-fare">
            {PUBBLICHE.map(([testo, href, spiega]) => (
              <Link key={href} href={href} target="_blank">
                <span>
                  <strong style={{ color: 'var(--nero)' }}>{testo}</strong>
                  <span className="piccolo muto" style={{ display: 'block' }}>{spiega}</span>
                </span>
                <span className="conta">↗</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
