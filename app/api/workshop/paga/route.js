import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { baseUrl } from '@/lib/stripe';
import { apriPagamentoWorkshop } from '@/lib/workshopPagamenti';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Pagare online un'iscrizione a un workshop: dall'app (la persona è della famiglia di chi è entrato)
// oppure dal link pubblico (con il codice segreto dell'iscrizione, mandato solo a chi si è iscritto)
export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  const metodo = b.metodo === 'satispay' ? 'satispay' : 'carta';
  const db = supabaseAdmin();
  const sito = baseUrl(request);
  let id = null; let ritorno = null;
  if (typeof b.codice === 'string' && /^[a-f0-9]{24,40}$/.test(b.codice)) {
    const { data } = await db.from('workshop_iscrizioni').select('id, codice, workshop ( slug )').eq('codice', b.codice).maybeSingle();
    if (!data) return NextResponse.json({ errore: 'Iscrizione non trovata.' }, { status: 404 });
    id = data.id; ritorno = `${sito}/workshop/${data.workshop.slug}/iscrizione/${data.codice}`;
  } else {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ errore: 'Accedi prima alla tua area.' }, { status: 401 });
    // si legge con l'accesso del cliente: se la vede, è della sua famiglia
    const { data } = await supabase.from('workshop_iscrizioni').select('id, workshop_id').eq('id', b.iscrizione_id || '00000000-0000-0000-0000-000000000000').maybeSingle();
    if (!data) return NextResponse.json({ errore: 'Iscrizione non trovata.' }, { status: 404 });
    id = data.id; ritorno = `${sito}/area/workshop/${data.workshop_id}`;
  }
  try {
    const r = await apriPagamentoWorkshop(db, id, metodo, sito, ritorno);
    if (r.errore) return NextResponse.json({ errore: r.errore }, { status: r.stato || 400 });
    return NextResponse.json({ url: r.url });
  } catch (e) {
    console.error('Pagamento workshop', e);
    return NextResponse.json({ errore: 'Il pagamento non si è aperto. Riprova tra poco, oppure paga in segreteria: l\'iscrizione resta.' }, { status: 502 });
  }
}
