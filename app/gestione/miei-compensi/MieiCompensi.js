'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve, ora } from '@/lib/formato';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const NOTA = { da_verificare: 'non confermata: non contata', sostituita: 'tenuta da un\'altra: non contata', forfait: 'nel forfait' };

export default function MieiCompensi({ cedolini }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(cedolini[0]?.id || null);
  const [righe, setRighe] = useState({});
  const [nota, setNota] = useState('');
  const [segnala, setSegnala] = useState(null);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function apri(id) {
    setAperto(aperto === id ? null : id);
    if (aperto === id) return;
    if (!righe[id]) {
      const { data } = await supabaseBrowser().rpc('dettaglio_compenso', { p_id: id });
      setRighe((x) => ({ ...x, [id]: data || [] }));
    }
  }
  // il mese più recente si apre già con le sue lezioni
  useEffect(() => {
    const id = cedolini[0]?.id;
    if (id) supabaseBrowser().rpc('dettaglio_compenso', { p_id: id }).then(({ data }) => setRighe((x) => ({ ...x, [id]: data || [] })));
  }, [cedolini]);

  async function rispondi(id, ok) {
    if (!ok && !nota.trim()) { setErrore('Scrivi cosa non torna.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('rispondi_cedolino', { p_id: id, p_ok: ok, p_nota: ok ? null : nota });
    setInvio(false);
    if (error) { setErrore('Non inviato. Riprova.'); return; }
    setSegnala(null); setNota(''); router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <h1>I miei compensi</h1>
        <p>Il conteggio del mese con le lezioni che hai confermato dall&apos;appello. Controllalo e conferma, oppure segnala cosa non torna.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {cedolini.length === 0 && <div className="vuoto">Ancora nessun conteggio: la segreteria lo prepara a fine mese.</div>}
      {cedolini.map((c) => (
        <section key={c.id} className="pannello mc-mese">
          <button type="button" className="mc-testa" onClick={() => apri(c.id)} aria-expanded={aperto === c.id}>
            <span>
              <strong style={{ textTransform: 'capitalize' }}>{MESI[c.mese - 1]} {c.anno}</strong>
              <span className="piccolo muto">{c.lezioni} lezioni · {Number(c.ore).toFixed(1).replace('.', ',')} ore{c.sostituzioni ? ` · ${c.sostituzioni} sostituzioni` : ''}</span>
            </span>
            <span className="mc-destra">
              <strong>{euro(c.totale_cent)}</strong>
              {c.stato === 'pagato' ? <span className="tag tag-ok">pagato</span>
                : c.visto_at ? <span className="tag tag-ok">confermato</span>
                : c.segnalazione ? <span className="tag tag-rosso">segnalato</span>
                : <span className="tag tag-attenzione">da controllare</span>}
            </span>
          </button>
          {aperto === c.id && (
            <div className="mc-corpo">
              {c.da_verificare > 0 && <p className="mc-avviso">{c.da_verificare} lezioni senza la tua conferma non sono contate: apri la lezione dall&apos;agenda, tocca &quot;Ho tenuto io la lezione&quot;, poi avvisa la segreteria.</p>}
              <ul className="elenco">
                {(righe[c.id] || []).map((r, i) => (
                  <li key={i} className={`persona cr-${r.stato}`}>
                    <span>
                      {r.inizio ? `${dataBreve(r.data)} ${ora(r.inizio)} · ` : ''}{r.corso}
                      <span className="piccolo muto" style={{ display: 'block' }}>
                        {[r.ore > 0 && `${Number(r.ore).toFixed(2).replace('.', ',')} h`, r.sostituzione, r.regola, NOTA[r.stato]].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="piccolo" style={{ fontWeight: 700 }}>{['contata', 'mensile'].includes(r.stato) ? euro(r.importo_cent) : '—'}</span>
                  </li>
                ))}
              </ul>
              {c.segnalazione && <p className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>Hai segnalato: “{c.segnalazione}” il {dataBreve(c.segnalata_at)}</p>}
              <div className="azioni-riga">
                <Link prefetch={false} className="btn btn-piccolo" href={`/gestione/compensi/${c.id}`} target="_blank">PDF</Link>
                {c.stato !== 'pagato' && !c.visto_at && (
                  <button type="button" className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => rispondi(c.id, true)}>Confermo, è giusto</button>
                )}
                {c.stato !== 'pagato' && segnala !== c.id && (
                  <button type="button" className="btn btn-piccolo" onClick={() => { setSegnala(c.id); setNota(''); }}>Segnala una differenza</button>
                )}
              </div>
              {segnala === c.id && (
                <div className="mc-segnala">
                  <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es. manca la lezione del 12 alle 18:30, ho sostituito Elena" />
                  <span className="azioni-riga">
                    <button type="button" className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => rispondi(c.id, false)}>Invia alla segreteria</button>
                    <button type="button" className="link-btn piccolo" onClick={() => setSegnala(null)}>annulla</button>
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
