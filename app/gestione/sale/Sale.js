'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';
import { euro } from '@/lib/formato';

const VUOTO = { nome: '', descrizione: '', attrezzatura: '', capienza: '', costo: '', foto_url: null, sede_id: '', gestione_postazioni: false };

export default function Sale({ palestraId, sale, sedi, orari, postazioni = {} }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);
  const [f, setF] = useState(VUOTO);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const usoDi = (id) => orari.filter((o) => o.sala_id === id).length;

  function modifica(s) {
    setF({
      nome: s.nome, descrizione: s.descrizione || '', attrezzatura: s.attrezzatura || '',
      capienza: s.capienza ?? '', costo: s.costo_ora_cent ? (s.costo_ora_cent / 100).toString() : '',
      foto_url: s.foto_url, sede_id: s.sede_id || (sedi[0]?.id ?? ''),
      gestione_postazioni: !!s.gestione_postazioni,
    });
    setApri(s.id); setErrore('');
  }

  async function salva(e) {
    e.preventDefault();
    if (!f.nome.trim()) { setErrore('Serve il nome della sala.'); return; }
    setInvio(true); setErrore('');
    const dati = {
      nome: f.nome.trim(), descrizione: f.descrizione || null, attrezzatura: f.attrezzatura || null,
      capienza: f.capienza === '' ? null : parseInt(f.capienza, 10),
      costo_ora_cent: f.costo ? Math.round(parseFloat(f.costo.replace(',', '.')) * 100) : null,
      foto_url: f.foto_url, sede_id: f.sede_id || null,
      gestione_postazioni: f.gestione_postazioni,
    };
    const db = supabaseBrowser();
    const { error } = apri === 'nuovo'
      ? await db.from('sale').insert({ ...dati, palestra_id: palestraId })
      : await db.from('sale').update(dati).eq('id', apri);
    setInvio(false);
    if (error) { setErrore(error.message?.includes('duplicate') ? 'Esiste già una sala con questo nome.' : 'Salvataggio non riuscito.'); return; }
    setApri(null); router.refresh();
  }

  // Crea in un colpo le postazioni numerate: Pertica 1, Pertica 2…
  async function creaPostazioni(s) {
    const quante = prompt(`Quanti posti numerati ha "${s.nome}"?`, postazioni[s.id] || s.capienza || 6);
    if (quante === null) return;
    const n = parseInt(quante, 10);
    if (!Number.isFinite(n) || n < 1) { setErrore('Scrivi un numero.'); return; }
    const prefisso = prompt('Come si chiamano? (Pertica, Tessuto, Tappetino…)', 'Pertica') || 'Postazione';
    const { error } = await supabaseBrowser().rpc('crea_postazioni', {
      p_sala: s.id, p_quante: n, p_prefisso: prefisso.trim(),
    });
    if (error) { setErrore('Non è stato possibile crearli.'); return; }
    router.refresh();
  }

  async function elimina(s) {
    if (usoDi(s.id) > 0) { setErrore(`"${s.nome}" è usata da ${usoDi(s.id)} orari: cambia prima quelli.`); return; }
    if (!confirm(`Eliminare "${s.nome}"?`)) return;
    const { error } = await supabaseBrowser().from('sale').delete().eq('id', s.id);
    if (error) { setErrore('Non si può eliminare: è collegata ad altri dati.'); return; }
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Struttura</div>
        <h1>Sale</h1>
        <p>Dove si svolgono le lezioni: capienza, attrezzatura e costo orario per i margini.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      {apri ? (
        <form onSubmit={salva} className="compare">
          <h2>{apri === 'nuovo' ? 'Nuova sala' : 'Modifica sala'}</h2>
          <Immagine url={f.foto_url} cartella="sale" etichetta="Foto della sala"
                    onChange={(url) => setF({ ...f, foto_url: url })} />
          <div className="campo"><label htmlFor="n">Nome</label><input id="n" value={f.nome} onChange={set('nome')} placeholder="Es. Sala aerea" /></div>
          <div className="campo"><label htmlFor="d">Descrizione</label><textarea id="d" value={f.descrizione} onChange={set('descrizione')} /></div>
          <div className="campo">
            <label htmlFor="a">Attrezzatura</label>
            <input id="a" value={f.attrezzatura} onChange={set('attrezzatura')} placeholder="Es. 6 pertiche, tessuti, specchi, impianto audio" />
          </div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="c">Capienza</label><input id="c" type="number" min="1" value={f.capienza} onChange={set('capienza')} /></div>
            <div className="campo">
              <label htmlFor="co">Costo orario (€)</label>
              <input id="co" inputMode="decimal" value={f.costo} onChange={set('costo')} />
              <span className="piccolo muto">Affitto mensile diviso le ore d'uso.</span>
            </div>
          </div>
          {sedi.length > 1 && (
            <div className="campo">
              <label htmlFor="se">Sede</label>
              <select id="se" value={f.sede_id} onChange={set('sede_id')}>
                {sedi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          )}
          <label className="spunta">
            <input type="checkbox" checked={f.gestione_postazioni}
                   onChange={(e) => setF({ ...f, gestione_postazioni: e.target.checked })} />
            <span>Posti numerati (pertiche, tessuti, tappetini)</span>
          </label>

          <div className="azioni">
            <button className="btn btn-primario" disabled={invio}>Salva</button>
            <button type="button" className="btn" onClick={() => setApri(null)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primario" onClick={() => { setF({ ...VUOTO, sede_id: sedi[0]?.id ?? '' }); setApri('nuovo'); }}>
          Aggiungi sala
        </button>
      )}

      {sale.length === 0 && !apri && <div className="vuoto" style={{ marginTop: 16 }}>Nessuna sala.</div>}

      <div className="griglia-2" style={{ marginTop: 20 }}>
        {sale.map((s) => (
          <div key={s.id} className="tessera" style={{ padding: 0, overflow: 'hidden' }}>
            {s.foto_url
              ? <img src={s.foto_url} alt="" className="copertina" style={{ borderRadius: 0 }} />
              : <div className="copertina segnaposto senza-foto" style={{ borderRadius: 0 }}>{s.nome.slice(0, 2).toUpperCase()}</div>}
            <div style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, color: 'var(--nero)' }}>{s.nome}</div>
              <div className="piccolo muto">
                {s.capienza ? `${s.capienza} posti` : 'capienza non impostata'}
                {s.costo_ora_cent ? ` · ${euro(s.costo_ora_cent)} all'ora` : ''}
                {` · ${usoDi(s.id)} orari`}
              </div>
              {s.attrezzatura && <div className="piccolo" style={{ marginTop: 4 }}>{s.attrezzatura}</div>}
              {s.gestione_postazioni && (
                <div className="piccolo" style={{ marginTop: 6 }}>
                  {(postazioni[s.id] || 0)} posti numerati
                </div>
              )}
              <div className="azioni-riga">
                <button className="link-btn piccolo" onClick={() => modifica(s)}>Modifica</button>
                <button className="link-btn piccolo" onClick={() => creaPostazioni(s)}>Posti numerati</button>
                <button className="link-btn piccolo pericolo" onClick={() => elimina(s)}>Elimina</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
