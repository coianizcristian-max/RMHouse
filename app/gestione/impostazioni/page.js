import { impostazioni } from './dati';
import Regole from './Regole';

export const dynamic = 'force-dynamic';

export default async function PaginaRegole() {
  const { palestra } = await impostazioni('id, quota_iscrizione_cent, mese_inizio_stagione, giorni_prenotabili, preavviso_ore, google_review_url, soglie, sconti');
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Regole e prenotazioni</h1>
        <p>Quota annuale, stagione, prove, soglie dello stato dei clienti e sconti da proporre.</p>
      </div>
      <Regole palestra={palestra} />
    </>
  );
}
