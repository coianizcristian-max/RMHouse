'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

// Scheda persona → accesso all'app: attivo o no, e il codice per entrare / rifare la password
export default function AccessoApp({ allievoId, sito = '' }) {
  const [s, setS] = useState(null);
  const [codice, setCodice] = useState(null);
  const [errore, setErrore] = useState('');
  useEffect(() => { supabaseBrowser().rpc('accesso_app', { p_allievo: allievoId }).then(({ data }) => setS(data)); }, [allievoId]);

  async function nuovo() {
    setErrore('');
    const { data, error } = await supabaseBrowser().rpc('crea_codice_accesso', { p_allievo: allievoId });
    if (error) { setErrore(error.message?.includes('email_mancante') ? 'Prima scrivi l\'email nei dati.' : 'Non riuscito.'); return; }
    setCodice(data);
  }
  if (!s) return null;
  const link = `${sito || window.location.origin}/area/accedi?email=${encodeURIComponent(s.email || '')}`;
  const testo = codice && `Ciao ${codice.nome || ''}! Per entrare nell'app di Ritmo Metropolitano apri ${link} , tocca Avanti e, se te lo chiede, usa il codice ${codice.codice} (vale 3 giorni). Poi scegli la tua password.`;
  const tel = (codice?.telefono || '').replace(/\D/g, '');

  return (
    <span className="accesso-app">
      {s.attivo
        ? <span className="tag tag-ok">app attiva{s.ultimo_accesso ? ` · ultimo accesso ${dataBreve(s.ultimo_accesso)}` : ''}{s.telefoni_notifiche ? ` · notifiche su ${s.telefoni_notifiche} tel.` : ''}</span>
        : <span className="tag tag-attenzione">app non ancora attivata</span>}
      {' '}<button type="button" className="link-btn piccolo" onClick={nuovo}>{s.attivo ? 'codice per rifare la password' : 'codice per entrare'}</button>
      {codice && (
        <span className="accesso-codice">
          <strong>{codice.codice}</strong> <span className="piccolo muto">vale 3 giorni, una volta sola</span>
          {' '}<button type="button" className="link-btn piccolo" onClick={() => navigator.clipboard?.writeText(testo)}>copia il messaggio</button>
          {tel && <>{' '}<a className="link-btn piccolo" href={`https://wa.me/${tel.startsWith('39') ? tel : `39${tel}`}?text=${encodeURIComponent(testo)}`} target="_blank" rel="noreferrer">manda su WhatsApp</a></>}
        </span>
      )}
      {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}> {errore}</span>}
    </span>
  );
}
