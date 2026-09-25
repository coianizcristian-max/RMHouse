import Testata from '../Testata';
import Conferma from './Conferma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Promozioni · Ritmo Metropolitano', robots: { index: false } };

export default async function Disiscriviti({ searchParams }) {
  const { t } = await searchParams;
  const valido = t && /^[0-9a-f-]{36}$/i.test(t);
  return (
    <>
      <Testata />
      <main className="pagina" style={{ maxWidth: 560 }}>
        {!valido ? <><h1>Link non valido</h1><p>Scrivici e ti togliamo noi dalle promozioni.</p></> : <Conferma token={t} />}
      </main>
    </>
  );
}
