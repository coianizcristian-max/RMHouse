import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { completaAcquistoSatispay } from '@/lib/satispayAcquisti';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Il cliente torna da Satispay: si controlla subito com'è andato il suo acquisto
// (così non si dipende solo dall'avviso di Satispay)
export async function GET(request) {
  const a = new URL(request.url).searchParams.get('a');
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !a) return NextResponse.json({ errore: 'non autorizzato' }, { status: 401 });
  const db = supabaseAdmin();
  const { data: ao } = await db.from('acquisti_online').select('id, satispay_id, account_id, account ( user_id )').eq('id', a).maybeSingle();
  if (!ao || ao.account?.user_id !== user.id || !ao.satispay_id) return NextResponse.json({ errore: 'non trovato' }, { status: 404 });
  try {
    const esito = await completaAcquistoSatispay(db, ao.satispay_id);
    return NextResponse.json({ stato: esito.stato, sessione: `satispay:${ao.satispay_id}` });
  } catch (e) {
    console.error('Satispay verifica', e);
    return NextResponse.json({ stato: 'in_attesa', sessione: `satispay:${ao.satispay_id}` });
  }
}
