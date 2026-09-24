'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Quali corsi dà diritto a frequentare ogni abbonamento. Nessun corso = tutti.
export default function CorsiCoperti({ tipi, corsi, coperti }) {
  const router = useRouter();
  const [tipoId, setTipoId] = useState(tipi[0]?.id || '');
  const [errore, setErrore] = useState('');
  const iniziali = useMemo(() => new Set(coperti.filter((c) => c.tipo_abbonamento_id === tipoId).map((c) => c.corso_id)),
    [coperti, tipoId]);
  const [scelti, setScelti] = useState(iniziali);
  const [perTipo, setPerTipo] = useState(tipoId);
  if (perTipo !== tipoId) { setPerTipo(tipoId); setScelti(iniziali); }

  const famiglie = [...new Set(tipi.map((t) => t.famiglia || 'Altri'))];

  async function cambia(corsoId) {
    setErrore('');
    const db = supabaseBrowser();
    const togli = scelti.has(corsoId);
    const prossimo = new Set(scelti);
    togli ? prossimo.delete(corsoId) : prossimo.add(corsoId);
    setScelti(prossimo);
    const { error } = togli
      ? await db.from('tipi_abbonamento_corsi').delete().eq('tipo_abbonamento_id', tipoId).eq('corso_id', corsoId)
      : await db.from('tipi_abbonamento_corsi').insert({ tipo_abbonamento_id: tipoId, corso_id: corsoId });
    if (error) { setScelti(scelti); setErrore('Modifica non riuscita.'); return; }
    router.refresh();
  }

  return (
    <>
      <p className="muto piccolo">
        Scegli un abbonamento e tocca i corsi che copre. Servono a proporre l'abbonamento giusto quando iscrivi
        qualcuno a un corso. Se non ne tocchi nessuno, l'abbonamento vale per tutti i corsi.
      </p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="campo" style={{ maxWidth: 560 }}>
        <label htmlFor="tipo-coperti">Abbonamento</label>
        <select id="tipo-coperti" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
          {famiglie.map((f) => (
            <optgroup key={f} label={f}>
              {tipi.filter((t) => (t.famiglia || 'Altri') === f).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}{t.codice ? ` · ${t.codice}` : ''}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <p className="piccolo muto">{scelti.size ? `${scelti.size} corsi coperti` : 'Vale per tutti i corsi'}</p>
      <div className="pastiglie">
        {[...corsi].sort((a, b) => (scelti.has(b.id) - scelti.has(a.id)) || a.nome.localeCompare(b.nome)).map((c) => (
          <button key={c.id} type="button" aria-pressed={scelti.has(c.id)} onClick={() => cambia(c.id)}
                  style={{ paddingLeft: 14 }}>{c.nome}</button>
        ))}
      </div>
    </>
  );
}
