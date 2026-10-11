// I testi per chi è iscritto e non ha pagato (righe di pagamenti_da_sistemare, query 162). Senza 'use client':
// servono anche alle pagine fatte sul server.
import { euro } from '@/lib/formato';

// il perché, per il title / il tag accanto al nome
export function motivoPagamento(x) {
  if (!x) return '';
  if (x.da_saldare) return x.totale_cent ? `Non ha pagato: ${euro(x.totale_cent)} da saldare` : 'Non ha pagato: passi dalla segreteria';
  if (x.senza_incasso) return 'Abbonamento senza incasso registrato: controlla se ha pagato';
  return '';
}
export const testoTag = (x) => (!x ? '' : x.da_saldare ? `da saldare${x.totale_cent ? ` ${euro(x.totale_cent)}` : ''}` : 'incasso non trovato');
