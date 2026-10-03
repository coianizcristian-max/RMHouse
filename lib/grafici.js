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

// ------------------------------------------------------------------
// Grafici in più per le statistiche
// ------------------------------------------------------------------
export const COLORI = ['var(--rosso)', '#111111', '#9a9a9a', '#f0a3a6', '#5e5e5e', '#d4d4d4', '#b31319', '#e86a70'];

// Legenda piccola sotto i grafici a più serie
export function Legenda({ serie }) {
  return (
    <div className="gr-legenda">
      {serie.map((s, i) => (
        <span key={s.nome}><i style={{ background: s.colore || COLORI[i] }} />{s.nome}</span>
      ))}
    </div>
  );
}

// Barre affiancate: dati [{ etichetta, valori: [a, b, c] }], serie [{ nome, colore }]
export function BarreGruppi({ dati, serie, altezza = 170, formato = (v) => v }) {
  const max = Math.max(1, ...dati.flatMap((d) => d.valori.map((v) => v || 0)));
  const larghezza = Math.max(dati.length * (serie.length * 14 + 16), 300);
  const passo = larghezza / dati.length;
  const base = altezza - 26;
  const w = (passo * 0.78) / serie.length;
  return (
    <>
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: '100%', height: 'auto' }} role="img">
        <line x1="0" y1={base} x2={larghezza} y2={base} stroke="var(--linea)" />
        {dati.map((d, i) => (
          <g key={i}>
            {d.valori.map((v, j) => {
              const h = Math.round(((v || 0) / max) * (base - 18));
              const x = i * passo + passo * 0.11 + j * w;
              return (
                <g key={j}>
                  <rect x={x} y={base - h} width={w - 2} height={h} rx="2" fill={serie[j].colore || COLORI[j]}>
                    <title>{`${d.etichetta} · ${serie[j].nome}: ${formato(v || 0)}`}</title>
                  </rect>
                  {v > 0 && dati.length <= 12 && (
                    <text x={x + (w - 2) / 2} y={base - h - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--nero)">{formato(v)}</text>
                  )}
                </g>
              );
            })}
            <text x={i * passo + passo / 2} y={altezza - 8} textAnchor="middle" fontSize="10" fill="var(--testo-2)">{d.etichetta}</text>
          </g>
        ))}
      </svg>
      <Legenda serie={serie} />
    </>
  );
}

// Più linee sullo stesso asse: etichette [..], serie [{ nome, colore, valori: [..] (null = nessun dato) }]
export function Linee({ etichette, serie, altezza = 170, formato = (v) => v }) {
  const tutti = serie.flatMap((s) => s.valori.filter((v) => v != null));
  const max = Math.max(1, ...tutti);
  const larghezza = Math.max(etichette.length * 44, 300);
  const base = altezza - 26;
  const x = (i) => (etichette.length === 1 ? larghezza / 2 : (i * (larghezza - 24)) / (etichette.length - 1) + 12);
  const y = (v) => base - (v / max) * (base - 20);
  return (
    <>
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: '100%', height: 'auto' }} role="img">
        <line x1="0" y1={base} x2={larghezza} y2={base} stroke="var(--linea)" />
        {serie.map((s, k) => {
          const punti = s.valori.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ');
          const colore = s.colore || COLORI[k];
          const ultimo = s.valori.reduce((u, v, i) => (v != null ? i : u), -1);
          return (
            <g key={s.nome}>
              <polyline points={punti} fill="none" stroke={colore} strokeWidth={k === 0 ? 2.8 : 2} strokeDasharray={s.tratteggio ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {s.valori.map((v, i) => v != null && (
                <circle key={i} cx={x(i)} cy={y(v)} r={i === ultimo ? 4 : 2.5} fill={colore}><title>{`${etichette[i]} · ${s.nome}: ${formato(v)}`}</title></circle>
              ))}
              {ultimo >= 0 && <text x={x(ultimo)} y={y(s.valori[ultimo]) - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill={colore}>{formato(s.valori[ultimo])}</text>}
            </g>
          );
        })}
        {etichette.map((e, i) => <text key={i} x={x(i)} y={altezza - 8} textAnchor="middle" fontSize="10" fill="var(--testo-2)">{e}</text>)}
      </svg>
      <Legenda serie={serie.map((s, k) => ({ nome: s.nome, colore: s.colore || COLORI[k] }))} />
    </>
  );
}

// Barre orizzontali con etichetta: [{ etichetta, valore, nota, href }]
export function BarreOrizzontali({ dati, formato = (v) => v, colore = 'var(--rosso)', vuoto = 'Nessun dato nel periodo.' }) {
  const max = Math.max(1, ...dati.map((d) => d.valore || 0));
  if (!dati.length) return <p className="piccolo muto" style={{ margin: 0 }}>{vuoto}</p>;
  return (
    <ul className="gr-orizz">
      {dati.map((d) => (
        <li key={d.etichetta}>
          <span className="gr-orizz-testo"><span>{d.etichetta}</span><strong>{formato(d.valore)}{d.nota && <em> · {d.nota}</em>}</strong></span>
          <span className="gr-orizz-barra"><i style={{ width: `${Math.max(2, ((d.valore || 0) / max) * 100)}%`, background: colore }} /></span>
        </li>
      ))}
    </ul>
  );
}

// Mappa di calore giorno × ora: celle [{ riga, colonna, valore, nota }]
export function Calore({ righe, colonne, celle, formato = (v) => v }) {
  const max = Math.max(1, ...celle.map((c) => c.valore || 0));
  const cella = (r, c) => celle.find((x) => x.riga === r && x.colonna === c);
  return (
    <div className="tabella-scorre">
      <table className="gr-calore">
        <thead><tr><th />{colonne.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {righe.map((r, ri) => (
            <tr key={r}>
              <th>{r}</th>
              {colonne.map((c, ci) => {
                const x = cella(ri + 1, c);
                const v = x?.valore;
                const a = v ? 0.12 + 0.88 * (v / max) : 0;
                return (
                  <td key={c} title={x ? `${r} ore ${c}: ${formato(v)}${x.nota ? ` · ${x.nota}` : ''}` : ''}
                      style={{ background: v ? `rgba(237, 28, 36, ${a.toFixed(2)})` : undefined, color: a > 0.55 ? '#fff' : undefined }}>
                    {x ? formato(v) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
