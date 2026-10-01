'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

// Privacy dal telefono: consenso alle promozioni, copia dei dati, richiesta di cancellazione
export default function IMieiDati({ allievi, marketing, privacyDal }) {
  const router = useRouter();
  const [si, setSi] = useState(marketing);
  const [chiedi, setChiedi] = useState(null);      // id della persona di cui si chiede la cancellazione
  const [nota, setNota] = useState('');
  const [avviso, setAvviso] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function consenso(v) {
    setSi(v); setErrore('');
    const { error } = await supabaseBrowser().rpc('imposta_consenso_marketing', { p_si: v });
    if (error) { setSi(!v); setErrore('Non salvato. Riprova.'); return; }
    setAvviso(v ? 'Consenso dato: riceverai novità e promozioni.' : 'Consenso tolto: niente più promozioni.');
    router.refresh();
  }

  async function richiesta(id) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('richiesta_privacy', { p_allievo: id, p_tipo: 'cancellazione', p_nota: nota || null });
    setInvio(false);
    if (error) { setErrore('Richiesta non inviata. Riprova.'); return; }
    setChiedi(null); setNota('');
    setAvviso('Richiesta inviata: la segreteria ti risponde entro 30 giorni.');
  }

  return (
    <div className="area-casa">
      <div className="ac-testa">
        <h1>I miei dati</h1>
        <p className="ac-nota" style={{ margin: '2px 0 0' }}>
          Privacy accettata{privacyDal ? ` il ${dataBreve(privacyDal)}` : ''}. Leggi l'<a href="/privacy">informativa</a> e la <a href="/cookie">cookie policy</a>.
        </p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}

      <section className="ac-sezione">
        <h2>Novità e promozioni</h2>
        <label className="ac-avviso" style={{ cursor: 'pointer' }}>
          <span className="piccolo">Voglio ricevere novità su corsi, stage ed eventi. Poche email, cambi idea quando vuoi.</span>
          <input type="checkbox" style={{ width: 24, height: 24, flex: "none", accentColor: "var(--rosso)" }} checked={si} onChange={(e) => consenso(e.target.checked)} aria-label="Consenso a novità e promozioni" />
        </label>
        <p className="ac-nota" style={{ marginTop: 6 }}>Le comunicazioni di servizio (conferme, promemoria, scadenze) arrivano comunque.</p>
      </section>

      <section className="ac-sezione">
        <h2>Una copia dei miei dati</h2>
        {allievi.map((a) => (
          <a key={a.id} className="ac-recupero" href={`/api/privacy/${a.id}`} style={{ background: 'var(--carta)' }}>
            <span><strong>{a.nome}</strong><span className="piccolo">anagrafica, iscrizioni, pagamenti, presenze…</span></span>
            <span className="btn btn-piccolo">Scarica</span>
          </a>
        ))}
      </section>

      <section className="ac-sezione">
        <h2>Cancellazione</h2>
        <p className="ac-nota">
          Cancelliamo tutto quello che la legge non ci obbliga a tenere (le ricevute vanno conservate 10 anni).
          Chi ha un abbonamento in corso perde l'accesso all'app.
        </p>
        {allievi.map((a) => (
          <div key={a.id} style={{ marginBottom: 6 }}>
            {chiedi === a.id ? (
              <div className="conferma-disdetta">
                <span>Chiedi la cancellazione dei dati di {a.nome}?</span>
                <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Una nota per la segreteria (facoltativa)"
                       style={{ minHeight: 40, padding: '8px 10px', border: '1px solid var(--linea)', borderRadius: 10, font: 'inherit' }} />
                <span className="azioni">
                  <button className="btn btn-primario btn-piccolo" disabled={invio} onClick={() => richiesta(a.id)}>{invio ? 'Invio…' : 'Sì, invia la richiesta'}</button>
                  <button className="btn btn-piccolo" onClick={() => setChiedi(null)}>No</button>
                </span>
              </div>
            ) : (
              <button className="link-btn piccolo" onClick={() => setChiedi(a.id)}>Chiedi la cancellazione dei dati di {a.nome}</button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
