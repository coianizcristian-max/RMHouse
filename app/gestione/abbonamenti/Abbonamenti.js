'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Gestore from '../Gestore';
import CorsiCoperti from './CorsiCoperti';
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

const durata = (t) => t.durata_giorni
  ? `${t.durata_giorni} ${t.durata_giorni === 1 ? 'giorno' : 'giorni'}`
  : t.scadenza_fine_mese && t.durata_mesi === 1 ? 'mese solare'
  : `${t.durata_mesi} ${t.durata_mesi === 1 ? 'mese' : 'mesi'}${t.scadenza_fine_mese ? ' a fine mese' : ''}`;

export default function Abbonamenti({ palestraId, tipi, corsi, regole, palestra, voci = [], coperti = [] }) {
  const [cerca, setCerca] = useState('');
  const [famiglia, setFamiglia] = useState('');
  const [archiviati, setArchiviati] = useState(false);
  const famiglie = [...new Set(tipi.filter((t) => !t.archiviato).map((t) => t.famiglia).filter(Boolean))];
  const testo = cerca.trim().toLowerCase();
  const visibili = tipi.filter((t) =>
    (archiviati ? t.archiviato : !t.archiviato) &&
    (!famiglia || t.famiglia === famiglia) &&
    (!testo || `${t.nome} ${t.codice || ''}`.toLowerCase().includes(testo)));
  const quantiCorsi = (id) => coperti.filter((c) => c.tipo_abbonamento_id === id).length;
  const router = useRouter();
  const [sezione, setSezione] = useState('tipi');
  const [f, setF] = useState({
    quota: ((palestra.quota_iscrizione_cent || 0) / 100).toString(),
    mese: palestra.mese_inizio_stagione || 9,
    giorni: palestra.giorni_prenotabili ?? 21,
    preavviso: palestra.preavviso_ore ?? 2,
    recensione: palestra.google_review_url || '',
  });
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState('');

  async function salvaImpostazioni(e) {
    e.preventDefault();
    const { error } = await supabaseBrowser().from('palestre').update({
      quota_iscrizione_cent: Math.round(parseFloat(String(f.quota).replace(',', '.') || '0') * 100),
      mese_inizio_stagione: parseInt(f.mese, 10),
      giorni_prenotabili: parseInt(f.giorni, 10),
      preavviso_ore: parseInt(f.preavviso, 10),
      google_review_url: f.recensione || null,
    }).eq('id', palestraId);
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    setErrore(''); setSalvato(true); setTimeout(() => setSalvato(false), 2500);
    router.refresh();
  }

  const nomeOrigine = (r) =>
    r.origine === 'corso'
      ? corsi.find((c) => c.id === r.origine_id)?.nome || 'corso eliminato'
      : tipi.find((t) => t.id === r.origine_id)?.nome || 'abbonamento eliminato';

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Abbonamenti, recuperi e sconti</h1>
        <p>Tipi di abbonamento, quota annuale, regole dei recuperi e preavvisi.</p>
      </div>
      <div className="filtri">
        {[['tipi', 'Tipi di abbonamento'], ['coperti', 'Corsi coperti'], ['listino', 'Altre voci a listino'],
          ['recuperi', 'Dove si recupera'], ['generali', 'Impostazioni']].map(([k, l]) => (
          <a key={k} href="#" onClick={(e) => { e.preventDefault(); setSezione(k); }}
             aria-current={sezione === k ? 'true' : undefined}>{l}</a>
        ))}
      </div>

      {sezione === 'tipi' && (
        <>
          <div className="barra-cerca">
            <input type="search" placeholder="Cerca per nome o codice" value={cerca} onChange={(e) => setCerca(e.target.value)} />
            <span className="piccolo muto">{visibili.length} abbonamenti</span>
          </div>
          <div className="pastiglie">
            <button type="button" aria-pressed={!famiglia && !archiviati} onClick={() => { setFamiglia(''); setArchiviati(false); }}>Tutti</button>
            {famiglie.map((x) => (
              <button type="button" key={x} aria-pressed={famiglia === x && !archiviati}
                      onClick={() => { setFamiglia(x); setArchiviati(false); }}>{x}</button>
            ))}
            {tipi.some((t) => t.archiviato) && (
              <button type="button" aria-pressed={archiviati} onClick={() => { setArchiviati(true); setFamiglia(''); }}>Archiviati</button>
            )}
          </div>
          <Gestore
            tabella="tipi_abbonamento" fissi={{ palestra_id: palestraId }} righe={visibili} etichettaNuovo="Aggiungi abbonamento"
            vuoto="Nessun abbonamento con questi filtri."
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true, aiuto: 'Es. "POLE DANCE 2 volte Trimestrale"' },
              { k: 'codice', etichetta: 'Codice', tipo: 'testo', aiuto: 'Il codice breve usato in segreteria, es. "P 24 lez"' },
              { k: 'famiglia', etichetta: 'Famiglia', tipo: 'testo', aiuto: 'Raggruppa gli abbonamenti simili: Aerea adulti, Street Kids e Teen…' },
              { k: 'modalita', etichetta: 'Tipo', tipo: 'select', opzioni: MODALITA, obbligatorio: true },
              { k: 'lezioni_settimanali', etichetta: 'Lezioni a settimana', tipo: 'numero' },
              { k: 'num_ingressi', etichetta: 'Ingressi del pacchetto', tipo: 'numero' },
              { k: 'prezzo_cent', etichetta: 'Prezzo in segreteria (€)', tipo: 'euro', obbligatorio: true },
              { k: 'prezzo_web_cent', etichetta: 'Prezzo online (€)', tipo: 'euro', aiuto: 'Vuoto = uguale al prezzo in segreteria' },
              { k: 'durata_mesi', etichetta: 'Durata (mesi)', tipo: 'numero', obbligatorio: true },
              { k: 'durata_giorni', etichetta: 'Oppure durata in giorni', tipo: 'numero', aiuto: 'Se compilato vale questo: 1 = lezione singola, 28 = quattro settimane' },
              { k: 'scadenza_fine_mese', etichetta: 'Scade a fine mese solare', tipo: 'check' },
              { k: 'recuperi_max', etichetta: 'Recuperi massimi', tipo: 'numero', aiuto: 'Vuoto = illimitati, 0 = nessun recupero' },
              { k: 'giorni_validita_recupero', etichetta: 'Validità recupero (giorni)', tipo: 'numero' },
              { k: 'acquistabile_online', etichetta: 'Acquistabile online dal cliente', tipo: 'check' },
              { k: 'attivo', etichetta: 'Attivo', tipo: 'check' },
              { k: 'archiviato', etichetta: 'Archiviato (non si vende più, resta nello storico)', tipo: 'check' },
            ]}
            riassunto={(t) => ({
              titolo: t.codice ? `${t.nome} · ${t.codice}` : t.nome,
              dettaglio: [
                t.famiglia,
                MODALITA.find((m) => m.v === t.modalita)?.l
                  + (t.lezioni_settimanali ? ` ${t.lezioni_settimanali}×sett.` : '')
                  + (t.num_ingressi ? ` da ${t.num_ingressi}` : ''),
                durata(t),
                euro(t.prezzo_cent) + (t.prezzo_web_cent != null && t.prezzo_web_cent !== t.prezzo_cent ? ` · online ${euro(t.prezzo_web_cent)}` : ''),
                `${quantiCorsi(t.id) || 'tutti i'} corsi`,
              ].filter(Boolean).join(' · '),
              tag: t.archiviato ? 'archiviato' : t.attivo ? (t.acquistabile_online ? null : 'solo segreteria') : 'non attivo',
            })}
          />
        </>
      )}

      {sezione === 'coperti' && (
        <CorsiCoperti tipi={tipi.filter((t) => !t.archiviato)} corsi={corsi} coperti={coperti} />
      )}

      {sezione === 'listino' && (
        <>
          <p className="muto piccolo">
            Contributi, rimborsi spese, campus: si incassano e hanno la loro ricevuta, ma non danno accesso ai corsi.
          </p>
          <Gestore
            tabella="voci_listino" fissi={{ palestra_id: palestraId }} righe={voci} etichettaNuovo="Aggiungi voce"
            vuoto="Nessuna voce a listino."
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'codice', etichetta: 'Codice', tipo: 'testo' },
              { k: 'categoria', etichetta: 'Categoria', tipo: 'select', opzioni: CATEGORIE_VOCI, obbligatorio: true },
              { k: 'prezzo_cent', etichetta: 'Prezzo (€)', tipo: 'euro', obbligatorio: true },
              { k: 'prezzo_web_cent', etichetta: 'Prezzo online (€)', tipo: 'euro' },
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

      {sezione === 'recuperi' && (
        <>
          <h2>Dove si può recuperare</h2>
          <p className="muto piccolo">
            Una regola dice: chi frequenta questo corso (o ha questo abbonamento) può recuperare in quest'altro corso.
            Il proprio corso è sempre ammesso, anche senza regole.
          </p>
          <Gestore
            tabella="recuperi_ammessi" fissi={{ palestra_id: palestraId }} righe={regole} etichettaNuovo="Aggiungi regola"
            vuoto="Nessuna regola: si recupera solo nello stesso corso."
            campi={[
              { k: 'origine', etichetta: 'La regola vale per', tipo: 'select', obbligatorio: true,
                opzioni: [{ v: 'corso', l: 'Chi frequenta un corso' }, { v: 'abbonamento', l: 'Chi ha un abbonamento' }] },
              { k: 'origine_id', etichetta: 'Corso o abbonamento di partenza', tipo: 'select', obbligatorio: true,
                opzioni: [...corsi.map((c) => ({ v: c.id, l: `Corso: ${c.nome}` })),
                          ...tipi.map((t) => ({ v: t.id, l: `Abbonamento: ${t.nome}` }))] },
              { k: 'corso_ammesso_id', etichetta: 'Può recuperare in', tipo: 'select', obbligatorio: true,
                opzioni: corsi.map((c) => ({ v: c.id, l: c.nome })) },
            ]}
            riassunto={(r) => ({
              titolo: `${nomeOrigine(r)} → ${corsi.find((c) => c.id === r.corso_ammesso_id)?.nome || '—'}`,
              dettaglio: r.origine === 'corso' ? 'Regola per corso' : 'Regola per abbonamento',
            })}
          />
        </>
      )}

      {sezione === 'generali' && (
        <form onSubmit={salvaImpostazioni}>
          <h2>Impostazioni generali</h2>
          {errore && <div className="errore" role="alert">{errore}</div>}
          <div className="riga-2">
            <div className="campo">
              <label htmlFor="quota">Quota d'iscrizione annuale (€)</label>
              <input id="quota" inputMode="decimal" value={f.quota} onChange={(e) => setF({ ...f, quota: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="mese">La stagione inizia a</label>
              <select id="mese" value={f.mese} onChange={(e) => setF({ ...f, mese: e.target.value })}>
                {['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
                  .map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="riga-2">
            <div className="campo">
              <label htmlFor="gg">Prove prenotabili entro (giorni)</label>
              <input id="gg" type="number" min="1" value={f.giorni} onChange={(e) => setF({ ...f, giorni: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="pv">Preavviso minimo (ore)</label>
              <input id="pv" type="number" min="0" value={f.preavviso} onChange={(e) => setF({ ...f, preavviso: e.target.value })} />
            </div>
          </div>
          <div className="campo">
            <label htmlFor="rec">Link per le recensioni Google</label>
            <input id="rec" value={f.recensione} onChange={(e) => setF({ ...f, recensione: e.target.value })} />
            <span className="piccolo muto">Finisce nell'email dopo la prova.</span>
          </div>
          <button className="btn btn-primario">{salvato ? 'Salvato' : 'Salva impostazioni'}</button>
        </form>
      )}
    </>
  );
}
