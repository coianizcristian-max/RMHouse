import Testata from '../Testata';
import Modulo from './Modulo';

export const metadata = { title: 'Il tuo parere · Ritmo Metropolitano' };

export default async function Feedback({ searchParams }) {
  const { t } = await searchParams;
  return (
    <>
      <Testata />
      <main className="pagina">
        {t ? <Modulo token={t} /> : <p>Link non valido.</p>}
      </main>
    </>
  );
}
