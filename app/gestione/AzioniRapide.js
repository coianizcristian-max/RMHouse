'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Pulsante sempre presente: le cose che si fanno più spesso, senza cercare la pagina
export default function AzioniRapide({ palestraId }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [avviso, setAvviso] = useState('');

  async function notaOggi() {
    const testo = prompt('Nota di oggi (la vede tutto lo staff):');
    if (!testo?.trim()) return;
    const { error } = await supabaseBrowser().from('note_giorno').insert({
      palestra_id: palestraId, data: new Date().toLocaleDateString('sv-SE'), testo: testo.trim(),
    });
    setApri(false);
    setAvviso(error ? 'Nota non salvata.' : 'Nota aggiunta a oggi.');
    setTimeout(() => setAvviso(''), 3000);
    router.refresh();
  }

  const voci = [
    ['Iscrivi una persona', '/gestione/persone'],
    ['Nuovo corso', '/gestione/corsi/nuovo'],
    ['Scrivi un avviso', '/gestione/bacheca'],
    ['Nuovo evento', '/gestione/eventi'],
    ['Blocca una sala', '/gestione/spazi'],
  ];

  return (
    <>
      {avviso && <div className="avviso-volante">{avviso}</div>}

      {apri && (
        <div className="fondo-rapide" onClick={() => setApri(false)}>
          <div className="menu-rapide" onClick={(e) => e.stopPropagation()}>
            <div className="piccolo muto" style={{ padding: '0 4px 8px' }}>Azioni rapide</div>
            <button className="voce-rapida" onClick={notaOggi}>Aggiungi una nota a oggi</button>
            {voci.map(([testo, href]) => (
              <Link key={href} className="voce-rapida" href={href} onClick={() => setApri(false)}>{testo}</Link>
            ))}
          </div>
        </div>
      )}

      <button className="bottone-rapide" onClick={() => setApri(!apri)} aria-label="Azioni rapide">
        {apri ? '×' : '+'}
      </button>
    </>
  );
}
