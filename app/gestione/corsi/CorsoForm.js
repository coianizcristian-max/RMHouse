'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';
import { gradazioni, testoSu, TAVOLOZZA_BASE } from '@/lib/colori';


export default function CorsoForm({ palestraId, corso, discipline, fasce, livelli, sedi = [], tavolozza = [] }) {
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
    colore: corso?.colore || '',
    colore_automatico: corso ? corso.colore_automatico !== false : true,
    foto_url: corso?.foto_url || null,
    visibilita: corso?.visibilita || 'pubblico',
    prenotabile: corso ? corso.prenotabile : true,
    iscrizioni_app: corso?.iscrizioni_app || 'aperte',
    nota_iscrizioni: corso?.nota_iscrizioni || '',
    sede_id: corso?.sede_id || (sedi[0]?.id ?? ''),
  });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const disciplinaScelta = discipline.find((d) => d.id === f.disciplina_id);
  const baseColore = disciplinaScelta?.colore || null;
  const nomeDisciplina = disciplinaScelta?.nome || '';

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function salva(e) {
    e.preventDefault();
    if (!f.nome || !f.disciplina_id || !f.fascia_eta_id) { setErrore('Nome, disciplina e fascia d\'età sono obbligatori.'); return; }
    if (f.colore && !/^#[0-9a-f]{6}$/i.test(f.colore)) { setErrore('Il colore va scritto come #rrggbb, per esempio #ff00ff.'); return; }
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
      colore: f.colore || null,
      colore_automatico: f.colore_automatico,
      foto_url: f.foto_url,
      visibilita: f.visibilita,
      prenotabile: f.prenotabile,
      iscrizioni_app: f.iscrizioni_app,
      nota_iscrizioni: f.nota_iscrizioni.trim() || null,
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

  const coloreVisto = f.colore || baseColore || '#f40000';
  const tinta = (c, etichetta) => (
    <button type="button" key={c} title={etichetta || c} aria-label={etichetta || `Tinta ${c}`}
            aria-pressed={f.colore?.toLowerCase() === c.toLowerCase()}
            onClick={() => setF({ ...f, colore: c, colore_automatico: false })}
            style={{ background: c, color: testoSu(c) }}>
      {f.colore?.toLowerCase() === c.toLowerCase() ? '✓' : ''}
    </button>
  );

  // Pagina compatta: a sinistra i dati del corso, a destra foto e colore
  return (
    <form onSubmit={salva} className="corso-form">
      <div className="cf-griglia">
        <div className="cf-principale">
          <section className="cf-sezione">
            <h3>Il corso</h3>
            <div className="cf-campi">
              <div className="campo cf-3"><label htmlFor="nome">Nome del corso</label>
                <input id="nome" value={f.nome} onChange={set('nome')} placeholder="Es. Pole Dance Base" /></div>
              <div className="campo cf-3"><label htmlFor="disc">Disciplina</label>
                <select id="disc" value={f.disciplina_id} onChange={set('disciplina_id')}>
                  <option value="">— scegli —</option>
                  {discipline.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select></div>
              <div className="campo cf-2"><label htmlFor="fascia">Fascia d'età</label>
                <select id="fascia" value={f.fascia_eta_id} onChange={set('fascia_eta_id')}>
                  <option value="">— scegli —</option>
                  {fasce.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select></div>
              <div className="campo cf-2"><label htmlFor="liv">Livello</label>
                <select id="liv" value={f.livello_id} onChange={set('livello_id')}>
                  <option value="">Tutti i livelli</option>
                  {livelli.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select></div>
              <div className="campo cf-2"><label htmlFor="cap">Posti</label>
                <input id="cap" type="number" min="1" value={f.capienza} onChange={set('capienza')} placeholder="come la sala" /></div>
              <div className={`campo ${sedi.length > 1 ? 'cf-3' : 'cf-6'}`}><label htmlFor="vis">Visibilità</label>
                <select id="vis" value={f.visibilita} onChange={set('visibilita')}>
                  <option value="pubblico">Pubblico: visibile sul sito</option>
                  <option value="privato">Privato: solo per chi frequenta già</option>
                  <option value="nascosto">Nascosto: lo vede solo lo staff</option>
                </select></div>
              {sedi.length > 1 && (
                <div className="campo cf-3"><label htmlFor="sede">Sede</label>
                  <select id="sede" value={f.sede_id} onChange={set('sede_id')}>
                    {sedi.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select></div>
              )}
            </div>
          </section>

          <section className="cf-sezione">
            <h3>Testi per il cliente</h3>
            <div className="cf-campi">
              <div className="campo cf-3"><label htmlFor="descr">Descrizione</label>
                <textarea id="descr" rows={3} value={f.descrizione} onChange={set('descrizione')} /></div>
              <div className="campo cf-3"><label htmlFor="info">Cosa sapere prima della prova</label>
                <textarea id="info" rows={3} value={f.info_prova} onChange={set('info_prova')}
                          placeholder="Abbigliamento, cosa portare, quanto arrivare prima…" />
                <span className="piccolo muto">Finisce nell'email di conferma della prova.</span></div>
            </div>
          </section>

          <section className="cf-sezione">
            <h3>Iscrizioni dall'app</h3>
            <div className="cf-campi">
              <div className="campo cf-6">
                <div className="cf-stati" role="radiogroup" aria-label="Iscrizioni dall'app">
                  {[['aperte', 'Aperte', 'si compra l\'abbonamento e si prenota'],
                    ['attesa', 'In partenza', 'non si compra né si prenota: "Avvisami quando parte"'],
                    ['chiuse', 'Chiuse', 'non si compra né si prenota dall\'app']].map(([v, t, d]) => (
                    <label key={v} className={`cf-stato${f.iscrizioni_app === v ? ' scelto' : ''}`}>
                      <input type="radio" name="iscrizioni_app" value={v} checked={f.iscrizioni_app === v} onChange={set('iscrizioni_app')} />
                      <strong>{t}</strong><span>{d}</span>
                    </label>
                  ))}
                </div>
              </div>
              {f.iscrizioni_app !== 'aperte' && (
                <div className="campo cf-6"><label htmlFor="notaisc">Messaggio per i clienti</label>
                  <input id="notaisc" value={f.nota_iscrizioni} onChange={set('nota_iscrizioni')}
                         placeholder={f.iscrizioni_app === 'attesa' ? 'Es. Parte appena siamo in 6: tocca "Avvisami" e ti scriviamo noi' : 'Es. Corso al completo per questa stagione'} />
                  <span className="piccolo muto">La segreteria può sempre iscrivere e prenotare a mano. Quando passi da "In partenza" ad "Aperte", chi ha chiesto di essere avvisato riceve la notifica.</span>
                </div>
              )}
            </div>
          </section>

          <section className="cf-sezione">
            <h3>Prova e prenotazioni</h3>
            <div className="cf-campi">
              <div className="campo cf-2"><label htmlFor="prezzo">Prezzo della prova (€)</label>
                <input id="prezzo" inputMode="decimal" value={f.prezzo_prova} onChange={set('prezzo_prova')} />
                <span className="piccolo muto">0 = gratuita</span></div>
              <div className="campo cf-2"><label htmlFor="maxp">Prove per lezione</label>
                <input id="maxp" type="number" min="0" value={f.max_prove_per_lezione} onChange={set('max_prove_per_lezione')} /></div>
              <div className="cf-2 cf-spunte">
                <label className="spunta"><input type="checkbox" checked={f.attivo} onChange={set('attivo')} /><span>Corso attivo</span></label>
                <label className="spunta"><input type="checkbox" checked={f.prova_abilitata} onChange={set('prova_abilitata')} /><span>Prova prenotabile dal sito</span></label>
                <label className="spunta" title="Togli la spunta per i corsi a numero chiuso"><input type="checkbox" checked={f.prenotabile} onChange={set('prenotabile')} /><span>Prenotabile dai clienti</span></label>
              </div>
            </div>
          </section>
        </div>

        <aside className="cf-lato">
          <section className="cf-sezione">
            <h3>Aspetto</h3>
            <Immagine url={f.foto_url} cartella="corsi" etichetta="Foto del corso" onChange={(url) => setF({ ...f, foto_url: url })} />
            <div className="campo">
              <label>Colore</label>
              <div className="tinte-anteprima" style={{ background: coloreVisto, color: testoSu(coloreVisto) }}>
                {f.nome || 'Nome del corso'}<span>{f.colore || baseColore || ''}</span>
              </div>
              <span className="tinte-titolo">Colori della scuola</span>
              <div className="tinte">{(tavolozza.length ? tavolozza : TAVOLOZZA_BASE).map((t) => tinta(t.colore, t.nome))}</div>
              {baseColore && (
                <>
                  <span className="tinte-titolo">Gradazioni di {nomeDisciplina || 'questa disciplina'}</span>
                  <div className="tinte">{gradazioni(baseColore, 10).map((c) => tinta(c))}</div>
                </>
              )}
              <span className="tinte-titolo">Qualunque altro colore</span>
              <div className="tinte-libero">
                <input type="color" aria-label="Scegli un colore" value={/^#[0-9a-f]{6}$/i.test(f.colore) ? f.colore : (baseColore || '#f40000')}
                       onChange={(e) => setF({ ...f, colore: e.target.value, colore_automatico: false })} />
                <input type="text" aria-label="Codice colore" placeholder="#ff00ff" maxLength={7} value={f.colore}
                       onChange={(e) => setF({ ...f, colore: e.target.value.trim(), colore_automatico: false })} />
              </div>
              <label className="spunta" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={f.colore_automatico} onChange={(e) => setF({ ...f, colore_automatico: e.target.checked })} />
                <span>Colore automatico: segue la disciplina</span>
              </label>
            </div>
          </section>
        </aside>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="azioni">
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva il corso'}</button>
      </div>
    </form>
  );
}
