'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Gestore from '../Gestore';
import CorsiCoperti from './CorsiCoperti';
import GruppiListino from './GruppiListino';
import Famiglie from './Famiglie';
import DoveSiRecupera from './DoveSiRecupera';
import { euro } from '@/lib/formato';

const MODALITA = [
  { v: 'orari_fissi', l: 'Giorni e orari fissi' },
  { v: 'ingressi', l: 'Pacchetto a ingressi' },
  { v: 'libero', l: 'Accesso libero' },
];

const CATEGORIE_VOCI = [
  { v: 'contributo', l: 'Contributo' }, { v: 'rimborso', l: 'Rimborso spese' },
  { v: 'evento', l: 'Evento o campus' }, { v: 'quota', l: 'Quota' }, { v: 'altro', l: 'Altro' },
];

const SEZIONI = [
  ['tipi', 'Tipi di abbonamento'], ['gruppi', 'Gruppi di listino'], ['famiglie', 'Famiglie'], ['coperti', 'Corsi coperti'],
  ['recuperi', 'Recuperi e disdette'], ['listino', 'Altre voci a listino'],
];

// Durata come la calcola il database: il mese solare vince sui "28 giorni"
const solare = (t) => t.scadenza_fine_mese && !(t.durata_giorni && t.durata_giorni < 28);
const durata = (t) => {
  if (t.durata_giorni && !solare(t)) return `${t.durata_giorni} ${t.durata_giorni === 1 ? 'giorno' : 'giorni'}`;
  const m = t.durata_mesi || 1;
  if (solare(t)) return m === 1 ? 'mese solare' : `${m} mesi solari`;
  return `${m} ${m === 1 ? 'mese' : 'mesi'} dal giorno d'inizio`;
};

// Per l'ordine "per durata": singole, mensili, trimestrali, annuali…, poi i pacchetti a ingressi
const NOMI_MESI = { 1: 'Mensili', 2: 'Bimestrali', 3: 'Trimestrali', 4: 'Quadrimestrali', 6: 'Semestrali' };
function fascia(t) {
  if (t.modalita === 'ingressi') return { ordine: 900, chiave: 'ingressi', titolo: 'Pacchetti a ingressi' };
  const g = t.durata_giorni;
  if (g && g < 28) return g === 1
    ? { ordine: 0, chiave: 'singola', titolo: 'Lezioni singole' }
    : { ordine: 1, chiave: 'giorni', titolo: 'A giorni' };
  const m = g && !solare(t) ? Math.max(1, Math.round(g / 30)) : (t.durata_mesi || 1);
  if (m >= 9) return { ordine: 12, chiave: 'annuali', titolo: 'Annuali (da 9 a 12 mesi)' };
  return { ordine: m, chiave: `m${m}`, titolo: NOMI_MESI[m] || `${m} mesi` };
}
const perNome = (a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true, sensitivity: 'base' });

