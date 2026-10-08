'use client';
import { useState } from 'react';
import Link from 'next/link';
import { euro } from '@/lib/formato';
import { problemaCF, normalizzaCF } from '@/lib/codiceFiscale';
import { prossimoScaglione, dataBreveIt } from '@/lib/workshop';

// Iscrizione dal link pubblico: per sé o per un figlio/a, i dati, l'opzione, privacy, come pagare.
// Il prezzo mostrato è quello per gli esterni; chi risulta già allievo/a paga il suo (lo vede prima di pagare).
const VUOTA = { nome: '', cognome: '', data_nascita: '', codice_fiscale: '', email: '', telefono: '' };

export default function IscrizionePubblica({ w, carta, satispay }) {
  const [adulto, setAdulto] = useState(true);
  const [t, setT] = useState(VUOTA);
  const [p, setP] = useState(VUOTA);
  const [opz, setOpz] = useState((w.opzioni || []).filter((o) => o.liberi !== 0).length === 1 ? w.opzioni.find((o) => o.liberi !== 0).id : '');
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const o = (w.opzioni || []).find((x) => x.id === opz);
  const quota = w.quota_cent || 0;
  const prezzo = o ? o.prezzo_esterni ?? o.prezzo_allievi : 0;
  const totale = (prezzo || 0) + quota;
  const pross = o ? prossimoScaglione(o) : null;
  const modi = [carta && ['carta', `Paga ${euro(totale)} con carta`], satispay && ['satispay', 'Paga con Satispay'], w.in_segreteria && ['segreteria', 'Pago in segreteria']].filter(Boolean);
  const setTit = (k) => (e) => setT((x) => ({ ...x, [k]: e.target.value }));
  const setPar = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));

  async function invia(pagamento) {
    setErrore('');
    const chi = adulto ? t : p;
    if (!o) { setErrore('Scegli a cosa ti iscrivi.'); return; }
    if (!t.nome.trim() || !t.cognome.trim() || !t.email.trim() || !t.telefono.trim()) { setErrore(`Compila nome, cognome, email e telefono${adulto ? '' : ' del genitore'}.`); return; }
    if (!chi.nome.trim() || !chi.cognome.trim() || !chi.data_nascita) { setErrore(adulto ? 'Manca la data di nascita.' : 'Compila nome, cognome e data di nascita di chi partecipa.'); return; }
    if (quota > 0) {
      const cf = normalizzaCF(chi.codice_fiscale);
      if (!cf) { setErrore('Serve il codice fiscale di chi partecipa: è per la tessera associativa.'); return; }
      const pr = problemaCF(cf);
      if (pr) { setErrore(`Codice fiscale: ${pr}`); return; }
    }
    if (!privacy) { setErrore('Per iscriverti serve il consenso al trattamento dei dati.'); return; }
    setInvio(true);
    const r = await fetch('/api/workshop/pubblico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      slug: w.slug, opzione_id: o.id, adulto, pagamento,
      titolare: { ...t, codice_fiscale: adulto ? normalizzaCF(t.codice_fiscale) : '' },
      partecipante: adulto ? null : { ...p, codice_fiscale: normalizzaCF(p.codice_fiscale) },
      consenso_privacy: privacy, consenso_marketing: marketing,
    }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setInvio(false); setErrore(d.errore || 'Iscrizione non riuscita. Riprova.'); return; }
    if (d.url) { window.location.href = d.url; return; }
    window.location.href = d.errore_pagamento ? `${d.pagina}?errore=1` : d.pagina;
  }

  return (
    <section className="wp-iscrizione" id="iscriviti">
      <h2>Iscriviti</h2>
      <p className="piccolo muto">Sei già allievo/a della scuola? <Link href={`/area/workshop/${w.id}`} prefetch={false}>Iscriviti dall&apos;app</Link>: paghi il prezzo allievi.</p>

      {(w.opzioni || []).length > 1 && (
        <div className="campo">
          <label>A cosa ti iscrivi</label>
          <div className="wa-opzioni" role="radiogroup" aria-label="Opzione">
            {w.opzioni.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={opz === x.id} className={`wa-opzione${opz === x.id ? ' scelta' : ''}`}
                      disabled={x.liberi === 0} onClick={() => setOpz(x.id)}>
                <strong>{x.nome}</strong><span>{x.liberi === 0 ? 'completo' : euro(x.prezzo_esterni ?? x.prezzo_allievi)}</span>
                {x.descrizione && <small className="muto">{x.descrizione}</small>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sp-scelta" role="radiogroup" aria-label="Per chi">
        <button type="button" role="radio" aria-checked={adulto} className={adulto ? 'attiva' : ''} onClick={() => setAdulto(true)}>Per me</button>
        <button type="button" role="radio" aria-checked={!adulto} className={!adulto ? 'attiva' : ''} onClick={() => setAdulto(false)}>Per mio figlio / mia figlia</button>
      </div>

      <fieldset className="wp-dati">
        <legend>{adulto ? 'I tuoi dati' : 'I dati del genitore'}</legend>
        <div className="wp-campi">
          <div className="campo"><label htmlFor="wt-nome">Nome</label><input id="wt-nome" value={t.nome} onChange={setTit('nome')} autoComplete="given-name" /></div>
          <div className="campo"><label htmlFor="wt-cognome">Cognome</label><input id="wt-cognome" value={t.cognome} onChange={setTit('cognome')} autoComplete="family-name" /></div>
          <div className="campo"><label htmlFor="wt-email">Email</label><input id="wt-email" type="email" value={t.email} onChange={setTit('email')} autoComplete="email" /></div>
          <div className="campo"><label htmlFor="wt-tel">Telefono</label><input id="wt-tel" type="tel" value={t.telefono} onChange={setTit('telefono')} autoComplete="tel" /></div>
          {adulto && <div className="campo"><label htmlFor="wt-nascita">Data di nascita</label><input id="wt-nascita" type="date" value={t.data_nascita} onChange={setTit('data_nascita')} /></div>}
          {adulto && <div className="campo"><label htmlFor="wt-cf">Codice fiscale{quota > 0 ? '' : ' (facoltativo)'}</label><input id="wt-cf" value={t.codice_fiscale} onChange={setTit('codice_fiscale')} autoCapitalize="characters" maxLength={16} /></div>}
        </div>
      </fieldset>
      {!adulto && (
        <fieldset className="wp-dati">
          <legend>Chi partecipa</legend>
          <div className="wp-campi">
            <div className="campo"><label htmlFor="wp-nome">Nome</label><input id="wp-nome" value={p.nome} onChange={setPar('nome')} /></div>
            <div className="campo"><label htmlFor="wp-cognome">Cognome</label><input id="wp-cognome" value={p.cognome} onChange={setPar('cognome')} /></div>
            <div className="campo"><label htmlFor="wp-nascita">Data di nascita</label><input id="wp-nascita" type="date" value={p.data_nascita} onChange={setPar('data_nascita')} /></div>
            <div className="campo"><label htmlFor="wp-cf">Codice fiscale{quota > 0 ? '' : ' (facoltativo)'}</label><input id="wp-cf" value={p.codice_fiscale} onChange={setPar('codice_fiscale')} autoCapitalize="characters" maxLength={16} /></div>
          </div>
        </fieldset>
      )}

      {o && (
        <div className="wa-totale">
          <div><span>{o.nome}</span><strong>{euro(prezzo)}</strong></div>
          {quota > 0 && <div><span>Quota associativa annuale <small className="muto">(tessera: vale un anno)</small></span><strong>{euro(quota)}</strong></div>}
          <div className="wa-totale-riga"><span>Totale</span><strong>{euro(totale)}</strong></div>
          {quota > 0 && <p className="piccolo muto">Se hai già la quota di quest&apos;anno, o sei allievo/a della scuola, il totale si abbassa da solo: lo vedi prima di pagare.</p>}
          {pross && <p className="piccolo muto">Dal {dataBreveIt(pross.dal)} costa {euro(pross.esterni)}.</p>}
        </div>
      )}

      <label className="spunta"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
        <span>Acconsento al trattamento dei dati per gestire l&apos;iscrizione{!adulto && ', anche come genitore del minore'}. <a href="/privacy" target="_blank" rel="noreferrer">Informativa</a></span></label>
      <label className="spunta"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
        <span>Voglio ricevere le novità della scuola (workshop, corsi, eventi). Facoltativo.</span></label>

      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="wa-bottoni">
        {modi.length === 0 && <p className="piccolo muto">Per iscriverti scrivici o passa in segreteria.</p>}
        {modi.map(([k, testo], i) => (
          <button key={k} type="button" className={`btn${i === 0 ? ' btn-primario' : ''}`} disabled={invio || !o} onClick={() => invia(k)}>
            {invio ? 'Un attimo…' : totale === 0 ? 'Iscriviti' : testo}
          </button>
        ))}
      </div>
      {!o && <p className="piccolo muto">Scegli a cosa ti iscrivi.</p>}
    </section>
  );
}
