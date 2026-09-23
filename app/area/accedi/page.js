import Accedi from './Accedi';

export const dynamic = 'force-dynamic';

export default async function PaginaAccedi({ searchParams }) {
  const { errore } = await searchParams;
  return <Accedi errore={errore === '1'} />;
}
