'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Il cliente corregge da solo i suoi dati (servono per tessera ASI e ricevute)
export default function ModificaDati({ d, onChiudi }) {
  const router = useRouter();
  const [f, setF] = useState({
    telefono: d.telefono || '', codice_fiscale: d.codice_fiscale || '', data_nascita: d.data_nascita || '',
    luogo_nascita: d.luogo_nascita || '', sesso: d.sesso || '', indirizzo: d.indirizzo || '',
    cap: d.cap || '', citta: d.citta || '', provincia: d.provincia || '',
  });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function salva(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('aggiorna_miei_dati', { p_allievo: d.id, p_dati: f });
    setInvio(false);
    if (error) { setErrore(error.message?.includes('codice_fiscale') ? 'Il codice fiscale ha 16 caratteri: controllalo.' : 'Non salvato. Riprova.'); return; }
    router.refresh(); onChiudi?.('Dati aggiornati ✓');
  }

  return (
    <form className="io-dati" onSubmit={salva}>
      {d.titolare && <label><span>Telefono</span><input type="tel" inputMode="tel" value={f.telefono} onChange={set('telefono')} /></label>}
      <label><span>Codice fiscale</span><input value={f.codice_fiscale} onChange={set('codice_fiscale')} autoCapitalize="characters" maxLength={16} /></label>
      <label className="io-metà"><span>Data di nascita</span><input type="date" value={f.data_nascita} onChange={set('data_nascita')} /></label>
      <label className="io-metà"><span>Luogo di nascita</span><input value={f.luogo_nascita} onChange={set('luogo_nascita')} placeholder="Comune" /></label>
      <label className="io-metà"><span>Sesso</span>
        <select value={f.sesso} onChange={set('sesso')}><option value="">—</option><option value="F">Femmina</option><option value="M">Maschio</option></select>
      </label>
      <label><span>Indirizzo</span><input value={f.indirizzo} onChange={set('indirizzo')} placeholder="Via e numero" /></label>
      {d.titolare && (
        <>
          <label className="io-terzo"><span>CAP</span><input inputMode="numeric" maxLength={5} value={f.cap} onChange={set('cap')} /></label>
          <label className="io-terzo2"><span>Città</span><input value={f.citta} onChange={set('citta')} /></label>
          <label className="io-terzo"><span>Prov.</span><input maxLength={2} value={f.provincia} onChange={set('provincia')} autoCapitalize="characters" /></label>
        </>
      )}
      {errore && <span className="errore" role="alert">{errore}</span>}
      <span className="io-dati-azioni">
        <button className="btn btn-primario btn-piccolo" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
        <button type="button" className="btn btn-piccolo" onClick={() => onChiudi?.()}>Annulla</button>
      </span>
    </form>
  );
}
