import { staffCorrente } from '@/lib/staff';
import ElencoFunzioni from './ElencoFunzioni';
import { AREE } from '@/lib/menu';

export const dynamic = 'force-dynamic';

// Indice di tutto quello che il gestionale sa fare, con il link diretto.
// Serve quando una funzione esiste ma non si ricorda dove sta di casa.
const SEZIONI = [
  {
    area: 'Ogni giorno',
    voci: [
      ['Riepilogo di oggi', '/gestione', 'Lezioni, persone attese, prove in arrivo e l\'elenco "Da fare"; in alto la ricerca veloce di un cliente (anche con le sole iniziali, es. "mr").'],
      ['Agenda del giorno', '/gestione/oggi', 'Le lezioni una sotto l\'altra, con l\'appello a portata di dito.'],
      ['Appello', '/gestione/appello', 'Si apre da una lezione: presenze, aggiungi o togli qualcuno, scrivi ai prenotati, scarica la lista.'],
      ['Richieste dall\'app', '/gestione/richieste', 'Quello che i clienti chiedono dall\'app (lezioni private, cambi, informazioni): si conferma o si risponde.'],
      ['Prenotazioni', '/gestione/prenotazioni', 'Ingressi, recuperi e prove in arrivo fatti dai clienti dall\'app o dalla segreteria: si vedono, si disdicono o si spostano.'],
      ['Lead e prove', '/gestione/lead', 'Chi ha chiesto informazioni o prenotato una prova, diviso per stato, con WhatsApp diretto.'],
      ['Liste d\'attesa', '/gestione/attese', 'Chi aspetta un posto, con l\'inserimento manuale dal banco: quando qualcuno disdice, l\'avviso parte da solo.'],
    ],
  },
  {
    area: 'Calendari',
    voci: [
      ['Palinsesto', '/gestione/calendario', 'La settimana a schede come nella vecchia app: tutti i 7 giorni in una videata, prenotati e posti liberi (passa col mouse sui cerchietti), "+" per aggiungere qualcuno, filtro per corso, Legenda, un giorno alla volta sul telefono.'],
      ['Più lezioni insieme', '/gestione/calendario', 'Nel palinsesto, il cerchietto in fondo a ogni scheda: selezioni più lezioni e cambi insieme insegnante, sala, posti, prenotazioni, nota, oppure le annulli.'],
      ['Agenda settimanale', '/gestione/agenda', 'La stessa settimana come griglia oraria, per ragionare a fasce.'],
      ['Giornata per sale', '/gestione/giornata', 'Un giorno, una colonna per sala: lezioni e affitti, con la linea dell\'ora attuale. Le colonne si allargano a tutto lo schermo.'],
      ['Giornata per insegnanti', '/gestione/giornata/staff', 'Un giorno, una colonna per insegnante, con lezioni e ore di ciascuno. Le colonne si allargano a tutto lo schermo.'],
      ['Azioni rapide sulla lezione', '/gestione/calendario', 'Toccando una lezione: colore, posti solo per quella volta, blocco prenotazioni, annullamento, anche "da oggi in avanti".'],
      ['Affitto sale e feste', '/gestione/spazi', 'Richieste da confermare, agenda delle sale, incassi, blocco manuale di una sala.'],
      ['Listino degli affitti', '/gestione/spazi/listino', 'Tariffe orarie per sala e pacchetti festa: è quello che fa il preventivo automatico sul sito.'],
      ['Eventi', '/gestione/eventi', 'Open day, saggi, stage e campus con locandina, posti, iscrizioni e fino a tre in evidenza.'],
    ],
  },
  {
    area: 'Struttura',
    voci: [
      ['Corsi', '/gestione/corsi', 'Anagrafica del corso, foto, colore, capienza, orari settimanali, insegnanti, iscritti e lista d\'attesa.'],
      ['Gruppo WhatsApp del corso', '/gestione/corsi', 'Nella scheda del corso: "Per il gruppo WhatsApp" copia i numeri di chi ha dato il consenso, da incollare nel gruppo.'],
      ['Pagina pubblica del corso', '/gestione/corsi', 'Dentro ogni corso, accanto a "modifica": il link con foto e orari da usare nelle campagne.'],
      ['Staff', '/gestione/staff', 'Insegnanti e segreteria: foto (si clicca per aprire la scheda), specialità, colore, compenso orario, archivio.'],
      ['Regole di compenso e rimborso auto', '/gestione/staff', 'Nella scheda di ogni insegnante: a ora, a lezione, a fasce, a persona, private, forfait, fisso mensile e rimborso auto per giornata (anche solo per una sede, un corso o le private).'],
      ['Sale', '/gestione/sale', 'Foto, capienza, attrezzatura e costo orario (serve per i margini).'],
      ['Categorie, discipline, livelli, fasce d\'età, chiusure', '/gestione/palinsesto', 'Gli elementi con cui sono costruiti i corsi e i giorni di chiusura. Elenchi in ordine di nome con la ricerca; si può vedere anche l\'ordine che vede il cliente.'],
      ['Bacheca', '/gestione/bacheca', 'Avvisi e novità con immagine e periodo di validità, da mandare per email agli iscritti.'],
      ['Sede e contatti', '/gestione/sede', 'Dati della scuola, mittente delle email, indirizzo del sito, sedi con logo e indirizzo.'],
    ],
  },
  {
    area: 'Persone',
    voci: [
      ['Nuovo cliente', '/gestione/persone/nuova', 'Chi paga e chi frequenta al banco: poi dalla scheda si crea l\'iscrizione al corso.'],
      ['Anagrafiche', '/gestione/persone', 'Ricerca mentre scrivi (pezzi di nome e cognome in qualunque ordine, o le iniziali), filtri per stato e per consensi (WhatsApp, foto), etichette, selezione multipla ed export CSV.'],
      ['Recuperi', '/gestione/persone', 'Nella scheda della persona: crediti maturati, scadenza e prenotazione del recupero.'],
      ['Prossime lezioni della persona', '/gestione/persone', 'Nella scheda: le lezioni dei prossimi 30 giorni (fisse, prenotate, recuperi, prove) con disdici e "Aggiungi a una lezione".'],
      ['Iscrizioni e abbonamenti', '/gestione/persone', 'Nella scheda: nuova iscrizione, cambia giorni, sospendi, annulla. Annuale fino a fine stagione con i mesi da scalare; chi parte a metà mese paga solo le lezioni che restano.'],
      ['Incassi della persona', '/gestione/persone', 'Nella scheda: incassa (anche con una data passata), correggi data e metodo, annulla un incasso sbagliato o doppio (con la sua ricevuta).'],
      ['Scadenze', '/gestione/scadenze', 'Abbonamenti, ingressi, certificati e quote da gestire: si segnano come gestiti, si scrive o si esporta.'],
      ['Rinnovi in blocco', '/gestione/rinnovi', 'Gli abbonamenti che scadono: si spuntano e si rinnovano tutti insieme.'],
      ['Certificati medici', '/gestione/certificati', 'Documenti caricati dai clienti da approvare, con scadenza e blocco automatico.'],
      ['Importa da CSV', '/gestione/importa', 'Porta dentro l\'elenco che hai oggi: abbini le colonne, vedi l\'anteprima, e crea persone e iscrizioni.'],
    ],
  },
  {
    area: 'Conti e impostazioni',
    voci: [
      ['Regole e prenotazioni', '/gestione/impostazioni', 'Quota annuale, stagione, prove dal sito, soglie dello stato dei clienti, sconti da proporre per più corsi e famiglie.'],
      ['Funzioni attive', '/gestione/impostazioni/funzioni', 'Spegni lead, attese, affitti, eventi, bacheca, rate o promozioni se non li usi: spariscono dal menù.'],
      ['Area clienti', '/gestione/impostazioni/aspetto', 'Messaggio di benvenuto, avviso in evidenza e colore, con anteprima sul telefono.'],
      ['Email e notifiche', '/gestione/impostazioni/notifiche', 'Riepilogo del lunedì, email inviate e non partite, chi dello staff ha email e accesso.'],
      ['Le mie notifiche', '/gestione/notifiche', 'Avvisi sul telefono per lo staff: prove, affitti, certificati, pagamenti online, lezioni annullate o assegnate.'],
      ['Ingressi', '/gestione/ingresso', 'Inquadri il pass del cliente con la fotocamera: vedi se è in regola e la presenza si segna da sola.'],
      ['Moduli e firme', '/gestione/moduli', 'Regolamento, privacy e liberatorie firmate col dito dall\'area clienti o in reception, con chi manca.'],
      ['Tesseramento', '/gestione/tesseramento', 'Tessere dell\'ente per stagione: chi manca, dati mancanti, elenco da caricare sul portale, numeri.'],
      ['Contatti e prove', '/gestione/crm', 'I contatti a colonne per fase: nuovi, prova prenotata, prova fatta, iscritti, non convertiti. Si trascinano.'],
      ['Da ricontattare', '/gestione/crm/ricontattare', 'Chi non ha rinnovato, chi non viene più, ex clienti recenti, prove non iscritte, da richiamare oggi: con il messaggio WhatsApp pronto.'],
      ['Campagne', '/gestione/crm/campagne', 'Email a un pubblico scelto per stato, corso o etichetta, solo a chi accetta promozioni, con esito.'],
      ['Sondaggi', '/gestione/crm/sondaggi', 'Domande a stelle, voto 0-10, scelta o testo, link personale, risultati con media e NPS.'],
      ['Ruoli e accessi', '/gestione/impostazioni/ruoli', 'Profili su misura che nascondono parti del gestionale, e chi ha quale profilo.'],
      ['Registro delle azioni', '/gestione/impostazioni/registro', 'Chi ha incassato, emesso, annullato, iscritto, modificato o cancellato cosa, e quando.'],
      ['Pagamenti online', '/gestione/impostazioni/pagamenti', 'Stripe: prove, abbonamenti dall\'area clienti, rate, link di pagamento, rinnovo automatico, commissioni. Pronto, si accende con le chiavi.'],
      ['Integrazioni', '/gestione/impostazioni/integrazioni', 'Cosa è collegato (email, cron, notifiche, dominio, dati fiscali, Stripe) e cosa manca.'],
      ['Riepilogo dei conti', '/gestione/conti', 'Incassato oggi, nel mese e nell\'anno; da incassare; incassi senza ricevuta; rate in arrivo.'],
      ['Rate', '/gestione/rate', 'Un importo diviso in più scadenze, incasso rata per rata con ricevuta subito.'],
      ['Note di credito', '/gestione/ricevute', 'Rimborsi totali o parziali legati alla ricevuta, con numerazione a parte.'],
      ['Mandare la ricevuta al cliente', '/gestione/ricevute', 'Aprendo una ricevuta: logo, "Invia su WhatsApp", "Invia via email", copia il link, annulla. Il cliente la apre dal link e la trova nell\'app.'],
      ['Rendiconto staff', '/gestione/rendiconto', 'Lezioni, ore, presenze e compenso stimato di ogni insegnante su un periodo libero.'],
      ['Per il commercialista', '/gestione/commercialista', 'Registro documenti, corrispettivi per giorno e aliquota, acquisti, incassi e compensi in un ZIP; aliquote IVA, numerazioni, attestati per la detrazione sportiva dei ragazzi.'],
      ['Statistiche', '/gestione/statistiche', 'Panoramica, iscrizioni e rinnovi, frequenza, corsi, persone, prove e contatti, economia: grafici e numeri sul periodo che scegli.'],
      ['Motivi di chi non si iscrive', '/gestione/statistiche/prove', 'Statistiche → Prove: le risposte del sondaggio mandato a chi ha provato senza poi iscriversi.'],
      ['Incassi', '/gestione/incassi', 'Quote, abbonamenti, prove e affitti incassati, totali per metodo e quello che resta da incassare.'],
      ['Ricevute', '/gestione/ricevute', 'Ricevute non fiscali con IVA a zero per quote e abbonamenti, numerate e stampabili.'],
      ['Fatture con IVA', '/gestione/ricevute', 'Per le attività commerciali (affitto sale, feste, eventi per esterni): IVA 22% scorporata, PDF di cortesia e file XML della fattura elettronica.'],
      ['Fatture', '/gestione/fatture', 'Carichi gli XML dello SDI: le fatture dei fornitori diventano spese e si abbinano ai movimenti.'],
      ['Banca e cassa', '/gestione/banca', "Carichi l'estratto conto e il sistema lo incrocia con gli incassi registrati."],
      ['Compensi insegnanti', '/gestione/compensi', 'Ore svolte, rimborsi auto, compenso del mese, extra e pagamento: la segreteria calcola, solo l\'amministrazione approva e paga; diventa una spesa nei costi.'],
      ['I miei compensi', '/gestione/miei-compensi', 'Per l\'insegnante: il cedolino del mese con le lezioni contate, da confermare o segnalare.'],
      ['Attività dello staff', '/gestione/attivita', 'Chi dello staff ha fatto cosa: appelli, incassi, iscrizioni, nel periodo.'],
      ['Costi e fornitori', '/gestione/costi', 'Spese fisse e variabili, fornitori, compensi orari, costo orario delle sale.'],
      ['Abbonamenti, recuperi e sconti', '/gestione/abbonamenti', 'Tipi di abbonamento, quota annuale, regole dei recuperi (quanti al mese, fino a quando), preavvisi, corsi coperti da ogni abbonamento.'],
      ['Esportazione contabile', '/gestione/incassi', 'In fondo agli incassi: il CSV del periodo da girare al commercialista.'],
      ['Messaggi automatici', '/gestione/messaggi', 'I testi di ogni email automatica, con segnaposto, anteprima dal vivo, invio di prova e coda di partenza.'],
    ],
  },
];

