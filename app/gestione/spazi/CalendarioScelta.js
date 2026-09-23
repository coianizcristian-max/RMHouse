'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora } from '@/lib/formato';

const MIN = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const daMinuti = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const inMinuti = (hhmm) => {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
};

// Calendario della giornata dentro il modulo: mostra lezioni e affitti di
// tutte le sale e disegna sopra la fascia che si sta scegliendo.
// Toccando una colonna si sposta l'inizio, la durata resta quella.
export default function CalendarioScelta({ palestraId, sale, data, salaId, dalle, alle, onScegli }) {
  const [righe, setRighe] = useState(null);

  useEffect(() => {
    let vivo = true;
    if (!data) return;
    setRighe(null);
    supabaseBrowser().rpc('agenda_sale', { p_palestra: palestraId, p_data: data })
      .then(({ data: d }) => { if (vivo) setRighe(d || []); });
    return () => { vivo = false; };
  }, [palestraId, data]);

  const inizioSel = inMinuti(dalle);
  const fineSel = inMinuti(alle);
  const durata = Math.max(fineSel - inizioSel, 15);

  const tutte = righe || [];
  const primo = Math.min(inizioSel, ...tutte.map((r) => MIN(r.inizio)), 9 * 60);
  const ultimo = Math.max(fineSel, ...tutte.map((r) => MIN(r.fine)), 22 * 60);
  const dal = Math.floor(primo / 60) * 60;
  const al = Math.ceil(ultimo / 60) * 60;
  const px = 1.15;
  const altezza = (al - dal) * px;

  // una colonna per sala: quella scelta resta in evidenza
  const colonne = salaId ? sale.filter((s) => s.id === salaId) : sale;

  const occupata = (sala) => tutte.some(
    (r) => r.sala_id === sala && MIN(r.inizio) < fineSel && MIN(r.fine) > inizioSel);

  function scegli(e, sala) {
    const rett = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rett.top;
    let minuti = dal + Math.round(y / px / 15) * 15;          // si aggancia al quarto d'ora
    minuti = Math.max(dal, Math.min(minuti, al - durata));
    onScegli({ sala_id: sala, ora: daMinuti(minuti), fine_ora: daMinuti(minuti + durata) });
  }

  return (
    <div className="campo">
      <label>Calendario del giorno</label>

      {righe === null && <p className="piccolo muto">Carico la giornata…</p>}

      <div className="calendario-scelta">
        <div className="ore" style={{ height: altezza }}>
          {Array.from({ length: (al - dal) / 60 + 1 }, (_, i) => (
            <span key={i} style={{ top: i * 60 * px - 6 }}>{daMinuti(dal + i * 60)}</span>
          ))}
        </div>

        <div className="colonne" style={{ gridTemplateColumns: `repeat(${colonne.length}, minmax(96px, 1fr))` }}>
          {colonne.map((s) => {
            const suo = tutte.filter((r) => r.sala_id === s.id);
            const scelta = !salaId || salaId === s.id;
            const libera = !occupata(s.id);
            return (
              <div key={s.id} className="colonna-sala">
                <div className={`testa-sala${salaId === s.id ? ' scelta' : ''}`}>{s.nome}</div>
                <div className="corpo-sala" style={{ height: altezza }} onClick={(e) => scegli(e, s.id)}>
                  {Array.from({ length: (al - dal) / 60 + 1 }, (_, i) => (
                    <span key={i} className="linea" style={{ top: i * 60 * px }} />
                  ))}

                  {suo.map((r) => (
                    <div key={r.id} className={`impegno ${r.tipo}`}
                         style={{ top: (MIN(r.inizio) - dal) * px, height: Math.max((MIN(r.fine) - MIN(r.inizio)) * px - 2, 20) }}
                         title={`${r.titolo} · ${ora(r.inizio)}–${ora(r.fine)}`}>
                      <strong>{ora(r.inizio)}</strong> {r.titolo}
                    </div>
                  ))}

                  {scelta && (
                    <div className={`scelta-fascia${libera ? '' : ' occupata'}`}
                         style={{ top: (inizioSel - dal) * px, height: Math.max(durata * px - 2, 22) }}>
                      {dalle}–{alle}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <span className="piccolo muto">
        Tocca il calendario per spostare la fascia: la durata resta quella che hai impostato.
        Grigio le lezioni, rosso gli affitti, nero gli eventi.
      </span>
    </div>
  );
}
