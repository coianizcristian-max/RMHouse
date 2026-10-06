import Registrati from './Registrati';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Registrati · Ritmo Metropolitano' };

export default async function PaginaRegistrati({ searchParams }) {
  const { email, corso, da } = (await searchParams) || {};
  return <Registrati emailIniziale={typeof email === 'string' ? email : ''} corso={typeof corso === 'string' ? corso : ''}
                     da={typeof da === 'string' && da.startsWith('/area/') && !da.startsWith('/area/accedi') ? da : ''} />;
}
