'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { scorporo, testoAliquota } from '@/lib/iva';
import { euro } from '@/lib/formato';

// La tendina dell'IVA (le aliquote della scuola, da Commercialista → Regole). Le aliquote si leggono una volta per pagina.
// value = id dell'aliquota, '' = automatica (quella del corso / dell'abbonamento / predefinita, spiegata in `auto`).
// esempioCent: un prezzo (IVA compresa) con cui far vedere lo scorporo: "15,00 € = 12,30 + IVA 2,70".
let memoria = null;   // Promise delle aliquote attive
export function aliquoteAttive(palestraId) {
  if (!memoria) {
    memoria = supabaseBrowser().from('aliquote_iva').select('id, nome, percentuale, natura, predefinita').eq('palestra_id', palestraId).eq('attiva', true).order('ordine')
      .then(({ data }) => data || []);
  }
  return memoria;
}

export default function SceltaIva({ palestraId, value = '', onChange, id = 'iva', etichetta = 'IVA', auto = 'automatica', aliquote: date = null, esempioCent = null, piccolo = false }) {
  const [aliquote, setAliquote] = useState(date || []);
  useEffect(() => {
    if (date) { setAliquote(date); return; }
    let vivo = true;
    aliquoteAttive(palestraId).then((a) => { if (vivo) setAliquote(a); });
    return () => { vivo = false; };
  }, [palestraId, date]);
  const scelta = aliquote.find((a) => a.id === value) || null;
  const predefinita = aliquote.find((a) => a.predefinita) || null;
  const perEsempio = scelta || (auto === 'predefinita' ? predefinita : null);
  const es = esempioCent > 0 && perEsempio ? scorporo(esempioCent, perEsempio.percentuale) : null;
  return (
    <div className={`campo${piccolo ? ' campo-piccolo' : ''}`}>
      <label htmlFor={id}>{etichetta}</label>
      <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— {auto}{!scelta && auto === 'predefinita' && predefinita ? ` (${testoAliquota(predefinita)})` : ''} —</option>
        {aliquote.map((a) => <option key={a.id} value={a.id}>{testoAliquota(a)}{a.predefinita ? ' (predefinita)' : ''}</option>)}
      </select>
      {es && es.percentuale > 0 && (
        <span className="piccolo muto">Il prezzo è IVA compresa: {euro(esempioCent)} = {euro(es.imponibile)} + IVA {euro(es.iva)}</span>
      )}
      {es && es.percentuale === 0 && <span className="piccolo muto">Prezzo senza IVA ({testoAliquota(perEsempio)}).</span>}
    </div>
  );
}
