import { impostazioni } from '../dati';
import Aspetto from './Aspetto';

export const dynamic = 'force-dynamic';

export default async function PaginaAspetto() {
  const { palestra } = await impostazioni('id, nome, area_cliente');
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Area clienti</h1>
        <p>Come la vedono allievi e genitori: messaggio di benvenuto, avviso in evidenza e colore. A destra l'anteprima.</p>
      </div>
      <Aspetto palestra={palestra} />
    </>
  );
}
