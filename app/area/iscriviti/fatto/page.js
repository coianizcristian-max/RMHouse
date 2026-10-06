import Fatto from './Fatto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Iscrizione · Ritmo Metropolitano' };

export default async function PaginaFatto({ searchParams }) {
  const { s, sp } = (await searchParams) || {};
  return <Fatto sessione={typeof s === 'string' ? s : ''} acquistoSatispay={typeof sp === 'string' ? sp : ''} />;
}
