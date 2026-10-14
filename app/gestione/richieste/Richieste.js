'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, euro } from '@/lib/formato';

const GIORNI = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const ERRORI = {
  orario_non_attivo: 'Il giorno chiesto è stato sospeso: senti il cliente per un altro giorno e rifiuta la richiesta.',
  iscrizione_gia_attiva: 'Ha già un abbonamento attivo per questo corso: controlla la scheda.',
  richiesta_non_trovata: 'Un\'altra persona dello staff l\'ha già gestita.',
};

export default function Richieste({ richieste, vista, orari }) {
  return (
    <div className="richieste">
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Richieste dall'app</h1>
        <p>Abbonamenti pagati con bonifico e lezioni private. Confermi o rispondi: il cliente riceve la notifica.</p>
      </div>
      <div className="schede-sezione" role="tablist">
        <Link prefetch={false} role="tab" aria-selected={vista === 'aperte'} className="scheda-link" href="/gestione/richieste">Da gestire</Link>
        <Link prefetch={false} role="tab" aria-selected={vista !== 'aperte'} className="scheda-link" href="/gestione/richieste?vista=gestite">Gestite</Link>
      </div>
      {richieste.length === 0 && <div className="vuoto">{vista === 'aperte' ? 'Nessuna richiesta da gestire.' : 'Ancora nessuna richiesta gestita.'}</div>}
      <ul className="rich-elenco">
        {richieste.map((r) => <Riga key={r.id} r={r} orari={orari} />)}
      </ul>
    </div>
  );
}

