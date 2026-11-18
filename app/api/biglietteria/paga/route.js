import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo } from '@/lib/stripe';
import { checkoutBiglietti } from '@/lib/biglietteriaStripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const b = await request.json().catch(() => null);
  if (!b || !/^[0-9a-f-]{36}$/i.test(b.token || '')) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 });
  if (!stripeAttivo()) return NextResponse.json({ errore: 'Il pagamento con carta non è disponibile.' }, { status: 400 });
  try {
    const url = await checkoutBiglietti(supabaseAdmin(), b.token, request);
    if (!url) return NextResponse.json({ errore: 'Questa prenotazione non è da pagare con carta.' }, { status: 409 });
    return NextResponse.json({ url });
  } catch (e) {
    console.error('Stripe biglietteria', e);
    return NextResponse.json({ errore: 'Il pagamento non si è aperto. Riprova tra poco.' }, { status: 500 });
  }
}
