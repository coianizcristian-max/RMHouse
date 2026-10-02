import Link from 'next/link';
import { dataBreve } from '@/lib/formato';

// Moduli della persona: firmati, da firmare, da rifirmare
export default function ModuliPersona({ allievoId, moduli, firme }) {
  // le firme di versioni vecchie o di moduli non più in uso: restano consultabili
  const correnti = new Set(moduli.map((m) => `${m.modulo_id}:${m.firmata_versione}`));
  const precedenti = firme.filter((f) => !correnti.has(`${f.modulo_id}:${f.versione}`));
  if (!moduli.length && !precedenti.length) return null;
  return (
    <section className="pannello">
      <div className="pannello-testa">
        <h2>Moduli</h2>
        {firme.length > 0 && <Link prefetch={false} className="btn btn-piccolo" href={`/gestione/persone/${allievoId}/firmati`} target="_blank">Stampa i firmati</Link>}
      </div>
      <ul className="mini-lista">
        {moduli.map((m) => {
          const ok = m.firmata_versione === m.versione;
          const firma = firme.find((f) => f.modulo_id === m.modulo_id && f.versione === m.firmata_versione);
          return (
            <li key={m.modulo_id}>
              <span className="ml-riga">
                <span className="ml-testo">
                  <strong>{m.titolo}</strong>
                  <span className="piccolo muto">
                    {ok ? `firmato il ${dataBreve(m.firmato_at)}` : m.firmata_versione ? 'testo cambiato: da rifirmare' : m.obbligatorio ? 'da firmare' : 'facoltativo, non firmato'}
                  </span>
                </span>
                {firma && <Link prefetch={false} className="link-btn piccolo" href={`/gestione/firme/${firma.id}`} target="_blank">apri</Link>}
                {!ok && <Link prefetch={false} className="btn btn-piccolo" href={`/gestione/persone/${allievoId}/firma?m=${m.modulo_id}`}>Fai firmare</Link>}
              </span>
            </li>
          );
        })}
      </ul>
      {precedenti.length > 0 && (
        <details className="firme-vecchie">
          <summary className="piccolo muto">Firme precedenti ({precedenti.length})</summary>
          <ul className="mini-lista">
            {precedenti.map((f) => (
              <li key={f.id}>
                <span className="ml-riga">
                  <span className="ml-testo"><strong>{f.titolo}</strong><span className="piccolo muto">versione {f.versione} · firmato il {dataBreve(f.firmato_at)}</span></span>
                  <Link prefetch={false} className="link-btn piccolo" href={`/gestione/firme/${f.id}`} target="_blank">apri</Link>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
