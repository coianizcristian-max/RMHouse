import Guscio from './Guscio';
import { staffCorrente } from '@/lib/staff';
import Testata from '../Testata';

// L'app dello staff ha la sua installazione: nome, icona e pagina di partenza diversi dall'app dei clienti
export const metadata = {
  title: 'Gestione · Ritmo Metropolitano',
  manifest: '/gestione.webmanifest',
  appleWebApp: { capable: true, title: 'RM Gestione', statusBarStyle: 'black' },
  icons: { icon: '/icona-gestione-192.png', apple: '/apple-icon-gestione.png' },
};

export default async function LayoutGestione({ children }) {
  const { supabase, user, staff } = await staffCorrente();
  if (!staff) {
    return (
      <>
        <Testata />
        <main className="pagina">
          <h1>Accesso non abilitato</h1>
          <p>L'account {user.email} non è ancora abilitato fra lo staff. Chiedi a chi amministra il gestionale di abilitarlo.</p>
        </main>
      </>
    );
  }
  const [{ data: pal }, { data: profilo }] = await Promise.all([
    supabase.from('palestre').select('funzioni').eq('id', staff.palestra_id).maybeSingle(),
    staff.ruolo_id && staff.ruolo !== 'admin'
      ? supabase.from('ruoli').select('voci_nascoste').eq('id', staff.ruolo_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return (
    <Guscio gestione={staff.ruolo !== 'insegnante'} nome={staff.nome} ruolo={staff.ruolo}
            palestraId={staff.palestra_id} funzioni={pal?.funzioni || {}}
            nascoste={profilo?.voci_nascoste || []}>
      {children}
    </Guscio>
  );
}
