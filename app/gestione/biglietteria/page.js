import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { stripeAttivo } from '@/lib/stripe';
import Biglietteria from './Biglietteria';

export const dynamic = 'force-dynamic';

// Biglietteria del saggio (query 170): spettacoli, elenco allievi, prenotazioni e pagamenti, ingresso
export default async function PaginaBiglietteria({ searchParams }) {
  const { b } = (await searchParams) || {};
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione/biglietteria/ingresso');
  const { data: tutte, error } = await supabase.from('biglietterie').select('*').eq('palestra_id', staff.palestra_id).order('created_at', { ascending: false });
  if (error) return <main className="pagina"><h1>Biglietteria</h1><div className="errore">Manca la query 170 in Supabase.</div></main>;
  const scelta = (tutte || []).find((x) => x.id === b) || (tutte || [])[0] || null;
  let spettacoli = [], allievi = [], prenotazioni = [], riepilogo = [], biglietti = [];
  if (scelta) {
    ({ data: spettacoli } = await supabase.from('biglietteria_spettacoli').select('*').eq('biglietteria_id', scelta.id).order('ordine').order('inizio'));
    const ids = (spettacoli || []).map((s) => s.id);
    if (ids.length) {
      [{ data: allievi }, { data: prenotazioni }, { data: riepilogo }] = await Promise.all([
        supabase.from('biglietteria_allievi').select('id, spettacolo_id, nome, cognome, gruppo, data_nascita').in('spettacolo_id', ids).order('cognome').order('nome').limit(5000),
        supabase.from('biglietteria_prenotazioni').select('*').in('spettacolo_id', ids).order('created_at', { ascending: false }).limit(5000),
        supabase.rpc('biglietteria_riepilogo', { p_biglietteria: scelta.id }),
      ]);
      // i biglietti delle prenotazioni confermate, per il registro d'ingresso
      const conf = (prenotazioni || []).filter((p) => p.stato === 'pagata' || p.stato === 'gratis').map((p) => p.id);
      for (let i = 0; i < conf.length; i += 300) {
        const { data } = await supabase.from('biglietteria_biglietti').select('id, prenotazione_id, numero, codice, nome, entrato_at').in('prenotazione_id', conf.slice(i, i + 300));
        biglietti = biglietti.concat(data || []);
      }
    }
  }
  return (
    <Biglietteria palestraId={staff.palestra_id} tutte={tutte || []} b={scelta} spettacoli={spettacoli || []} allievi={allievi || []}
                  prenotazioni={prenotazioni || []} riepilogo={riepilogo || []} biglietti={biglietti} stripe={stripeAttivo()} />
  );
}
