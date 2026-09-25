import { impostazioni } from '../dati';
import Funzioni from './Funzioni';

export const dynamic = 'force-dynamic';

export default async function PaginaFunzioni() {
  const { palestra } = await impostazioni('id, funzioni');
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Funzioni attive</h1>
        <p>Spegni quello che la scuola non usa: sparisce dal menù e il gestionale resta più semplice. I dati restano.</p>
      </div>
      <Funzioni palestra={palestra} />
    </>
  );
}
