'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';

// Pagina dedicata: una sala, nuova o da modificare, tutta in una videata
export default function SchedaSala({ palestraId, sala = null, sedi = [], orari = 0, posti = 0 }) {
  const router = useRouter();
  const nuova = !sala;
  const [f, setF] = useState({
    nome: sala?.nome || '', descrizione: sala?.descrizione || '', attrezzatura: sala?.attrezzatura || '',
    capienza: sala?.capienza ?? '', costo: sala?.costo_ora_cent ? (sala.costo_ora_cent / 100).toFixed(2).replace('.', ',') : '',
    foto_url: sala?.foto_url || null, sede_id: sala?.sede_id || (sedi[0]?.id ?? ''),
    gestione_postazioni: !!sala?.gestione_postazioni,
  });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function salva(e) {
    e.preventDefault();
    if (!f.nome.trim()) { setErrore('Serve il nome della sala.'); return; }
    const costo = String(f.costo).trim() ? Math.round(parseFloat(String(f.costo).replace(/[€\s.]/g, '').replace(',', '.')) * 100) : null;
    if (String(f.costo).trim() && !Number.isFinite(costo)) { setErrore('Costo orario: scrivi un importo, per esempio 12 oppure 12,50.'); return; }
    if (f.capienza !== '' && !/^\d+$/.test(String(f.capienza).trim())) { setErrore('Capienza: scrivi un numero intero.'); return; }
    setInvio(true); setErrore('');
    const dati = {
      nome: f.nome.trim(), descrizione: f.descrizione.trim() || null, attrezzatura: f.attrezzatura.trim() || null,
      capienza: f.capienza === '' ? null : parseInt(f.capienza, 10), costo_ora_cent: costo,
      foto_url: f.foto_url, sede_id: f.sede_id || null, gestione_postazioni: f.gestione_postazioni,
    };
    const db = supabaseBrowser();
    const { data, error } = nuova
      ? await db.from('sale').insert({ ...dati, palestra_id: palestraId }).select('id')
      : await db.from('sale').update(dati).eq('id', sala.id).select('id');
    setInvio(false);
    if (error) { setErrore(error.message?.includes('duplicate') ? 'Esiste già una sala con questo nome.' : 'Salvataggio non riuscito. Riprova.'); return; }
    if (!data?.length) { setErrore('Non salvato: l\'accesso è scaduto. Ricarica la pagina (o esci e rientra) e riprova.'); return; }
    router.push(`/gestione/sale?salvato=${data[0].id}`);
    router.refresh();
  }

  return (
    <>
      <p><Link href="/gestione/sale">‹ Torna alle sale</Link></p>
      <div className="intestazione">
        <div className="occhiello">Struttura · Sale</div>
        <h1>{nuova ? 'Nuova sala' : sala.nome}</h1>
        {!nuova && <p>{orari} {orari === 1 ? 'orario la usa' : 'orari la usano'}{sala.gestione_postazioni ? ` · ${posti} posti numerati` : ''}</p>}
      </div>

      <form onSubmit={salva} className="scheda scheda-staff">
        <div className="ss-griglia">
          <div className="ss-lato">
            <Immagine url={f.foto_url} cartella="sale" etichetta="Foto della sala" onChange={(url) => setF({ ...f, foto_url: url })} />
            <label className="spunta"><input type="checkbox" checked={f.gestione_postazioni} onChange={set('gestione_postazioni')} />
              <span>Posti numerati <span className="piccolo muto" style={{ display: 'block' }}>pertiche, tessuti, tappetini</span></span></label>
          </div>
          <div className="ss-dati">
            <div className={`campo ${sedi.length > 1 ? 'ss-4' : 'ss-6'}`}><label htmlFor="n">Nome</label>
              <input id="n" value={f.nome} onChange={set('nome')} placeholder="Es. Sala aerea" autoFocus={nuova} /></div>
            {sedi.length > 1 && (
              <div className="campo ss-2"><label htmlFor="se">Sede</label>
                <select id="se" value={f.sede_id} onChange={set('sede_id')}>
                  {sedi.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select></div>
            )}
            <div className="campo ss-2"><label htmlFor="c">Capienza</label>
              <input id="c" inputMode="numeric" value={f.capienza} onChange={set('capienza')} placeholder="persone" /></div>
            <div className="campo ss-2"><label htmlFor="co">Costo orario (€)</label>
              <input id="co" inputMode="decimal" value={f.costo} onChange={set('costo')} placeholder="es. 12,50" /></div>
            <div className="campo ss-2 ss-nota"><span className="piccolo muto">Costo orario: affitto mensile diviso le ore d'uso, serve per i margini.</span></div>
            <div className="campo ss-6"><label htmlFor="a">Attrezzatura</label>
              <input id="a" value={f.attrezzatura} onChange={set('attrezzatura')} placeholder="Es. 6 pertiche, tessuti, specchi, impianto audio" /></div>
            <div className="campo ss-6"><label htmlFor="d">Descrizione</label>
              <textarea id="d" rows={3} value={f.descrizione} onChange={set('descrizione')} /></div>
          </div>
        </div>
        {errore && <div className="errore" role="alert">{errore}</div>}
        <div className="azioni">
          <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : nuova ? 'Aggiungi' : 'Salva'}</button>
          <Link href="/gestione/sale" className="btn">Annulla</Link>
        </div>
      </form>
    </>
  );
}
