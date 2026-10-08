'use client';
import { useRef, useState } from 'react';
import { TestoRicco } from '@/lib/testoRicco';

// Un campo di testo con la barra di formattazione: grassetto, corsivo, titoletto, elenchi, link.
// Scrive i segni semplici di lib/testoRicco (**grassetto**, _corsivo_, ## titolo, - elenco, [testo](link)):
// si possono anche scrivere a mano. "Vedi" mostra come esce.
const SEGNI = [
  { k: 'g', testo: 'G', titolo: 'Grassetto (seleziona il testo e premi)', stile: { fontWeight: 900 } },
  { k: 'c', testo: 'C', titolo: 'Corsivo', stile: { fontStyle: 'italic', fontFamily: 'Georgia, serif' } },
  { k: 't', testo: 'Titolo', titolo: 'Titoletto: la riga diventa un titolo piccolo' },
  { k: 'p', testo: '• Elenco', titolo: 'Elenco puntato: una voce per riga' },
  { k: 'n', testo: '1. Elenco', titolo: 'Elenco numerato: una voce per riga' },
  { k: 'l', testo: 'Link', titolo: 'Link: seleziona le parole e poi incolla l\'indirizzo' },
];

export default function CampoTestoRicco({ id, value, onChange, rows = 4, placeholder }) {
  const rif = useRef(null);
  const [vedi, setVedi] = useState(false);

  // rimette il cursore (o la selezione) dove serve dopo che React ha aggiornato il testo
  const dopo = (a, b) => requestAnimationFrame(() => { const el = rif.current; if (!el) return; el.focus(); el.setSelectionRange(a, b); });

  function avvolgi(prima, poi, segnaposto) {
    const el = rif.current; const v = value || '';
    const a = el ? el.selectionStart : v.length; const b = el ? el.selectionEnd : v.length;
    let sel = v.slice(a, b);
    // gli spazi selezionati per sbaglio restano fuori dai segni
    const spaziPrima = sel.match(/^\s*/)[0]; const spaziDopo = sel.match(/\s*$/)[0];
    sel = sel.trim();
    if (!sel) sel = segnaposto;
    const nuovo = v.slice(0, a) + spaziPrima + prima + sel + poi + spaziDopo + v.slice(b);
    onChange(nuovo);
    const inizio = a + spaziPrima.length + prima.length;
    dopo(inizio, inizio + sel.length);
  }

  function righe(segno) {
    const el = rif.current; const v = value || '';
    const a = el ? el.selectionStart : v.length; const b = el ? el.selectionEnd : v.length;
    const inizio = v.lastIndexOf('\n', a - 1) + 1;
    const fineRiga = v.indexOf('\n', Math.max(b - (b > a && v[b - 1] === '\n' ? 1 : 0), a));
    const fine = fineRiga === -1 ? v.length : fineRiga;
    const blocco = v.slice(inizio, fine).split('\n');
    const togli = { t: /^#{1,3}\s+/, p: /^[-•*]\s+/, n: /^\d{1,2}[.)]\s+/ }[segno];
    const pieni = blocco.filter((r) => r.trim());
    const giaFatto = pieni.length > 0 && pieni.every((r) => togli.test(r));
    let i = 0;
    const nuovo = blocco.map((r) => {
      if (!r.trim()) return r;
      const pulita = r.replace(/^#{1,3}\s+|^[-•*]\s+|^\d{1,2}[.)]\s+/, '');
      if (giaFatto) return pulita;
      i += 1;
      return (segno === 't' ? '## ' : segno === 'p' ? '- ' : `${i}. `) + pulita;
    }).join('\n');
    // il titolo e l'elenco staccati dal testo prima: una riga vuota sopra
    const prima = v.slice(0, inizio);
    const rigaPrima = prima.endsWith('\n') ? prima.slice(0, -1).split('\n').pop() : '';
    const stessaLista = segno !== 't' && togli.test(rigaPrima);
    const stacco = !giaFatto && rigaPrima.trim() && !stessaLista ? '\n' : '';
    onChange(prima + stacco + nuovo + v.slice(fine));
    dopo(inizio + stacco.length, inizio + stacco.length + nuovo.length);
  }

  function link() {
    const el = rif.current; const v = value || '';
    const a = el ? el.selectionStart : v.length; const b = el ? el.selectionEnd : v.length;
    const sel = v.slice(a, b).trim();
    if (/^(https?:\/\/|www\.)/i.test(sel)) {
      const url = sel.startsWith('www.') ? `https://${sel}` : sel;
      const nuovo = `${v.slice(0, a)}[testo del link](${url})${v.slice(b)}`;
      onChange(nuovo); dopo(a + 1, a + 1 + 'testo del link'.length);
      return;
    }
    const parole = sel || 'testo del link';
    const nuovo = `${v.slice(0, a)}[${parole}](https://)${v.slice(b)}`;
    onChange(nuovo);
    const u = a + parole.length + 3;
    dopo(u, u + 'https://'.length);
  }

  function premi(k) {
    if (k === 'g') avvolgi('**', '**', 'grassetto');
    else if (k === 'c') avvolgi('_', '_', 'corsivo');
    else if (k === 'l') link();
    else righe(k);
  }

  return (
    <div className="ctr">
      <div className="ctr-barra" role="toolbar" aria-label="Formattazione del testo">
        {SEGNI.map((s) => (
          <button key={s.k} type="button" className="ctr-bottone" title={s.titolo} aria-label={s.titolo} style={s.stile}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => premi(s.k)}>{s.testo}</button>
        ))}
        <button type="button" className={`ctr-bottone ctr-vedi${vedi ? ' attivo' : ''}`} aria-pressed={vedi}
                onClick={() => setVedi((x) => !x)}>{vedi ? 'Scrivi' : 'Vedi come esce'}</button>
      </div>
      {vedi ? (
        <div className="ctr-vista" aria-live="polite">
          {value?.trim() ? <TestoRicco testo={value} /> : <p className="piccolo muto">Niente da vedere: scrivi prima il testo.</p>}
        </div>
      ) : (
        <textarea id={id} ref={rif} rows={rows} value={value || ''} placeholder={placeholder}
                  onChange={(e) => onChange(e.target.value)} />
      )}
      <p className="ctr-aiuto">**grassetto** · _corsivo_ · ## titolo · - elenco · riga vuota = nuovo paragrafo</p>
    </div>
  );
}
