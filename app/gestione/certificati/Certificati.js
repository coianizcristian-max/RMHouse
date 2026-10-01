'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

// Una riga per certificato: chi, quando, il documento, la scadenza e i pulsanti, tutto sulla stessa riga
export default function Certificati({ certificati, stato, oggi }) {
  return (
    <ul className="cert-elenco">
      {certificati.map((c) => <Riga key={c.id} c={c} stato={stato} oggi={oggi} />)}
    </ul>
  );
}

function Riga({ c, stato, oggi }) {
  const router = useRouter();
  const [scadenza, setScadenza] = useState(c.scadenza || '');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState('');

  async function salva(nuovo) {
    if (nuovo === 'valido' && !scadenza) { setErrore('Scrivi la scadenza letta sul certificato.'); return; }
    if (nuovo === 'rifiutato' && !confirm(`Rifiutare il certificato di ${c.allievi.nome}? Dovrà caricarne un altro.`)) return;
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const { data: { user } } = await db.auth.getUser();
    const { data, error } = await db.from('certificati').update({
      scadenza: scadenza || null, stato: nuovo, verificato_da: user?.id, verificato_at: new Date().toISOString(),
    }).eq('id', c.id).select('id');
    setInvio(false);
    if (error || !data?.length) { setErrore('Non salvato. Ricarica la pagina e riprova.'); return; }
    setFatto(nuovo === 'valido' ? 'approvato ✓' : 'rifiutato');
    setTimeout(() => router.refresh(), 700);
  }

  const scaduto = c.scadenza && c.scadenza < oggi;
  return (
    <li className={`cert-riga${fatto ? ' fatta' : ''}`}>
      <span className="cert-chi">
        <Link prefetch={false} href={`/gestione/persone/${c.allievi.id}`}><strong>{c.allievi.cognome} {c.allievi.nome}</strong></Link>
        <span className="piccolo muto">
          caricato il {dataBreve(c.caricato_at)}
          {stato === 'da_verificare' && c.allievi.certificato_scadenza ? ` · quello vecchio scade il ${dataBreve(c.allievi.certificato_scadenza)}` : ''}
        </span>
      </span>
      <a className="btn btn-piccolo cert-apri" href={`/api/certificato/${c.id}`} target="_blank" rel="noopener">Apri</a>

      {stato === 'da_verificare' ? (
        <span className="cert-azioni">
          <input type="date" value={scadenza} onChange={(e) => { setScadenza(e.target.value); setErrore(''); }} aria-label="Scadenza" />
          <button className="btn btn-piccolo btn-primario" disabled={invio || !!fatto} onClick={() => salva('valido')}>Approva</button>
          <button className="btn btn-piccolo" disabled={invio || !!fatto} onClick={() => salva('rifiutato')}>Rifiuta</button>
        </span>
      ) : (
        <span className="cert-azioni">
          {stato === 'valido'
            ? <span className={`tag ${scaduto ? 'tag-rosso' : 'tag-ok'}`}>{scaduto ? 'scaduto il' : 'valido fino al'} {dataBreve(c.scadenza)}</span>
            : <span className="tag tag-neutro">rifiutato{c.verificato_at ? ` il ${dataBreve(c.verificato_at)}` : ''}</span>}
        </span>
      )}
      {fatto && <span className="tag tag-ok cert-fatto">{fatto}</span>}
      {errore && <span className="piccolo cert-errore">{errore}</span>}
    </li>
  );
}
