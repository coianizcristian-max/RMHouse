import { supabaseAdmin } from '@/lib/supabase/admin';
import { pdfRicevuta, nomeFilePdf } from '@/lib/pdfRicevuta';

export const dynamic = 'force-dynamic';

// Il PDF della ricevuta per il cliente, dal link che ha ricevuto (solo chi ha il link)
export async function GET(request, { params }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32,64}$/.test(token || '')) return new Response('Non trovata', { status: 404 });
  const { data: r } = await supabaseAdmin().rpc('ricevuta_pubblica', { p_token: token });
  if (!r) return new Response('Non trovata', { status: 404 });
  const base = new URL(request.url).origin;
  const byte = await pdfRicevuta({ r, pal: r.palestra, logo: r.palestra?.logo_url || '/logo.png', base });
  return new Response(byte, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nomeFilePdf(r)}"`, 'Cache-Control': 'no-store' },
  });
}
