import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo } from '@/lib/stripe';
import { erroreBiglietteria } from '@/lib/biglietteria';
import { checkoutBiglietti } from '@/lib/biglietteriaStripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const testo = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const intero = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

// Prenotazione dalla pagina pubblica della biglietteria
export async function POST(request) {
  const b = await request.json().catch(() => null);
  if (!b || !/^[0-9a-f-]{36}$/i.test(b.spettacolo_id || '')) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 });
  if (b.privacy !== true) return NextResponse.json({ errore: 'Per prenotare serve il consenso al trattamento dei dati.' }, { status: 400 });
  const db = supabaseAdmin();
  const { data: r, error } = await db.rpc('biglietteria_prenota', { p: {
    spettacolo_id: b.spettacolo_id,
    allievo_id: /^[0-9a-f-]{36}$/i.test(b.allievo_id || '') ? b.allievo_id : null,
    posti: intero(b.posti, 0, 100), pizze: intero(b.pizze, 0, 50), offerta_cent: intero(b.offerta_cent, 0, 100000),
    nascita: /^\d{4}-\d{2}-\d{2}$/.test(b.nascita || '') ? b.nascita : null,
    partecipanti: Array.isArray(b.partecipanti) ? b.partecipanti.slice(0, 100).map((x) => ({ nome: testo(x?.nome, 60), cognome: testo(x?.cognome, 60) })) : [],
    nome: testo(b.nome), cognome: testo(b.cognome), email: testo(b.email, 200), telefono: testo(b.telefono, 30), note: testo(b.note, 300),
  } });
  if (error) {
    const msg = erroreBiglietteria(error.message);
    if (!msg) console.error('Prenotazione biglietteria', error);
    return NextResponse.json({ errore: msg || 'Prenotazione non riuscita. Riprova tra poco.' }, { status: msg ? 409 : 500 });
  }
  if (r?.errore) return NextResponse.json({ errore: erroreBiglietteria(r.errore) || 'Dati non corretti.' }, { status: 409 });
  // con la carta: si apre subito la pagina di pagamento di Stripe (se non riesce resta la prenotazione da pagare)
  if (b.carta === true && r.stato === 'da_pagare' && stripeAttivo()) {
    try {
      const url = await checkoutBiglietti(db, r.token, request);
      if (url) return NextResponse.json({ ...r, url });
    } catch (e) { console.error('Stripe biglietteria', e); }
  }
  return NextResponse.json(r);
}
