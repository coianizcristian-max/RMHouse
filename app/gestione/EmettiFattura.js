'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, oggiISO } from '@/lib/formato';

const ERRORI = {
  documento_gia_emesso: 'Questo incasso ha già una ricevuta o una fattura.',
  dati_scuola_mancanti: 'Mancano i dati della scuola per la fattura: Struttura → Sede e contatti → "Dati per la fattura elettronica".',
  cliente_denominazione: 'Scrivi la ragione sociale.',
  cliente_piva: 'Partita IVA non valida (11 cifre).',
  cliente_nome: 'Scrivi nome e cognome.',
  cliente_cf: 'Serve il codice fiscale (o la partita IVA) del cliente.',
  cliente_indirizzo: 'Serve l\'indirizzo completo: via, CAP (5 cifre) e comune.',
  cliente_codice: 'Il codice destinatario ha 7 caratteri (0000000 se non ce l\'ha).',
  cliente_pec: 'La PEC non è valida.',
  aliquota_mancante: 'Scegli l\'aliquota IVA.',
  aliquota_senza_natura: 'Quell\'aliquota a 0% non ha la "natura" (N2.2, N4…): sceglierne un\'altra.',
  data_futura: 'La data non può essere nel futuro.',
  data_prima_ultima: 'C\'è già una fattura con data successiva: la data deve essere uguale o dopo l\'ultima.',
  pagamento_non_incassato: 'Prima segna l\'incasso come pagato.',
};

// Fattura di un incasso (attività commerciali, es. affitto sale con IVA 22%).
// Propone i dati del cliente (quelli della volta prima, o quelli della scheda) e l'aliquota.
export default function EmettiFattura({ pagamentoId, onChiudi }) {
  const router = useRouter();
  const [base, setBase] = useState(null);
  const [c, setC] = useState(null);
  const [f, setF] = useState({ aliquota_id: '', descrizione: '', data: oggiISO(), note: '' });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    supabaseBrowser().rpc('dati_per_fattura', { p_pagamento: pagamentoId }).then(({ data, error }) => {
      if (error || !data) { setErrore('Impossibile leggere l\'incasso.'); return; }
      setBase(data);
      const k = data.cliente || {};
      setC({
        tipo: k.tipo || 'persona', nome: k.nome || '', cognome: k.cognome || '', denominazione: k.denominazione || '',
        piva: k.piva || '', cf: k.cf || '', indirizzo: k.indirizzo || '', cap: k.cap || '', comune: k.comune || '',
        provincia: k.provincia || '', codice_destinatario: k.codice_destinatario || '0000000', pec: k.pec || '',
      });
      setF((x) => ({ ...x, aliquota_id: data.aliquota_id || '', descrizione: data.descrizione || '' }));
    });
  }, [pagamentoId]);

  if (!base || !c) return <div className="fattura-box">{errore ? <div className="errore">{errore}</div> : <span className="piccolo muto">Carico…</span>}</div>;

  const al = (base.aliquote || []).find((a) => a.id === f.aliquota_id);
  const imponibile = Math.round(base.importo_cent / (1 + (Number(al?.percentuale) || 0) / 100));
  const setK = (k, su) => (e) => setC({ ...c, [k]: su ? e.target.value.toUpperCase() : e.target.value });
  const azienda = c.tipo === 'azienda';

  async function emetti(e) {
    e.preventDefault();
    if (!confirm(`Emettere la fattura di ${euro(base.importo_cent)}? Il numero è progressivo e non si riusa.`)) return;
    setInvio(true); setErrore('');
    const { data, error } = await supabaseBrowser().rpc('emetti_fattura', { p_pagamento: pagamentoId, p: { cliente: c, ...f } });
    setInvio(false);
    if (error) { const k = Object.keys(ERRORI).find((x) => error.message?.includes(x)); setErrore(ERRORI[k] || 'Fattura non emessa.'); return; }
    router.push(`/gestione/ricevute/${data}`);
  }

  return (
    <form className="fattura-box" onSubmit={emetti}>
      <div className="fattura-testa">
        <strong>Fattura</strong>
        <button type="button" className="link-btn piccolo" onClick={onChiudi}>chiudi</button>
      </div>
      {!base.scuola_pronta && <div className="errore">{ERRORI.dati_scuola_mancanti}</div>}
      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="fm-modo" role="radiogroup" aria-label="Cliente">
        <button type="button" role="radio" aria-checked={!azienda} onClick={() => setC({ ...c, tipo: 'persona' })}>Persona</button>
        <button type="button" role="radio" aria-checked={azienda} onClick={() => setC({ ...c, tipo: 'azienda' })}>Azienda / ente</button>
      </div>

      <div className="fattura-campi">
        {azienda ? (
          <label className="fc-largo"><span>Ragione sociale</span><input value={c.denominazione} onChange={setK('denominazione')} /></label>
        ) : (<>
          <label><span>Nome</span><input value={c.nome} onChange={setK('nome')} /></label>
          <label><span>Cognome</span><input value={c.cognome} onChange={setK('cognome')} /></label>
        </>)}
        <label><span>{azienda ? 'Partita IVA' : 'Partita IVA (se ce l\'ha)'}</span><input value={c.piva} onChange={setK('piva')} inputMode="numeric" maxLength={11} /></label>
        <label><span>Codice fiscale</span><input value={c.cf} onChange={setK('cf', true)} maxLength={16} /></label>
        <label className="fc-largo"><span>Indirizzo</span><input value={c.indirizzo} onChange={setK('indirizzo')} placeholder="Via e numero" /></label>
        <label><span>CAP</span><input value={c.cap} onChange={setK('cap')} inputMode="numeric" maxLength={5} /></label>
        <label><span>Comune</span><input value={c.comune} onChange={setK('comune')} /></label>
        <label><span>Provincia</span><input value={c.provincia} onChange={setK('provincia', true)} maxLength={2} /></label>
        <label><span>Codice destinatario</span><input value={c.codice_destinatario} onChange={setK('codice_destinatario', true)} maxLength={7} /></label>
        <label className="fc-largo"><span>PEC (se non ha il codice destinatario)</span><input type="email" value={c.pec} onChange={setK('pec')} /></label>
        <label className="fc-largo"><span>Descrizione</span><input value={f.descrizione} onChange={(e) => setF({ ...f, descrizione: e.target.value })} /></label>
        <label><span>Aliquota</span>
          <select value={f.aliquota_id} onChange={(e) => setF({ ...f, aliquota_id: e.target.value })}>
            <option value="">—</option>
            {(base.aliquote || []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select></label>
        <label><span>Data</span><input type="date" value={f.data} max={oggiISO()} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
      </div>

      <div className="fattura-conti">
        <span>Imponibile <strong>{euro(imponibile)}</strong></span>
        <span>IVA {al ? `${Number(al.percentuale)}%` : ''} <strong>{euro(base.importo_cent - imponibile)}</strong></span>
        <span>Totale <strong>{euro(base.importo_cent)}</strong></span>
      </div>
      <p className="piccolo muto" style={{ margin: 0 }}>L&apos;importo incassato è IVA compresa: l&apos;IVA si scorpora. Ai privati senza partita IVA va il codice 0000000.</p>
      <div><button className="btn btn-primario" disabled={invio || !base.scuola_pronta}>{invio ? 'Emetto…' : 'Emetti la fattura'}</button></div>
    </form>
  );
}
