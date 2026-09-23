'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';
import { dataBreve, ora, euro } from '@/lib/formato';

const VUOTO = {
  titolo: '', descrizione: '', locandina_url: null, luogo: '', sede_id: '',
  data: '', ora_inizio: '18:00', ora_fine: '20:00', prenotabile: false, prezzo: '', posti: '',
  in_evidenza: false, visibilita: 'pubblico',
};

export default function Eventi({ palestraId, eventi, sedi, iscritti }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);
  const [f, setF] = useState(VUOTO);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const conta = (id) => iscritti.filter((i) => i.evento_id === id && i.stato !== 'annullato')
    .reduce((s, i) => s + (i.persone || 1), 0);
  const inEvidenza = eventi.filter((e) => e.in_evidenza).length;

  function modifica(e) {
    const i = new Date(e.inizio);
    setF({
      titolo: e.titolo, descrizione: e.descrizione || '', locandina_url: e.locandina_url,
      luogo: e.luogo || '', sede_id: e.sede_id || '',
      data: i.toLocaleDateString('sv-SE'), ora_inizio: i.toTimeString().slice(0, 5),
      ora_fine: e.fine ? new Date(e.fine).toTimeString().slice(0, 5) : '',
      prenotabile: e.prenotabile, prezzo: e.prezzo_cent ? (e.prezzo_cent / 100).toString() : '',
      posti: e.posti ?? '', in_evidenza: e.in_evidenza, visibilita: e.visibilita,
    });
    setApri(e.id); setErrore('');
  }

  async function salva(ev) {
    ev.preventDefault();
    if (!f.titolo.trim() || !f.data) { setErrore('Servono titolo e data.'); return; }
    setInvio(true); setErrore('');
    const dati = {
      titolo: f.titolo.trim(), descrizione: f.descrizione || null, locandina_url: f.locandina_url,
      luogo: f.luogo || null, sede_id: f.sede_id || null,
      inizio: new Date(`${f.data}T${f.ora_inizio || '00:00'}:00`).toISOString(),
      fine: f.ora_fine ? new Date(`${f.data}T${f.ora_fine}:00`).toISOString() : null,
      prenotabile: f.prenotabile,
      prezzo_cent: f.prezzo ? Math.round(parseFloat(f.prezzo.replace(',', '.')) * 100) : 0,
      posti: f.posti === '' ? null : parseInt(f.posti, 10),
      in_evidenza: f.in_evidenza, visibilita: f.visibilita,
    };
    const db = supabaseBrowser();
    const { error } = apri === 'nuovo'
      ? await db.from('eventi').insert({ ...dati, palestra_id: palestraId })
      : await db.from('eventi').update(dati).eq('id', apri);
    setInvio(false);
    if (error) {
      setErrore(error.message?.includes('massimo_tre')
        ? 'Puoi tenere al massimo tre eventi in evidenza: togline uno.'
        : 'Salvataggio non riuscito.');
      return;
    }
    setApri(null); router.refresh();
  }

  async function elimina(e) {
    if (!confirm(`Eliminare "${e.titolo}"? Spariscono anche le iscrizioni.`)) return;
    await supabaseBrowser().from('eventi').delete().eq('id', e.id);
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Vita della scuola</div>
        <h1>Eventi</h1>
        <p>Open day, saggi, stage e campus. Fino a tre restano in evidenza nella home dell'app.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      {apri ? (
        <form onSubmit={salva} className="compare">
          <h2>{apri === 'nuovo' ? 'Nuovo evento' : 'Modifica evento'}</h2>
          <div className="campo"><label htmlFor="t">Titolo</label><input id="t" value={f.titolo} onChange={set('titolo')} placeholder="Es. Discovery Week" /></div>
          <Immagine url={f.locandina_url} cartella="eventi" etichetta="Locandina"
                    onChange={(url) => setF({ ...f, locandina_url: url })} />
          <div className="campo"><label htmlFor="d">Descrizione</label><textarea id="d" value={f.descrizione} onChange={set('descrizione')} /></div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="da">Giorno</label><input id="da" type="date" value={f.data} onChange={set('data')} /></div>
            <div className="campo"><label htmlFor="se">Sede</label>
              <select id="se" value={f.sede_id} onChange={set('sede_id')}>
                <option value="">— nessuna —</option>
                {sedi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="oi">Dalle</label><input id="oi" type="time" value={f.ora_inizio} onChange={set('ora_inizio')} /></div>
            <div className="campo"><label htmlFor="of">Alle</label><input id="of" type="time" value={f.ora_fine} onChange={set('ora_fine')} /></div>
          </div>
          <div className="campo"><label htmlFor="lu">Luogo</label><input id="lu" value={f.luogo} onChange={set('luogo')} placeholder="Se diverso dalla sede" /></div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="pr">Prezzo (€)</label><input id="pr" inputMode="decimal" value={f.prezzo} onChange={set('prezzo')} placeholder="0 = gratuito" /></div>
            <div className="campo"><label htmlFor="po">Posti</label><input id="po" type="number" min="1" value={f.posti} onChange={set('posti')} /></div>
          </div>
          <label className="spunta"><input type="checkbox" checked={f.prenotabile} onChange={set('prenotabile')} /><span>Prenotabile dai clienti</span></label>
          <label className="spunta"><input type="checkbox" checked={f.in_evidenza} onChange={set('in_evidenza')} /><span>In evidenza nella home ({inEvidenza}/3 occupati)</span></label>
          <div className="campo">
            <label htmlFor="vi">Visibilità</label>
            <select id="vi" value={f.visibilita} onChange={set('visibilita')}>
              <option value="pubblico">Pubblico</option>
              <option value="privato">Solo iscritti</option>
              <option value="nascosto">Bozza</option>
            </select>
          </div>
          <div className="azioni">
            <button className="btn btn-primario" disabled={invio}>Salva</button>
            <button type="button" className="btn" onClick={() => setApri(null)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primario" onClick={() => { setF(VUOTO); setApri('nuovo'); }}>Nuovo evento</button>
      )}

      {eventi.length === 0 && !apri && <div className="vuoto" style={{ marginTop: 16 }}>Nessun evento in programma.</div>}

      <div className="griglia-2" style={{ marginTop: 20 }}>
        {eventi.map((e) => (
          <div key={e.id} className="tessera" style={{ padding: 0, overflow: 'hidden' }}>
            {e.locandina_url
              ? <img src={e.locandina_url} alt="" className="copertina" style={{ borderRadius: 0 }} />
              : <div className="copertina segnaposto" style={{ borderRadius: 0 }}>{e.titolo.slice(0, 2).toUpperCase()}</div>}
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                {e.in_evidenza && <span className="tag tag-rosso">In evidenza</span>}
                {e.prenotabile && <span className="tag tag-ok">Prenotabile</span>}
                {e.visibilita !== 'pubblico' && <span className="tag tag-neutro">{e.visibilita}</span>}
                {new Date(e.inizio) < new Date() && <span className="tag tag-neutro">Concluso</span>}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--nero)' }}>{e.titolo}</div>
              <div className="piccolo muto">
                {dataBreve(e.inizio)} · {ora(e.inizio)}{e.fine && `–${ora(e.fine)}`}
                {e.luogo && ` · ${e.luogo}`}
                {e.prezzo_cent > 0 && ` · ${euro(e.prezzo_cent)}`}
              </div>
              {e.prenotabile && (
                <div className="piccolo" style={{ marginTop: 4 }}>
                  {conta(e.id)} iscritti{e.posti ? ` su ${e.posti} posti` : ''}
                </div>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                <button className="link-btn piccolo" onClick={() => modifica(e)}>Modifica</button>
                <button className="link-btn piccolo" onClick={() => elimina(e)}>Elimina</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
