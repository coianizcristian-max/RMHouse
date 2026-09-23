// Grafici disegnati a mano in SVG: nessuna libreria, leggeri e adatti al telefono.
// Tutti scalano in larghezza mantenendo le proporzioni (viewBox + width 100%).

const ROSSO = 'var(--rosso)';
const NERO = 'var(--nero)';

export function Barre({ dati, altezza = 150, colore = ROSSO, formato = (v) => v, etichettaOgni = 1 }) {
  // dati: [{ etichetta, valore }]
  const max = Math.max(1, ...dati.map((d) => d.valore || 0));
  const larghezza = Math.max(dati.length * 44, 280);
  const passo = larghezza / dati.length;
  const base = altezza - 26;

  return (
    <svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: '100%', height: 'auto' }} role="img">
      <line x1="0" y1={base} x2={larghezza} y2={base} stroke="var(--linea)" />
      {dati.map((d, i) => {
        const h = Math.round(((d.valore || 0) / max) * (base - 18));
        const x = i * passo + passo * 0.2;
        const w = passo * 0.6;
        return (
          <g key={i}>
            <rect x={x} y={base - h} width={w} height={h} rx="3" fill={colore} opacity={i === dati.length - 1 ? 1 : 0.75} />
            {d.valore > 0 && (
              <text x={x + w / 2} y={base - h - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill={NERO}>
                {formato(d.valore)}
              </text>
            )}
            {i % etichettaOgni === 0 && (
              <text x={x + w / 2} y={altezza - 8} textAnchor="middle" fontSize="10" fill="var(--testo-2)">{d.etichetta}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Linea({ dati, altezza = 150, colore = ROSSO, formato = (v) => v }) {
  const valori = dati.map((d) => d.valore || 0);
  const max = Math.max(1, ...valori);
  const min = Math.min(0, ...valori);
  const larghezza = Math.max(dati.length * 44, 280);
  const base = altezza - 26;
  const x = (i) => (dati.length === 1 ? larghezza / 2 : (i * (larghezza - 24)) / (dati.length - 1) + 12);
  const y = (v) => base - ((v - min) / (max - min || 1)) * (base - 20);
  const punti = dati.map((d, i) => `${x(i)},${y(d.valore || 0)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: '100%', height: 'auto' }} role="img">
      <polygon points={`12,${base} ${punti} ${x(dati.length - 1)},${base}`} fill={colore} opacity="0.1" />
      <polyline points={punti} fill="none" stroke={colore} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {dati.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.valore || 0)} r={i === dati.length - 1 ? 4.5 : 3} fill={colore} />
          {(i === dati.length - 1 || i === 0) && (
            <text x={x(i)} y={y(d.valore || 0) - 9} textAnchor="middle" fontSize="11" fontWeight="700" fill={NERO}>
              {formato(d.valore)}
            </text>
          )}
          <text x={x(i)} y={altezza - 8} textAnchor="middle" fontSize="10" fill="var(--testo-2)">{d.etichetta}</text>
        </g>
      ))}
    </svg>
  );
}

export function Anello({ dati, dimensione = 150 }) {
  // dati: [{ etichetta, valore }]
  const totale = dati.reduce((s, d) => s + (d.valore || 0), 0) || 1;
  const r = 56, c = 2 * Math.PI * r;
  const colori = ['var(--rosso)', '#000000', '#8a8a8a', '#f0a3a6', '#c9c9c9', '#5e5e5e'];
  let offset = 0;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 150 150" style={{ width: dimensione, height: dimensione, flex: 'none' }} role="img">
        <g transform="rotate(-90 75 75)">
          {dati.map((d, i) => {
            const quota = ((d.valore || 0) / totale) * c;
            const cerchio = (
              <circle key={i} cx="75" cy="75" r={r} fill="none" strokeWidth="24"
                      stroke={colori[i % colori.length]}
                      strokeDasharray={`${quota} ${c - quota}`} strokeDashoffset={-offset} />
            );
            offset += quota;
            return cerchio;
          })}
        </g>
        <text x="75" y="80" textAnchor="middle" fontSize="26" fontWeight="800" fill={NERO}>{totale}</text>
      </svg>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14, minWidth: 140 }}>
        {dati.map((d, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: colori[i % colori.length], flex: 'none' }} />
            <span style={{ flex: 1 }}>{d.etichetta}</span>
            <strong>{d.valore}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Barra orizzontale con percentuale: usata per riempimento corsi, sale, insegnanti
export function BarraRiempimento({ valore, massimo = 100, etichetta, nota }) {
  const pct = Math.min(100, Math.round(((valore || 0) / (massimo || 1)) * 100));
  const colore = pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--rosso)' : 'var(--attenzione)';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
        <span>{etichetta}</span>
        <strong>{pct}%{nota && <span className="muto" style={{ fontWeight: 400 }}> · {nota}</span>}</strong>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--linea)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: colore }} />
      </div>
    </div>
  );
}

// Riquadro con un numero grande e una variazione
export function Numero({ titolo, valore, nota, tono }) {
  const colore = tono === 'ok' ? 'var(--ok)' : tono === 'male' ? 'var(--rosso-scuro)' : 'var(--nero)';
  return (
    <div className="scheda" style={{ padding: 14 }}>
      <div className="piccolo muto" style={{ marginBottom: 2 }}>{titolo}</div>
      <div style={{ fontSize: 26, fontWeight: 850, fontStretch: '118%', color: colore, lineHeight: 1.1 }}>{valore}</div>
      {nota && <div className="piccolo muto" style={{ marginTop: 2 }}>{nota}</div>}
    </div>
  );
}
