'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

// Scheda staff → accesso all'app: la segreteria crea un codice e lo manda all'insegnante (WhatsApp o copia)
export default function AccessoStaff({ staffId, attivo, sito = '' }) {
  const [codice, setCodice] = useState(null);
  const [errore, setErrore] = useState('');
  const [copiato, setCopiato] = useState(false);

  async function nuovo() {
    setErrore(''); setCopiato(false);
    const { data, error } = await supabaseBrowser().rpc('crea_codice_staff', { p_staff: staffId });
    if (error) { setErrore(error.message?.includes('email_mancante') ? 'Prima scrivi la sua email nella scheda e salva.' : 'Non riuscito.'); return; }
    setCodice(data);
  }
  const link = `${sito || (typeof window !== 'undefined' ? window.location.origin : '')}/login?primo=1`;
  const testo = codice && [
    `Ciao ${codice.nome || ''}! ${codice.attivo ? 'Ecco il codice per rifare la password' : 'Ecco come entrare'} nell'app di Ritmo Metropolitano (appelli, lezioni, compensi):`,
    link,
    '',
    `1. Scrivi la tua email: ${codice.email}`,
    `2. Scrivi il codice ${codice.codice} (vale 7 giorni, una volta sola)`,
    '3. Scegli la tua password ed entri',
    '',
    'Dal telefono: poi aggiungi la pagina alla schermata Home per averla come app.',
  ].join('\n');
  const tel = (codice?.telefono || '').replace(/\D/g, '');

  return (
    <span className="accesso-app">
      {attivo ? <span className="tag tag-ok">entra nell'app</span> : <span className="tag tag-attenzione">senza accesso</span>}
      {' '}<button type="button" className="link-btn piccolo" onClick={nuovo}>{attivo ? 'codice per rifare la password' : 'crea l\'accesso'}</button>
      {codice && (
        <span className="accesso-codice">
          <strong>{codice.codice}</strong> <span className="piccolo muto">vale fino al {dataBreve(codice.scade)}, una volta sola</span>
          {' '}<button type="button" className="link-btn piccolo" onClick={() => { navigator.clipboard?.writeText(testo); setCopiato(true); }}>{copiato ? 'copiato ✓' : 'copia il messaggio'}</button>
          {tel && <>{' '}<a className="link-btn piccolo" href={`https://wa.me/${tel.startsWith('39') ? tel : `39${tel}`}?text=${encodeURIComponent(testo)}`} target="_blank" rel="noreferrer">manda su WhatsApp</a></>}
        </span>
      )}
      {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}> {errore}</span>}
    </span>
  );
}
