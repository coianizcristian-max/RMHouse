import { supabaseServer } from '@/lib/supabase/server';
import { fatturaXml, nomeFile } from '@/lib/fatturaXml';

export const dynamic = 'force-dynamic';

// Il file XML della fattura elettronica, da caricare su "Fatture e Corrispettivi" (o da dare al commercialista)
export async function GET(_request, { params }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });
  const { data: staff } = await supabase.from('staff')
    .select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return new Response('Servono i permessi di segreteria.', { status: 403 });

  const [{ data: r }, { data: pal }] = await Promise.all([
    supabase.from('ricevute').select('*, numerazioni ( codice ), aliquote_iva ( percentuale, natura, riferimento ), rif:riferimento_id ( numero, anno, data, tipo_documento, numerazioni ( codice ) )')
      .eq('id', id).eq('palestra_id', staff.palestra_id).maybeSingle(),
    supabase.from('palestre').select('fatturazione').eq('id', staff.palestra_id).maybeSingle(),
  ]);
  const notaSuFattura = r?.tipo_documento === 'nota_credito' && r.rif?.tipo_documento === 'fattura';
  if (!r || (r.tipo_documento !== 'fattura' && !notaSuFattura)) return new Response('Fattura non trovata.', { status: 404 });
  if (r.annullata) return new Response('La fattura è annullata: non si trasmette.', { status: 409 });
  const scuola = pal?.fatturazione || {};
  if (!scuola.piva) return new Response('Mancano i dati della scuola per la fattura (Struttura → Sede e contatti).', { status: 409 });

  await supabase.rpc('segna_xml_scaricato', { p_id: r.id });
  const collegata = notaSuFattura ? { numero: `${r.rif.numerazioni?.codice || 'FT'}${r.rif.numero}/${r.rif.anno}`, data: r.rif.data } : null;
  return new Response(fatturaXml(r, scuola, r.numerazioni?.codice || 'FT', collegata), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeFile(scuola, r)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
