'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora, euro } from '@/lib/formato';

const MOTIVI = {
  posti_esauriti: 'I posti sono finiti.',
  gia_iscritto: 'Risulta già iscritto.',
  evento_non_prenotabile: 'Per questo evento le iscrizioni non sono aperte.',
  evento_gia_passato: 'Questo evento è già passato.',
};

export default function EventiArea({ eventi, allievi }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  async function iscrivi(e, allievo) {
    if (!confirm(`Iscrivere ${allievo.nome} a "${e.titolo}"?${e.prezzo_cent > 0 ? ` Costo ${euro(e.prezzo_cent)}, si paga in segreteria.` : ''}`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('iscrivi_evento', {
      p_evento: e.id, p_allievo: allievo.id, p_persone: 1, p_note: null,
    });
    setInvio(false);
    if (error) {
      const k = Object.keys(MOTIVI).find((m) => error.message?.includes(m));
      setErrore(k ? MOTIVI[k] : 'Iscrizione non riuscita.');
      return;
    }
    setAvviso('Iscrizione registrata.');
    router.refresh();
  }

  async function annulla(iscrizione) {
    if (!confirm('Annullare questa iscrizione?')) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('annulla_iscrizione_evento', { p_iscrizione: iscrizione.id });
    setInvio(false);
    if (error) { setErrore('Non è stato possibile annullare.'); return; }
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">La mia area</div>
        <h1>Eventi</h1>
        <p>Open day, stage, saggi e campus della scuola.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      {eventi.length === 0 && <div className="vuoto">Nessun evento in programma.</div>}

      {eventi.map((e) => {
        const liberi = e.posti ? Math.max(e.posti - e.occupati, 0) : null;
        return (
          <div key={e.id} className="scheda" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
            {e.locandina && <img src={e.locandina} alt="" className="copertina" style={{ borderRadius: 0 }} />}
            <div style={{ padding: 16 }}>
              <strong style={{ color: 'var(--nero)', fontSize: 17 }}>{e.titolo}</strong>
              <div className="piccolo muto" style={{ marginTop: 2 }}>
                {dataBreve(e.inizio)} · {ora(e.inizio)}{e.fine && `–${ora(e.fine)}`}
                {e.luogo ? ` · ${e.luogo}` : ''}
                {e.prezzo_cent > 0 ? ` · ${euro(e.prezzo_cent)}` : ' · gratuito'}
                {liberi !== null && ` · ${liberi} posti liberi`}
              </div>
              {e.descrizione && <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{e.descrizione}</p>}

              {e.iscritti.length > 0 && (
                <ul className="elenco" style={{ marginTop: 10 }}>
                  {e.iscritti.map((i) => (
                    <li key={i.id} className="persona">
                      <span>{i.nome}<span className="piccolo muto" style={{ display: 'block' }}>iscritto</span></span>
                      <button className="link-btn piccolo pericolo" disabled={invio} onClick={() => annulla(i)}>annulla</button>
                    </li>
                  ))}
                </ul>
              )}

              {e.prenotabile && (liberi === null || liberi > 0) && (
                <div className="azioni-riga" style={{ marginTop: 12 }}>
                  {allievi
                    .filter((a) => !e.iscritti.some((i) => i.allievo_id === a.id))
                    .map((a) => (
                      <button key={a.id} className="btn" disabled={invio} onClick={() => iscrivi(e, a)}>
                        {allievi.length > 1 ? `Iscrivi ${a.nome}` : 'Iscrivimi'}
                      </button>
                    ))}
                </div>
              )}

              {e.prenotabile && liberi === 0 && <span className="tag tag-neutro">posti esauriti</span>}
              {!e.prenotabile && <span className="piccolo muto">Per iscriverti chiedi in segreteria.</span>}
            </div>
          </div>
        );
      })}

      <p style={{ marginTop: 20 }}><Link href="/area">Torna alla mia area</Link></p>
    </>
  );
}
