'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useCopia, whatsappLink, daISO } from './campi';

// Gruppo WhatsApp del corso: WhatsApp non permette di aggiungere qualcuno da fuori, quindi si manda
// alla persona il link d'invito del gruppo (salvato nel corso) con un messaggio già scritto.
export function GruppoWhatsApp({ persona, corso, palestraNome }) {
  const [copiato, copia] = useCopia();
  const tel = persona?.telefono;
  if (!corso) return null;
  const testo = corso.link_whatsapp
    ? `Ciao ${persona?.nome || ''}! Benvenuta/o a ${palestraNome || 'scuola'} 🙂 Ecco il link per entrare nel gruppo WhatsApp di ${corso.nome}: ${corso.link_whatsapp}`
    : '';
  return (
    <div className="sp-passo">
      <div className="sp-passo-testa"><span className="sp-icona wa" aria-hidden="true">✆</span><strong>Gruppo WhatsApp · {corso.nome}</strong></div>
      {persona?.consenso_whatsapp === false && <p className="piccolo sp-attenzione">Ha detto di no ai gruppi WhatsApp.</p>}
      {!tel && <p className="piccolo muto">Manca il cellulare: aggiungilo nella scheda.</p>}
      <div className="sp-bottoni">
        {tel && corso.link_whatsapp && (
          <a className="btn btn-piccolo" href={whatsappLink(tel, testo)} target="_blank" rel="noreferrer">Manda il link del gruppo</a>
        )}
        {tel && <button type="button" className="btn btn-piccolo" onClick={() => copia(tel, 'tel')}>{copiato === 'tel' ? 'Copiato ✓' : `Copia ${tel}`}</button>}
      </div>
      {!corso.link_whatsapp && (
        <p className="piccolo muto">Il corso non ha il link del gruppo: mettilo in Corsi → {corso.nome} (campo &quot;Link del gruppo WhatsApp&quot;) e da qui si manda con un clic.</p>
      )}
    </div>
  );
}

// Tessera dell'ente (ASI): il portale non si collega da fuori, quindi qui ci sono tutti i dati pronti
// da copiare (uno alla volta con un clic, o tutti insieme), il pulsante per aprire il portale
// e "Fatta" con il numero di tessera.
export function TesseraEnte({ palestraId, ente = {}, persona, dati, tessera, stagione, onCambio }) {
  const [copiato, copia] = useCopia();
  const [numero, setNumero] = useState('');
  const [portale, setPortale] = useState(ente.portale || '');
  const [cambiaLink, setCambiaLink] = useState(false);
  const [msg, setMsg] = useState('');
  const nomeEnte = ente.nome || 'ASI';
  if (!persona) return null;

  const campi = [
    ['Cognome', persona.cognome], ['Nome', persona.nome], ['Sesso', dati?.sesso],
    ['Data di nascita', daISO(persona.data_nascita)], ['Luogo di nascita', dati?.luogo_nascita],
    ['Codice fiscale', dati?.codice_fiscale],
    ['Indirizzo', dati?.account?.indirizzo], ['CAP', dati?.account?.cap], ['Comune', dati?.account?.citta], ['Provincia', dati?.account?.provincia],
    ['Email', persona.email], ['Cellulare', persona.telefono],
  ];
  const mancano = campi.filter(([, v]) => !v).map(([k]) => k.toLowerCase());
  const tutto = campi.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

  async function segna() {
    setMsg('');
    const { error } = await supabaseBrowser().rpc('aggiorna_tesseramenti', {
      p_palestra: palestraId, p_stagione: stagione, p_allievi: [persona.id], p_stato: 'tesserato',
      p_numero_da: numero.trim() && /^\d+$/.test(numero.trim()) ? Number(numero.trim()) : null,
    });
    if (error) { setMsg('Non salvato: riprova.'); return; }
    // numero con lettere (es. "VI-12345"): si salva così com'è
    if (numero.trim() && !/^\d+$/.test(numero.trim())) {
      await Promise.all([
        supabaseBrowser().from('allievi').update({ tessera: numero.trim() }).eq('id', persona.id),
        supabaseBrowser().from('tesseramenti').update({ numero: numero.trim() }).eq('allievo_id', persona.id).eq('stagione', stagione),
      ]);
    }
    setMsg('Segnata ✓'); setNumero(''); onCambio?.();
  }
  async function salvaPortale() {
    const { error } = await supabaseBrowser().rpc('salva_portale_ente', { p_palestra: palestraId, p_url: portale });
    if (error) { setMsg('Il link deve iniziare con https://'); return; }
    setCambiaLink(false); setMsg('Link salvato ✓');
  }

  return (
    <div className="sp-passo">
      <div className="sp-passo-testa">
        <span className="sp-icona ente" aria-hidden="true">★</span>
        <strong>Tessera {nomeEnte}</strong>
        <span className={`sp-stato ${tessera?.stato === 'tesserato' ? 'ok' : 'no'}`}>
          {tessera?.stato === 'tesserato' ? `fatta${tessera.numero ? ` · n. ${tessera.numero}` : ''}` : tessera?.stato === 'inviato' ? 'inviata' : 'da fare'}
        </span>
      </div>
      <div className="sp-copia-campi">
        {campi.map(([k, v]) => (
          <button type="button" key={k} disabled={!v} onClick={() => copia(String(v), k)} title={v ? `Copia ${k.toLowerCase()}` : 'manca'}>
            <span className="muto">{k}</span><b>{copiato === k ? 'copiato ✓' : v || '—'}</b>
          </button>
        ))}
      </div>
      {mancano.length > 0 && <p className="piccolo sp-attenzione">Mancano: {mancano.join(', ')}.</p>}
      <div className="sp-bottoni">
        <button type="button" className="btn btn-piccolo" onClick={() => copia(tutto, 'tutto')}>{copiato === 'tutto' ? 'Copiati ✓' : 'Copia tutti i dati'}</button>
        {ente.portale && !cambiaLink && <a className="btn btn-piccolo" href={ente.portale} target="_blank" rel="noreferrer">Apri il sito {nomeEnte} ↗</a>}
        <button type="button" className="link-btn piccolo" onClick={() => setCambiaLink(!cambiaLink)}>{ente.portale ? 'cambia link' : `metti il link del sito ${nomeEnte}`}</button>
      </div>
      {cambiaLink && (
        <div className="sp-riga-input">
          <input value={portale} onChange={(e) => setPortale(e.target.value)} placeholder="https://… (la pagina dove fate le tessere)" aria-label="Link del portale" />
          <button type="button" className="btn btn-piccolo" onClick={salvaPortale}>Salva</button>
        </div>
      )}
      {tessera?.stato !== 'tesserato' && (
        <div className="sp-riga-input">
          <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="n. tessera (se c'è)" aria-label="Numero tessera" />
          <button type="button" className="btn btn-piccolo" onClick={segna}>Fatta</button>
        </div>
      )}
      {msg && <p className="piccolo" role="status">{msg}</p>}
    </div>
  );
}
