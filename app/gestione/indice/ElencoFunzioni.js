'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// "Tutte le funzioni" con la ricerca per parola chiave: mentre si scrive restano solo le voci che la contengono
// (nel nome, nella spiegazione o nell'area), con le parole trovate evidenziate.
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function Evidenzia({ testo, parole }) {
  if (!parole.length) return testo;
  const re = new RegExp(`(${parole.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const n = norm(testo);
  // si cerca sul testo senza accenti ma si evidenzia quello vero: stesse posizioni carattere per carattere
  const pezzi = []; let ultimo = 0; let m;
  while ((m = re.exec(n)) !== null) {
    if (m.index > ultimo) pezzi.push(testo.slice(ultimo, m.index));
    pezzi.push(<mark key={m.index}>{testo.slice(m.index, m.index + m[0].length)}</mark>);
    ultimo = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (ultimo < testo.length) pezzi.push(testo.slice(ultimo));
  return pezzi;
}

export default function ElencoFunzioni({ sezioni, pubbliche = [] }) {
  const [q, setQ] = useState('');
  const campo = useRef(null);
  useEffect(() => { if (window.innerWidth >= 900) campo.current?.focus(); }, []);
  const parole = norm(q).split(/\s+/).filter(Boolean);
  const passa = (voce, area) => parole.every((p) => norm(`${voce[0]} ${voce[2]} ${area}`).includes(p));
  const filtrate = sezioni.map((s) => ({ ...s, voci: s.voci.filter((v) => passa(v, s.area)) })).filter((s) => s.voci.length);
  const pubbl = pubbliche.filter((v) => passa(v, 'pagine pubbliche sito clienti'));
  const totale = filtrate.reduce((t, s) => t + s.voci.length, 0) + pubbl.length;

  const voce = ([testo, href, spiega], esterna) => (
    <Link prefetch={false} key={testo + href} href={href} target={esterna ? '_blank' : undefined}>
      <span>
        <strong style={{ color: 'var(--nero)' }}><Evidenzia testo={testo} parole={parole} /></strong>
        <span className="piccolo muto" style={{ display: 'block' }}><Evidenzia testo={spiega} parole={parole} /></span>
      </span>
      <span className="conta">{esterna ? '↗' : '›'}</span>
    </Link>
  );

  return (
    <>
      <div className="intestazione indice-testa">
        <div>
          <div className="occhiello">Guida</div>
          <h1>Tutte le funzioni</h1>
          <p>Cosa sa fare il gestionale e dove sta di casa ogni cosa.</p>
        </div>
        <div className="indice-cerca">
          <input ref={campo} type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca una funzione"
                 placeholder="Cerca una funzione… (es. rimborso, certificati, whatsapp)" autoComplete="off" />
          {q && <span className="piccolo muto">{totale === 0 ? 'Niente con queste parole.' : `${totale} ${totale === 1 ? 'funzione' : 'funzioni'}`}</span>}
        </div>
      </div>

      {filtrate.map((s) => (
        <div key={s.area}>
          <h2 className="sezione">{s.area}</h2>
          <div className="da-fare">{s.voci.map((v) => voce(v, false))}</div>
        </div>
      ))}

      {pubbl.length > 0 && (
        <>
          <h2 className="sezione">Pagine pubbliche</h2>
          <p className="piccolo muto" style={{ marginTop: -4 }}>
            Quelle che vedono i clienti: aprile in una scheda nuova per controllarle.
          </p>
          <div className="da-fare">{pubbl.map((v) => voce(v, true))}</div>
        </>
      )}

      {q && totale === 0 && (
        <div className="vuoto">Nessuna funzione contiene «{q}». Prova con una parola sola, o guarda le aree qui sopra togliendo il filtro.</div>
      )}
    </>
  );
}
