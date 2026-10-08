import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { completaPagamentoSatispay } from '@/lib/satispayAcquisti';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Di ritorno da Satispay: si controlla subito il pagamento del workshop (senza aspettare l'avviso di Satispay)
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const db = supabaseAdmin();
  let pagamentoId = null;
  const codice = q.get('c');
  if (codice && /^[a-f0-9]{24,40}$/.test(codice)) {
    const { data } = await db.from('workshop_iscrizioni').select('pagamento_id').eq('codice', codice).maybeSingle();
    pagamentoId = data?.pagamento_id;
  } else {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ errore: 'non autorizzato' }, { status: 401 });
    const { data } = await supabase.from('workshop_iscrizioni').select('pagamento_id').eq('id', q.get('i') || '00000000-0000-0000-0000-000000000000').maybeSingle();
    pagamentoId = data?.pagamento_id;
  }
  if (!pagamentoId) return NextResponse.json({ stato: 'sconosciuto' });
  const { data: pg } = await db.from('pagamenti').select('stato, satispay_id').eq('id', pagamentoId).maybeSingle();
  if (!pg) return NextResponse.json({ stato: 'sconosciuto' });
  if (pg.stato !== 'in_attesa' || !pg.satispay_id) return NextResponse.json({ stato: pg.stato });
  try {
    const esito = await completaPagamentoSatispay(db, pg.satispay_id);
    return NextResponse.json({ stato: esito.stato });
  } catch (e) {
    console.error('Verifica Satispay workshop', e);
    return NextResponse.json({ stato: 'in_attesa' });
  }
}
