import Testata from '../Testata';
import Nav from './Nav';
import { staffCorrente } from '@/lib/staff';

export const metadata = { title: 'Gestione · Ritmo Metropolitano' };

export default async function LayoutGestione({ children }) {
  const { user, staff } = await staffCorrente();
  if (!staff) {
    return (
      <>
        <Testata />
        <main className="pagina">
          <h1>Accesso non abilitato</h1>
          <p>L'utente {user.email} non è registrato come staff di questa palestra. Chiedi all'amministratore di abilitarti.</p>
        </main>
      </>
    );
  }
  return (
    <>
      <Testata destra={<span className="piccolo muto">{staff.nome} · {staff.ruolo}</span>} />
      <Nav gestione={staff.ruolo !== 'insegnante'} />
      <main className="pagina-larga">{children}</main>
    </>
  );
}
