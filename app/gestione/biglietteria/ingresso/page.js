import { staffCorrente } from '@/lib/staff';
import Ingresso from './Ingresso';

export const dynamic = 'force-dynamic';

// Ingresso del saggio: scanner dei QR per le segretarie (e il QR aperto con la fotocamera del telefono porta qui)
export default async function PaginaIngressoSaggio({ searchParams }) {
  const { b } = (await searchParams) || {};
  const { supabase, staff } = await staffCorrente();
  const { data: bi } = await supabase.from('biglietterie').select('id, titolo').eq('palestra_id', staff.palestra_id).order('created_at', { ascending: false }).limit(1);
  const { data: spettacoli } = bi?.[0]
    ? await supabase.from('biglietteria_spettacoli').select('id, titolo, inizio, ordine, colore').eq('biglietteria_id', bi[0].id).order('ordine').order('inizio')
    : { data: [] };
  return <Ingresso codice={typeof b === 'string' ? b.slice(0, 20) : ''} biglietteriaId={bi?.[0]?.id || null} titolo={bi?.[0]?.titolo || 'Saggio'} spettacoli={spettacoli || []} />;
}
