import Link from 'next/link';
import { dataBreve } from '@/lib/formato';

// Moduli della persona: firmati, da firmare, da rifirmare
export default function ModuliPersona({ allievoId, moduli, firme }) {
  if (!moduli.length) return null;
  return (
    <section className="pannello">
      <h2>Moduli</h2>
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
                {firma && <Link className="link-btn piccolo" href={`/gestione/firme/${firma.id}`} target="_blank">vedi</Link>}
                {!ok && <Link className="btn btn-piccolo" href={`/gestione/persone/${allievoId}/firma?m=${m.modulo_id}`}>Fai firmare</Link>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
