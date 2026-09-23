'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';
import { dataBreve } from '@/lib/formato';

const VUOTO = { tipo: 'avviso', titolo: '', testo: '', immagine_url: null, dal: '', al: '', visibilita: 'pubblico' };

export default function Bacheca({ palestraId, righe }) {
  const router = useRouter();
  const [tipo, setTipo] = useState('avviso');
  const [apri, setApri] = useState(null);
  const [f, setF] = useState(VUOTO);
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  const visibili = righe.filter((r) => r.tipo === tipo);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function nuovo() { setF({ ...VUOTO, tipo }); setApri('nuovo'); setErrore(''); }
  function modifica(r) {
    setF({
      tipo: r.tipo, titolo: r.titolo, testo: r.testo || '', immagine_url: r.immagine_url,
      dal: r.dal ? r.dal.slice(0, 10) : '', al: r.al ? r.al.slice(0, 10) : '', visibilita: r.visibilita,
    });
    setApri(r.id); setErrore('');
  }

  async function salva(e) {
    e.preventDefault();
    if (!f.titolo.trim()) { setErrore('Serve un titolo.'); return; }
    setInvio(true); setErrore('');
    const dati = {
      tipo: f.tipo, titolo: f.titolo.trim(), testo: f.testo || null, immagine_url: f.immagine_url,
      dal: f.dal ? `${f.dal}T00:00:00` : null, al: f.al ? `${f.al}T23:59:59` : null, visibilita: f.visibilita,
    };
    const db = supabaseBrowser();
    const { error } = apri === 'nuovo'
      ? await db.from('bacheca').insert({ ...dati, palestra_id: palestraId })
      : await db.from('bacheca').update(dati).eq('id', apri);
    setInvio(false);
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    setApri(null); router.refresh();
  }

  async function elimina(r) {
    if (!confirm(`Eliminare "${r.titolo}"?`)) return;
    await supabaseBrowser().from('bacheca').delete().eq('id', r.id);
    router.refresh();
  }

  async function invia(r) {
    const push = confirm(
      'Mandare questo messaggio agli iscritti attivi?\n\n' +
      'OK = email + notifica sul telefono\nAnnulla = scegli solo email nella prossima finestra'
    );
    if (!push && !confirm('Mandarlo solo per email?')) return;

    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('invia_bacheca', { p_id: r.id, p_push: push });
    setInvio(false);
    if (error) { setErrore('Invio non riuscito.'); return; }
    setAvviso(
      `In coda: ${data?.email ?? 0} email` +
      (push ? ` e ${data?.push ?? 0} notifiche` : '') +
      '. Partono entro cinque minuti.'
    );
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Comunicazione</div>
        <h1>Bacheca</h1>
        <p>Avvisi e novità per i tuoi iscritti: restano in bacheca e puoi mandarli per email.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <div className="filtri">
        {[['avviso', 'Avvisi'], ['post', 'Novità']].map(([k, l]) => (
          <a key={k} href="#" onClick={(e) => { e.preventDefault(); setTipo(k); setApri(null); }}
             aria-current={tipo === k ? 'true' : undefined}>{l}</a>
        ))}
      </div>

      {apri === 'nuovo' || (apri && visibili.some((r) => r.id === apri)) ? (
        <form onSubmit={salva} className="compare">
          <h2>{apri === 'nuovo' ? 'Nuovo' : 'Modifica'} {f.tipo === 'avviso' ? 'avviso' : 'post'}</h2>
          <div className="campo"><label htmlFor="t">Titolo</label><input id="t" value={f.titolo} onChange={set('titolo')} /></div>
          <div className="campo"><label htmlFor="te">Testo</label><textarea id="te" style={{ minHeight: 160 }} value={f.testo} onChange={set('testo')} /></div>
          <Immagine url={f.immagine_url} cartella="bacheca" etichetta="Immagine o locandina"
                    onChange={(url) => setF({ ...f, immagine_url: url })} />
          <div className="riga-2">
            <div className="campo"><label htmlFor="d1">Visibile dal</label><input id="d1" type="date" value={f.dal} onChange={set('dal')} /></div>
            <div className="campo"><label htmlFor="d2">Fino al</label><input id="d2" type="date" value={f.al} onChange={set('al')} /></div>
          </div>
          <div className="campo">
            <label htmlFor="v">Visibilità</label>
            <select id="v" value={f.visibilita} onChange={set('visibilita')}>
              <option value="pubblico">Pubblico: lo vedono tutti</option>
              <option value="privato">Privato: solo chi è iscritto</option>
              <option value="nascosto">Nascosto: bozza</option>
            </select>
          </div>
          <div className="azioni">
            <button className="btn btn-primario" disabled={invio}>Salva</button>
            <button type="button" className="btn" onClick={() => setApri(null)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primario" onClick={nuovo}>
          {tipo === 'avviso' ? 'Scrivi un avviso' : 'Aggiungi una novità'}
        </button>
      )}

      {visibili.length === 0 && !apri && <div className="vuoto" style={{ marginTop: 16 }}>Ancora niente qui.</div>}

      <div style={{ marginTop: 20 }}>
        {visibili.map((r) => (
          <div key={r.id} className="avviso-card">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {r.immagine_url && <img src={r.immagine_url} alt="" className="miniatura-grande" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{r.titolo}</h3>
                <p>{(r.testo || '').slice(0, 200)}{(r.testo || '').length > 200 ? '…' : ''}</p>
                <div className="piccolo muto" style={{ marginTop: 6 }}>
                  {r.dal && `dal ${dataBreve(r.dal)} `}{r.al && `al ${dataBreve(r.al)} `}
                  · {r.visibilita}
                  {r.inviato_at && ` · inviato a ${r.destinatari} persone il ${dataBreve(r.inviato_at)}`}
                </div>
                <div className="azioni-riga">
                  <button className="link-btn piccolo" onClick={() => modifica(r)}>Modifica</button>
                  <button className="link-btn piccolo" disabled={invio} onClick={() => invia(r)}>
                    {r.inviato_at ? 'Rimanda per email' : 'Manda per email'}
                  </button>
                  <button className="link-btn piccolo pericolo" onClick={() => elimina(r)}>Elimina</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
