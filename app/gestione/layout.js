import Guscio from './Guscio';
import { staffCorrente } from '@/lib/staff';
import Testata from '../Testata';

export const metadata = { title: 'Gestione · Ritmo Metropolitano' };

export default async function LayoutGestione({ children }) {
  const { user, staff } = await staffCorrente();
  if (!staff) {
    return (
      <>
        <Testata />
        <main className="pagina">
          <h1>Accesso non abilitato</h1>
          <p>L'utente {user.email} non è ancora registrato come staff. Chiedi all'amministratore di abilitarti.</p>
        </main>
      </>
    );
  }
  return (
    <Guscio gestione={staff.ruolo !== 'insegnante'} nome={staff.nome} ruolo={staff.ruolo}
            palestraId={staff.palestra_id}>
      {children}
    </Guscio>
  );
}
