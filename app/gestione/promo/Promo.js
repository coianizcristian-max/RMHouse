'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora } from '@/lib/formato';

export default function Promo({ palestraId, corsi, storico }) {
  const router = useRouter();
  const [oggetto, setOggetto] = useState('');
  const [corpo, setCorpo] = useState('Ciao {{nome}},\n\n');
  const [scelti, setScelti] = useState([]);
  const [conta, setConta] = useState(null);
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  // quante persone riceverebbero il messaggio, aggiornato mentre si scelgono i corsi
  useEffect(() => {
    let vivo = true;
    supabaseBrowser().rpc('conta_promo', {
      p_palestra: palestraId, p_corsi: scelti.length ? scelti : null,
    }).then(({ data }) => { if (vivo) setConta(data); });
    return () => { vivo = false; };
  }, [palestraId, scelti]);

  const spunta = (id) => setScelti((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  async function manda(e) {
    e.preventDefault();
    if (!oggetto.trim() || corpo.trim().length < 10) { setErrore('Servono un oggetto e un testo.'); return; }
    if (!confirm(`Mandare a ${conta?.destinatari ?? 0} persone?`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('invia_promo', {
      p_palestra: palestraId, p_oggetto: oggetto.trim(), p_corpo: corpo,
      p_corsi: scelti.length ? scelti : null,
    });
    setInvio(false);
    if (error) { setErrore('Invio non riuscito.'); return; }
    setAvviso(`In coda per ${data} persone: partono entro cinque minuti.`);
    setOggetto(''); setCorpo('Ciao {{nome}},\n\n'); setScelti([]);
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Promozioni</h1>
        <p>Un messaggio mirato agli iscritti di certi corsi. Arriva solo a chi ha dato il consenso alle comunicazioni.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <div className="griglia" style={{ marginBottom: 14 }}>
        <div className="tessera tessera-rossa">
          <div className="etichetta">Arriverebbe a</div>
          <div className="cifra">{conta?.destinatari ?? '…'}</div>
          <div className="sotto">{scelti.length ? `${scelti.length} corsi scelti` : 'tutti gli iscritti attivi'}</div>
        </div>
        <div className="tessera">
          <div className="etichetta">Senza consenso</div>
          <div className="cifra">{conta?.senza_consenso ?? '…'}</div>
          <div className="sotto">esclusi per legge</div>
        </div>
      </div>

      <form onSubmit={manda}>
        <h3>Il messaggio</h3>
        <div className="campo">
          <label htmlFor="og">Oggetto</label>
          <input id="og" value={oggetto} onChange={(e) => setOggetto(e.target.value)}
                 placeholder="Es. Open day di sabato, porta un'amica" />
        </div>
        <div className="campo">
          <label htmlFor="co">Testo</label>
          <textarea id="co" style={{ minHeight: 200 }} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
          <span className="piccolo muto">
            Puoi usare <strong>{'{{nome}}'}</strong>: viene sostituito con il nome di chi riceve.
          </span>
        </div>

        <h3>A chi</h3>
        <p className="piccolo muto" style={{ marginTop: -6 }}>
          Nessun corso scelto significa tutti gli iscritti attivi.
        </p>
        <div className="filtri" style={{ marginBottom: 14 }}>
          {corsi.map((c) => (
            <a key={c.id} href="#" onClick={(e) => { e.preventDefault(); spunta(c.id); }}
               aria-current={scelti.includes(c.id) ? 'true' : undefined}>{c.nome}</a>
          ))}
        </div>

        <div className="azioni">
          <button className="btn btn-primario" disabled={invio || !conta?.destinatari}>
            Manda a {conta?.destinatari ?? 0} persone
          </button>
        </div>
      </form>

      {storico.length > 0 && (
        <>
          <h2 className="sezione">Ultime promozioni</h2>
          <ul className="elenco">
            {storico.map((s) => (
              <li key={s.chiave} className="persona">
                <span>
                  {s.oggetto}
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    {dataBreve(s.quando)} alle {ora(s.quando)} · {s.quanti} destinatari
                  </span>
                </span>
                <span className="tag tag-neutro">{s.inviati} inviate</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Chi non ha spuntato il consenso alle comunicazioni promozionali non riceve nulla, anche se è iscritto:
        è una regola di legge, non una dimenticanza.
      </p>
    </>
  );
}
