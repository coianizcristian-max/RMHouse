import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo } from '@/lib/stripe';
import { erroreBiglietteria } from '@/lib/biglietteria';
import { checkoutBiglietti } from '@/lib/biglietteriaStripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const testo = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const intero = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const UUID = /^[0-9a-f-]{36}$/i;
const riga = (x = {}) => ({
  spettacolo_id: UUID.test(x.spettacolo_id || '') ? x.spettacolo_id : null,
  allievo_id: UUID.test(x.allievo_id || '') ? x.allievo_id : null,
  nascita: /^\d{4}-\d{2}-\d{2}$/.test(x.nascita || '') ? x.nascita : null,
  posti: intero(x.posti, 0, 100),
  extra: Array.isArray(x.extra) ? x.extra.slice(0, 20).map((o) => ({ id: testo(o?.id, 40), quantita: intero(o?.quantita, 0, 50) })).filter((o) => o.id && o.quantita > 0) : [],
  offerta_cent: intero(x.offerta_cent, 0, 100000),
  partecipanti: Array.isArray(x.partecipanti) ? x.partecipanti.slice(0, 100).map((y) => ({ nome: testo(y?.nome, 60), cognome: testo(y?.cognome, 60) })) : [],
});

// Prenotazione dalla pagina pubblica: uno o più eventi insieme, un solo pagamento (query 173)
export async function POST(request) {
  const b = await request.json().catch(() => null);
  const righe = Array.isArray(b?.righe) ? b.righe.slice(0, 10).map(riga) : b?.spettacolo_id ? [riga(b)] : [];
  if (!righe.length || righe.some((r) => !r.spettacolo_id)) return NextResponse.json({ errore: 'Scegli almeno un evento.' }, { status: 400 });
  if (b.privacy !== true) return NextResponse.json({ errore: 'Per prenotare serve il consenso al trattamento dei dati.' }, { status: 400 });
  const db = supabaseAdmin();
  const { data: r, error } = await db.rpc('biglietteria_prenota_tutto', { p: {
    nome: testo(b.nome), cognome: testo(b.cognome), email: testo(b.email, 200), telefono: testo(b.telefono, 30), note: testo(b.note, 300), righe,
  } });
  if (error) {
    const msg = erroreBiglietteria(error.message);
    if (!msg) console.error('Prenotazione biglietteria', error);
    return NextResponse.json({ errore: msg || 'Prenotazione non riuscita. Riprova tra poco.' }, { status: msg ? 409 : 500 });
  }
  // con la carta: si apre subito la pagina di pagamento di Stripe (se non riesce resta la prenotazione da pagare)
  if (b.carta === true && r.stato === 'da_pagare' && stripeAttivo()) {
    try {
      const url = await checkoutBiglietti(db, r.token, request);
      if (url) return NextResponse.json({ ...r, url });
    } catch (e) { console.error('Stripe biglietteria', e); }
  }
  // da pagare: la scadenza (giorni lavorativi, query 175) e il promemoria di pagamento per email (passa dalla coda)
  if (r.stato === 'da_pagare') {
    const [{ data: q }] = await Promise.all([
      db.from('biglietteria_prenotazioni').select('scade_at').or(`id.eq.${r.id},gruppo_id.eq.${r.id}`).eq('stato', 'da_pagare')
        .order('scade_at', { ascending: true, nullsFirst: false }).limit(1).maybeSingle(),
      db.rpc('biglietteria_promemoria', { p_prenotazione: r.id }).then((x) => { if (x.error) console.error('Promemoria biglietteria', x.error); }),
    ]);
    return NextResponse.json({ ...r, scade_at: q?.scade_at || null });
  }
  return NextResponse.json(r);
}
