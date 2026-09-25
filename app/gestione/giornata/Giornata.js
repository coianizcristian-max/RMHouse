'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { testoSu } from '@/lib/colori';

const PX = 1.15;                         // pixel per minuto
const minuti = (iso) => {
  const d = new Date(iso);
  const [h, m] = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).split(':');
  return Number(h) * 60 + Number(m);
};
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Una giornata a colonne (sale o insegnanti) su una griglia oraria
export default function Giornata({ colonne, blocchi, oggi }) {
  const [adesso, setAdesso] = useState(null);
  useEffect(() => {
    if (!oggi) return;
    const tick = () => setAdesso(minuti(new Date().toISOString()));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [oggi]);

  if (!blocchi.length) return <div className="vuoto">Nessuna lezione in questa giornata.</div>;

  const inizi = blocchi.map((b) => minuti(b.inizio));
  const fini = blocchi.map((b) => minuti(b.fine));
  const dalle = Math.min(Math.floor(Math.min(...inizi) / 60) * 60, 16 * 60);
  const alle = Math.max(Math.ceil(Math.max(...fini) / 60) * 60, 21 * 60);
  const altezza = (alle - dalle) * PX;
  const ore = Array.from({ length: (alle - dalle) / 60 + 1 }, (_, i) => dalle + i * 60);

  return (
    <div className="giornata-scorre">
      <div className="giornata" style={{ gridTemplateColumns: `52px repeat(${colonne.length}, minmax(170px, 1fr))` }}>
        <div className="g-angolo" />
        {colonne.map((c) => (
          <div key={c.id} className="g-testa">
            <strong>{c.nome}</strong>
            {c.sotto && <span className="piccolo muto">{c.sotto}</span>}
          </div>
        ))}

        <div className="g-ore" style={{ height: altezza }}>
          {ore.map((m) => <span key={m} style={{ top: (m - dalle) * PX - 7 }}>{hhmm(m)}</span>)}
        </div>

        {colonne.map((c) => (
          <div key={c.id} className="g-colonna" style={{ height: altezza }}>
            {ore.map((m) => <span key={m} className="g-riga" style={{ top: (m - dalle) * PX }} />)}
            {adesso != null && adesso >= dalle && adesso <= alle && (
              <span className="g-adesso" style={{ top: (adesso - dalle) * PX }} />
            )}
            {blocchi.filter((b) => b.colonna === c.id).map((b) => {
              const top = (minuti(b.inizio) - dalle) * PX;
              const h = Math.max((minuti(b.fine) - minuti(b.inizio)) * PX, 30);
              const colore = b.colore || 'var(--nero)';
              const contenuto = (
                <>
                  <span className="g-ora">{hhmm(minuti(b.inizio))}–{hhmm(minuti(b.fine))}</span>
                  <strong>{b.titolo}</strong>
                  {b.sotto && <span className="g-sotto">{b.sotto}</span>}
                </>
              );
              const stile = {
                top, height: h - 3,
                ...(b.tipo === 'affitto'
                  ? { background: 'repeating-linear-gradient(135deg, var(--carta), var(--carta) 6px, #fff 6px, #fff 12px)', borderColor: 'var(--testo-2)' }
                  : { background: colore, borderColor: colore, color: testoSu(colore) }),
                opacity: b.annullata ? 0.45 : 1,
              };
              return b.href
                ? <Link key={b.id} href={b.href} className="g-blocco" style={stile}>{contenuto}</Link>
                : <div key={b.id} className="g-blocco" style={stile}>{contenuto}</div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
