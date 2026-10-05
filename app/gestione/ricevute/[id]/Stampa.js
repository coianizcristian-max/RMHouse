'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Barra sopra il documento (non finisce nella stampa): stampa/PDF, invio al cliente su WhatsApp o per email, annullo.
// Senza `documento` (es. riepilogo compensi) resta solo stampa e chiudi.
export default function Stampa({ documento = null }) {
  const router = useRouter();
  const [email, setEmail] = useState(null);     // null = chiuso, altrimenti l'indirizzo che si sta scrivendo
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState('');
  const d = documento;
  const link = d ? `${typeof window !== 'undefined' ? window.location.origin : ''}/ricevuta/${d.token}` : '';
  const testoWa = d ? `Ciao${d.nome ? ` ${d.nome}` : ''}, ecco la ${d.tipo.toLowerCase()} n. ${d.numero} del ${d.data} di ${d.importo} (${d.descrizione}). La apri, la stampi o la salvi in PDF da qui: ${link}` : '';
  const tel = d?.telefono ? d.telefono.replace(/\D/g, '').replace(/^0+/, '') : '';
  const waHref = d ? `https://wa.me/${tel ? (tel.startsWith('39') && tel.length > 10 ? tel : `39${tel}`) : ''}?text=${encodeURIComponent(testoWa)}` : '';

  async function inviaEmail(e) {
    e.preventDefault();
    setInvio(true); setEsito('');
    const { data, error } = await supabaseBrowser().rpc('invia_ricevuta_email', { p_id: d.id, p_email: email || null });
    setInvio(false);
    if (error) { setEsito(error.message?.includes('email_mancante') ? 'Manca un indirizzo email valido.' : 'Invio non riuscito.'); return; }
    setEsito(`Email in partenza a ${data} (arriva entro pochi minuti).`); setEmail(null);
  }
  async function annulla() {
    const motivo = prompt('Motivo dell\'annullamento (resta scritto sul documento):');
    if (!motivo || !motivo.trim()) return;
    const { error } = await supabaseBrowser().rpc('annulla_ricevuta', { p_id: d.id, p_motivo: motivo.trim() });
    if (error) { setEsito('Annullamento non riuscito.'); return; }
    router.refresh();
  }
  async function copia() {
    try { await navigator.clipboard.writeText(link); setEsito('Link copiato.'); } catch { setEsito(link); }
  }

  return (
    <div className="senza-stampa" style={{ marginBottom: 18 }}>
      <div className="azioni-riga">
        <button className="btn btn-primario" onClick={() => window.print()}>Stampa o salva in PDF</button>
        {d && !d.annullata && (
          <>
            <a className="btn" href={waHref} target="_blank" rel="noreferrer">Invia su WhatsApp</a>
            <button type="button" className="btn" onClick={() => { setEmail(d.email || ''); setEsito(''); }}>Invia via email</button>
            <button type="button" className="link-btn piccolo" onClick={copia}>copia il link</button>
            {d.gestione && <button type="button" className="link-btn piccolo pericolo" onClick={annulla}>annulla il documento</button>}
          </>
        )}
        <button className="link-btn" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}>Chiudi</button>
      </div>
      {email !== null && (
        <form onSubmit={inviaEmail} className="azioni-riga" style={{ marginTop: 10 }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="indirizzo email" aria-label="Email" style={{ maxWidth: 320 }} required />
          <button className="btn btn-piccolo btn-primario" disabled={invio}>{invio ? 'Invio…' : 'Manda'}</button>
          <button type="button" className="btn btn-piccolo" onClick={() => setEmail(null)}>Annulla</button>
        </form>
      )}
      {esito && <p className="piccolo" style={{ marginTop: 8, color: esito.includes('non') || esito.includes('Manca') ? 'var(--rosso-scuro)' : 'var(--ok)' }}>{esito}</p>}
    </div>
  );
}
