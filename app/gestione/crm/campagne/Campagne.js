'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { STATI_CLIENTE } from '@/lib/stati';
import { dataBreve } from '@/lib/formato';

const PUBBLICI = ['iscritto', 'fedele', 'in_scadenza', 'in_esaurimento', 'no_rinnovo', 'inattivo', 'rientro', 'prova', 'lead', 'perso'];
const VUOTA = { titolo: '', oggetto: '', corpo: 'Ciao {nome},\n\n', stati: [], corsi: [], etichette: [], anche_passati: false, servizio: false, sondaggio_id: '' };

export default function Campagne({ palestraId, campagne, corsi, etichette, sondaggi }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [f, setF] = useState(VUOTA);
  const [conta, setConta] = useState(null);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const alterna = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const pubblico = { stati: f.stati, corsi: f.corsi, etichette: f.etichette, anche_passati: f.anche_passati, servizio: f.servizio };
  const chiave = JSON.stringify(pubblico);

  useEffect(() => {
    if (!apri) return;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser().rpc('conta_pubblico', { p_palestra: palestraId, p: pubblico });
      setConta(data);
    }, 350);
    return () => clearTimeout(t);
  }, [chiave, apri]); // eslint-disable-line react-hooks/exhaustive-deps

  const riceveranno = conta ? (f.servizio ? conta.con_email : conta.con_consenso) : 0;

  async function invia(e) {
    e.preventDefault();
    if (!f.titolo.trim() || !f.oggetto.trim() || f.corpo.trim().length < 20) { setErrore('Scrivi titolo, oggetto e un messaggio.'); return; }
    if (f.sondaggio_id && !f.corpo.includes('{sondaggio}')) { setErrore('Metti {sondaggio} nel testo, dove vuoi il link al sondaggio.'); return; }
    if (!riceveranno) { setErrore('Nessuno riceverà questa email con il pubblico scelto.'); return; }
    if (!confirm(`Mandare "${f.oggetto}" a ${riceveranno} famiglie? Non si può annullare.`)) return;
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const { data: { user } } = await db.auth.getUser();
    const { data: c, error } = await db.from('campagne').insert({
      palestra_id: palestraId, titolo: f.titolo.trim(), oggetto: f.oggetto.trim(), corpo: f.corpo,
      pubblico, sondaggio_id: f.sondaggio_id || null, creata_da: user?.id,
    }).select('id').single();
    const r = error ? { error } : await db.rpc('invia_campagna', { p_campagna: c.id });
    setInvio(false);
    if (r.error) { setErrore('Invio non riuscito.'); return; }
    setApri(false); setF(VUOTA); setConta(null); router.refresh();
  }

  async function copiaNumeri() {
    const testo = (conta?.telefoni || []).map((t) => `${t.nome}\t${t.telefono}`).join('\n');
    await navigator.clipboard.writeText(testo);
    setCopiato(true); setTimeout(() => setCopiato(false), 2000);
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Campagne</h1>
        <p>Un'email a un pubblico scelto: per stato, corso o etichetta. Arriva una sola email per famiglia, con il nome giusto.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {!apri && <button className="btn btn-primario" onClick={() => setApri(true)} style={{ marginBottom: 16 }}>Nuova campagna</button>}

      {apri && (
        <form className="scheda-due" onSubmit={invia} style={{ marginBottom: 20 }}>
          <div>
            <section className="pannello">
              <h2>A chi</h2>
              <div className="piccolo muto">Stato</div>
              <div className="pastiglie">
                {PUBBLICI.map((s) => (
                  <button type="button" key={s} className="stato-pillola"
                          aria-current={f.stati.includes(s) ? 'true' : undefined} onClick={() => alterna('stati', s)}>
                    {STATI_CLIENTE[s]?.testo || s}
                  </button>
                ))}
              </div>
              <div className="piccolo muto">Corsi</div>
              <div className="pastiglie">
                {corsi.map((c) => (
                  <button type="button" key={c.id} className="stato-pillola" aria-current={f.corsi.includes(c.id) ? 'true' : undefined}
                          onClick={() => alterna('corsi', c.id)}>
                    <span className="punto-colore" style={{ background: c.colore }} />{c.nome}
                  </button>
                ))}
              </div>
              {f.corsi.length > 0 && (
                <label className="spunta"><input type="checkbox" checked={f.anche_passati} onChange={set('anche_passati')} />
                  <span>anche chi li ha frequentati in passato</span></label>
              )}
              {etichette.length > 0 && (
                <>
                  <div className="piccolo muto">Etichette</div>
                  <div className="pastiglie">
                    {etichette.map((t) => (
                      <button type="button" key={t.id} className="stato-pillola eti" aria-current={f.etichette.includes(t.id) ? 'true' : undefined}
                              onClick={() => alterna('etichette', t.id)}>
                        <span className="punto-colore" style={{ background: t.colore }} />{t.nome}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="piccolo muto">Niente selezionato = tutti. Più scelte nello stesso gruppo si sommano.</p>
            </section>

            <section className="pannello">
              <h2>Il messaggio</h2>
              <div className="campo"><label htmlFor="ti">Nome della campagna (solo per voi)</label>
                <input id="ti" value={f.titolo} onChange={set('titolo')} placeholder="Es. Rientro di settembre" /></div>
              <div className="campo"><label htmlFor="og">Oggetto dell'email</label>
                <input id="og" value={f.oggetto} onChange={set('oggetto')} placeholder="Es. {nome}, ti aspettiamo in sala!" /></div>
              <div className="campo"><label htmlFor="co">Testo</label>
                <textarea id="co" rows={8} value={f.corpo} onChange={set('corpo')} />
                <span className="piccolo muto">{'{nome}'} diventa il nome di chi riceve.</span></div>
              {sondaggi.length > 0 && (
                <div className="campo"><label htmlFor="so">Con un sondaggio</label>
                  <select id="so" value={f.sondaggio_id} onChange={set('sondaggio_id')}>
                    <option value="">— nessuno —</option>
                    {sondaggi.map((s) => <option key={s.id} value={s.id}>{s.titolo}</option>)}
                  </select>
                  {f.sondaggio_id && <span className="piccolo muto">Scrivi {'{sondaggio}'} nel testo: diventa il link personale di ognuno.</span>}
                </div>
              )}
            </section>
          </div>

          <aside>
            <section className="pannello">
              <h2>Chi la riceve</h2>
              {!conta ? <div className="vuoto">Calcolo…</div> : (
                <>
                  <div className="cifra-grande">{riceveranno}</div>
                  <div className="piccolo muto">famiglie riceveranno l'email</div>
                  <ul className="mini-lista" style={{ marginTop: 10 }}>
                    <li><span className="ml-riga"><span className="ml-testo">Famiglie nel pubblico</span><strong>{conta.famiglie}</strong></span></li>
                    <li><span className="ml-riga"><span className="ml-testo">con un'email</span><strong>{conta.con_email}</strong></span></li>
                    <li><span className="ml-riga"><span className="ml-testo">che accettano promozioni</span><strong>{conta.con_consenso}</strong></span></li>
                    <li><span className="ml-riga"><span className="ml-testo">con un telefono</span><strong>{conta.con_telefono}</strong></span></li>
                  </ul>
                  {conta.con_telefono > 0 && (
                    <button type="button" className="link-btn piccolo" onClick={copiaNumeri}>
                      {copiato ? 'Copiati ✓' : 'Copia nomi e numeri per WhatsApp'}
                    </button>
                  )}
                </>
              )}
              <label className="spunta" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={f.servizio} onChange={set('servizio')} />
                <span>È una comunicazione di servizio (chiusure, cambi d'orario): arriva a tutti, anche a chi non accetta promozioni</span>
              </label>
              {f.servizio && <p className="piccolo" style={{ color: 'var(--attenzione)' }}>Usala solo per informazioni necessarie, mai per offerte: altrimenti non è in regola con la privacy.</p>}
              <div className="azioni" style={{ marginTop: 12 }}>
                <button className="btn btn-primario" disabled={invio}>{invio ? 'Invio…' : `Manda a ${riceveranno || 0}`}</button>
                <button type="button" className="btn" onClick={() => setApri(false)}>Annulla</button>
              </div>
            </section>
          </aside>
        </form>
      )}

      <h2 className="sezione">Mandate</h2>
      {campagne.length === 0 && <div className="vuoto">Nessuna campagna ancora.</div>}
      {campagne.length > 0 && (
        <div className="tabella-scorre">
          <table>
            <thead><tr><th>Campagna</th><th>Quando</th><th>Destinatari</th><th>Partite</th><th className="col-desktop">Sondaggio</th></tr></thead>
            <tbody>
              {campagne.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.titolo}</strong><div className="piccolo muto">{c.oggetto}</div></td>
                  <td className="piccolo">{c.inviata_at ? dataBreve(c.inviata_at) : 'bozza'}</td>
                  <td>{c.destinatari ?? '—'}</td>
                  <td className="piccolo">
                    {c.inviate} inviate{c.in_coda ? ` · ${c.in_coda} in coda` : ''}
                    {c.errori ? <span style={{ color: 'var(--rosso-scuro)' }}> · {c.errori} non partite</span> : null}
                  </td>
                  <td className="col-desktop piccolo">
                    {c.sondaggio_id ? <a href={`/gestione/crm/sondaggi/${c.sondaggio_id}`}>{c.sondaggio}</a> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
