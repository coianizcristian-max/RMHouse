'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

const FASI = [
  ['nuovo', 'Nuovi contatti', 'Da chiamare e invitare a una prova'],
  ['prova_prenotata', 'Prova prenotata', 'Aspettano la prova'],
  ['prova_effettuata', 'Prova fatta', 'Da convincere a iscriversi'],
  ['iscritto', 'Iscritti', 'ultimi 30 giorni'],
  ['perso', 'Non convertiti', 'ultimi 30 giorni'],
];
const giorniDa = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const wa = (t) => `https://wa.me/39${(t || '').replace(/\D/g, '').replace(/^39/, '')}`;

export default function Pipeline({ righe }) {
  const router = useRouter();
  const [elenco, setElenco] = useState(righe);
  const [trascina, setTrascina] = useState(null);
  const [sopra, setSopra] = useState(null);
  const [errore, setErrore] = useState('');

  async function sposta(id, fase) {
    const r = elenco.find((x) => x.id === id);
    if (!r || r.stato_lead === fase) return;
    let motivo = null;
    if (fase === 'perso') {
      motivo = prompt(`Perché ${r.nome} non si è iscritto/a? (resta nelle statistiche)`);
      if (motivo === null) return;
    }
    setErrore('');
    setElenco((v) => v.map((x) => (x.id === id ? { ...x, stato_lead: fase } : x)));
    const { error } = await supabaseBrowser().rpc('cambia_stato_lead', { p_allievo: id, p_stato: fase, p_motivo: motivo });
    if (error) { setErrore('Spostamento non riuscito.'); setElenco(righe); return; }
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Contatti e prove</h1>
        <p>Chi ha chiesto informazioni o una prova, fase per fase. Trascina una scheda nella colonna giusta
          (sul telefono usa il menù sotto la scheda). <Link href="/gestione/lead">Elenco con il diario dei contatti</Link></p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="pipeline">
        {FASI.map(([fase, titolo, sotto]) => {
          const carte = elenco.filter((r) => r.stato_lead === fase);
          return (
            <section key={fase} className={`pipe-colonna${sopra === fase ? ' sopra' : ''}`}
                     onDragOver={(e) => { e.preventDefault(); setSopra(fase); }}
                     onDragLeave={() => setSopra(null)}
                     onDrop={(e) => { e.preventDefault(); setSopra(null); if (trascina) sposta(trascina, fase); setTrascina(null); }}>
              <header>
                <strong>{titolo}</strong> <span className="conta">{carte.length}</span>
                <div className="piccolo muto">{sotto}</div>
              </header>
              {carte.length === 0 && <div className="pipe-vuota">—</div>}
              {carte.map((r) => {
                const scaduto = r.prossimo_contatto && r.prossimo_contatto <= new Date().toISOString().slice(0, 10);
                return (
                  <article key={r.id} className="pipe-carta" draggable onDragStart={() => setTrascina(r.id)}>
                    <Link href={`/gestione/persone/${r.id}`} className="persona-nome">{r.nome} {r.cognome}</Link>
                    <div className="piccolo muto">
                      {[r.eta != null && `${r.eta} anni`, r.fonte, `da ${giorniDa(r.created_at)} gg`].filter(Boolean).join(' · ')}
                    </div>
                    {r.prova && <div className="piccolo">Prova: {r.prova}</div>}
                    {r.ultima_nota && <div className="piccolo muto pipe-nota">“{r.ultima_nota}”</div>}
                    {r.prossimo_contatto && (
                      <div className={`piccolo ${scaduto ? 'scaduta' : ''}`}>Richiamare il {dataBreve(r.prossimo_contatto)}</div>
                    )}
                    <div className="pipe-azioni">
                      {r.telefono && <a className="link-btn piccolo" href={wa(r.telefono)} target="_blank" rel="noreferrer">WhatsApp</a>}
                      <select className="select-piccola" value={fase} onChange={(e) => sposta(r.id, e.target.value)} aria-label={`Fase di ${r.nome}`}>
                        {FASI.map(([f, t]) => <option key={f} value={f}>{t}</option>)}
                      </select>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
