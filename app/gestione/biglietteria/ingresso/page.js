import { staffCorrente } from '@/lib/staff';
import Ingresso from './Ingresso';

export const dynamic = 'force-dynamic';

// Ingresso del saggio: il QR del biglietto apre questa pagina (telefono dello staff, già entrato nel gestionale)
export default async function PaginaIngressoSaggio({ searchParams }) {
  const { b } = (await searchParams) || {};
  const { supabase, staff } = await staffCorrente();
  const { data: bi } = await supabase.from('biglietterie').select('id, titolo').eq('palestra_id', staff.palestra_id).order('created_at', { ascending: false }).limit(1);
  const { data: spettacoli } = bi?.[0]
    ? await supabase.from('biglietteria_spettacoli').select('id, titolo, inizio').eq('biglietteria_id', bi[0].id).order('ordine').order('inizio')
    : { data: [] };
  return <Ingresso codice={typeof b === 'string' ? b.slice(0, 20) : ''} titolo={bi?.[0]?.titolo || 'Saggio'} spettacoli={spettacoli || []} />;
}
