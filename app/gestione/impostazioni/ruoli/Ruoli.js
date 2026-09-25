'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { AREE } from '@/lib/menu';

const BASE = { admin: 'Amministrazione', segreteria: 'Segreteria', insegnante: 'Insegnante' };

function Editor({ ruolo, palestraId, onFatto, onAnnulla }) {
  const [nome, setNome] = useState(ruolo?.nome || '');
  const [descr, setDescr] = useState(ruolo?.descrizione || '');
  const [nascoste, setNascoste] = useState(new Set(ruolo?.voci_nascoste || []));
  const [errore, setErrore] = useState('');
  const cambia = (h) => { const s = new Set(nascoste); s.has(h) ? s.delete(h) : s.add(h); setNascoste(s); };
  const area = (a, vedi) => { const s = new Set(nascoste); a.voci.forEach((v) => (vedi ? s.delete(v.href) : s.add(v.href))); setNascoste(s); };

  async function salva(e) {
    e.preventDefault();
    if (!nome.trim()) { setErrore('Dai un nome al profilo.'); return; }
    const db = supabaseBrowser();
    const dati = { nome: nome.trim(), descrizione: descr || null, voci_nascoste: [...nascoste] };
    const { error } = ruolo?.id
      ? await db.from('ruoli').update(dati).eq('id', ruolo.id)
      : await db.from('ruoli').insert({ ...dati, palestra_id: palestraId });
    if (error) { setErrore(error.message?.includes('duplicate') ? 'Esiste già un profilo con questo nome.' : 'Salvataggio non riuscito.'); return; }
    onFatto();
  }

  return (
    <form className="pannello" onSubmit={salva}>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="griglia-soglie">
        <div className="campo"><label htmlFor="rn">Nome del profilo</label>
          <input id="rn" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Segreteria senza conti" /></div>
        <div className="campo"><label htmlFor="rd">A cosa serve</label>
          <input id="rd" value={descr} onChange={(e) => setDescr(e.target.value)} placeholder="Facoltativo" /></div>
      </div>
      <p className="piccolo muto">Togli la spunta a quello che questo profilo NON deve vedere.</p>
      <div className="ruoli-aree">
        {AREE.map((a) => {
          const tutte = a.voci.every((v) => !nascoste.has(v.href));
          return (
            <fieldset key={a.k} className="ruolo-area">
              <legend>
                <label className="spunta" style={{ margin: 0 }}>
                  <input type="checkbox" checked={tutte} onChange={() => area(a, !tutte)} />
                  <span><strong>{a.titolo}</strong></span>
                </label>
              </legend>
              {a.voci.map((v) => (
                <label key={v.href} className="spunta" style={{ margin: 0 }}>
                  <input type="checkbox" checked={!nascoste.has(v.href)} onChange={() => cambia(v.href)} />
                  <span>{v.testo}</span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      <div className="azioni" style={{ marginTop: 12 }}>
        <button className="btn btn-primario">Salva il profilo</button>
        <button type="button" className="btn" onClick={onAnnulla}>Annulla</button>
      </div>
    </form>
  );
}

export default function Ruoli({ ruoli, persone, admin, palestraId }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);     // id del profilo, 'nuovo' o null
  const [errore, setErrore] = useState('');
  const fatto = () => { setApri(null); router.refresh(); };

  async function assegna(p, ruoloId) {
    setErrore('');
    const { error } = await supabaseBrowser().from('staff').update({ ruolo_id: ruoloId || null }).eq('id', p.id);
    if (error) { setErrore('Assegnazione non riuscita.'); return; }
    router.refresh();
  }

  async function elimina(r) {
    if (!confirm(`Eliminare il profilo "${r.nome}"? Chi lo aveva torna a vedere quello del suo ruolo di base.`)) return;
    const { error } = await supabaseBrowser().from('ruoli').delete().eq('id', r.id);
    if (error) { setErrore('Eliminazione non riuscita.'); return; }
    router.refresh();
  }

  if (!admin) return <div className="vuoto">Ruoli e accessi li gestisce solo l'amministrazione.</div>;

  return (
    <div className="scheda-due">
      <div>
        {errore && <div className="errore" role="alert">{errore}</div>}
        <section className="pannello">
          <div className="pannello-testa">
            <h2>Profili su misura</h2>
            {apri !== 'nuovo' && <button className="btn btn-piccolo btn-primario" onClick={() => setApri('nuovo')}>Nuovo profilo</button>}
          </div>
          {ruoli.length === 0 && apri !== 'nuovo' && <div className="vuoto">Nessun profilo: tutti vedono quello del loro ruolo di base.</div>}
          <ul className="mini-lista">
            {ruoli.map((r) => (
              <li key={r.id}>
                <span className="ml-riga">
                  <span className="ml-testo">
                    <strong>{r.nome}</strong>
                    <span className="piccolo muto">
                      {r.descrizione ? `${r.descrizione} · ` : ''}{r.voci_nascoste.length ? `nasconde ${r.voci_nascoste.length} pagine` : 'vede tutto'}
                      {' · '}{persone.filter((p) => p.ruolo_id === r.id).length} persone
                    </span>
                  </span>
                  <button className="link-btn piccolo" onClick={() => setApri(r.id)}>modifica</button>
                  <button className="link-btn piccolo pericolo" onClick={() => elimina(r)}>elimina</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
        {apri && (
          <Editor key={apri} ruolo={ruoli.find((r) => r.id === apri)} palestraId={palestraId} onFatto={fatto} onAnnulla={() => setApri(null)} />
        )}
      </div>
      <aside>
        <section className="pannello">
          <h2>Chi ha quale profilo</h2>
          <p className="piccolo muto" style={{ marginTop: -4 }}>L'amministrazione vede sempre tutto.</p>
          <ul className="mini-lista">
            {persone.map((p) => (
              <li key={p.id}>
                <span className="ml-riga">
                  <span className="ml-testo">
                    <strong>{p.nome} {p.cognome || ''}</strong>
                    <span className="piccolo muto">{BASE[p.ruolo]}{p.user_id ? ' · con accesso' : ''}</span>
                  </span>
                  {p.ruolo === 'admin' ? <span className="tag tag-ok">tutto</span> : (
                    <select className="select-piccola" value={p.ruolo_id || ''} onChange={(e) => assegna(p, e.target.value)}
                            aria-label={`Profilo di ${p.nome}`}>
                      <option value="">— base —</option>
                      {ruoli.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                    </select>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
