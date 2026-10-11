'use client';
// Chi è iscritto e non ha pagato: nome in rosso in tutto il gestionale (query 162, pagamenti_da_sistemare).
// • da_saldare: incassi non pagati / in attesa, rate scadute;
// • senza_incasso: abbonamento attivo senza nessun incasso collegato (solo segreteria e amministrazione).
// Una sola lettura per pagina: i componenti che la chiedono insieme si dividono la stessa risposta (20 secondi).
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

let memoria = null; // { quando, promessa }

export function leggiDaSistemare({ forza = false } = {}) {
  if (!forza && memoria && Date.now() - memoria.quando < 20000) return memoria.promessa;
  const promessa = supabaseBrowser().rpc('pagamenti_da_sistemare').then(({ data, error }) =>
    (error || !Array.isArray(data) ? new Map() : new Map(data.map((x) => [x.allievo_id, x]))));
  memoria = { quando: Date.now(), promessa };
  return promessa;
}

// dopo un incasso: la prossima lettura è fresca
export function dimenticaDaSistemare() { memoria = null; }

// attivo = false: non legge (es. finestra chiusa); chiave: quando cambia si rilegge (es. dopo un incasso)
export function useDaSistemare(attivo = true, chiave = null) {
  const [mappa, setMappa] = useState(() => new Map());
  useEffect(() => {
    if (!attivo) return undefined;
    let vivo = true;
    leggiDaSistemare().then((m) => { if (vivo) setMappa(m); });
    return () => { vivo = false; };
  }, [attivo, chiave]);
  return mappa;
}

export { motivoPagamento, testoTag } from '@/lib/daSistemareTesti';
