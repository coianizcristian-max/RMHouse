'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FirmaModulo from '../../FirmaModulo';
import { dataBreve } from '@/lib/formato';

const minore = (d) => d && new Date(d) > new Date(new Date().setFullYear(new Date().getFullYear() - 18));

export default function Moduli({ elenco }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">La mia area</div>
        <h1>Moduli</h1>
        <p>Regolamento, privacy e autorizzazioni: si leggono e si firmano qui, col dito.</p>
      </div>
      {elenco.map(({ allievo: a, moduli }) => (
        <section key={a.id} style={{ marginBottom: 22 }}>
          {elenco.length > 1 && <h2 className="sezione">{a.nome}</h2>}
          {moduli.map((m) => {
            const ok = m.firmata_versione === m.versione;
            const chiave = `${a.id}:${m.modulo_id}`;
            return (
              <div key={chiave} className="scheda" style={{ marginBottom: 10 }}>
                <div className="pannello-testa" style={{ marginBottom: 0 }}>
                  <span>
                    <strong style={{ color: 'var(--nero)' }}>{m.titolo}</strong>
                    <span className="piccolo muto" style={{ display: 'block' }}>
                      {ok ? `firmato il ${dataBreve(m.firmato_at)}` : m.firmata_versione ? 'il testo è cambiato: va firmato di nuovo' : m.obbligatorio ? 'da firmare' : 'facoltativo'}
                    </span>
                  </span>
                  {ok ? <span className="tag tag-ok">firmato</span>
                    : apri !== chiave && <button className="btn btn-piccolo btn-primario" onClick={() => setApri(chiave)}>Leggi e firma</button>}
                </div>
                {apri === chiave && (
                  <FirmaModulo modulo={{ id: m.modulo_id, titolo: m.titolo, testo: m.testo }} allievo={a} minore={minore(a.data_nascita)}
                               nomeSuggerito={`${a.nome} ${a.cognome}`} onFatto={() => { setApri(null); router.refresh(); }} />
                )}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