function Riga({ r, orari }) {
  const router = useRouter();
  const [risposta, setRisposta] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const d = r.dati || {};
  const a = r.allievi || {};
  const giorni = (d.orari || []).map((id) => orari.find((o) => o.id === id)).filter(Boolean)
    .map((o) => `${GIORNI[o.giorno_settimana]} ${String(o.ora_inizio).slice(0, 5)}`).join(', ');

  async function fissa(t) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('fissa_personal', { p_id: r.id, p_quando: t, p_risposta: risposta || null });
    setInvio(false);
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    router.refresh();
  }

  async function chiudi() {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('chiudi_da_incassare', { p_id: r.id, p_nota: risposta || null });
    setInvio(false);
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    router.refresh();
  }
  async function rispondi(conferma) {
    if (!conferma && !risposta.trim()) { setErrore('Scrivi due parole al cliente: il motivo o un\'alternativa.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc(conferma ? 'conferma_richiesta' : 'rifiuta_richiesta', { p_id: r.id, p_risposta: risposta || null });
    setInvio(false);
    if (error) { const k = Object.keys(ERRORI).find((x) => error.message?.includes(x)); setErrore(ERRORI[k] || 'Non riuscito. Riprova.'); return; }
    router.refresh();
  }

  return (
    <li className={`rich-riga ${r.stato}`}>
      <div className="rich-testa">
        <span className={`tag ${r.tipo === 'abbonamento' ? 'tag-ok' : r.tipo === 'da_incassare' ? 'tag-attenzione' : 'tag-neutro'}`}>
          {r.tipo === 'abbonamento' ? 'Abbonamento · bonifico' : r.tipo === 'da_incassare' ? 'Iscritto · paga in segreteria' : 'Lezione privata'}</span>
        <Link prefetch={false} href={`/gestione/persone/${a.id}`}><strong>{a.nome} {a.cognome}</strong></Link>
        <span className="piccolo muto">{dataBreve(r.created_at)}{a.account?.telefono ? ` · ${a.account.telefono}` : ''}</span>
      </div>
      {r.tipo === 'da_incassare' ? (
        <div className="rich-dati">
          <span><strong>{d.abbonamento}</strong> · {d.corso}{giorni ? ` · ${giorni}` : ''}</span>
          <span>già iscritto dal {dataBreve(d.data_inizio)} al {dataBreve(d.data_fine)} · restano {d.rimaste} {d.a_giorni ? 'giorni' : 'lezioni'} su {d.totale}{d.fisso ? ' del periodo' : ' del mese'}</span>
          <span>prezzo indicativo {euro(d.prezzo_cent)} <span className="muto">(intero {euro(d.prezzo_pieno_cent)})</span>{d.quota_cent ? ` + quota ${euro(d.quota_cent)}` : ''} = <strong>{euro(r.importo_cent)}</strong></span>
          <span className="piccolo muto">Passa in segreteria a pagare. Controlla prezzo, giorni e certificato: dallo Sportello puoi correggere l'importo e incassare. Incassato, sparisce da qui da solo.</span>
          {r.stato === 'da_confermare' && (
            <span className="rich-slot">
              <Link prefetch={false} className="btn btn-piccolo btn-primario" href={r.iscrizione_id ? `/gestione/sportello?persona=${a.id}&modifica=${r.iscrizione_id}` : `/gestione/sportello?persona=${a.id}`}>Apri allo Sportello per incassare</Link>
            </span>
          )}
        </div>
      ) : r.tipo === 'abbonamento' ? (
        <div className="rich-dati">
          <span><strong>{d.abbonamento}</strong> · {d.corso}{giorni ? ` · ${giorni}` : ''}</span>
          <span>dal {dataBreve(d.data_inizio)} · {euro(d.prezzo_cent)}{d.quota_cent ? ` + quota ${euro(d.quota_cent)}` : ''} = <strong>{euro(r.importo_cent)}</strong></span>
          <span className="piccolo muto">Causale: {d.causale}. Conferma quando vedi il bonifico: l'iscrizione si crea da sola, poi registra l'incasso dalla scheda.</span>
        </div>
      ) : (
        <div className="rich-dati">
          <span>con <strong>{d.insegnante}</strong></span>
          {(d.slot || []).length > 0 ? (
            <span className="rich-slot">Orari scelti — tocca quello che fissi:
              {d.slot.map((t) => (
                <button key={t} type="button" className="btn btn-piccolo" disabled={invio || r.stato !== 'da_confermare'} onClick={() => fissa(t)}>
                  {new Date(t).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}
                </button>
              ))}
            </span>
          ) : <span>Quando: {d.quando}</span>}
          {d.nota && <span className="piccolo muto">“{d.nota}”</span>}
        </div>
      )}
      {r.stato === 'da_confermare' && r.tipo === 'da_incassare' ? (
        <div className="rich-azioni">
          <input value={risposta} onChange={(e) => setRisposta(e.target.value)} placeholder="Nota (facoltativa), es. pagato con altro incasso" aria-label="Nota" />
          <button className="btn btn-piccolo" disabled={invio} onClick={chiudi}>Già sistemato: togli</button>
        </div>
      ) : r.stato === 'da_confermare' ? (
        <div className="rich-azioni">
          <input value={risposta} onChange={(e) => setRisposta(e.target.value)}
                 placeholder={r.tipo === 'personal' ? 'Es. Fissata giovedì 10 alle 18:00 in Sala Pole' : 'Messaggio al cliente (facoltativo)'} aria-label="Risposta" />
          <button className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => rispondi(true)}>{r.tipo === 'abbonamento' ? 'Bonifico arrivato: attiva' : 'Conferma'}</button>
          <button className="btn btn-piccolo" disabled={invio} onClick={() => rispondi(false)}>Rifiuta</button>
        </div>
      ) : (
        <div className="piccolo muto">{r.stato === 'confermata' ? 'Confermata' : r.stato === 'rifiutata' ? 'Rifiutata' : 'Ritirata dal cliente'}{r.gestita_at ? ` il ${dataBreve(r.gestita_at)}` : ''}{r.risposta ? ` · “${r.risposta}”` : ''}</div>
      )}
      {errore && <div className="errore" role="alert">{errore}</div>}
    </li>
  );
}
