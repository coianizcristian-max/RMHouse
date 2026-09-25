'use client';
import { useState } from 'react';
import { useSalva, BottoneSalva } from '../Salva';
import { testoSu } from '@/lib/colori';

const COLORI = ['#f40000', '#000000', '#b3001b', '#e11d9c', '#2200ff', '#008080', '#ff8c00'];

export default function Aspetto({ palestra }) {
  const { salva, stato } = useSalva(palestra.id);
  const a = palestra.area_cliente || {};
  const [f, setF] = useState({ benvenuto: a.benvenuto || '', avviso: a.avviso || '', colore: a.colore || '#f40000' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const colore = /^#[0-9a-f]{6}$/i.test(f.colore) ? f.colore : '#f40000';

  return (
    <div className="scheda-due">
      <form className="pannello" onSubmit={(e) => { e.preventDefault(); salva({ area_cliente: { ...a, ...f, colore } }); }}>
        <div className="campo"><label htmlFor="ben">Messaggio di benvenuto</label>
          <textarea id="ben" rows={3} value={f.benvenuto} onChange={set('benvenuto')}
                    placeholder="Es. Bentornati! Da ottobre il sabato mattina c'è Antigravity per principianti." />
          <span className="piccolo muto">Compare sotto il saluto, in alto.</span></div>
        <div className="campo"><label htmlFor="avv">Avviso in evidenza</label>
          <textarea id="avv" rows={3} value={f.avviso} onChange={set('avviso')}
                    placeholder="Es. Il 1° novembre la scuola è chiusa." />
          <span className="piccolo muto">Riquadro con il bordo colorato. Vuoto = nessun avviso.</span></div>
        <div className="campo">
          <label>Colore principale</label>
          <div className="tinte">
            {COLORI.map((c) => (
              <button type="button" key={c} aria-label={c} aria-pressed={colore.toLowerCase() === c}
                      onClick={() => setF({ ...f, colore: c })} style={{ background: c, color: testoSu(c) }}>
                {colore.toLowerCase() === c ? '✓' : ''}
              </button>
            ))}
          </div>
          <div className="tinte-libero" style={{ marginTop: 8 }}>
            <input type="color" value={colore} onChange={set('colore')} aria-label="Colore libero" />
            <input type="text" value={f.colore} onChange={set('colore')} aria-label="Codice colore" maxLength={7} />
          </div>
        </div>
        <BottoneSalva stato={stato} />
      </form>

      <aside>
        <div className="telefono">
          <div className="tel-testa"><strong>{palestra.nome}</strong><span style={{ color: colore }}>La mia area</span></div>
          <div className="tel-corpo">
            <div className="tel-occhiello" style={{ color: colore }}>LA MIA AREA</div>
            <div className="tel-titolo">Ciao Giulia</div>
            <p className="tel-testo">{f.benvenuto || 'La prossima lezione è giovedì alle 19:45.'}</p>
            {f.avviso && <div className="tel-avviso" style={{ borderColor: colore }}>{f.avviso}</div>}
            <div className="tel-lezione"><span style={{ background: colore }} /><div><strong>19:45</strong><br />Pole Dance Liv.3</div></div>
            <div className="tel-bottone" style={{ background: colore, color: testoSu(colore) }}>Prenota un recupero</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
