import 'server-only';
import { baseUrl, creaCheckout } from '@/lib/stripe';

// Pagina di pagamento con carta (Stripe) per una prenotazione da pagare; pagato → il webhook emette i biglietti
export async function checkoutBiglietti(db, token, request) {
  const { data: p } = await db.rpc('biglietteria_biglietti', { p_token: token });
  if (!p || p.stato !== 'da_pagare' || !p.stripe || !p.totale_cent) return null;
  const sito = baseUrl(request);
  const s = await creaCheckout({
    righe: [{ descrizione: `${p.evento} · ${(p.eventi || []).length > 1 ? `${p.eventi.length} eventi` : p.spettacolo} · ${p.posti} ${p.posti === 1 ? 'posto' : 'posti'}${p.pizze ? ` + ${p.pizze} extra` : ''} (${p.codice})`,
               importo_cent: p.totale_cent }],
    metadata: { tipo: 'biglietteria', prenotazione_id: p.id, riferimento: p.codice },
    successo: `${sito}/biglietti/${token}?pagato=1`,
    annullato: `${sito}/biglietti/${token}`,
    scadenzaMinuti: 60,
  });
  return s.url;
}
