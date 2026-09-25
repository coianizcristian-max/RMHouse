'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Salvataggio delle impostazioni della palestra, con conferma breve
export function useSalva(palestraId) {
  const router = useRouter();
  const [stato, setStato] = useState('');
  async function salva(dati) {
    setStato('salvo');
    const { error } = await supabaseBrowser().from('palestre').update(dati).eq('id', palestraId);
    if (error) { setStato('errore'); return false; }
    setStato('fatto'); setTimeout(() => setStato(''), 2500);
    router.refresh();
    return true;
  }
  return { salva, stato };
}

export function BottoneSalva({ stato, testo = 'Salva' }) {
  return (
    <div className="azioni" style={{ alignItems: 'center', marginTop: 8 }}>
      <button className="btn btn-primario" disabled={stato === 'salvo'}>{stato === 'salvo' ? 'Salvo…' : stato === 'fatto' ? 'Salvato ✓' : testo}</button>
      {stato === 'errore' && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>Salvataggio non riuscito.</span>}
    </div>
  );
}
