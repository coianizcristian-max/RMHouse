'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { intestazionePredefinita } from '@/lib/dichiarazione730';

// Impostazioni della "Dichiarazione e ricevuta" per il 730 dei ragazzi: il testo in testa, il "presso", la firma
// e l'immagine del timbro con la firma (resta nel database, la vedono solo segreteria e PDF: non è un file pubblico).
async function preparaImmagine(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 900 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/png');                       // PNG: tiene lo sfondo trasparente
  let tipo = 'image/png';
  if (url.length > 600_000) {                               // troppo pesante: JPEG su sfondo bianco
    const c2 = document.createElement('canvas'); c2.width = c.width; c2.height = c.height;
    const x = c2.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(c, 0, 0);
    url = c2.toDataURL('image/jpeg', 0.9); tipo = 'image/jpeg';
  }
  return { tipo, dati: url.split(',')[1], url };
}

export default function Dichiarazione730({ palestraId, palestra, haTimbro }) {
  const router = useRouter();
  const imp = palestra.dichiarazione || {};
  const [f, setF] = useState({ intestazione: imp.intestazione || '', presso: imp.presso || '', firma: imp.firma || 'Legale Rappresentante' });
  const [anteprima, setAnteprima] = useState(haTimbro ? '/api/dichiarazioni/timbro' : null);
  const [msg, setMsg] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function salva(e) {
    e.preventDefault(); setMsg('');
    setInvio(true);
    const { error } = await supabaseBrowser().from('palestre')
      .update({ dichiarazione: { intestazione: f.intestazione.trim(), presso: f.presso.trim(), firma: f.firma.trim() || 'Legale Rappresentante' } }).eq('id', palestraId);
    setInvio(false);
    setMsg(error ? (error.message?.includes('dichiarazione') ? 'Manca la query 158 in Supabase.' : 'Non salvato.') : 'Salvato ✓');
    if (!error) router.refresh();
  }
  async function carica(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { setMsg('Serve un\'immagine PNG o JPG.'); return; }
    setMsg('Carico…');
    try {
      const { tipo, dati, url } = await preparaImmagine(file);
      const { error } = await supabaseBrowser().from('palestra_file')
        .upsert({ palestra_id: palestraId, chiave: 'timbro_firma', tipo, dati, updated_at: new Date().toISOString() });
      if (error) { setMsg(error.message?.includes('palestra_file') ? 'Manca la query 158 in Supabase.' : 'Non caricato.'); return; }
      setAnteprima(url); setMsg('Timbro e firma caricati ✓');
    } catch { setMsg('Immagine non leggibile.'); }
  }
  async function togli() {
    if (!confirm('Togliere il timbro con la firma? Nelle dichiarazioni resterà una riga per firmare a mano.')) return;
    const { error } = await supabaseBrowser().from('palestra_file').delete().eq('palestra_id', palestraId).eq('chiave', 'timbro_firma');
    if (!error) { setAnteprima(null); setMsg('Tolto.'); }
  }

  return (
    <form onSubmit={salva} className="scheda dic-730" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>Dichiarazione per il 730 (sport dei ragazzi)</h2>
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        Il documento &quot;Dichiarazione e ricevuta per partecipazione attività sportiva dilettantistica&quot;: si scarica da
        Conti → Ricevute (bottone 730 sulle ricevute dei minori) e da Conti → Commercialista (tutti i ragazzi dell&apos;anno).
      </p>
      <div className="campo">
        <label htmlFor="dic-int">Chi dichiara <span className="eti-info">· il testo in testa</span></label>
        <textarea id="dic-int" rows={3} value={f.intestazione} onChange={set('intestazione')} placeholder={intestazionePredefinita(palestra)} />
      </div>
      <div className="riga-2">
        <div className="campo"><label htmlFor="dic-presso">&quot;presso&quot; <span className="eti-info">· per i corsi della sede principale</span></label>
          <input id="dic-presso" value={f.presso} onChange={set('presso')} placeholder="la sede operativa di Via …, Vicenza" /></div>
        <div className="campo"><label htmlFor="dic-firma">Sotto la data</label>
          <input id="dic-firma" value={f.firma} onChange={set('firma')} /></div>
      </div>
      <div className="dic-timbro">
        <div>
          <b>Timbro e firma</b>
          <p className="piccolo muto" style={{ margin: '2px 0 8px' }}>Un&apos;immagine (meglio PNG con lo sfondo trasparente). Non è pubblica: la vedono solo la segreteria e i PDF.</p>
          <label className="btn btn-piccolo">{anteprima ? 'Cambia l\'immagine' : 'Carica l\'immagine'}<input type="file" accept="image/png,image/jpeg" onChange={carica} hidden /></label>
          {anteprima && <button type="button" className="link-btn piccolo" onClick={togli}>togli</button>}
        </div>
        {anteprima ? <img src={anteprima} alt="Timbro e firma" className="dic-anteprima" /> : <span className="piccolo muto">Nessuna immagine: nel PDF resta lo spazio per firmare a mano.</span>}
      </div>
      <div className="azioni-riga" style={{ marginTop: 12 }}>
        <button className="btn btn-primario" disabled={invio}>Salva</button>
        <a className="btn" href="/api/dichiarazioni/pdf?esempio=1&vedi=1" target="_blank" rel="noreferrer">Vedi un esempio (PDF)</a>
        {msg && <span className="piccolo" role="status">{msg}</span>}
      </div>
    </form>
  );
}
