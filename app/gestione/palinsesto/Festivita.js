'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Pasqua (Gauss/Meeus): YYYY-MM-DD
function pasqua(a) {
  const x = a % 19, b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * x + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((x + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return `${a}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}
const piu = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const it = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Le festività della stagione (settembre → luglio): quelle nazionali già spuntate,
// le vacanze di Natale e Pasqua proposte ma da confermare
function proposta(s) {
  const a1 = s, a2 = s + 1, p = pasqua(a2);
  return [
    { dal: `${a1}-11-01`, al: `${a1}-11-01`, motivo: 'Ognissanti', si: true },
    { dal: `${a1}-12-08`, al: `${a1}-12-08`, motivo: 'Immacolata', si: true },
    { dal: `${a1}-12-24`, al: `${a2}-01-06`, motivo: 'Vacanze di Natale', si: false, nota: 'proposta: se la scegli, Natale, Capodanno ed Epifania ci sono già dentro' },
    { dal: `${a1}-12-25`, al: `${a1}-12-26`, motivo: 'Natale e Santo Stefano', si: true },
    { dal: `${a2}-01-01`, al: `${a2}-01-01`, motivo: 'Capodanno', si: true },
    { dal: `${a2}-01-06`, al: `${a2}-01-06`, motivo: 'Epifania', si: true },
    { dal: piu(p, -3), al: piu(p, 2), motivo: 'Vacanze di Pasqua', si: false, nota: 'proposta: dal giovedì al martedì' },
    { dal: p, al: piu(p, 1), motivo: 'Pasqua e Pasquetta', si: true },
    { dal: `${a2}-04-25`, al: `${a2}-04-25`, motivo: 'Festa della Liberazione', si: true },
    { dal: `${a2}-05-01`, al: `${a2}-05-01`, motivo: 'Festa dei lavoratori', si: true },
    { dal: `${a2}-06-02`, al: `${a2}-06-02`, motivo: 'Festa della Repubblica', si: true },
  ];
}

export default function Festivita({ palestraId, chiusure = [] }) {
  const router = useRouter();
  const ora = new Date();
  const stagioneOra = ora.getMonth() + 1 >= 8 ? ora.getFullYear() : ora.getFullYear() - 1;
  const [stagione, setStagione] = useState(stagioneOra);
  const [righe, setRighe] = useState(null);
  const [msg, setMsg] = useState('');
  const [invio, setInvio] = useState(false);
  const gia = (r) => chiusure.some((c) => r.dal && c.dal <= (r.al || r.dal) && c.al >= r.dal);
  const cambia = (i, k, val) => setRighe((l) => l.map((r, j) => (j === i ? { ...r, [k]: val } : r)));

  function proponi() {
    setMsg('');
    setRighe(proposta(stagione).map((r) => (gia(r) ? { ...r, si: false, gia: true } : r)));
  }
  const scelte = (righe || []).filter((r) => r.si && r.dal && !r.gia);
  async function salva() {
    setInvio(true); setMsg('');
    const { data, error } = await supabaseBrowser().rpc('aggiungi_chiusure', {
      p_palestra: palestraId, p_righe: scelte.map(({ dal, al, motivo }) => ({ dal, al: al || dal, motivo })),
    });
    setInvio(false);
    if (error) { setMsg('Non salvato: riprova.'); return; }
    setRighe(null);
    setMsg(data ? `Salvate ${data} chiusure${data < scelte.length ? ` (${scelte.length - data} erano già comprese in un'altra, es. dentro le vacanze di Natale)` : ''}: le lezioni di quei giorni non si fanno (niente recuperi, scadenze uguali) e nel palinsesto il giorno risulta chiuso.` : 'Nessuna chiusura nuova (c\'erano già).');
    router.refresh();
  }

  return (
    <div className="festivita">
      {!righe ? (
        <div className="festivita-testa">
          <span>Le festività della stagione te le propongo io: controlli, togli o aggiungi, e salvi.</span>
          <select value={stagione} onChange={(e) => setStagione(Number(e.target.value))} aria-label="Stagione">
            {[stagioneOra, stagioneOra + 1].map((a) => <option key={a} value={a}>stagione {a}/{String(a + 1).slice(2)}</option>)}
          </select>
          <button type="button" className="btn btn-piccolo" onClick={proponi}>Proponi le festività</button>
        </div>
      ) : (
        <>
          <div className="festivita-testa"><strong>Festività proposte · stagione {stagione}/{String(stagione + 1).slice(2)}</strong>
            <span className="piccolo muto">togli la spunta a quelle che non fate, correggi le date, aggiungi le vostre (es. santo patrono, carnevale)</span></div>
          <div className="festivita-elenco" role="table">
            {righe.map((r, i) => (
              <div key={i} className={`festivita-riga${r.si ? '' : ' no'}`} role="row">
                <input type="checkbox" checked={!!r.si} disabled={r.gia} onChange={(e) => cambia(i, 'si', e.target.checked)} aria-label={`Includi ${r.motivo || 'chiusura'}`} />
                <input type="date" value={r.dal} onChange={(e) => cambia(i, 'dal', e.target.value)} aria-label="Dal" />
                <input type="date" value={r.al} min={r.dal} onChange={(e) => cambia(i, 'al', e.target.value)} aria-label="Al" />
                <input value={r.motivo} onChange={(e) => cambia(i, 'motivo', e.target.value)} placeholder="Motivo (es. Santo patrono)" aria-label="Motivo" />
                <span className="piccolo muto">{r.gia ? 'già messa' : r.nota || (r.dal === r.al ? '' : `${it(r.dal)} → ${it(r.al)}`)}</span>
              </div>
            ))}
          </div>
          <div className="festivita-azioni">
            <button type="button" className="btn btn-piccolo" onClick={() => setRighe((l) => [...l, { dal: '', al: '', motivo: '', si: true }])}>+ aggiungi un giorno</button>
            <button type="button" className="btn btn-primario" disabled={invio || !scelte.length} onClick={salva}>{invio ? 'Salvo…' : `Salva ${scelte.length} ${scelte.length === 1 ? 'chiusura' : 'chiusure'}`}</button>
            <button type="button" className="link-btn piccolo" onClick={() => setRighe(null)}>annulla</button>
          </div>
        </>
      )}
      {msg && <p className="piccolo" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}
