import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { completaAcquistoSatispay } from '@/lib/satispayAcquisti';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Satispay avvisa qui quando un pagamento cambia stato (callback_url con l'id del pagamento).
// L'avviso non dice "pagato": per sicurezza si rilegge sempre il pagamento da Satispay.
async function gestisci(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[\w-]{6,80}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const esito = await completaAcquistoSatispay(supabaseAdmin(), id);
    return NextResponse.json({ ok: true, stato: esito.stato });
  } catch (e) {
    console.error('Satispay notifica', id, e);
    return NextResponse.json({ ok: false }, { status: 500 });   // Satispay riprova
  }
}
export const GET = gestisci;
export const POST = gestisci;
