import { supabaseServer } from '@/lib/supabase/server';
import { pdfDichiarazioni } from '@/lib/pdfDichiarazione';
import { nomeFileDichiarazione } from '@/lib/dichiarazione730';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/;
const ESEMPIO = { nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA12A01L840X', comune: 'Vicenza', indirizzo: 'Via Roma 1',
  attivita: 'Hip Hop Kids', dal: '2026-10-01', al: '2026-12-31', importo_cent: 22000, metodi: ['bonifico'],
  pagante: 'Anna Bianchi', pagante_cf: 'BNCNNA80A41L840Y', principale: true };

// Dichiarazioni per il 730 (segreteria):
//   ?ricevute=<id>,<id>  → una pagina per ricevuta
//   ?anno=2026[&allievo=<id>] → una pagina per ragazzo (5–18 anni) con il totale dell'anno
//   ?esempio=1 → una pagina di prova con dati finti, per vedere come viene
export async function GET(request) {
  const u = new URL(request.url);
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Non autorizzato', { status: 401 });
  const { data: staff } = await supabase.from('staff').select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return new Response('Servono i permessi di segreteria', { status: 403 });

  const ricevute = (u.searchParams.get('ricevute') || '').split(',').filter((x) => UUID.test(x)).slice(0, 500);
  const anno = parseInt(u.searchParams.get('anno'), 10);
  const allievo = UUID.test(u.searchParams.get('allievo') || '') ? u.searchParams.get('allievo') : null;
  const esempio = u.searchParams.get('esempio') === '1';
  if (!ricevute.length && !(anno > 2000 && anno < 2100) && !esempio) return new Response('Manca cosa stampare', { status: 400 });

  const [{ data: righe, error }, { data: pal }, { data: sedi }, { data: file }] = await Promise.all([
    esempio ? Promise.resolve({ data: [ESEMPIO] })
      : supabase.rpc('dichiarazioni_730', { p_palestra: staff.palestra_id, p_ricevute: ricevute.length ? ricevute : null, p_anno: ricevute.length ? null : anno, p_allievo: allievo }),
    supabase.from('palestre').select('nome, fatturazione, ente, dichiarazione').eq('id', staff.palestra_id).maybeSingle(),
    supabase.from('sedi').select('logo_url, principale, ordine').eq('palestra_id', staff.palestra_id).not('logo_url', 'is', null)
      .order('principale', { ascending: false }).order('ordine').limit(1),
    supabase.from('palestra_file').select('dati').eq('palestra_id', staff.palestra_id).eq('chiave', 'timbro_firma').maybeSingle(),
  ]);
  if (error) return new Response(error.message?.includes('dichiarazioni_730') ? 'Manca la query 158 in Supabase.' : 'Errore', { status: 500 });
  if (!righe?.length) return new Response('Nessuna dichiarazione da fare (servono ricevute non annullate, o ragazzi dai 5 ai 18 anni con versamenti nell\'anno).', { status: 404 });

  // il logo della scuola (come sulle ricevute)
  let logo = null;
  try {
    const url = sedi?.[0]?.logo_url || '/logo.png';
    const res = await fetch(url.startsWith('http') ? url : `${u.origin}${url}`, { cache: 'no-store' });
    if (res.ok) logo = new Uint8Array(await res.arrayBuffer());
  } catch { /* senza logo */ }
  const timbro = file?.dati ? Uint8Array.from(Buffer.from(file.dati, 'base64')) : null;
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  const byte = await pdfDichiarazioni({ righe, imp: pal?.dichiarazione || {}, pal: pal || {}, logo, timbro, oggi });
  const nome = esempio ? 'dichiarazione-730-esempio.pdf' : nomeFileDichiarazione(righe, ricevute.length ? null : anno);
  return new Response(byte, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${u.searchParams.get('vedi') ? 'inline' : 'attachment'}; filename="${nome}"`, 'Cache-Control': 'no-store' },
  });
}
