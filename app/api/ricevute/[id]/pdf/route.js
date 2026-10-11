import { supabaseServer } from '@/lib/supabase/server';
import { pdfRicevuta, nomeFilePdf } from '@/lib/pdfRicevuta';

export const dynamic = 'force-dynamic';

// Scarica il PDF di una ricevuta / fattura / nota di credito (segreteria)
export async function GET(request, { params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return new Response('Non trovata', { status: 404 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Non autorizzato', { status: 401 });
  const { data: staff } = await supabase.from('staff').select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return new Response('Servono i permessi di segreteria', { status: 403 });
  const [{ data: r }, { data: pal }, { data: sedi }] = await Promise.all([
    supabase.from('ricevute').select('*, numerazioni ( codice ), aliquote_iva ( riferimento, percentuale ), rif:riferimento_id ( numero, anno, data, tipo_documento, numerazioni ( codice ) )')
      .eq('id', id).eq('palestra_id', staff.palestra_id).maybeSingle(),
    supabase.from('palestre').select('nome, indirizzo, telefono, email, dicitura_ricevuta, dati_fiscali, fatturazione').eq('id', staff.palestra_id).maybeSingle(),
    supabase.from('sedi').select('logo_url, principale, ordine').eq('palestra_id', staff.palestra_id).not('logo_url', 'is', null)
      .order('principale', { ascending: false }).order('ordine').limit(1),
  ]);
  if (!r) return new Response('Non trovata', { status: 404 });
  const base = new URL(request.url).origin;
  const byte = await pdfRicevuta({ r, pal, logo: sedi?.[0]?.logo_url || '/logo.png', base });
  return new Response(byte, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nomeFilePdf(r)}"`, 'Cache-Control': 'no-store' },
  });
}
