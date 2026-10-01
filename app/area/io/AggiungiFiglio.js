'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const ERRORI = {
  nome_cognome: 'Scrivi nome e cognome.',
  data_nascita: 'Controlla la data di nascita.',
  codice_fiscale_non_valido: 'Il codice fiscale ha 16 caratteri: controllalo (o lascialo vuoto).',
  gia_presente: 'È già nella tua famiglia.',
};

// Il genitore aggiunge un figlio: stesso accesso, gestisce i suoi abbonamenti e le sue lezioni
export default function AggiungiFiglio({ cognome = '' }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [f, setF] = useState({ nome: '', cognome, nascita: '', cf: '', sesso: '' });
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function salva(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('aggiungi_figlio', { p_nome: f.nome, p_cognome: f.cognome, p_nascita: f.nascita || null, p_cf: f.cf || null, p_sesso: f.sesso || null });
    setInvio(false);
    if (error) { const k = Object.keys(ERRORI).find((x) => error.message?.includes(x)); setErrore(ERRORI[k] || 'Non riuscito. Riprova.'); return; }
    const n = f.nome.trim(); setFatto(`${n.charAt(0).toUpperCase() + n.slice(1)} è nella tua famiglia ✓ Ora puoi scegliergli l'abbonamento e firmare i suoi moduli.`);
    setAperto(false); setF({ nome: '', cognome, nascita: '', cf: '', sesso: '' });
    router.refresh();
  }

  if (!aperto) return (
    <>
      {fatto && <div className="avviso-ok" role="status">{fatto}</div>}
      <button type="button" className="btn io-aggiungi" onClick={() => { setAperto(true); setFatto(''); }}>+ Aggiungi un figlio</button>
    </>
  );
  return (
    <form className="io-dati" onSubmit={salva}>
      <label className="io-metà"><span>Nome</span><input value={f.nome} onChange={set('nome')} autoFocus /></label>
      <label className="io-metà"><span>Cognome</span><input value={f.cognome} onChange={set('cognome')} /></label>
      <label className="io-metà"><span>Nato il</span><input type="date" value={f.nascita} onChange={set('nascita')} /></label>
      <label className="io-metà"><span>Sesso</span>
        <select value={f.sesso} onChange={set('sesso')}><option value="">—</option><option value="F">Femmina</option><option value="M">Maschio</option></select>
      </label>
      <label><span>Codice fiscale (serve per la tessera ASI)</span><input value={f.cf} onChange={set('cf')} maxLength={16} autoCapitalize="characters" /></label>
      {errore && <span className="errore" role="alert">{errore}</span>}
      <span className="io-dati-azioni">
        <button className="btn btn-primario btn-piccolo" disabled={invio}>{invio ? 'Salvo…' : 'Aggiungi'}</button>
        <button type="button" className="btn btn-piccolo" onClick={() => setAperto(false)}>Annulla</button>
      </span>
    </form>
  );
}
