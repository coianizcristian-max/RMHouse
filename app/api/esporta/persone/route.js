import { supabaseServer } from '@/lib/supabase/server';
import { applicaFiltri } from '@/lib/filtriPersone';
import { STATI_CLIENTE, comeCsv } from '@/lib/stati';

export const dynamic = 'force-dynamic';

// Export CSV delle persone con gli stessi filtri della pagina Persone
export async function GET(request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Non autorizzato', { status: 401 });
  const { data: staff } = await supabase.from('staff').select('palestra_id, ruolo')
    .eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return new Response('Servono i permessi di segreteria', { status: 403 });

  const u = new URL(request.url).searchParams;
  const filtri = { q: u.get('q') || '', stato: u.get('stato') || '', campanello: u.get('campanello') || '', etichetta: u.get('etichetta') || '' };

  const righe = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await applicaFiltri(
      supabase.from('v_stato_clienti')
        .select('cognome, nome, data_nascita, codice_fiscale, is_titolare, titolare_nome, titolare_cognome, email, telefono, stato, attivo, prima_data, fine_prossima, ultima_fine, certificato_scadenza, quota_mancante, etichette')
        .eq('palestra_id', staff.palestra_id),
      filtri,
    ).order('cognome').order('nome').range(da, da + 999);
    if (error) return new Response('Export non riuscito', { status: 500 });
    righe.push(...data);
    if (data.length < 1000) break;
  }

  const csv = comeCsv(
    ['Cognome', 'Nome', 'Data di nascita', 'Codice fiscale', 'Chi paga', 'Email', 'Telefono', 'Stato', 'Cliente dal',
     'Abbonamento fino al', 'Ultimo abbonamento finito il', 'Certificato fino al', 'Quota da pagare', 'Etichette'],
    righe.map((p) => [p.cognome, p.nome, p.data_nascita || '', p.codice_fiscale || '',
      p.is_titolare ? '' : `${p.titolare_nome || ''} ${p.titolare_cognome || ''}`.trim(), p.email || '', p.telefono || '',
      STATI_CLIENTE[p.stato]?.testo || p.stato, p.prima_data || '', p.fine_prossima || '', p.attivo ? '' : (p.ultima_fine || ''),
      p.certificato_scadenza || '', p.quota_mancante ? 'sì' : '', (p.etichette || []).join(', ')]),
  );
  const oggi = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="persone-${filtri.stato || 'tutte'}-${oggi}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
