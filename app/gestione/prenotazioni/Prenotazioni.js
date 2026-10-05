'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora } from '@/lib/formato';

const GENERE = { ingresso: ['prenotazione', 'tag-ok'], recupero: ['recupero', 'tag-ok'], prova: ['prova', 'tag-attenzione'] };
const ORIGINE = { cliente: 'dall\'app', sito: 'dal sito', segreteria: 'segreteria' };
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Prenotazioni({ righe, giorni, tipo, origine, q, gestione }) {
  const router = useRouter();
  const [testo, setTesto] = useState(q);
  const [tipoF, setTipoF] = useState(tipo);
  const [origF, setOrigF] = useState(origine);
  const [invio, setInvio] = useState(null);
  const [errore, setErrore] = useState('');

  const vai = (g) => router.push(`/gestione/prenotazioni?giorni=${g}`);
  const parole = norm(testo).split(/\s+/).filter(Boolean);
  const visibili = righe.filter((r) => (!tipoF || r.genere === tipoF) && (!origF || r.origine === origF)
    && parole.every((p) => norm(`${r.allievi?.nome} ${r.allievi?.cognome} ${r.lezioni?.corsi?.nome} ${r.lezioni?.insegnante?.nome}`).includes(p)));
  const conta = (k) => righe.filter((r) => r.genere === k).length;
  const dallApp = righe.filter((r) => r.origine !== 'segreteria').length;

  // raggruppate per giorno
  const giorniMap = new Map();
  for (const r of visibili) { const k = r.lezioni.data; if (!giorniMap.has(k)) giorniMap.set(k, []); giorniMap.get(k).push(r); }

  async function disdici(r) {
    const chi = `${r.allievi?.nome || ''} ${r.allievi?.cognome || ''}`.trim();
    if (!confirm(`Disdire ${GENERE[r.genere][0]} di ${chi} per ${r.lezioni.corsi?.nome} di ${dataBreve(r.lezioni.data)} alle ${ora(r.lezioni.inizio)}?${r.genere === 'recupero' ? ' Il credito del recupero torna disponibile.' : ''}`)) return;
    setInvio(r.id); setErrore('');
    const db = supabaseBrowser();
    const { error } = r.genere === 'prova'
      ? await db.from('prove').update({ stato: 'annullata' }).eq('id', r.id)
      : await db.rpc('cancella_prenotazione', { p_prenotazione: r.id });
    setInvio(null);
    if (error) { setErrore(error.message?.includes('troppo_tardi') ? 'Troppo tardi per disdire: segna l\'assenza dall\'appello.' : 'Disdetta non riuscita. Riprova.'); return; }
    router.refresh();
  }

  return (
    <>
      <div className="intestazione" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="occhiello">Oggi</div>
          <h1>Prenotazioni</h1>
          <p>Ingressi, recuperi e prove in arrivo: {righe.length} nei prossimi {giorni === 1 ? 'giorno' : `${giorni} giorni`}, {dallApp} {dallApp === 1 ? 'fatta' : 'fatte'} dai clienti.</p>
        </div>
        <div className="pastiglie" style={{ margin: 0 }}>
          {[[1, 'Oggi'], [7, '7 giorni'], [30, '30 giorni'], [90, '3 mesi']].map(([g, t]) => (
            <button key={g} type="button" className="stato-pillola" aria-current={giorni === g ? 'true' : undefined} onClick={() => vai(g)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="filtri-persone">
        <input type="search" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca persona, corso o insegnante…" aria-label="Cerca" />
        <select value={tipoF} onChange={(e) => setTipoF(e.target.value)} aria-label="Tipo">
          <option value="">Tutte ({righe.length})</option>
          <option value="ingresso">Prenotazioni ({conta('ingresso')})</option>
          <option value="recupero">Recuperi ({conta('recupero')})</option>
          <option value="prova">Prove ({conta('prova')})</option>
        </select>
        <select value={origF} onChange={(e) => setOrigF(e.target.value)} aria-label="Origine">
          <option value="">Da chiunque</option>
          <option value="cliente">Fatte dai clienti (app)</option>
          <option value="sito">Fatte dal sito</option>
          <option value="segreteria">Fatte dalla segreteria</option>
        </select>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {visibili.length === 0 && <div className="vuoto">Nessuna prenotazione {righe.length ? 'con questi filtri' : 'in questo periodo'}.</div>}

      {[...giorniMap.entries()].map(([g, lista]) => (
        <section key={g} style={{ marginBottom: 18 }}>
          <h2 className="sezione" style={{ textTransform: 'capitalize' }}>
            {new Date(g + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            <span className="piccolo muto" style={{ fontWeight: 400, marginLeft: 8 }}>{lista.length}</span>
          </h2>
          <ul className="mini-lista">
            {lista.map((r) => {
              const t = GENERE[r.genere] || ['', 'tag-neutro']; const l = r.lezioni;
              return (
                <li key={r.id}>
                  <span className="ml-riga">
                    <span className="ml-testo">
                      <strong>
                        <span className="pallino-colore" style={{ background: l.corsi?.colore || 'var(--rosso)', display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
                        {ora(l.inizio)} · {l.corsi?.nome}
                        {' · '}<Link prefetch={false} href={`/gestione/persone/${r.allievo_id}`}>{r.allievi?.nome} {r.allievi?.cognome}</Link>
                      </strong>
                      <span className="piccolo muto">
                        <span className={`tag ${t[1]}`}>{t[0]}</span> {ORIGINE[r.origine] || r.origine} il {dataBreve(r.created_at)}
                        {l.sale?.nome ? ` · ${l.sale.nome}` : ''}{l.insegnante?.nome ? ` · ${l.insegnante.nome}` : ''}{r.note ? ` · ${r.note}` : ''}
                      </span>
                    </span>
                    <span className="pag-destra">
                      <Link prefetch={false} className="link-btn piccolo" href={`/gestione/appello/${l.id}`}>appello</Link>
                      {gestione && <Link prefetch={false} className="link-btn piccolo" href={`/gestione/persone/${r.allievo_id}#prossime`}>sposta</Link>}
                      {gestione && <button type="button" className="link-btn piccolo pericolo" disabled={invio === r.id} onClick={() => disdici(r)}>disdici</button>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="piccolo muto">«Sposta» apre la scheda della persona: da «Prossime lezioni» si disdice e la si aggiunge a un&apos;altra lezione. Gli iscritti fissi dei corsi non compaiono qui: sono in appello.</p>
    </>
  );
}
