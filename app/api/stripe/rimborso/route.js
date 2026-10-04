import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo, stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

const ERRORI_NOTA = { importo_non_valido: 'importo oltre il documento', motivo_mancante: 'motivo mancante', ricevuta_annullata: 'documento annullato' };

// La segreteria restituisce (tutto o in parte) un pagamento fatto con carta, senza entrare in Stripe.
// Se si vuole, emette subito anche la nota di credito sul documento dell'incasso.
export async function POST(request) {
  if (!stripeAttivo()) return NextResponse.json({ errore: 'I pagamenti online non sono attivi.' }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 });
  const { data: staff } = await supabase.from('staff').select('nome, cognome, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return NextResponse.json({ errore: 'Servono i permessi di segreteria.' }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const motivo = String(b.motivo || '').trim().slice(0, 300);
  const importo = Math.round(Number(b.importo_cent));
  if (!motivo) return NextResponse.json({ errore: 'Scrivi il motivo del rimborso.' }, { status: 400 });

  const { data: p } = await supabase.from('pagamenti')
    .select('id, palestra_id, importo_cent, rimborsato_cent, stato, metodo, stripe_payment_intent, descrizione')
    .eq('id', b.pagamento_id).maybeSingle();
  if (!p) return NextResponse.json({ errore: 'Incasso non trovato.' }, { status: 404 });
  if (!p.stripe_payment_intent) return NextResponse.json({ errore: 'Questo incasso non è stato pagato con carta online: il rimborso si fa a mano.' }, { status: 400 });
  if (p.stato !== 'pagato') return NextResponse.json({ errore: 'L\'incasso è già stato rimborsato.' }, { status: 400 });
  const residuo = p.importo_cent - (p.rimborsato_cent || 0);
  if (!Number.isFinite(importo) || importo <= 0 || importo > residuo) {
    return NextResponse.json({ errore: `L'importo deve essere tra 0,01 € e ${(residuo / 100).toFixed(2).replace('.', ',')} €.` }, { status: 400 });
  }

  // 1. i soldi tornano sulla carta
  let rimborso;
  try {
    rimborso = await stripe('POST', 'refunds', {
      payment_intent: p.stripe_payment_intent, amount: importo, reason: 'requested_by_customer',
      metadata: { pagamento_id: p.id, motivo, fatto_da: `${staff.nome} ${staff.cognome || ''}`.trim() },
    });
  } catch (e) {
    return NextResponse.json({ errore: `Stripe non ha accettato il rimborso: ${e.message}` }, { status: 502 });
  }

  // 2. la nota di credito (se richiesta e se c'è il documento)
  let nota = null; let avviso = null;
  if (b.nota_credito) {
    const { data: doc } = await supabase.from('ricevute').select('id').eq('pagamento_id', p.id)
      .in('tipo_documento', ['ricevuta', 'fattura']).eq('annullata', false).order('created_at').limit(1).maybeSingle();
    if (doc) {
      const { data, error } = await supabase.rpc('emetti_nota_credito', { p_ricevuta: doc.id, p_importo_cent: importo, p_motivo: motivo });
      if (error) avviso = `Rimborso fatto, ma la nota di credito non è stata emessa (${ERRORI_NOTA[Object.keys(ERRORI_NOTA).find((k) => error.message?.includes(k))] || 'errore'}): emettila da Ricevute e fatture.`;
      else nota = data;
    } else avviso = 'Rimborso fatto. Questo incasso non aveva una ricevuta: nessuna nota di credito da emettere.';
  }

  // 3. l'incasso si aggiorna subito (il messaggio di Stripe che arriva dopo non duplica nulla)
  const { error: e3 } = await supabaseAdmin().rpc('segna_rimborso_online', {
    p_intent: p.stripe_payment_intent, p_rimborsato_cent: (p.rimborsato_cent || 0) + importo,
  });
  if (e3) console.error('segna_rimborso_online', e3.message);

  return NextResponse.json({ ok: true, rimborso: rimborso.id, stato: rimborso.status, nota, avviso });
}
