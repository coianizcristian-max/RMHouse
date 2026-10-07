import Guscio from './Guscio';
import { staffCorrente, guscioDati } from '@/lib/staff';
import Testata from '../Testata';

// L'app dello staff ha la sua installazione: nome, icona e pagina di partenza diversi dall'app dei clienti
export const metadata = {
  title: 'Gestione · Ritmo Metropolitano',
  manifest: '/gestione.webmanifest',
  appleWebApp: { capable: true, title: 'RM Gestione', statusBarStyle: 'black' },
  icons: { icon: [{ url: '/favicon-rosso-48.png', sizes: '48x48' }, { url: '/favicon-rosso-192.png', sizes: '192x192' }], apple: '/apple-icon-gestione.png' },
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
  const { funzioni, nascoste, vedeAttivita } = await guscioDati(supabase, staff);
  return (
    <Guscio gestione={staff.ruolo !== 'insegnante'} nome={staff.nome} ruolo={staff.ruolo}
            palestraId={staff.palestra_id} funzioni={funzioni} nascoste={nascoste} vedeAttivita={vedeAttivita}>
      {children}
    </Guscio>
  );
}
