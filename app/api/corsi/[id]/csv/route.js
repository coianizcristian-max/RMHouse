import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const cella = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Esportazione dell'elenco iscritti (Excel apre direttamente il file)
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'non autorizzato' }, { status: 401 });

  // le regole RLS filtrano da sole: se non è staff, non esce nulla
  const { data, error } = await supabase.from('v_iscritti_corso').select('*').eq('corso_id', id).order('cognome');
  if (error || !data?.length) return NextResponse.json({ errore: 'nessun dato' }, { status: 404 });

  const colonne = [
    ['Cognome', 'cognome'], ['Nome', 'nome'], ['Nascita', 'data_nascita'], ['Orari', 'orari'],
    ['Abbonamento', 'abbonamento'], ['Inizio', 'data_inizio'], ['Scadenza', 'data_fine'], ['Stato', 'stato'],
    ['Certificato', 'certificato_scadenza'], ['Titolare', 'titolare_nome'], ['Email', 'email'], ['Telefono', 'telefono'],
  ];
  const righe = [colonne.map(([t]) => cella(t)).join(';')]
    .concat(data.map((r) => colonne.map(([, k]) => cella(r[k])).join(';')));
  const nome = (data[0].corso_nome || 'corso').replace(/[^\w]+/g, '-').toLowerCase();

  return new NextResponse('\uFEFF' + righe.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="iscritti-${nome}.csv"`,
    },
  });
}
