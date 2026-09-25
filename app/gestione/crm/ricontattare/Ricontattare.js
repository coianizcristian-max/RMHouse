'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

const LISTE = [
  ['no_rinnovo', 'Non hanno rinnovato', "Abbonamento finito e nessun rinnovo. Chi hai già sentito dopo la scadenza non c'è più.",
    'Ciao {nome}! Abbiamo visto che il tuo abbonamento è scaduto: ti aspettiamo in sala, vuoi che ti prepari il rinnovo? 💪'],
  ['inattivo', 'Non vengono più', 'Iscritti che da un po\' non si presentano. Spariscono per 14 giorni dopo un contatto.',
    'Ciao {nome}, è un po\' che non ti vediamo a lezione: tutto bene? Se ti serve cambiare giorno o orario dimmelo e sistemiamo.'],
  ['ex_recenti', 'Ex clienti recenti', 'Hanno smesso negli ultimi sei mesi.',
    'Ciao {nome}! Da {scuola} ci manchi 🙂 Abbiamo novità nel palinsesto: vuoi venire a provare una lezione?'],
  ['prove', 'Prova fatta, non iscritti', 'Hanno provato ma non si sono iscritti. Spariscono per 7 giorni dopo un contatto.',
    'Ciao {nome}, com\'è andata la prova? Se vuoi continuare ti tengo il posto nel corso: scrivimi quando vuoi.'],
  ['richiamare', 'Da richiamare oggi', 'Chi hai deciso di risentire entro oggi.', 'Ciao {nome}, come promesso ti ricontatto…'],
];
const ESITI = [['sentito', 'Sentito'], ['non_risponde', 'Non risponde'], ['richiamare', 'Da richiamare'], ['non_interessato', 'Non interessato']];
const wa = (t, testo) => `https://wa.me/39${(t || '').replace(/\D/g, '').replace(/^39/, '')}?text=${encodeURIComponent(testo)}`;

export default function Ricontattare({ righe, lista, palestra }) {
  const router = useRouter();
  const [testi, setTesti] = useState(palestra.crm_testi || {});
  const [modifica, setModifica] = useState(false);
  const [apri, setApri] = useState(null);
  const [f, setF] = useState({ esito: 'sentito', testo: '', prossimo: '' });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const voce = LISTE.find(([k]) => k === lista) || LISTE[0];
  const testo = testi[voce[0]] ?? voce[3];
  const elenco = righe.filter((r) => r.lista === voce[0]);
  const conta = (k) => righe.filter((r) => r.lista === k).length;
  const messaggio = (r) => testo.replaceAll('{nome}', r.nome).replaceAll('{scuola}', palestra.nome || '');

  async function chiudiModifica() {
    if (modifica) await supabaseBrowser().from('palestre').update({ crm_testi: testi }).eq('id', palestra.id);
    setModifica(!modifica);
  }

  async function segna(e, r) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('segna_contatto', {
      p_allievo: r.allievo_id, p_canale: 'whatsapp', p_esito: f.esito, p_testo: f.testo || null, p_prossimo: f.prossimo || null,
    });
    setInvio(false);
    if (error) { setErrore('Contatto non salvato.'); return; }
    setApri(null); setF({ esito: 'sentito', testo: '', prossimo: '' }); router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Da ricontattare</h1>
        <p>Liste pronte, un messaggio già scritto per ognuna. Scrivi su WhatsApp, poi segna com'è andata: la persona esce dalla lista.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="pastiglie">
        {LISTE.map(([k, t]) => (
          <Link key={k} className="stato-pillola" aria-current={voce[0] === k ? 'true' : undefined} href={`/gestione/crm/ricontattare?lista=${k}`}>
            {t} <span className="conta">{conta(k)}</span>
          </Link>
        ))}
      </div>
      <p className="piccolo muto">{voce[2]}</p>

      <section className="pannello" style={{ marginBottom: 14 }}>
        <div className="pannello-testa">
          <h2>Il messaggio</h2>
          <button className="link-btn piccolo" onClick={chiudiModifica}>{modifica ? 'salva' : 'modifica'}</button>
        </div>
        {modifica ? (
          <div className="campo">
            <textarea rows={3} value={testo} onChange={(e) => setTesti({ ...testi, [voce[0]]: e.target.value })} aria-label="Testo del messaggio" />
            <span className="piccolo muto">{'{nome}'} diventa il nome della persona, {'{scuola}'} il nome della scuola.</span>
          </div>
        ) : <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{testo}</p>}
      </section>

      {elenco.length === 0 && <div className="vuoto">Nessuno in questa lista. 👏</div>}
      {elenco.length > 0 && (
        <div className="tabella-scorre">
          <table className="tabella-persone">
            <thead><tr><th>Persona</th><th>Perché</th><th className="col-desktop">Ultimo contatto</th><th aria-label="Azioni" /></tr></thead>
            <tbody>
              {elenco.map((r) => (
                <tr key={r.allievo_id + r.lista}>
                  <td>
                    <Link className="persona-nome" href={`/gestione/persone/${r.allievo_id}`}>{r.nome} {r.cognome}</Link>
                    {r.titolare && r.titolare.trim() !== `${r.nome} ${r.cognome}` && <div className="piccolo muto">per {r.titolare}</div>}
                    {apri === r.allievo_id && (
                      <form className="contatto-veloce" onSubmit={(e) => segna(e, r)}>
                        <select value={f.esito} onChange={(e) => setF({ ...f, esito: e.target.value })} aria-label="Esito">
                          {ESITI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <input value={f.testo} onChange={(e) => setF({ ...f, testo: e.target.value })} placeholder="Nota (facoltativa)" />
                        <input type="date" value={f.prossimo} onChange={(e) => setF({ ...f, prossimo: e.target.value })} aria-label="Richiamare il" />
                        <button className="btn btn-piccolo btn-primario" disabled={invio}>Salva</button>
                        <button type="button" className="link-btn piccolo" onClick={() => setApri(null)}>annulla</button>
                      </form>
                    )}
                  </td>
                  <td className="piccolo">{r.dettaglio}</td>
                  <td className="col-desktop piccolo muto">
                    {r.ultimo_contatto ? `${dataBreve(r.ultimo_contatto)} · ${(ESITI.find(([v]) => v === r.ultimo_esito) || [, r.ultimo_esito])[1]}` : 'mai'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.telefono && <a className="btn btn-piccolo" href={wa(r.telefono, messaggio(r))} target="_blank" rel="noreferrer">WhatsApp</a>}{' '}
                    <button className="link-btn piccolo" onClick={() => { setApri(r.allievo_id); setF({ esito: 'sentito', testo: '', prossimo: '' }); }}>segna</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
