import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Esportazione contabile degli incassi: una riga per pagamento
export async function GET(request) {
  const url = new URL(request.url);
  const dal = url.searchParams.get('dal');
  const al = url.searchParams.get('al');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dal || '') || !/^\d{4}-\d{2}-\d{2}$/.test(al || '')) {
    return new Response('Date non valide.', { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });

  const { data: staff } = await supabase.from('staff')
    .select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return new Response('Servono i permessi di segreteria.', { status: 403 });

  const { data, error } = await supabase.rpc('esporta_incassi', {
    p_palestra: staff.palestra_id, p_dal: dal, p_al: al,
  });
  if (error) return new Response('Esportazione non riuscita.', { status: 500 });

  const intestazioni = ['Data', 'Causale', 'Descrizione', 'Importo', 'Metodo', 'Stato', 'Cliente', 'Codice fiscale', 'Email', 'Corso'];
  const righe = (data || []).map((r) => [
    r.data, r.causale, r.descrizione,
    (r.importo_cent / 100).toFixed(2).replace('.', ','),   // virgola: si apre bene in Excel italiano
    r.metodo, r.stato, r.cliente, r.codice_fiscale, r.email, r.corso,
  ]);

  const totale = (data || []).reduce((s, r) => s + (r.stato === 'pagato' ? r.importo_cent : 0), 0);
  righe.push([]);
  righe.push(['', '', 'TOTALE INCASSATO', (totale / 100).toFixed(2).replace('.', ','), '', '', '', '', '', '']);

  const csv = '\uFEFF' + [intestazioni, ...righe].map((r) => r.map(campo).join(';')).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="incassi ${dal} - ${al}.csv"`,
    },
  });
}
