import 'server-only';
import { cache } from 'react';
import { SLUG } from './palestra';
import { impostazioniPalestra } from './staff';

// Da che mese parte la stagione sportiva (Impostazioni → Regole → Quota e stagione). Predefinito: settembre.
// (dalla memoria del server: niente lettura per pagina)
export const meseStagione = cache(async () => {
  const p = await impostazioniPalestra(SLUG);
  return p?.mese_inizio_stagione || 9;
});

// Che periodo si vede di base nel fatturato del Riepilogo, nei Conti e nelle Statistiche
// (Impostazioni → Regole → Quota e stagione): 'stagione' (predefinito) o 'anno' (anno solare).
// Se la colonna non c'è ancora (query 149 non eseguita) vale la stagione.
export const periodoPredefinito = cache(async () => {
  const p = await impostazioniPalestra(SLUG);
  return p?.periodo_conti === 'anno' ? 'anno' : 'stagione';
});