export default function Abbonamenti({ palestraId, sezioneIniziale = 'tipi', tipi, corsi, regole, palestra, voci = [], coperti = [], aliquote = [], gruppi = [] }) {
  const router = useRouter();
  // nel menù si vede sempre la percentuale: "Esente IVA · 0% N4"
  const opzioniAliquota = aliquote.map((a) => {
    const perc = `${Number(a.percentuale || 0)}%${a.natura ? ` ${a.natura}` : ''}`;
    const nome = a.nome.includes('%') ? a.nome : `${a.nome} · ${perc}`;
    return { v: a.id, l: a.predefinita ? `${nome} (predefinita)` : nome };
  });
  const opzioniGruppo = gruppi.map((g) => ({ v: g.id, l: g.nome }));
  const [sezione, setSezione] = useState(SEZIONI.some(([k]) => k === sezioneIniziale) ? sezioneIniziale : 'tipi');
  const [cerca, setCerca] = useState('');
  const [gruppo, setGruppo] = useState('');         // '' = tutti, 'nessuno' = senza gruppo
  const [famiglia, setFamiglia] = useState('');
  const [archiviati, setArchiviati] = useState(false);
  const [ordine, setOrdine] = useState('durata');   // 'durata' | 'nome'
  const [avviso, setAvviso] = useState('');

  const nelGruppo = (t) => !gruppo || (gruppo === 'nessuno' ? !t.gruppo_id : t.gruppo_id === gruppo);
  const quanti = (g) => tipi.filter((t) => !t.archiviato && (g === 'nessuno' ? !t.gruppo_id : t.gruppo_id === g)).length;
  // tutte le famiglie in uso (per sceglierle nella scheda dell'abbonamento, invece di riscriverle)
  const famiglieDi = (t) => (Array.isArray(t.famiglie) && t.famiglie.length ? t.famiglie : (t.famiglia ? [t.famiglia] : []));
  const tutteFamiglie = [...new Set(tipi.flatMap(famiglieDi))].sort((a, b) => a.localeCompare(b, 'it'));
  const famiglie = [...new Set(tipi.filter((t) => !t.archiviato && nelGruppo(t)).flatMap(famiglieDi))].sort();
  // parola per parola, senza accenti né spazi doppi: "attrezzi 90" trova anche "ATTREZZI  90 min…"
  const sempl = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const parole = sempl(cerca).split(/\s+/).filter(Boolean);
  const testo = parole.join(' ');
  const visibili = tipi.filter((t) =>
    (archiviati ? t.archiviato : !t.archiviato) && nelGruppo(t) &&
    (!famiglia || famiglieDi(t).includes(famiglia)) &&
    (!testo || parole.every((w) => sempl(`${t.nome} ${t.codice || ''} ${t.famiglia || ''}`).includes(w))))
    .sort(ordine === 'durata' ? (a, b) => (fascia(a).ordine - fascia(b).ordine) || perNome(a, b) : perNome);
  const quantiCorsi = (id) => coperti.filter((c) => c.tipo_abbonamento_id === id).length;
  const nomeGruppo = (id) => gruppi.find((g) => g.id === id)?.nome;
  const senzaGruppo = quanti('nessuno');

  function vaiA(k) {
    setSezione(k); setAvviso('');
    window.history.replaceState(null, '', k === 'tipi' ? '/gestione/abbonamenti' : `/gestione/abbonamenti?sezione=${k}`);
  }

  // Un abbonamento già usato non si elimina: si archivia e resta nello storico
  async function eliminaTipo(t, setErrore) {
    if (!confirm(`Togliere "${t.nome}" dal listino?\nSe qualcuno l'ha già usato viene archiviato: non si vende più ma resta nello storico.`)) return;
    const { data, error } = await supabaseBrowser().rpc('elimina_o_archivia_tipo', { p_tipo: t.id });
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setAvviso(data === 'archiviato'
      ? `"${t.nome}" è già stato usato: l'ho archiviato. Lo ritrovi con il filtro "Archiviati".`
      : `"${t.nome}" eliminato.`);
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Struttura</div>
        <h1>Abbonamenti e recuperi</h1>
        <p>Listino diviso per gruppi, corsi coperti, regole dei recuperi e delle disdette.</p>
      </div>
      <div className="schede-sezione" role="tablist">
        {SEZIONI.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={sezione === k} onClick={() => vaiA(k)}>
            {l}{k === 'gruppi' && senzaGruppo > 0 && <span className="conta-mini">{senzaGruppo}</span>}
          </button>
        ))}
      </div>

      {sezione === 'tipi' && (
        <>
          {gruppi.length > 0 && (
            <div className="segmenti" role="group" aria-label="Gruppo di listino">
              <button type="button" aria-pressed={!gruppo} onClick={() => { setGruppo(''); setFamiglia(''); }}>
                Tutti <span>{tipi.filter((t) => !t.archiviato).length}</span>
              </button>
              {gruppi.map((g) => (
                <button key={g.id} type="button" aria-pressed={gruppo === g.id} onClick={() => { setGruppo(g.id); setFamiglia(''); }}>
                  {g.nome} <span>{quanti(g.id)}</span>
                </button>
              ))}
              {senzaGruppo > 0 && (
                <button type="button" aria-pressed={gruppo === 'nessuno'} onClick={() => { setGruppo('nessuno'); setFamiglia(''); }}>
                  Senza gruppo <span>{senzaGruppo}</span>
                </button>
              )}
            </div>
          )}
          <div className="filtri-persone filtri-listino">
            <input type="search" placeholder="Cerca per nome o codice" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca abbonamento" />
            <select value={famiglia} onChange={(e) => setFamiglia(e.target.value)} aria-label="Famiglia" className={famiglia ? 'scelto' : ''}>
              <option value="">Famiglia: tutte ({famiglie.length})</option>
              {famiglie.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={ordine} onChange={(e) => setOrdine(e.target.value)} aria-label="Ordine" className={ordine !== 'durata' ? 'scelto' : ''}>
              <option value="durata">Per durata</option>
              <option value="nome">Alfabetico</option>
            </select>
            <select value={archiviati ? 'si' : ''} onChange={(e) => setArchiviati(e.target.value === 'si')} aria-label="In vendita o archiviati"
                    className={archiviati ? 'scelto' : ''}>
              <option value="">In vendita</option>
              <option value="si">Archiviati ({tipi.filter((t) => t.archiviato).length})</option>
            </select>
            <span className="piccolo muto">{visibili.length} abbonamenti</span>
          </div>
          {avviso && <div className="avviso-ok" role="status">{avviso}</div>}
          <Gestore
            tabella="tipi_abbonamento" fissi={{ palestra_id: palestraId }} righe={visibili} etichettaNuovo="Aggiungi abbonamento"
            vuoto="Nessun abbonamento con questi filtri." onElimina={eliminaTipo}
            sezione={ordine === 'durata' ? fascia : undefined}
            campi={[
              // modulo compatto a sezioni: tutto in una schermata
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true, gruppo: 'Abbonamento', larghezza: 3 },
              { k: 'codice', etichetta: 'Codice', tipo: 'testo', gruppo: 'Abbonamento', aiuto: 'es. P 24 lez' },
              { k: 'gruppo_id', etichetta: 'Gruppo di listino', tipo: 'select', opzioni: opzioniGruppo, vuotoTesto: '— nessuno —',
                predefinito: gruppo && gruppo !== 'nessuno' ? gruppo : '', gruppo: 'Abbonamento' },
              { k: 'modalita', etichetta: 'Tipo', tipo: 'select', opzioni: MODALITA, obbligatorio: true, predefinito: 'orari_fissi', gruppo: 'Abbonamento' },
              { k: 'famiglie', etichetta: 'Famiglie', tipo: 'etichette', gruppo: 'Abbonamento', larghezza: 6, aiuto: 'una o più: raggruppano i simili',
                opzioni: tutteFamiglie, nuovaTesto: '+ Nuova famiglia…' },
              { k: 'descrizione', etichetta: 'Descrizione per il cliente', tipo: 'testolungo', righe: 1, gruppo: 'Abbonamento', larghezza: 5, aiuto: 'nel negozio dell\'app' },
              { k: 'aliquota_id', etichetta: 'IVA', tipo: 'select', opzioni: opzioniAliquota, vuotoTesto: '— predefinita —', gruppo: 'Abbonamento' },

              { k: 'prezzo_cent', etichetta: 'Prezzo segreteria (€)', tipo: 'euro', obbligatorio: true, gruppo: 'Prezzo e durata' },
              { k: 'prezzo_web_cent', etichetta: 'Prezzo online (€)', tipo: 'euro', gruppo: 'Prezzo e durata', aiuto: 'vuoto = uguale' },
              { k: 'durata_mesi', etichetta: 'Durata (mesi)', tipo: 'numero', obbligatorio: true, predefinito: '1', gruppo: 'Prezzo e durata' },
              { k: 'durata_giorni', etichetta: 'Oppure giorni', tipo: 'numero', gruppo: 'Prezzo e durata', aiuto: '1 = singola, 28 = 4 sett.' },
              { k: 'scadenza_fine_mese', etichetta: 'Scade a fine mese solare', tipo: 'check', gruppo: 'Prezzo e durata', larghezza: 2,
                aiuto: 'chi paga il 10 scade a fine mese (trimestrale: fine del 3° mese)' },

              { k: 'lezioni_settimanali', etichetta: 'Lezioni a settimana', tipo: 'numero', gruppo: 'Lezioni e recuperi', se: (b) => b.modalita !== 'ingressi' && b.modalita !== 'libero' },
              { k: 'num_ingressi', etichetta: 'Ingressi del pacchetto', tipo: 'numero', gruppo: 'Lezioni e recuperi', se: (b) => b.modalita === 'ingressi' },
              { k: 'recuperi_max', etichetta: 'Recuperi massimi', tipo: 'numero', gruppo: 'Lezioni e recuperi', aiuto: 'vuoto = illimitati, 0 = nessuno', larghezza: 2 },
              // con i recuperi validi fino a fine abbonamento i giorni non servono
              ...(palestra.scadenza_recupero === 'abbonamento' ? [] : [
                { k: 'giorni_validita_recupero', etichetta: 'Validità recupero (giorni)', tipo: 'numero', predefinito: '30', gruppo: 'Lezioni e recuperi', aiuto: 'dalla lezione persa', larghezza: 2 },
              ]),

              { k: 'acquistabile_online', etichetta: 'Si compra dall\'app', tipo: 'check', gruppo: 'Vendita' },
              { k: 'rinnovo_automatico', etichetta: 'Rinnovo automatico mensile online', tipo: 'check', predefinito: false, gruppo: 'Vendita' },
              { k: 'attivo', etichetta: 'Attivo', tipo: 'check', gruppo: 'Vendita' },
              { k: 'archiviato', etichetta: 'Archiviato (resta nello storico)', tipo: 'check', predefinito: false, gruppo: 'Vendita' },
            ]}
            riassunto={(t) => ({
              titolo: t.codice ? `${t.nome} · ${t.codice}` : t.nome,
              dettaglio: [
                !gruppo && nomeGruppo(t.gruppo_id),
                t.famiglia,
                MODALITA.find((m) => m.v === t.modalita)?.l
                  + (t.lezioni_settimanali ? ` ${t.lezioni_settimanali}×sett.` : '')
                  + (t.num_ingressi ? ` da ${t.num_ingressi}` : ''),
                durata(t),
                euro(t.prezzo_cent) + (t.prezzo_web_cent != null && t.prezzo_web_cent !== t.prezzo_cent ? ` · online ${euro(t.prezzo_web_cent)}` : ''),
                `${quantiCorsi(t.id) || 'tutti i'} corsi`,
              ].filter(Boolean).join(' · '),
              tag: t.archiviato ? 'archiviato' : !t.gruppo_id ? 'senza gruppo' : t.attivo ? (t.acquistabile_online ? null : 'solo segreteria') : 'non attivo',
            })}
          />
        </>
      )}

      {sezione === 'famiglie' && <Famiglie palestraId={palestraId} tipi={tipi.filter((t) => !t.archiviato)} />}

      {sezione === 'gruppi' && <GruppiListino palestraId={palestraId} gruppi={gruppi} tipi={tipi.filter((t) => !t.archiviato)} />}

      {sezione === 'coperti' && (
        <CorsiCoperti tipi={tipi.filter((t) => !t.archiviato)} corsi={corsi} coperti={coperti} gruppi={gruppi} />
      )}

      {sezione === 'recuperi' && (
        <DoveSiRecupera palestra={palestra} corsi={corsi} tipi={tipi.filter((t) => !t.archiviato)} regole={regole} gruppi={gruppi}
                        onSalvato={() => router.refresh()} />
      )}

      {sezione === 'listino' && (
        <>
          <p className="muto piccolo">
            Contributi, rimborsi spese, campus: si incassano e hanno la loro ricevuta, ma non danno accesso ai corsi.
          </p>
          <Gestore
            tabella="voci_listino" ordinabile fissi={{ palestra_id: palestraId }} righe={voci} etichettaNuovo="Aggiungi voce"
            vuoto="Nessuna voce a listino."
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'codice', etichetta: 'Codice', tipo: 'testo' },
              { k: 'categoria', etichetta: 'Categoria', tipo: 'select', opzioni: CATEGORIE_VOCI, obbligatorio: true },
              { k: 'prezzo_cent', etichetta: 'Prezzo (€)', tipo: 'euro', obbligatorio: true },
              { k: 'prezzo_web_cent', etichetta: 'Prezzo online (€)', tipo: 'euro' },
              { k: 'aliquota_id', etichetta: 'Aliquota IVA', tipo: 'select', opzioni: opzioniAliquota, vuotoTesto: '— la predefinita —' },
              { k: 'attiva', etichetta: 'Attiva', tipo: 'check' },
            ]}
            riassunto={(v) => ({
              titolo: v.codice ? `${v.nome} · ${v.codice}` : v.nome,
              dettaglio: [CATEGORIE_VOCI.find((c) => c.v === v.categoria)?.l, euro(v.prezzo_cent)].filter(Boolean).join(' · '),
              tag: v.attiva ? null : 'non attiva',
            })}
          />
        </>
      )}

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Quota annuale, stagione, prove e soglie dello stato dei clienti sono in Impostazioni → Regole e prenotazioni.
      </p>
    </>
  );
}
