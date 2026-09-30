'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Cerca un cliente e apri la scheda, oppure scegli per chi fare una nuova iscrizione
export default function CercaVeloce({ palestraId }) {
  const router = useRouter();
  const [testo, setTesto] = useState('');
  const [trovati, setTrovati] = useState([]);
  const [modo, setModo] = useState('scheda');   // scheda | iscrivi
  const [attivo, setAttivo] = useState(-1);
  const campo = useRef(null);

  useEffect(() => {
    const t = testo.trim().toLowerCase();
    if (t.length < 2) { setTrovati([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabaseBrowser().from('v_persone')
        .select('id, nome, cognome, data_nascita, telefono, iscrizioni_attive, titolare_nome, titolare_cognome, is_titolare')
        .eq('palestra_id', palestraId).ilike('ricerca', `%${t}%`).order('cognome').limit(8);
      setTrovati(data || []); setAttivo(-1);
    }, 200);
    return () => clearTimeout(timer);
  }, [testo, palestraId]);

  const vai = (p) => router.push(`/gestione/persone/${p.id}${modo === 'iscrivi' ? '?iscrivi=1' : ''}`);

  return (
    <div className="cerca-veloce">
      <div className="cv-riga">
        <input ref={campo} value={testo} onChange={(e) => setTesto(e.target.value)} type="search" autoComplete="off"
               placeholder={modo === 'iscrivi' ? 'Chi iscrivi? Scrivi nome o cognome' : 'Cerca un cliente: nome, cognome, email, telefono'}
               aria-label="Cerca un cliente"
               onKeyDown={(e) => {
                 if (e.key === 'ArrowDown') { e.preventDefault(); setAttivo((a) => Math.min(a + 1, trovati.length - 1)); }
                 if (e.key === 'ArrowUp') { e.preventDefault(); setAttivo((a) => Math.max(a - 1, 0)); }
                 if (e.key === 'Enter' && trovati.length) { e.preventDefault(); vai(trovati[Math.max(attivo, 0)]); }
               }} />
        <button type="button" className={`btn${modo === 'iscrivi' ? ' btn-primario' : ''}`}
                onClick={() => { setModo(modo === 'iscrivi' ? 'scheda' : 'iscrivi'); campo.current?.focus(); }}>
          {modo === 'iscrivi' ? 'Nuova iscrizione: scegli la persona' : 'Nuova iscrizione'}
        </button>
      </div>
      {trovati.length > 0 && (
        <ul className="cv-risultati" role="listbox">
          {trovati.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === attivo}>
              <button type="button" onClick={() => vai(p)} className={i === attivo ? 'attivo' : ''}>
                <strong>{p.cognome} {p.nome}</strong>
                <span className="piccolo muto">
                  {[p.iscrizioni_attive ? `${p.iscrizioni_attive} iscrizioni in corso` : 'nessuna iscrizione in corso',
                    !p.is_titolare && p.titolare_nome ? `paga ${p.titolare_nome} ${p.titolare_cognome || ''}` : null, p.telefono].filter(Boolean).join(' · ')}
                </span>
                <span className="cv-vai">{modo === 'iscrivi' ? 'Iscrivi →' : 'Apri →'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {testo.trim().length >= 2 && trovati.length === 0 && (
        <div className="cv-risultati vuoto-cv piccolo muto">
          Nessuno con questo nome. <a href="/gestione/persone/nuova">Registralo come nuovo cliente</a>
        </div>
      )}
    </div>
  );
}
