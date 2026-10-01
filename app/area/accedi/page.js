import Accedi from './Accedi';

export const dynamic = 'force-dynamic';

export default async function PaginaAccedi({ searchParams }) {
  const { errore, da, email } = await searchParams;
  const dove = typeof da === 'string' && da.startsWith('/area') ? da : '/area';
  return <Accedi errore={errore === '1'} dove={dove} emailIniziale={typeof email === 'string' ? email : ''} />;
}
