'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Etichette della persona: un tocco aggiunge o toglie, oppure se ne crea una nuova
export default function EtichettePersona({ palestraId, allievoId, tutte, sue }) {
  const router = useRouter();
  const [attive, setAttive] = useState(new Set(sue));
  const [nuova, setNuova] = useState('');
  const [apri, setApri] = useState(false);

  async function cambia(id) {
    const db = supabaseBrowser();
    const togli = attive.has(id);
    const s = new Set(attive); togli ? s.delete(id) : s.add(id); setAttive(s);
    const { error } = togli
      ? await db.from('allievi_etichette').delete().eq('allievo_id', allievoId).eq('etichetta_id', id)
      : await db.from('allievi_etichette').insert({ allievo_id: allievoId, etichetta_id: id, palestra_id: palestraId });
    if (error) setAttive(attive);
    router.refresh();
  }

  async function crea() {
    const nome = nuova.trim();
    if (!nome) return;
    const db = supabaseBrowser();
    const { data, error } = await db.from('etichette').insert({ palestra_id: palestraId, nome }).select('id').single();
    if (error) return;
    await db.from('allievi_etichette').insert({ allievo_id: allievoId, etichetta_id: data.id, palestra_id: palestraId });
    setNuova(''); setAttive(new Set([...attive, data.id]));
    router.refresh();
  }

  const visibili = apri ? tutte : tutte.filter((e) => attive.has(e.id));
  return (
    <div>
      <div className="pastiglie" style={{ marginBottom: 8 }}>
        {visibili.map((e) => (
          <button key={e.id} type="button" aria-pressed={attive.has(e.id)} onClick={() => cambia(e.id)} style={{ paddingLeft: 12 }}>
            # {e.nome}
          </button>
        ))}
        {!apri && (
          <button type="button" onClick={() => setApri(true)} style={{ paddingLeft: 12 }}>
            {visibili.length ? '+ altre' : '+ aggiungi etichetta'}
          </button>
        )}
      </div>
      {apri && (
        <div className="barra-cerca" style={{ marginBottom: 0 }}>
          <input placeholder="Nuova etichetta" value={nuova} onChange={(e) => setNuova(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') crea(); }} />
          <button type="button" className="btn btn-piccolo" onClick={crea} disabled={!nuova.trim()}>Crea</button>
          <button type="button" className="link-btn piccolo" onClick={() => setApri(false)}>Chiudi</button>
        </div>
      )}
    </div>
  );
}