const PUBBLICHE = [
  ['Prenotazione della prova', '/prova', 'Il percorso per chi arriva dal sito: età, categoria, livello, orario, dati e conferma.'],
  ['Affitto sala e feste', '/spazi', 'Disponibilità in tempo reale e preventivo automatico dal listino.'],
  ['Caricamento del certificato', '/certificato', 'Ogni persona ha il suo link personale: lo trovi nella sua scheda.'],
  ['Sondaggio post-prova', '/feedback', 'Arriva per email a chi ha provato senza poi iscriversi.'],
];

export default async function Indice() {
  const { staff } = await staffCorrente();
  const gestione = staff.ruolo !== 'insegnante';
  // Le pagine nuove compaiono da sole: ogni voce del menù che qui non ha ancora una descrizione viene aggiunta
  // alla fine della sua area con il nome del menù (poi qui si scrive la spiegazione per bene).
  const presenti = new Set(SEZIONI.flatMap((x) => x.voci.map((v) => v[1].split('?')[0])));
  const NOMI = { oggi: 'Ogni giorno', calendari: 'Calendari', struttura: 'Struttura', persone: 'Persone' };
  const sezioni = SEZIONI.map((x) => ({ ...x, voci: [...x.voci] }));
  for (const a of AREE) {
    const nuove = a.voci.filter((v) => !presenti.has(v.href.split('?')[0]) && v.href !== '/gestione/indice'
      && (gestione || !v.soloGestione));
    if (!nuove.length) continue;
    const dove = sezioni.find((x) => x.area === (NOMI[a.k] || 'Conti e impostazioni')) || sezioni[sezioni.length - 1];
    nuove.forEach((v) => { dove.voci.push([v.testo, v.href, `Dal menù: ${a.titolo} → ${v.testo}.`]); presenti.add(v.href); });
  }
  return <ElencoFunzioni sezioni={sezioni} pubbliche={gestione ? PUBBLICHE : []} />;
}
