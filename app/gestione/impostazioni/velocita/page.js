import { staffCorrente } from '@/lib/staff';
import { redirect } from 'next/navigation';
import Velocita from './Velocita';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Velocità' };

export default async function PaginaVelocita() {
  const { staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Velocità</h1>
        <p>Misura dove se ne va il tempo quando si apre una pagina: il server, il database, la rete. Da aprire dal computer della segreteria.</p>
      </div>
      <Velocita supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} />
    </>
  );
}
