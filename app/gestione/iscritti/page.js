import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Iscritti from './Iscritti';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Iscritti per corso' };

// Iscritti per corso (query 154): tutti i corsi, orario per orario, con chi c'è, i suoi giorni, abbonamento,
// certificato, tessera, se ha pagato e le note. Sempre aggiornato: è la stessa lista dello Sportello e dell'appello.
export default async function PaginaIscritti({ searchParams }) {
  const { corso, cerca, problema } = (await searchParams) || {};
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const { data, error } = await supabase.rpc('iscritti_corsi', { p_palestra: staff.palestra_id });
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Sportello</div>
        <h1>Iscritti per corso</h1>
        <p>Corso per corso e giorno per giorno: chi c&apos;è, fino a quando, certificato, tessera, se ha pagato e le note.
          Si aggiorna da solo con lo Sportello: non serve più il file Excel.</p>
      </div>
      {error ? <div className="errore">{error.message?.includes('iscritti_corsi') ? 'Manca la query 154 in Supabase.' : 'Non riesco a leggere gli iscritti: riprova.'}</div>
        : <Iscritti dati={data} corsoIniziale={corso || ''} cercaIniziale={cerca || ''} problemaIniziale={problema || ''} />}
    </>
  );
}
