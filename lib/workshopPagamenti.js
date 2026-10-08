import 'server-only';
import { stripeAttivo, creaCheckout } from './stripe';
import { satispayAttivo, creaPagamentoOnline } from './satispay';

// Apre il pagamento online di un'iscrizione a un workshop (carta con Stripe o Satispay).
// Il pagamento c'è già (in attesa, creato dall'iscrizione): qui si apre solo la cassa.
// Al ritorno: Stripe avvisa il webhook (pagamento_id nei metadati), Satispay la notifica: in entrambi i casi
// il pagamento risulta pagato e il database registra la quota annuale e manda l'email.
export async function apriPagamentoWorkshop(db, iscrizioneId, metodo, sito, ritorno) {
  const { data: i } = await db.from('workshop_iscrizioni')
    .select('id, stato, codice, prezzo_cent, quota_cent, pagamento_id, workshop ( id, titolo, slug, online, stato ), workshop_opzioni ( nome ), '
      + 'allievi ( nome, cognome, account ( email, stripe_customer_id ) ), pagamenti ( id, stato, importo_cent )')
    .eq('id', iscrizioneId).maybeSingle();
  if (!i || i.stato !== 'iscritto') return { errore: 'Iscrizione non trovata.', stato: 404 };
  if (!i.pagamenti || i.pagamenti.stato === 'pagato') return { errore: 'Risulta già pagato.', stato: 409 };
  if (i.pagamenti.stato !== 'in_attesa') return { errore: 'Questo pagamento non è più aperto: chiedi in segreteria.', stato: 409 };
  if (!i.workshop?.online || i.workshop.stato === 'annullato') return { errore: 'Per questo workshop il pagamento online non c\'è: si paga in segreteria.', stato: 400 };

  const nome = `${i.allievi?.nome || ''} ${i.allievi?.cognome || ''}`.trim();
  const descrizione = `Workshop ${i.workshop.titolo} · ${i.workshop_opzioni?.nome || ''} · ${nome}`;
  const importo = i.pagamenti.importo_cent;
  const righe = i.quota_cent > 0 && i.prezzo_cent + i.quota_cent === importo
    ? [{ descrizione, importo_cent: i.prezzo_cent }, { descrizione: `Quota associativa annuale · ${nome}`, importo_cent: i.quota_cent }]
    : [{ descrizione, importo_cent: importo }];

  if (metodo === 'satispay') {
    if (!(await satispayAttivo())) return { errore: 'Satispay non è attivo: paga con la carta o in segreteria.', stato: 503 };
    const p = await creaPagamentoOnline({
      importoCent: importo, riferimento: i.id, descrizione: descrizione.slice(0, 120),
      callback: `${sito}/api/satispay/notifica?id={uuid}`, ritorno: `${ritorno}${ritorno.includes('?') ? '&' : '?'}sp=1`,
    });
    await db.from('pagamenti').update({ satispay_id: p.id, metodo: 'satispay' }).eq('id', i.pagamento_id);
    return { url: p.url };
  }
  if (!stripeAttivo()) return { errore: 'Il pagamento con carta non è attivo: paga in segreteria.', stato: 503 };
  const s = await creaCheckout({
    righe, email: i.allievi?.account?.email || undefined, cliente: i.allievi?.account?.stripe_customer_id || undefined,
    metadata: { tipo: 'workshop', pagamento_id: i.pagamento_id, riferimento: i.id },
    successo: `${ritorno}${ritorno.includes('?') ? '&' : '?'}pagato=1`, annullato: ritorno, scadenzaMinuti: 45,
  });
  await db.from('pagamenti').update({ stripe_session_id: s.id, metodo: 'online' }).eq('id', i.pagamento_id);
  return { url: s.url };
}
