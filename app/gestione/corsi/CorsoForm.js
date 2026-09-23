'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';

const COLORI = ['#f40000', '#000000', '#b3001b', '#8a0303', '#d64545', '#5c5c5c', '#2b2b2b', '#7a7a7a'];

export default function CorsoForm({ palestraId, corso, discipline, fasce, livelli, sedi = [] }) {
  const router = useRouter();
  const [f, setF] = useState({
    nome: corso?.nome || '',
    disciplina_id: corso?.disciplina_id || '',
    fascia_eta_id: corso?.fascia_eta_id || '',
    livello_id: corso?.livello_id || '',
    descrizione: corso?.descrizione || '',
    info_prova: corso?.info_prova || '',
    prova_abilitata: corso ? corso.prova_abilitata : true,
    prezzo_prova: corso ? (corso.prezzo_prova_cent / 100).toString() : '0',
    max_prove_per_lezione: corso?.max_prove_per_lezione ?? 2,
    capienza: corso?.capienza ?? '',
    attivo: corso ? corso.attivo : true,
    colore: corso?.colore || '#f40000',
    foto_url: corso?.foto_url || null,
    visibilita: corso?.visibilita || 'pubblico',
    prenotabile: corso ? corso.prenotabile : true,
    sede_id: corso?.sede_id || (sedi[0]?.id ?? ''),
  });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function salva(e) {
    e.preventDefault();
    if (!f.nome || !f.disciplina_id || !f.fascia_eta_id) { setErrore('Nome, disciplina e fascia d\'età sono obbligatori.'); return; }
    setInvio(true); setErrore('');
    const dati = {
      nome: f.nome.trim(),
      disciplina_id: f.disciplina_id,
      fascia_eta_id: f.fascia_eta_id,
      livello_id: f.livello_id || null,
      descrizione: f.descrizione || null,
      info_prova: f.info_prova || null,
      prova_abilitata: f.prova_abilitata,
      prezzo_prova_cent: Math.round(parseFloat(String(f.prezzo_prova).replace(',', '.') || '0') * 100),
      max_prove_per_lezione: parseInt(f.max_prove_per_lezione, 10) || 0,
      capienza: f.capienza === '' ? null : parseInt(f.capienza, 10),
      attivo: f.attivo,
      colore: f.colore,
      foto_url: f.foto_url,
      visibilita: f.visibilita,
      prenotabile: f.prenotabile,
      sede_id: f.sede_id || null,
    };
    const db = supabaseBrowser();
    const { data, error } = corso
      ? await db.from('corsi').update(dati).eq('id', corso.id).select('id').single()
      : await db.from('corsi').insert({ ...dati, palestra_id: palestraId }).select('id').single();
    setInvio(false);
    if (error) { setErrore('Salvataggio non riuscito. Controlla i dati e riprova.'); return; }
    router.push(`/gestione/corsi/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={salva}>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="campo">
        <label htmlFor="nome">Nome del corso</label>
        <input id="nome" value={f.nome} onChange={set('nome')} placeholder="Es. Pole Dance Base" />
      </div>
      <div className="riga-2">
        <div className="campo">
          <label htmlFor="disc">Disciplina</label>
          <select id="disc" value={f.disciplina_id} onChange={set('disciplina_id')}>
            <option value="">— scegli —</option>
            {discipline.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fascia">Fascia d'età</label>
          <select id="fascia" value={f.fascia_eta_id} onChange={set('fascia_eta_id')}>
            <option value="">— scegli —</option>
            {fasce.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </div>
      </div>
      <div className="campo">
        <label htmlFor="liv">Livello</label>
        <select id="liv" value={f.livello_id} onChange={set('livello_id')}>
          <option value="">Aperto a tutti i livelli</option>
          {livelli.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
      </div>
      <Immagine url={f.foto_url} cartella="corsi" etichetta="Foto del corso"
                onChange={(url) => setF({ ...f, foto_url: url })} />
      <div className="campo">
        <label>Colore</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {COLORI.map((c) => (
            <button type="button" key={c} onClick={() => setF({ ...f, colore: c })}
                    aria-label={`Colore ${c}`} aria-pressed={f.colore === c}
                    style={{
                      width: 34, height: 34, borderRadius: 8, background: c, cursor: 'pointer',
                      border: f.colore === c ? '3px solid var(--nero)' : '1px solid var(--linea)',
                    }} />
          ))}
        </div>
        <span className="piccolo muto">È il colore con cui il corso appare nel calendario.</span>
      </div>
      {sedi.length > 1 && (
        <div className="campo">
          <label htmlFor="sede">Sede</label>
          <select id="sede" value={f.sede_id} onChange={set('sede_id')}>
            {sedi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      )}
      <div className="campo">
        <label htmlFor="vis">Visibilità</label>
        <select id="vis" value={f.visibilita} onChange={set('visibilita')}>
          <option value="pubblico">Pubblico: visibile sul sito</option>
          <option value="privato">Privato: solo per chi è già iscritto</option>
          <option value="nascosto">Nascosto: lo vede solo lo staff</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor="descr">Descrizione</label>
        <textarea id="descr" value={f.descrizione} onChange={set('descrizione')} />
      </div>
      <div className="campo">
        <label htmlFor="info">Cosa sapere prima della prova</label>
        <textarea id="info" value={f.info_prova} onChange={set('info_prova')}
                  placeholder="Abbigliamento, cosa portare, quanto arrivare prima…" />
        <span className="piccolo muto">Finisce nell'email di conferma della prova.</span>
      </div>
      <div className="riga-2">
        <div className="campo">
          <label htmlFor="prezzo">Prezzo della prova (€)</label>
          <input id="prezzo" inputMode="decimal" value={f.prezzo_prova} onChange={set('prezzo_prova')} />
          <span className="piccolo muto">0 = prova gratuita</span>
        </div>
        <div className="campo">
          <label htmlFor="maxp">Prove per lezione</label>
          <input id="maxp" type="number" min="0" value={f.max_prove_per_lezione} onChange={set('max_prove_per_lezione')} />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="cap">Capienza del corso</label>
        <input id="cap" type="number" min="1" value={f.capienza} onChange={set('capienza')} placeholder="Vuoto = usa la capienza della sala" />
      </div>
      <label className="spunta">
        <input type="checkbox" checked={f.prova_abilitata} onChange={set('prova_abilitata')} />
        <span>Prenotabile come lezione di prova dal sito</span>
      </label>
      <label className="spunta">
        <input type="checkbox" checked={f.prenotabile} onChange={set('prenotabile')} />
        <span>Prenotabile dai clienti (togli la spunta per i corsi a numero chiuso)</span>
      </label>
      <label className="spunta">
        <input type="checkbox" checked={f.attivo} onChange={set('attivo')} />
        <span>Corso attivo</span>
      </label>
      <button className="btn btn-primario btn-pieno" disabled={invio}>{invio ? 'Salvo…' : 'Salva il corso'}</button>
    </form>
  );
}
