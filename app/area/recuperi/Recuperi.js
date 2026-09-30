'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora, dataBreve, giornoLungo } from '@/lib/formato';

const MOTIVI = {
  credito_scaduto: 'Questo credito è scaduto.',
  lezione_al_completo: 'Quella lezione si è riempita un attimo fa.',
  lezione_non_disponibile: 'Quella lezione non è più prenotabile.',
  certificato_scaduto: 'Prima serve il certificato medico valido.',
  corso_non_ammesso_per_recupero: 'Su quel corso non si può recuperare.',
  credito_non_valido: 'Questo credito è già stato usato.',
};

export default function Recuperi({ crediti, piuAllievi }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  async function prenota(credito, lezione) {
    if (!confirm(`Prenotare ${lezione.corso} di ${giornoLungo(lezione.inizio).toLowerCase()} alle ${ora(lezione.inizio)}?`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('prenota_recupero', {
      p_credito: credito.id, p_lezione: lezione.lezione_id,
    });
    setInvio(false);
    if (error) {
      const chiave = Object.keys(MOTIVI).find((k) => error.message?.includes(k));
      setErrore(chiave ? MOTIVI[chiave] : 'Prenotazione non riuscita. Riprova.');
      router.refresh();
      return;
    }
    setAvviso('Recupero prenotato: lo trovi fra le prossime lezioni.');
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">La mia area</div>
        <h1>Recuperi</h1>
        <p>Le lezioni che puoi recuperare e dove usarle.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      {crediti.length === 0 && (
        <div className="vuoto">
          Non hai recuperi da usare.
        </div>
      )}

      {crediti.map((c) => (
        <div key={c.id} id={c.id} style={{ marginBottom: 28 }}>
          <h2 className="sezione">{c.corso}</h2>
          <p className="piccolo muto" style={{ marginTop: -4 }}>
            {piuAllievi ? `${c.allievo} · ` : ''}da usare entro il {dataBreve(c.scadenza)}
          </p>

          {c.lezioni.length === 0 ? (
            <div className="vuoto">
              Al momento non ci sono lezioni disponibili per questo recupero.
              <div className="piccolo" style={{ marginTop: 6 }}>Chiedi in segreteria: possono aprirti un altro corso.</div>
            </div>
          ) : (
            <ul className="elenco">
              {c.lezioni.map((l) => (
                <li key={l.lezione_id} className="persona">
                  <span>
                    <strong style={{ color: 'var(--nero)', textTransform: 'capitalize' }}>
                      {giornoLungo(l.inizio)} {ora(l.inizio)}
                    </strong>
                    <span className="piccolo muto" style={{ display: 'block' }}>
                      {l.corso}{l.sala ? ` · ${l.sala}` : ''}{l.insegnante ? ` · ${l.insegnante}` : ''}
                      {l.liberi > 0 ? ` · ${l.liberi} posti liberi` : ' · al completo'}
                    </span>
                  </span>
                  <button className="btn" disabled={invio || l.liberi === 0} onClick={() => prenota(c, l)}>
                    Prenota
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <p style={{ marginTop: 20 }}><Link href="/area">Torna alla mia area</Link></p>
    </>
  );
}
